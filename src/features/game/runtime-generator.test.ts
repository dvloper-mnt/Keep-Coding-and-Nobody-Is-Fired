import { afterEach, describe, expect, it, vi } from 'vitest';
import { difficultyInstruction } from './challenge-difficulty';
import type { Difficulty } from './game-types';

// Mock the AWS SDK so the generator never hits the network in tests.
const sendMock = vi.fn();
let lastConverseInput: unknown;
let lastStreamInput: unknown;

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: class {
    send = sendMock;
  },
  ConverseCommand: class {
    constructor(public input: unknown) {
      lastConverseInput = input;
    }
  },
  ConverseStreamCommand: class {
    constructor(public input: unknown) {
      lastStreamInput = input;
    }
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

function userPromptFromInput(input: unknown): string {
  const record = input as {
    messages?: Array<{ content?: Array<{ text?: string }> }>;
  };
  return record.messages?.[0]?.content?.[0]?.text ?? '';
}

function systemPromptFromInput(input: unknown): string {
  const record = input as { system?: Array<{ text?: string }> };
  return record.system?.[0]?.text ?? '';
}

function challengeJson(difficulty: Difficulty) {
  return JSON.stringify({
    id: 'lvl_gen_001',
    title: 'Generado',
    difficulty,
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
}

const VALID_CHALLENGE_JSON = challengeJson('medium');

// Structurally valid, but a Helper rule contains the correct option verbatim —
// the hint IS the answer. hasCooperativeIntegrity must reject it, so the
// generator returns null and the caller falls back to a curated challenge.
const LEAKY_CHALLENGE_JSON = JSON.stringify({
  id: 'lvl_leak_001',
  title: 'Filtrado',
  difficulty: 'medium',
  story_context: 'Demo en vivo',
  time_limit: 180,
  steps: [
    {
      step: 1,
      coder_view: { code: 'echo 1;', error: '500' },
      helper_view: {
        rules: ['El método index no existe en el controlador'],
        knowledge: ['Contexto de dominio irrelevante'],
      },
      options: [
        'El método index no existe en el controlador',
        'b',
        'c',
        'd',
      ],
      correct_answer: 0,
      success_state: { code_patch: 'echo 2;' },
    },
  ],
});

afterEach(() => {
  vi.clearAllMocks();
  lastConverseInput = undefined;
  lastStreamInput = undefined;
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

  it('returns null when the challenge is valid but leaks the answer to the Helper → caller falls back', async () => {
    sendMock.mockResolvedValue(bedrockReply(LEAKY_CHALLENGE_JSON));
    expect(await generateChallenge()).toBeNull();
  });

  it('returns null on an empty response', async () => {
    sendMock.mockResolvedValue({ output: { message: { content: [{ text: '' }] } } });
    expect(await generateChallenge()).toBeNull();
  });

  it('defaults to easy difficulty in the prompt when none is provided', async () => {
    sendMock.mockResolvedValue(bedrockReply(VALID_CHALLENGE_JSON));
    await generateChallenge('php');
    const prompt = userPromptFromInput(lastConverseInput);
    expect(prompt).toContain(difficultyInstruction('easy'));
  });

  it.each(['easy', 'medium', 'hard', 'expert'] as const)(
    'injects difficultyInstruction(%s) into the user prompt',
    async (difficulty) => {
      sendMock.mockResolvedValue(bedrockReply(challengeJson(difficulty)));
      const result = await generateChallenge('php', difficulty);
      expect(result?.difficulty).toBe(difficulty);
      const prompt = userPromptFromInput(lastConverseInput);
      expect(prompt).toContain(difficultyInstruction(difficulty));
    },
  );

  it('accepts an expert challenge returned by Bedrock', async () => {
    sendMock.mockResolvedValue(bedrockReply(challengeJson('expert')));
    const result = await generateChallenge('php', 'expert');
    expect(result?.difficulty).toBe('expert');
  });

  it('system prompt no longer hardcodes medium difficulty', async () => {
    sendMock.mockResolvedValue(bedrockReply(VALID_CHALLENGE_JSON));
    await generateChallenge('php', 'hard');
    const systemPrompt = systemPromptFromInput(lastConverseInput);
    expect(systemPrompt).not.toContain('"difficulty": "medium"');
    expect(systemPrompt).toMatch(/difficulty.*user message/i);
  });

  it('returns null on stream failure at expert level so caller can fall back to curated', async () => {
    sendMock.mockRejectedValue(new Error('throttled'));
    expect(await generateChallenge('php', 'expert')).toBeNull();
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

  it('returns null when the streamed challenge leaks the answer to the Helper → caller falls back', async () => {
    sendMock.mockResolvedValue(streamingReply([LEAKY_CHALLENGE_JSON]));
    const result = await generateChallengeStreaming('random', () => {});
    expect(result).toBeNull();
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

  it('defaults to easy difficulty in the streaming prompt when none is provided', async () => {
    sendMock.mockResolvedValue(streamingReply([VALID_CHALLENGE_JSON]));
    await generateChallengeStreaming('php', () => {});
    const prompt = userPromptFromInput(lastStreamInput);
    expect(prompt).toContain(difficultyInstruction('easy'));
  });

  it('injects difficultyInstruction into the streaming user prompt', async () => {
    const expertJson = challengeJson('expert');
    sendMock.mockResolvedValue(streamingReply([expertJson]));
    const result = await generateChallengeStreaming('php', () => {}, 'expert');
    expect(result?.difficulty).toBe('expert');
    const prompt = userPromptFromInput(lastStreamInput);
    expect(prompt).toContain(difficultyInstruction('expert'));
  });

  it('returns null on streaming failure at expert level so caller can fall back to curated', async () => {
    sendMock.mockRejectedValue(new Error('stream down'));
    expect(await generateChallengeStreaming('php', () => {}, 'expert')).toBeNull();
  });
});
