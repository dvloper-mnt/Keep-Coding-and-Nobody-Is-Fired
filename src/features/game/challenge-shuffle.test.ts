import { describe, expect, it } from 'vitest';
import {
  applyOptionPermutation,
  isValidOptionPermutation,
  shuffleChallengeOptions,
  type OptionPermutation,
} from './challenge-shuffle';
import { makeChallenge, makeStep } from './testing/fixtures';

// ---------------------------------------------------------------------------
// applyOptionPermutation moves options[] into a new order and rewrites
// correct_answer so it still points to the SAME text. Pure, deterministic:
// the caller injects the permutation, no Math.random inside.
//
// The rest of the pipeline (helper_view, coder_view, code_patch, hint,
// options[i] text itself) is untouched — only ordering changes.
// ---------------------------------------------------------------------------

const IDENTITY: OptionPermutation = [0, 1, 2, 3];

describe('applyOptionPermutation', () => {
  it('identity permutation leaves the step unchanged (shape-preserving no-op)', () => {
    const step = makeStep({
      options: ['A right', 'B wrong', 'C wrong', 'D wrong'],
      correct_answer: 0,
    });
    const result = applyOptionPermutation(step, IDENTITY);

    expect(result.options).toEqual(['A right', 'B wrong', 'C wrong', 'D wrong']);
    expect(result.correct_answer).toBe(0);
  });

  it('reorders options and updates correct_answer to the same text', () => {
    const step = makeStep({
      options: ['A right', 'B wrong', 'C wrong', 'D wrong'],
      correct_answer: 0,
    });
    // Move option-A (correct) from index 0 to index 2.
    const perm: OptionPermutation = [1, 3, 0, 2];
    const result = applyOptionPermutation(step, perm);

    expect(result.options).toEqual(['B wrong', 'D wrong', 'A right', 'C wrong']);
    expect(result.correct_answer).toBe(2);
    // The correct option text is preserved after the swap.
    expect(result.options[result.correct_answer]).toBe('A right');
  });

  it('does not mutate the input step', () => {
    const step = makeStep({
      options: ['A right', 'B wrong', 'C wrong', 'D wrong'],
      correct_answer: 0,
    });
    const before = JSON.stringify(step);
    applyOptionPermutation(step, [3, 2, 1, 0]);

    expect(JSON.stringify(step)).toBe(before);
  });

  it('preserves helper_view, coder_view, code_patch and hint verbatim', () => {
    const step = makeStep({
      options: ['A right', 'B', 'C', 'D'],
      correct_answer: 0,
      helper_view: {
        rules: ['r1', 'r2', 'r3'],
        knowledge: ['k1', 'k2'],
      },
      hint: 'a hint',
    });
    const result = applyOptionPermutation(step, [2, 1, 0, 3]);

    expect(result.helper_view).toEqual(step.helper_view);
    expect(result.coder_view).toEqual(step.coder_view);
    expect(result.success_state).toEqual(step.success_state);
    expect(result.hint).toBe(step.hint);
    expect(result.step).toBe(step.step);
  });

  it('works when the correct option is not at index 0', () => {
    const step = makeStep({
      options: ['A wrong', 'B wrong', 'C right', 'D wrong'],
      correct_answer: 2,
    });
    // Move option-C (correct) from index 2 to index 3.
    const result = applyOptionPermutation(step, [0, 1, 3, 2]);

    expect(result.options).toEqual(['A wrong', 'B wrong', 'D wrong', 'C right']);
    expect(result.correct_answer).toBe(3);
  });
});

describe('isValidOptionPermutation', () => {
  it('accepts every permutation of [0,1,2,3]', () => {
    expect(isValidOptionPermutation([0, 1, 2, 3])).toBe(true);
    expect(isValidOptionPermutation([3, 2, 1, 0])).toBe(true);
    expect(isValidOptionPermutation([1, 3, 0, 2])).toBe(true);
  });

  it('rejects arrays with the wrong length', () => {
    expect(isValidOptionPermutation([0, 1, 2])).toBe(false);
    expect(isValidOptionPermutation([0, 1, 2, 3, 4])).toBe(false);
  });

  it('rejects arrays with duplicates', () => {
    expect(isValidOptionPermutation([0, 0, 1, 2])).toBe(false);
    expect(isValidOptionPermutation([1, 1, 1, 1])).toBe(false);
  });

  it('rejects arrays with out-of-range values', () => {
    expect(isValidOptionPermutation([-1, 1, 2, 3])).toBe(false);
    expect(isValidOptionPermutation([0, 1, 2, 4])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shuffleChallengeOptions is the impure wrapper — it draws a fresh random
// permutation per step. Tested loosely (statistical property) because we can't
// pin down Math.random without a heavier fake, and the pure applyOptionPermutation
// above already covers correctness.
// ---------------------------------------------------------------------------

describe('shuffleChallengeOptions', () => {
  it('preserves the correct option text at the (possibly new) correct_answer index in every step', () => {
    const challenge = makeChallenge({
      steps: [
        makeStep({ step: 1, options: ['s1A', 's1B', 's1C', 's1D'], correct_answer: 0 }),
        makeStep({ step: 2, options: ['s2A', 's2B', 's2C', 's2D'], correct_answer: 0 }),
        makeStep({ step: 3, options: ['s3A', 's3B', 's3C', 's3D'], correct_answer: 0 }),
      ],
    });
    const originalCorrect = challenge.steps.map((step) => step.options[step.correct_answer]);

    const shuffled = shuffleChallengeOptions(challenge);

    // Structural invariants preserved.
    expect(shuffled.steps).toHaveLength(3);
    for (let i = 0; i < shuffled.steps.length; i++) {
      const s = shuffled.steps[i];
      if (!s) throw new Error('step missing');
      expect(s.options).toHaveLength(4);
      expect(s.correct_answer).toBeGreaterThanOrEqual(0);
      expect(s.correct_answer).toBeLessThan(4);
      // The correct option TEXT is stable — only its index moved.
      expect(s.options[s.correct_answer]).toBe(originalCorrect[i]);
    }
  });

  it('does not mutate the input challenge', () => {
    const challenge = makeChallenge({
      steps: [
        makeStep({ step: 1, options: ['a', 'b', 'c', 'd'], correct_answer: 0 }),
      ],
    });
    const snapshot = JSON.stringify(challenge);
    shuffleChallengeOptions(challenge);

    expect(JSON.stringify(challenge)).toBe(snapshot);
  });
});
