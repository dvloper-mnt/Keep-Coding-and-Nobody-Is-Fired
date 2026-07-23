import { describe, expect, it } from 'vitest';
import {
  isHintRevealed,
  isKnowledgeRevealed,
  lockedKnowledgeIndicesFor,
  markHelperItemRevealed,
  validateReveal,
} from './helper-reveal-engine';
import { makeChallenge, makeSession, makeStep } from './testing/fixtures';

// ---------------------------------------------------------------------------
// Pure reveal state transitions and validation. The service composes these
// with the game clock (applyTimeDelta) and persistence; here we only prove
// the state math.
// ---------------------------------------------------------------------------

describe('isKnowledgeRevealed / isHintRevealed', () => {
  it('returns false when the session has no revealed items yet', () => {
    const session = makeSession();

    expect(isKnowledgeRevealed(session, 1, 0)).toBe(false);
    expect(isHintRevealed(session, 1)).toBe(false);
  });

  it('reads the flag from the matching step entry', () => {
    const session = makeSession({
      revealedHelperItems: {
        '1': { knowledge: [0, 2], hint: true },
        '2': { knowledge: [], hint: false },
      },
    });

    expect(isKnowledgeRevealed(session, 1, 0)).toBe(true);
    expect(isKnowledgeRevealed(session, 1, 2)).toBe(true);
    expect(isKnowledgeRevealed(session, 1, 1)).toBe(false);
    expect(isHintRevealed(session, 1)).toBe(true);

    expect(isKnowledgeRevealed(session, 2, 0)).toBe(false);
    expect(isHintRevealed(session, 2)).toBe(false);
  });
});

describe('lockedKnowledgeIndicesFor', () => {
  it('locks all indices when nothing has been revealed', () => {
    const session = makeSession();
    expect(lockedKnowledgeIndicesFor(session, 1, 3)).toEqual([0, 1, 2]);
  });

  it('subtracts the revealed indices from the full set', () => {
    const session = makeSession({
      revealedHelperItems: { '1': { knowledge: [1], hint: false } },
    });
    expect(lockedKnowledgeIndicesFor(session, 1, 3)).toEqual([0, 2]);
  });

  it('returns empty when everything is unlocked', () => {
    const session = makeSession({
      revealedHelperItems: { '1': { knowledge: [0, 1, 2], hint: true } },
    });
    expect(lockedKnowledgeIndicesFor(session, 1, 3)).toEqual([]);
  });
});

describe('markHelperItemRevealed', () => {
  it('records a knowledge reveal without mutating the input', () => {
    const session = makeSession();
    const snapshot = JSON.stringify(session);
    const next = markHelperItemRevealed(session, { type: 'knowledge', step: 1, index: 0 });

    expect(JSON.stringify(session)).toBe(snapshot);
    expect(next.revealedHelperItems?.['1']).toEqual({ knowledge: [0], hint: false });
  });

  it('appends without duplicating an already-revealed index', () => {
    const session = makeSession({
      revealedHelperItems: { '1': { knowledge: [0], hint: false } },
    });
    const next = markHelperItemRevealed(session, { type: 'knowledge', step: 1, index: 0 });

    expect(next.revealedHelperItems?.['1']).toEqual({ knowledge: [0], hint: false });
  });

  it('records a hint reveal without touching knowledge', () => {
    const session = makeSession({
      revealedHelperItems: { '1': { knowledge: [2], hint: false } },
    });
    const next = markHelperItemRevealed(session, { type: 'hint', step: 1 });

    expect(next.revealedHelperItems?.['1']).toEqual({ knowledge: [2], hint: true });
  });

  it('keeps other steps untouched', () => {
    const session = makeSession({
      revealedHelperItems: {
        '1': { knowledge: [0], hint: false },
        '2': { knowledge: [], hint: false },
      },
    });
    const next = markHelperItemRevealed(session, { type: 'knowledge', step: 2, index: 1 });

    expect(next.revealedHelperItems?.['1']).toEqual({ knowledge: [0], hint: false });
    expect(next.revealedHelperItems?.['2']).toEqual({ knowledge: [1], hint: false });
  });
});

describe('validateReveal — structural', () => {
  const challenge = makeChallenge({
    steps: [
      makeStep({
        step: 1,
        helper_view: { rules: ['r'], knowledge: ['k0', 'k1'] },
        hint: 'a hint',
      }),
    ],
  });

  it('rejects a non-integer or non-positive step', () => {
    const session = makeSession();

    expect(validateReveal(session, challenge, { type: 'knowledge', step: 0, index: 0 })).toEqual({
      ok: false,
      reason: 'out-of-range',
    });
    expect(validateReveal(session, challenge, { type: 'knowledge', step: 1.5, index: 0 })).toEqual({
      ok: false,
      reason: 'out-of-range',
    });
  });

  it('rejects a step that does not exist in the challenge', () => {
    const session = makeSession();

    expect(validateReveal(session, challenge, { type: 'knowledge', step: 5, index: 0 })).toEqual({
      ok: false,
      reason: 'out-of-range',
    });
  });

  it('rejects a knowledge index out of range', () => {
    const session = makeSession();

    expect(validateReveal(session, challenge, { type: 'knowledge', step: 1, index: 5 })).toEqual({
      ok: false,
      reason: 'out-of-range',
    });
    expect(validateReveal(session, challenge, { type: 'knowledge', step: 1, index: -1 })).toEqual({
      ok: false,
      reason: 'out-of-range',
    });
  });

  it('rejects a hint reveal when the step has no hint', () => {
    const challengeNoHint = makeChallenge({
      steps: [makeStep({ step: 1, hint: undefined })],
    });
    const session = makeSession();

    expect(validateReveal(session, challengeNoHint, { type: 'hint', step: 1 })).toEqual({
      ok: false,
      reason: 'out-of-range',
    });
  });
});

describe('validateReveal — idempotence', () => {
  const challenge = makeChallenge({
    steps: [
      makeStep({
        step: 1,
        helper_view: { rules: ['r'], knowledge: ['k0', 'k1'] },
        hint: 'a hint',
      }),
    ],
  });

  it('rejects a knowledge reveal that already happened', () => {
    const session = makeSession({
      revealedHelperItems: { '1': { knowledge: [0], hint: false } },
    });

    expect(validateReveal(session, challenge, { type: 'knowledge', step: 1, index: 0 })).toEqual({
      ok: false,
      reason: 'already-revealed',
    });
  });

  it('rejects a hint reveal that already happened', () => {
    const session = makeSession({
      revealedHelperItems: { '1': { knowledge: [], hint: true } },
    });

    expect(validateReveal(session, challenge, { type: 'hint', step: 1 })).toEqual({
      ok: false,
      reason: 'already-revealed',
    });
  });

  it('accepts a fresh reveal on a valid target', () => {
    const session = makeSession();

    expect(validateReveal(session, challenge, { type: 'knowledge', step: 1, index: 0 })).toEqual({
      ok: true,
    });
    expect(validateReveal(session, challenge, { type: 'hint', step: 1 })).toEqual({ ok: true });
  });
});
