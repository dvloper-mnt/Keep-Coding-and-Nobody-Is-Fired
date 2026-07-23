import { describe, expect, it } from 'vitest';
import { PENALTY_SECONDS, WRONG_ANSWER_MESSAGE } from '@/src/lib/constants';
import {
  BOSS_REWARD_SECONDS,
  ENDLESS_REWARD_SECONDS,
} from '@/src/lib/constants';
import {
  abandonGame,
  applyTimeDelta,
  clearLastResult,
  createPendingSession,
  endlessScore,
  gameDurationSeconds,
  isTerminalStatus,
  resolveMultipleChoice,
  resolveStep,
  submitAnswer,
  tickTimer,
} from './game-engine';
import type { Challenge, GameSession } from './game-types';
import { makeSession, makeStep } from './testing/fixtures';

// ---------------------------------------------------------------------------
// Helpers to build a minimal Challenge for submitAnswer
// ---------------------------------------------------------------------------

function makeChallenge(steps: ReturnType<typeof makeStep>[]): Challenge {
  return {
    id: 'test-challenge',
    title: 'Test Challenge',
    difficulty: 'easy',
    story_context: 'Test context',
    time_limit: 180,
    steps,
  };
}

// ---------------------------------------------------------------------------
// R2 — resolveMultipleChoice
// ---------------------------------------------------------------------------

describe('resolveMultipleChoice', () => {
  // R2.1 — correct answer returns { success: true } with no extra fields
  it('returns { success: true } without penalty or message when answer is correct', () => {
    const result = resolveMultipleChoice(2, 2);
    expect(result).toStrictEqual({ success: true });
  });

  // R2.2 — wrong answer uses default penalty and message
  it('returns success:false with default penalty and message when answer is wrong', () => {
    const result = resolveMultipleChoice(0, 3);
    expect(result.success).toBe(false);
    expect(result.penalty).toBe(PENALTY_SECONDS);
    expect(result.message).toBe(WRONG_ANSWER_MESSAGE);
  });

  // R2.3 — wrong answer uses explicit penalty and message when provided
  it('uses explicit wrongPenalty and wrongMessage when provided', () => {
    const result = resolveMultipleChoice(0, 1, 8, 'Custom error');
    expect(result.success).toBe(false);
    expect(result.penalty).toBe(8);
    expect(result.message).toBe('Custom error');
  });
});

// ---------------------------------------------------------------------------
// R3 — resolveStep
// ---------------------------------------------------------------------------

