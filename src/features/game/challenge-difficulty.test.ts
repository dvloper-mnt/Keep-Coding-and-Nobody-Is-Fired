import { describe, expect, it } from 'vitest';
import {
  difficultyForSession,
  difficultyInstruction,
  resolveRoundForGeneration,
  roundToDifficulty,
} from './challenge-difficulty';
import type { Difficulty } from './game-types';

describe('roundToDifficulty', () => {
  const cases: Array<{ round: number; expected: Difficulty }> = [
    { round: 0, expected: 'easy' },
    { round: -5, expected: 'easy' },
    { round: 0.5, expected: 'easy' },
    { round: 1.9, expected: 'easy' },
    { round: 1, expected: 'easy' },
    { round: 2, expected: 'easy' },
    { round: 3, expected: 'easy' },
    { round: 4, expected: 'medium' },
    { round: 5, expected: 'medium' },
    { round: 7, expected: 'medium' },
    { round: 8, expected: 'hard' },
    { round: 10, expected: 'hard' },
    { round: 12, expected: 'hard' },
    { round: 13, expected: 'expert' },
    { round: 100, expected: 'expert' },
  ];

  it.each(cases)('round $round → $expected', ({ round, expected }) => {
    expect(roundToDifficulty(round)).toBe(expected);
  });

  it('treats NaN and Infinity as round 1 (easy)', () => {
    expect(roundToDifficulty(Number.NaN)).toBe('easy');
    expect(roundToDifficulty(Number.POSITIVE_INFINITY)).toBe('easy');
    expect(roundToDifficulty(Number.NEGATIVE_INFINITY)).toBe('easy');
  });
});

describe('resolveRoundForGeneration', () => {
  it('returns 1 for classic mode regardless of session round', () => {
    expect(
      resolveRoundForGeneration({ mode: 'classic', round: 10, roundComplete: true }),
    ).toBe(1);
  });

  it('returns the current round for endless first generation', () => {
    expect(resolveRoundForGeneration({ mode: 'endless', round: 1 })).toBe(1);
    expect(resolveRoundForGeneration({ mode: 'endless', round: 7 })).toBe(7);
  });

  it('returns round + 1 when idle after completing a round', () => {
    expect(
      resolveRoundForGeneration({ mode: 'endless', round: 3, roundComplete: true }),
    ).toBe(4);
    expect(
      resolveRoundForGeneration({ mode: 'endless', round: 12, roundComplete: true }),
    ).toBe(13);
  });

  it('falls back to 1 for invalid endless round values', () => {
    expect(resolveRoundForGeneration({ mode: 'endless', round: 0 })).toBe(1);
    expect(resolveRoundForGeneration({ mode: 'endless', round: -2 })).toBe(1);
    expect(resolveRoundForGeneration({ mode: 'endless', round: 2.5 })).toBe(1);
  });
});

describe('difficultyInstruction', () => {
  const levels: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

  it.each(levels)('returns non-empty Spanish instruction for %s', (difficulty) => {
    const instruction = difficultyInstruction(difficulty);
    expect(instruction.length).toBeGreaterThan(20);
    expect(instruction).toMatch(/dificultad|nivel|bug/i);
  });

  it('produces distinct instructions per level', () => {
    const instructions = levels.map((level) => difficultyInstruction(level));
    const unique = new Set(instructions);
    expect(unique.size).toBe(levels.length);
  });

  it('mentions exactly 3 steps for every level', () => {
    for (const level of levels) {
      expect(difficultyInstruction(level)).toMatch(/3\s*steps|3\s*pasos|EXACTAMENTE\s*3/i);
    }
  });

  it('escalates subtlety from easy to expert', () => {
    const easy = difficultyInstruction('easy');
    const expert = difficultyInstruction('expert');
    expect(easy).toMatch(/evidente|obvio|directo/i);
    expect(expert).toMatch(/sutil|encadenad|distractor/i);
  });
});

describe('difficultyForSession', () => {
  it('combines resolveRoundForGeneration with roundToDifficulty', () => {
    expect(
      difficultyForSession({ mode: 'endless', round: 7, roundComplete: true }),
    ).toBe('hard');
    expect(difficultyForSession({ mode: 'classic', round: 20 })).toBe('easy');
  });
});