import { describe, expect, it } from 'vitest';
import { formatSummaryForPrompt } from './feedback-generator';
import type { RunSummary } from './game-types';

// formatSummaryForPrompt is the only pure piece of feedback-generator: it
// turns the RunSummary object into the human-readable block the LLM sees. The
// streaming call itself needs Bedrock so it lives outside these tests.

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
