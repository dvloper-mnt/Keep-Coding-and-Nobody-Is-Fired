import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunSummary } from './game-types';

// Mock the AWS SDK so the streaming generator never hits the network in tests.
const sendMock = vi.fn();

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: class {
    send = sendMock;
  },
  ConverseStreamCommand: class {
    constructor(public input: unknown) {}
  },
}));

import { formatSummaryForPrompt, generateFeedbackStreaming } from './feedback-generator';

/** Mock streaming response from an array of text fragments. */
async function* streamChunks(fragments: string[]) {
  for (const text of fragments) {
    yield { contentBlockDelta: { delta: { text } } };
  }
}

function summary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    roundsReached: 5,
    score: 6200,
    secondsSurvived: 210,
    bestStreak: 4,
    topFailure: null,
    maxDifficulty: null,
    defeatReason: null,
    ...overrides,
  };
}

describe('formatSummaryForPrompt — happy path', () => {
  it('lists every metric with the numeric values when all are present', () => {
    const text = formatSummaryForPrompt(
      summary({
        roundsReached: 12,
        score: 15400,
        secondsSurvived: 420,
        bestStreak: 7,
        topFailure: { language: 'php', count: 3 },
        maxDifficulty: 'hard',
        defeatReason: 'timeout',
      }),
    );

    expect(text).toContain('Rondas alcanzadas: 12');
    expect(text).toContain('Puntaje final: 15400');
    expect(text).toContain('Tiempo sobrevivido: 420 segundos');
    expect(text).toContain('Mejor racha de aciertos consecutivos: 7');
    expect(text).toContain('Dificultad máxima alcanzada: difícil');
    expect(text).toContain('Razón de derrota: se les acabó el tiempo');
    expect(text).toContain('Lenguaje con más fallos: PHP (3 errores)');
  });

  it('joins the parts as separate lines so the LLM parses them cleanly', () => {
    const text = formatSummaryForPrompt(summary());
    const lines = text.split('\n');
    // 6 base metrics + 1 topFailure line = 7 lines minimum.
    expect(lines.length).toBeGreaterThanOrEqual(7);
    // Every non-empty line should contain a colon (label: value).
    for (const line of lines) {
      if (line.trim() === '') continue;
      expect(line).toContain(':');
    }
  });
});

describe('formatSummaryForPrompt — labels', () => {
  it('renders the expert difficulty added by adaptive-difficulty', () => {
    const text = formatSummaryForPrompt(summary({ maxDifficulty: 'expert' }));
    expect(text).toContain('Dificultad máxima alcanzada: experto');
  });

  it.each([
    ['coder_lives', 'el Coder perdió todas las vidas'],
    ['helper_lives', 'el Helper perdió todas las vidas'],
    ['timeout', 'se les acabó el tiempo'],
  ] as const)('renders the %s defeat reason as "%s"', (reason, label) => {
    const text = formatSummaryForPrompt(summary({ defeatReason: reason }));
    expect(text).toContain(`Razón de derrota: ${label}`);
  });

  it.each([
    ['typescript', 'TypeScript'],
    ['python', 'Python'],
    ['sql', 'SQL'],
  ] as const)('renders the %s failure language as "%s"', (language, label) => {
    const text = formatSummaryForPrompt(
      summary({ topFailure: { language, count: 2 } }),
    );
    expect(text).toContain(`Lenguaje con más fallos: ${label} (2 errores)`);
  });
});

describe('formatSummaryForPrompt — absent data', () => {
  it('says "no disponible" when maxDifficulty is null', () => {
    const text = formatSummaryForPrompt(summary({ maxDifficulty: null }));
    expect(text).toContain('Dificultad máxima alcanzada: no disponible');
  });

  it('says "no disponible" when defeatReason is null', () => {
    const text = formatSummaryForPrompt(summary({ defeatReason: null }));
    expect(text).toContain('Razón de derrota: no disponible');
  });

  it('says "ninguno registrado" when topFailure is null', () => {
    const text = formatSummaryForPrompt(summary({ topFailure: null }));
    expect(text).toContain('Lenguaje con más fallos: ninguno registrado');
  });

  it('does NOT invent numbers when the run had zero score/rounds/streak', () => {
    const text = formatSummaryForPrompt(
      summary({ roundsReached: 0, score: 0, secondsSurvived: 0, bestStreak: 0 }),
    );
    expect(text).toContain('Rondas alcanzadas: 0');
    expect(text).toContain('Puntaje final: 0');
    expect(text).toContain('Tiempo sobrevivido: 0 segundos');
    expect(text).toContain('Mejor racha de aciertos consecutivos: 0');
  });
});

describe('generateFeedbackStreaming — Bedrock streaming', () => {
  // The generator skips Bedrock in dev unless a credential hint is present, so
  // we set one for these tests and restore the environment afterwards.
  const originalKey = process.env.AWS_ACCESS_KEY_ID;

  beforeEach(() => {
    sendMock.mockReset();
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.AWS_ACCESS_KEY_ID;
    else process.env.AWS_ACCESS_KEY_ID = originalKey;
  });

  it('returns the accumulated analysis text and emits each partial buffer', async () => {
    sendMock.mockResolvedValue({ stream: streamChunks(['Buen ', 'trabajo ', 'equipo.']) });
    const deltas: string[] = [];

    const result = await generateFeedbackStreaming(summary(), (b) => deltas.push(b));

    expect(result).toBe('Buen trabajo equipo.');
    expect(deltas).toEqual(['Buen ', 'Buen trabajo ', 'Buen trabajo equipo.']);
  });

  it('returns null when the response exceeds the buffer cap (no truncated garbage)', async () => {
    // A single chunk larger than MAX_STREAM_BUFFER_BYTES (20_000) triggers the
    // cap guard. The fix must return null, NOT the truncated partial buffer.
    const runaway = 'x'.repeat(20_001);
    sendMock.mockResolvedValue({ stream: streamChunks([runaway]) });

    const result = await generateFeedbackStreaming(summary(), () => {});

    expect(result).toBeNull();
  });

  it('returns null on an empty stream', async () => {
    sendMock.mockResolvedValue({ stream: streamChunks([]) });

    const result = await generateFeedbackStreaming(summary(), () => {});

    expect(result).toBeNull();
  });

  it('returns null when Bedrock throws', async () => {
    sendMock.mockRejectedValue(new Error('bedrock down'));

    const result = await generateFeedbackStreaming(summary(), () => {});

    expect(result).toBeNull();
  });
});
