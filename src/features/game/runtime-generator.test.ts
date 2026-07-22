import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the AWS SDK so the generator never hits the network in tests.
const sendMock = vi.fn();
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: class {
    send = sendMock;
  },
  ConverseCommand: class {
    constructor(public input: unknown) {}
  },
  ConverseStreamCommand: class {
    constructor(public input: unknown) {}
  },
}));

import { generateChallenge, generateChallengeStreaming } from './runtime-generator';

// ---------------------------------------------------------------------------
// Helpers for streaming tests
// ---------------------------------------------------------------------------

/** Build a mock streaming response from an array of text fragments. */
async function* makeStreamChunks(fragments: string[]) {
  for (const text of fragments) {
    yield { contentBlockDelta: { delta: { text } } };
  }
}

/** Build the streaming response shape that client.send() resolves to. */
function streamingReply(fragments: string[]) {
  return { stream: makeStreamChunks(fragments) };
}

/** Split a string into individual characters to simulate token-by-token streaming. */
function charFragments(text: string): string[] {
  return text.split('');
}

function bedrockReply(text: string) {
  return { output: { message: { content: [{ text }] } } };
}

const VALID_CHALLENGE_JSON = JSON.stringify({
  id: 'lvl_gen_001',
  title: 'Generado',
  difficulty: 'medium',
  story_context: 'Demo en vivo',
  time_limit: 180,
  steps: [
    {
      step: 1,
      coder_view: { code: 'echo 1;', error: '500' },
      helper_view: { rules: ['r'], knowledge: ['k'] },
      options: ['a', 'b', 'c', 'd'],
      correct_answer: 0,
      success_state: { code_patch: 'echo 2;' },
    },
  ],
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('generateChallenge', () => {
  it('returns a validated challenge when Bedrock replies with valid JSON', async () => {
    sendMock.mockResolvedValue(bedrockReply(VALID_CHALLENGE_JSON));
    const result = await generateChallenge();
    expect(result).not.toBeNull();
    expect(result?.id).toBe('lvl_gen_001');
    expect(result?.steps).toHaveLength(1);
  });

  it('strips markdown fences before parsing', async () => {
    sendMock.mockResolvedValue(bedrockReply('```json\n' + VALID_CHALLENGE_JSON + '\n```'));
    const result = await generateChallenge();
    expect(result?.id).toBe('lvl_gen_001');
  });

  it('returns null when Bedrock throws (network/timeout/throttle) → caller falls back', async () => {
    sendMock.mockRejectedValue(new Error('network down'));
    expect(await generateChallenge()).toBeNull();
  });

  it('returns null when the reply is not valid JSON', async () => {
    sendMock.mockResolvedValue(bedrockReply('not json at all'));
    expect(await generateChallenge()).toBeNull();
  });

  it('returns null when the JSON is valid but not a valid challenge', async () => {
    sendMock.mockResolvedValue(bedrockReply(JSON.stringify({ id: 'x', steps: [] })));
    expect(await generateChallenge()).toBeNull();
  });

  it('returns null on an empty response', async () => {
    sendMock.mockResolvedValue({ output: { message: { content: [{ text: '' }] } } });
    expect(await generateChallenge()).toBeNull();
  });
});

describe('generateChallengeStreaming', () => {
  it('accumulates fragments in order and returns validated challenge', async () => {
    // Split the JSON into char-by-char fragments to simulate real token streaming.
    const fragments = charFragments(VALID_CHALLENGE_JSON);
    sendMock.mockResolvedValue(streamingReply(fragments));

    const deltas: string[] = [];
    const result = await generateChallengeStreaming('random', (partial) => {
      deltas.push(partial);
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe('lvl_gen_001');
    expect(result?.steps).toHaveLength(1);

    // onDelta must have been called once per fragment, accumulating progressively.
    expect(deltas).toHaveLength(fragments.length);
    // Each call receives the full accumulated buffer up to that point.
    expect(deltas[0]).toBe(fragments[0]);
    expect(deltas[deltas.length - 1]).toBe(VALID_CHALLENGE_JSON);
    // Buffers grow monotonically (each call has more text than the previous).
    for (let i = 1; i < deltas.length; i++) {
      expect(deltas[i].length).toBeGreaterThan(deltas[i - 1].length);
    }
  });

  it('strips markdown fences before parsing the accumulated buffer', async () => {
    const fenced = '```json\n' + VALID_CHALLENGE_JSON + '\n```';
    sendMock.mockResolvedValue(streamingReply([fenced]));

    const result = await generateChallengeStreaming('random', () => {});
    expect(result?.id).toBe('lvl_gen_001');
  });

  it('returns null when the stream throws (network/timeout/abort) → caller falls back', async () => {
    sendMock.mockRejectedValue(new Error('stream error'));
    const result = await generateChallengeStreaming('random', () => {});
    expect(result).toBeNull();
  });

  it('returns null when accumulated text is not valid JSON', async () => {
    sendMock.mockResolvedValue(streamingReply(['not ', 'valid ', 'json']));
    const result = await generateChallengeStreaming('random', () => {});
    expect(result).toBeNull();
  });

  it('returns null when the JSON is valid but fails isValidChallenge', async () => {
    const invalidChallenge = JSON.stringify({ id: 'x', steps: [] });
    sendMock.mockResolvedValue(streamingReply([invalidChallenge]));
    const result = await generateChallengeStreaming('random', () => {});
    expect(result).toBeNull();
  });

  it('returns null when the stream produces no text content', async () => {
    // Simulate a stream that yields chunks without contentBlockDelta text.
    async function* emptyStream() {
      yield { messageStart: { role: 'assistant' } };
      yield { messageStop: { stopReason: 'end_turn' } };
    }
    sendMock.mockResolvedValue({ stream: emptyStream() });
    const result = await generateChallengeStreaming('random', () => {});
    expect(result).toBeNull();
  });

  it('returns null when the response has no stream property', async () => {
    sendMock.mockResolvedValue({});
    const result = await generateChallengeStreaming('random', () => {});
    expect(result).toBeNull();
  });

  it('does not call onDelta when there are no text fragments', async () => {
    async function* noTextStream() {
      yield { messageStart: { role: 'assistant' } };
    }
    sendMock.mockResolvedValue({ stream: noTextStream() });

    const onDelta = vi.fn();
    await generateChallengeStreaming('random', onDelta);
    expect(onDelta).not.toHaveBeenCalled();
  });
});