describe('resolveStep', () => {
  const step = makeStep({ correct_answer: 1, success_state: { code_patch: 'echo "patched";' } });

  // R3.1 — correct answer returns success:true with the code patch
  it('returns success:true with patch equal to success_state.code_patch on correct answer', () => {
    const result = resolveStep(step, 1);
    expect(result.success).toBe(true);
    expect(result.patch).toBe('echo "patched";');
  });

  // R3.2 — wrong answer returns failure without patch
  it('returns success:false without patch on wrong answer', () => {
    const result = resolveStep(step, 3);
    expect(result.success).toBe(false);
    expect(result.patch).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// R4 — applyTimeDelta
// ---------------------------------------------------------------------------

describe('applyTimeDelta', () => {
  // R4.1 — positive delta adds to remainingTime
  it('adds a positive delta to remainingTime', () => {
    const session = makeSession({ remainingTime: 100 });
    const result = applyTimeDelta(session, 20);
    expect(result.remainingTime).toBe(120);
  });

  // R4.2 — negative delta that would go below zero clamps to 0
  it('clamps remainingTime to 0 when delta would produce a negative value', () => {
    const session = makeSession({ remainingTime: 5 });
    const result = applyTimeDelta(session, -20);
    expect(result.remainingTime).toBe(0);
  });

  // R4.3 — time <= 0 with status 'playing' triggers 'defeat'
  it('sets status to defeat when remainingTime reaches 0 and status was playing', () => {
    const session = makeSession({ remainingTime: 10, status: 'playing' });
    const result = applyTimeDelta(session, -10);
    expect(result.remainingTime).toBe(0);
    expect(result.status).toBe('defeat');
  });

  // R4.3 variant — delta that crosses exactly 0
  it('sets status to defeat when delta crosses exactly through 0', () => {
    const session = makeSession({ remainingTime: 3, status: 'playing' });
    const result = applyTimeDelta(session, -5);
    expect(result.remainingTime).toBe(0);
    expect(result.status).toBe('defeat');
  });

  // R4.4 — non-playing status is preserved even when time hits 0
  it('preserves victory status when time reaches 0 (does NOT force defeat)', () => {
    const session = makeSession({ remainingTime: 5, status: 'victory' });
    const result = applyTimeDelta(session, -10);
    expect(result.remainingTime).toBe(0);
    expect(result.status).toBe('victory');
  });
});

// ---------------------------------------------------------------------------
// R5 — submitAnswer
// ---------------------------------------------------------------------------

describe('submitAnswer', () => {
  // R5.1 — non-playing status returns session unchanged
  it.each<GameSession['status']>(['victory', 'defeat', 'idle'])(
    'returns session unchanged when status is %s',
    (status) => {
      const session = makeSession({ status });
      const step = makeStep({ correct_answer: 0 });
      const challenge = makeChallenge([step]);
      const result = submitAnswer(session, challenge, 0);
      expect(result).toBe(session); // same reference — no mutation
    },
  );

  // R5.2 — correct answer on a non-last step advances currentStep and applies patch
  it('increments currentStep, applies patch, keeps playing, and marks lastResult:correct on non-last step', () => {
    const step1 = makeStep({ step: 1, correct_answer: 0, success_state: { code_patch: 'patch-1' } });
    const step2 = makeStep({ step: 2, correct_answer: 0, success_state: { code_patch: 'patch-2' } });
    const challenge = makeChallenge([step1, step2]);
    const session = makeSession({ currentStep: 1 });

    const result = submitAnswer(session, challenge, 0);

    expect(result.currentStep).toBe(2);
    expect(result.currentCode).toBe('patch-1');
    expect(result.status).toBe('playing');
    expect(result.lastResult).toBe('correct');
  });

  // R5.3 — correct answer on the last step sets victory without going past totalSteps
  it('sets status to victory on last step without incrementing currentStep beyond total', () => {
    const step1 = makeStep({ step: 1, correct_answer: 0, success_state: { code_patch: 'patch-1' } });
    const step2 = makeStep({ step: 2, correct_answer: 0, success_state: { code_patch: 'patch-final' } });
    const challenge = makeChallenge([step1, step2]);
    const session = makeSession({ currentStep: 2 }); // already on last step

    const result = submitAnswer(session, challenge, 0);

    expect(result.status).toBe('victory');
    expect(result.currentStep).toBe(2); // does NOT go to 3
    expect(result.currentCode).toBe('patch-final');
    expect(result.lastResult).toBe('correct');
  });

  // R5.3 boundary — penultimate step advances, last step triggers victory
  it('advances from penultimate step (playing) but triggers victory on the final step', () => {
    const steps = [
      makeStep({ step: 1, correct_answer: 0, success_state: { code_patch: 'p1' } }),
      makeStep({ step: 2, correct_answer: 0, success_state: { code_patch: 'p2' } }),
      makeStep({ step: 3, correct_answer: 0, success_state: { code_patch: 'p3' } }),
    ];
    const challenge = makeChallenge(steps);

    // Step 2 is penultimate — should advance to step 3, still playing
    const afterStep2 = submitAnswer(makeSession({ currentStep: 2 }), challenge, 0);
    expect(afterStep2.currentStep).toBe(3);
    expect(afterStep2.status).toBe('playing');

    // Step 3 is last — should become victory
    const afterStep3 = submitAnswer(makeSession({ currentStep: 3 }), challenge, 0);
    expect(afterStep3.currentStep).toBe(3);
    expect(afterStep3.status).toBe('victory');
  });

  // R5.4 — wrong answer subtracts penalty and marks lastResult:incorrect without advancing step
  it('subtracts penalty, marks lastResult:incorrect, and does NOT advance currentStep on wrong answer', () => {
    const step = makeStep({ correct_answer: 0 });
    const challenge = makeChallenge([step]);
    const session = makeSession({ currentStep: 1, remainingTime: 60 });

    const result = submitAnswer(session, challenge, 3); // wrong

    expect(result.lastResult).toBe('incorrect');
    expect(result.currentStep).toBe(1); // unchanged
    expect(result.remainingTime).toBe(60 - PENALTY_SECONDS);
    expect(result.coderLives).toBe(2);
  });

  it('triggers defeat with coder_lives after the third wrong answer', () => {
    const step = makeStep({ correct_answer: 0 });
    const challenge = makeChallenge([step]);
    const session = makeSession({ currentStep: 1, remainingTime: 120, coderLives: 1 });

    const result = submitAnswer(session, challenge, 3);

    expect(result.status).toBe('defeat');
    expect(result.coderLives).toBe(0);
    expect(result.defeatReason).toBe('coder_lives');
  });

  it('prioritizes coder_lives over timeout when the third wrong answer also drains the timer', () => {
    const step = makeStep({ correct_answer: 0 });
    const challenge = makeChallenge([step]);
    const session = makeSession({ currentStep: 1, remainingTime: 5, coderLives: 1 });

    const result = submitAnswer(session, challenge, 3);

    expect(result.status).toBe('defeat');
    expect(result.remainingTime).toBe(0);
    expect(result.defeatReason).toBe('coder_lives');
  });
});

// ---------------------------------------------------------------------------
// Boss encounters — reward / penalty parametrized by the round modifier
// ---------------------------------------------------------------------------

describe('submitAnswer with round modifier', () => {
  it('applies the boss time bonus when completing a boss round', () => {
    const step = makeStep({ correct_answer: 0 });
    const challenge = makeChallenge([step]);
    const session = makeSession({
      currentStep: 1,
      mode: 'endless',
      remainingTime: 100,
      roundModifier: 'boss',
    });

    const result = submitAnswer(session, challenge, 0, 'boss');

    expect(result.roundComplete).toBe(true);
    expect(result.remainingTime).toBe(100 + BOSS_REWARD_SECONDS);
  });

  it('halves the time bonus during an audit event', () => {
    const step = makeStep({ correct_answer: 0 });
    const challenge = makeChallenge([step]);
    const session = makeSession({ currentStep: 1, mode: 'endless', remainingTime: 100 });

    const result = submitAnswer(session, challenge, 0, 'audit');

    expect(result.remainingTime).toBe(100 + Math.round(ENDLESS_REWARD_SECONDS * 0.5));
  });

  it('doubles the penalty on a wrong answer during a watching event', () => {
    const step = makeStep({ correct_answer: 0 });
    const challenge = makeChallenge([step]);
    const session = makeSession({ currentStep: 1, remainingTime: 100 });

    const result = submitAnswer(session, challenge, 3, 'watching');

    expect(result.remainingTime).toBe(100 - PENALTY_SECONDS * 2);
  });

  it('behaves like the base endless flow with no modifier', () => {
    const step = makeStep({ correct_answer: 0 });
    const challenge = makeChallenge([step]);
    const session = makeSession({ currentStep: 1, mode: 'endless', remainingTime: 100 });

    const result = submitAnswer(session, challenge, 0);

    expect(result.remainingTime).toBe(100 + ENDLESS_REWARD_SECONDS);
  });

  it('advances through a boss challenge of 5 steps and completes on the last (dynamic end)', () => {
    const steps = [1, 2, 3, 4, 5].map((n) => makeStep({ step: n, correct_answer: 0 }));
    const challenge = makeChallenge(steps);

    // Solve steps 1..4 — each advances, none completes the round yet.
    let session = makeSession({ currentStep: 1, mode: 'endless', remainingTime: 100 });
    for (let s = 1; s <= 4; s++) {
      session = submitAnswer({ ...session, currentStep: s }, challenge, 0, 'boss');
      expect(session.roundComplete).toBeUndefined();
    }
    // Solving step 5 (the last) completes the boss round.
    const done = submitAnswer({ ...session, currentStep: 5 }, challenge, 0, 'boss');
    expect(done.roundComplete).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R6 — tickTimer
// ---------------------------------------------------------------------------

describe('tickTimer', () => {
  // R6.1 — non-playing status: session returned unchanged
  it.each<GameSession['status']>(['victory', 'defeat', 'idle'])(
    'returns session unchanged (no decrement) when status is %s',
    (status) => {
      const session = makeSession({ status, remainingTime: 50 });
      const result = tickTimer(session);
      expect(result).toBe(session);
    },
  );

  // R6.2 — playing status decrements remainingTime by 1
  it('decrements remainingTime by 1 when status is playing', () => {
    const session = makeSession({ remainingTime: 30 });
    const result = tickTimer(session);
    expect(result.remainingTime).toBe(29);
    expect(result.status).toBe('playing');
  });

  // R6.3 — decrement to <= 0 triggers defeat
  it('sets status to defeat when remainingTime reaches 0 after decrement', () => {
    const session = makeSession({ remainingTime: 1 });
    const result = tickTimer(session);
    expect(result.remainingTime).toBe(0);
    expect(result.status).toBe('defeat');
    expect(result.defeatReason).toBe('timeout');
  });
});

// ---------------------------------------------------------------------------
// R7 — clearLastResult & isTerminalStatus
// ---------------------------------------------------------------------------

describe('clearLastResult', () => {
  // R7.1 — removes lastResult from session
  it('returns a session without the lastResult property', () => {
    const session = makeSession({ lastResult: 'correct' });
    const result = clearLastResult(session);
    expect('lastResult' in result).toBe(false);
  });

  it('does not mutate other session fields', () => {
    const session = makeSession({ remainingTime: 42, lastResult: 'incorrect' });
    const result = clearLastResult(session);
    expect(result.remainingTime).toBe(42);
    expect(result.status).toBe('playing');
  });
});

describe('isTerminalStatus', () => {
  // R7.2 — victory and defeat are terminal
  it.each(['victory', 'defeat'] as const)(
    'returns true for terminal status %s',
    (status) => {
      expect(isTerminalStatus(status)).toBe(true);
    },
  );

  // R7.3 — playing and idle are not terminal
  it.each(['playing', 'idle'] as const)(
    'returns false for non-terminal status %s',
    (status) => {
      expect(isTerminalStatus(status)).toBe(false);
    },
  );
});

describe('abandonGame', () => {
  it('sets status to abandoned and records who abandoned, when playing', () => {
    const session = makeSession({ status: 'playing' });
    const result = abandonGame(session, 'coder');
    expect(result.status).toBe('abandoned');
    expect(result.abandonedBy).toBe('coder');
  });

  it('records the helper as the one who abandoned', () => {
    const result = abandonGame(makeSession({ status: 'playing' }), 'helper');
    expect(result.abandonedBy).toBe('helper');
  });

  it('does not mutate remaining time or step on abandon', () => {
    const session = makeSession({ status: 'playing', remainingTime: 120, currentStep: 2 });
    const result = abandonGame(session, 'coder');
    expect(result.remainingTime).toBe(120);
    expect(result.currentStep).toBe(2);
  });

  it.each(['victory', 'defeat', 'abandoned'] as const)(
    'does nothing when the game is already in terminal status %s',
    (status) => {
      const session = makeSession({ status });
      const result = abandonGame(session, 'coder');
      expect(result).toEqual(session);
    },
  );
});

describe('gameDurationSeconds', () => {
  it('returns whole seconds elapsed since startedAt', () => {
    const session = makeSession({ startedAt: 1_000_000 });
    expect(gameDurationSeconds(session, 1_045_000)).toBe(45);
  });

  it('rounds to the nearest second', () => {
    const session = makeSession({ startedAt: 1_000_000 });
    expect(gameDurationSeconds(session, 1_002_400)).toBe(2);
    expect(gameDurationSeconds(session, 1_002_600)).toBe(3);
  });

  it('never returns a negative duration if clocks disagree', () => {
    const session = makeSession({ startedAt: 2_000_000 });
    expect(gameDurationSeconds(session, 1_000_000)).toBe(0);
  });
});

describe('createPendingSession', () => {
  it('creates an idle room with the requested language and no challenge yet', () => {
    const session = createPendingSession('ABCD', 'python', 1_000_000);

    expect(session.id).toBe('ABCD');
    expect(session.status).toBe('idle');
    expect(session.language).toBe('python');
    expect(session.challengeId).toBe('');
    expect(session.generatedChallenge).toBeUndefined();
    expect(session.generating).toBe(false);
    expect(session.startedAt).toBe(1_000_000);
    expect(session.mode).toBe('endless');
    expect(session.round).toBe(1);
    expect(session.playedRounds).toBe(0);
  });

  it('defaults to random when no language is given', () => {
    const session = createPendingSession('WXYZ', undefined, 1_000_000);
    expect(session.language).toBe('random');
  });

  it('accepts classic mode explicitly', () => {
    const session = createPendingSession('WXYZ', 'php', 1_000_000, undefined, 'classic');
    expect(session.mode).toBe('classic');
  });
});

describe('endlessScore', () => {
  it.each([
    { playedRounds: 0, seconds: 0, expected: 0 },
    { playedRounds: 1, seconds: 45, expected: 1045 },
    { playedRounds: 12, seconds: 300, expected: 12300 },
    { playedRounds: 5, seconds: 999, expected: 5999 },
  ])('returns playedRounds * 1000 + seconds ($playedRounds, $seconds → $expected)', ({
    playedRounds,
    seconds,
    expected,
  }) => {
    expect(endlessScore(playedRounds, seconds)).toBe(expected);
  });
});

describe('submitAnswer — endless mode', () => {
  it('marks roundComplete, increments playedRounds, and adds time bonus on last step', () => {
    const step1 = makeStep({ step: 1, correct_answer: 0, success_state: { code_patch: 'p1' } });
    const step2 = makeStep({ step: 2, correct_answer: 0, success_state: { code_patch: 'p-final' } });
    const challenge = makeChallenge([step1, step2]);
    const session = makeSession({
      mode: 'endless',
      currentStep: 2,
      remainingTime: 80,
      playedRounds: 2,
    });

    const result = submitAnswer(session, challenge, 0);

    expect(result.status).toBe('playing');
    expect(result.roundComplete).toBe(true);
    expect(result.playedRounds).toBe(3);
    expect(result.remainingTime).toBe(80 + ENDLESS_REWARD_SECONDS);
    expect(result.currentCode).toBe('p-final');
    expect(result.currentStep).toBe(2);
  });

  it('does not show victory in endless mode on last step', () => {
    const step = makeStep({ correct_answer: 0, success_state: { code_patch: 'done' } });
    const challenge = makeChallenge([step]);
    const session = makeSession({ mode: 'endless', currentStep: 1 });

    const result = submitAnswer(session, challenge, 0);

    expect(result.status).not.toBe('victory');
    expect(result.roundComplete).toBe(true);
  });

  it('still applies life loss and time penalty on wrong answer', () => {
    const step = makeStep({ correct_answer: 0 });
    const challenge = makeChallenge([step]);
    const session = makeSession({ mode: 'endless', remainingTime: 60, coderLives: 2 });

    const result = submitAnswer(session, challenge, 3);

    expect(result.coderLives).toBe(1);
    expect(result.remainingTime).toBe(60 - PENALTY_SECONDS);
    expect(result.lastResult).toBe('incorrect');
  });

  it('defeats by coder_lives in endless even when time remains', () => {
    const step = makeStep({ correct_answer: 0 });
    const challenge = makeChallenge([step]);
    const session = makeSession({ mode: 'endless', remainingTime: 200, coderLives: 1 });

    const result = submitAnswer(session, challenge, 3);

    expect(result.status).toBe('defeat');
    expect(result.defeatReason).toBe('coder_lives');
  });
});
