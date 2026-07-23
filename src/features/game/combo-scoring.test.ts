import { describe, expect, it } from 'vitest';
import { COMBO_BASE_PER_HIT } from '@/src/lib/constants';
import {
  buildEndlessGameOverMeta,
  comboPoints,
  finalScore,
  getCoderStepView,
  streakMultiplier,
  submitAnswer,
} from './game-engine';
import type { Challenge } from './game-types';
import { makeSession, makeStep } from './testing/fixtures';

describe('streakMultiplier', () => {
  it.each([
    { streak: 0, expected: 1 },
    { streak: 1, expected: 1 },
    { streak: 2, expected: 1 },
    { streak: 3, expected: 1.5 },
    { streak: 4, expected: 1.5 },
    { streak: 5, expected: 2 },
    { streak: 6, expected: 2 },
    { streak: 7, expected: 3 },
    { streak: 100, expected: 3 },
  ])('maps streak $streak → ×$expected', ({ streak, expected }) => {
    expect(streakMultiplier(streak)).toBe(expected);
    expect(streakMultiplier(streak)).toBeGreaterThanOrEqual(1);
  });
});

describe('comboPoints', () => {
  it('rounds fractional multipliers to an integer', () => {
    expect(comboPoints(100, 1.5)).toBe(150);
    expect(comboPoints(100, 2)).toBe(200);
    expect(comboPoints(100, 3)).toBe(300);
  });
});

describe('finalScore', () => {
  it('adds endless base and combo bonus', () => {
    expect(finalScore(5000, 450)).toBe(5450);
  });

  it('equals endless-only score when comboScore is zero (R3.3)', () => {
    expect(finalScore(3200, 0)).toBe(3200);
  });
});

describe('submitAnswer — combo streak', () => {
  const step = makeStep({ correct_answer: 0, success_state: { code_patch: 'fixed' } });
  const challenge = makeChallenge([step]);

  it('increments streak and bestStreak on correct answer', () => {
    const session = makeSession({ streak: 2, bestStreak: 2 });
    const result = submitAnswer(session, challenge, 0);

    expect(result.streak).toBe(3);
    expect(result.bestStreak).toBe(3);
    expect(result.lastResult).toBe('correct');
  });

  it('does not accumulate comboScore while multiplier is ×1', () => {
    const twoStep = makeChallenge([
      makeStep({ step: 1, correct_answer: 0, success_state: { code_patch: 'p1' } }),
      makeStep({ step: 2, correct_answer: 0, success_state: { code_patch: 'p2' } }),
    ]);
    let session = makeSession({ streak: 0, comboScore: 0, currentStep: 1 });

    session = submitAnswer(session, twoStep, 0);
    expect(session.streak).toBe(1);
    expect(session.comboScore).toBe(0);

    session = submitAnswer(session, twoStep, 0);
    expect(session.streak).toBe(2);
    expect(session.comboScore).toBe(0);
  });

  it('accumulates comboScore once multiplier exceeds ×1', () => {
    const session = makeSession({ streak: 2, comboScore: 0 });
    const result = submitAnswer(session, challenge, 0);

    expect(result.streak).toBe(3);
    expect(result.comboScore).toBe(comboPoints(COMBO_BASE_PER_HIT, 1.5));
  });

  it('resets streak on error but preserves bestStreak', () => {
    const session = makeSession({ streak: 5, bestStreak: 6, comboScore: 200 });
    const result = submitAnswer(session, challenge, 3);

    expect(result.streak).toBe(0);
    expect(result.bestStreak).toBe(6);
    expect(result.comboScore).toBe(200);
    expect(result.lastResult).toBe('incorrect');
  });

  it('chains 7+ correct answers to reach ×3 multiplier tier', () => {
    const multiStep = makeChallenge(
      Array.from({ length: 7 }, (_, index) =>
        makeStep({
          step: index + 1,
          correct_answer: 0,
          success_state: { code_patch: `patch-${index + 1}` },
        }),
      ),
    );
    let session = makeSession({ streak: 0, comboScore: 0, currentStep: 1 });

    for (let i = 0; i < 7; i += 1) {
      session = submitAnswer(session, multiStep, 0);
    }

    expect(session.streak).toBe(7);
    expect(streakMultiplier(session.streak)).toBe(3);
    expect(session.bestStreak).toBe(7);
    expect(session.comboScore).toBeGreaterThan(0);
  });
});

describe('buildEndlessGameOverMeta', () => {
  it('composes finalScore from endless base and comboScore', () => {
    const session = makeSession({
      mode: 'endless',
      playedRounds: 4,
      comboScore: 350,
      bestStreak: 8,
    });

    const meta = buildEndlessGameOverMeta(session, 120);

    expect(meta.playedRounds).toBe(4);
    expect(meta.endlessScore).toBe(finalScore(4120, 350));
    expect(meta.bestStreak).toBe(8);
  });
});

describe('getCoderStepView — combo fields', () => {
  it('exposes streak and multiplier derived from session', () => {
    const step = makeStep();
    const challenge = makeChallenge([step]);
    const session = makeSession({ streak: 5 });

    const view = getCoderStepView(session, challenge);

    expect(view.streak).toBe(5);
    expect(view.multiplier).toBe(2);
  });
});

function makeChallenge(steps: ReturnType<typeof makeStep>[]): Challenge {
  return {
    id: 'combo-test',
    title: 'Combo Test',
    difficulty: 'easy',
    story_context: 'Test',
    time_limit: 180,
    steps,
  };
}