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
}));

import { generateChallenge } from './runtime-generator';

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
