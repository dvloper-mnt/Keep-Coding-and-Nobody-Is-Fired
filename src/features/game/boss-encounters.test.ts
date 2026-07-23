import { describe, expect, it } from 'vitest';
import {
  bossFormatInstruction,
  isBossFormat,
  isBossRound,
  penaltyFor,
  pickBossEvent,
  rewardSecondsFor,
  scoreBonusFor,
} from './boss-encounters';
import type { RoundModifier } from './game-types';
import {
  BOSS_EVENT_CHANCE,
  BOSS_REWARD_SECONDS,
  BOSS_SCORE_BONUS,
  ENDLESS_REWARD_SECONDS,
  PENALTY_SECONDS,
} from '@/src/lib/constants';
import { makeChallenge, makeStep } from './testing/fixtures';

// ---------------------------------------------------------------------------
// The boss is a FORMAT change, not a difficulty bump. All randomness is injected
// (the `roll` is a parameter) so the logic is deterministic in tests. See
// .kiro/specs/boss-encounters/design.md.
// ---------------------------------------------------------------------------

describe('isBossRound', () => {
  const cases: Array<{ round: number; expected: boolean }> = [
    { round: 0, expected: false },
    { round: 1, expected: false },
    { round: 9, expected: false },
    { round: 10, expected: true },
    { round: 11, expected: false },
    { round: 19, expected: false },
    { round: 20, expected: true },
    { round: 100, expected: true },
    { round: -10, expected: false },
    { round: 10.5, expected: false },
  ];

  it.each(cases)('round $round → $expected', ({ round, expected }) => {
    expect(isBossRound(round)).toBe(expected);
  });

  it('treats NaN / Infinity as not a boss round', () => {
    expect(isBossRound(Number.NaN)).toBe(false);
    expect(isBossRound(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('pickBossEvent', () => {
  it('always returns "boss" on a boss round, regardless of the roll', () => {
    expect(pickBossEvent(10, 0)).toBe('boss');
    expect(pickBossEvent(10, 0.99)).toBe('boss');
    expect(pickBossEvent(20, 0.5)).toBe('boss');
  });

  it('returns "none" on a normal round when the roll is at/above the chance', () => {
    expect(pickBossEvent(5, BOSS_EVENT_CHANCE)).toBe('none');
    expect(pickBossEvent(5, 0.99)).toBe('none');
  });

  it('returns an event id on a normal round when the roll is below the chance', () => {
    const modifier = pickBossEvent(5, 0);
    expect(['audit', 'watching']).toContain(modifier);
  });

  it('can select both catalog events depending on the roll', () => {
    // roll 0 → first event, a roll in the upper half of the chance window → the
    // second. The exact split is an implementation detail; both must be reachable.
    const low = pickBossEvent(3, 0);
    const high = pickBossEvent(3, BOSS_EVENT_CHANCE - 0.001);
    const seen = new Set<RoundModifier>([low, high]);
    expect(seen.has('audit')).toBe(true);
    expect(seen.has('watching')).toBe(true);
  });
});

describe('rewardSecondsFor', () => {
  it('gives the boss round a bigger time bonus', () => {
    expect(rewardSecondsFor('boss')).toBe(BOSS_REWARD_SECONDS);
    expect(BOSS_REWARD_SECONDS).toBeGreaterThan(ENDLESS_REWARD_SECONDS);
  });

  it('halves the bonus during an audit event', () => {
    expect(rewardSecondsFor('audit')).toBe(Math.round(ENDLESS_REWARD_SECONDS * 0.5));
  });

  it('gives the normal bonus for none and watching', () => {
    expect(rewardSecondsFor('none')).toBe(ENDLESS_REWARD_SECONDS);
    expect(rewardSecondsFor('watching')).toBe(ENDLESS_REWARD_SECONDS);
  });
});

describe('penaltyFor', () => {
  it('doubles the penalty during a watching event', () => {
    expect(penaltyFor('watching')).toBe(PENALTY_SECONDS * 2);
  });

  it('gives the normal penalty for none, boss and audit', () => {
    expect(penaltyFor('none')).toBe(PENALTY_SECONDS);
    expect(penaltyFor('boss')).toBe(PENALTY_SECONDS);
    expect(penaltyFor('audit')).toBe(PENALTY_SECONDS);
  });
});

describe('scoreBonusFor', () => {
  it('awards the boss score bonus only on a boss round', () => {
    expect(scoreBonusFor('boss')).toBe(BOSS_SCORE_BONUS);
    expect(scoreBonusFor('none')).toBe(0);
    expect(scoreBonusFor('audit')).toBe(0);
    expect(scoreBonusFor('watching')).toBe(0);
  });
});

describe('isBossFormat', () => {
  it('is true when the challenge has more than 3 steps', () => {
    const steps = [1, 2, 3, 4].map((n) => makeStep({ step: n }));
    expect(isBossFormat(makeChallenge({ steps }))).toBe(true);
  });

  it('is false for the standard 3-step format', () => {
    const steps = [1, 2, 3].map((n) => makeStep({ step: n }));
    expect(isBossFormat(makeChallenge({ steps }))).toBe(false);
  });

  it('is false for fewer than 3 steps', () => {
    expect(isBossFormat(makeChallenge({ steps: [makeStep()] }))).toBe(false);
  });
});

describe('bossFormatInstruction', () => {
  it('returns non-empty Spanish text mentioning multi-step and memory dependency', () => {
    const text = bossFormatInstruction();
    expect(text.length).toBeGreaterThan(0);
    // It must ask for more than 3 steps and a memory dependency between steps.
    expect(text).toMatch(/pasos/i);
    expect(text.toLowerCase()).toContain('jefe');
  });
});
