import type { Challenge, ChallengeStep, MultipleChoiceOptions } from './game-types';

// ---------------------------------------------------------------------------
// Neutralize the "option-A bias" seen in Bedrock output. The SYSTEM_PROMPT has
// a single few-shot example whose correct_answer is 0, and 3/4 curated fallback
// challenges also fix correct_answer at 0 in every step. Both patterns train
// the model (or reinforce it via prompt priming) to always place the correct
// option at index 0 — making the game exploitable by clicking "A" blindly.
//
// This module shuffles the four options at the moment a challenge is loaded
// into a session and rewrites correct_answer to still point at the SAME text.
// The pure `applyOptionPermutation` is TDD-friendly; `randomOptionPermutation`
// isolates the single call to Math.random so the pure function stays testable.
// The rest of the challenge (helper_view, coder_view, code_patch, hint) is
// untouched — only ordering changes.
// ---------------------------------------------------------------------------

/** A permutation of [0, 1, 2, 3] used to reorder a step's four options. */
export type OptionPermutation = readonly [number, number, number, number];

/** True when `perm` is a valid permutation of [0, 1, 2, 3]. */
export function isValidOptionPermutation(perm: readonly number[]): boolean {
  if (perm.length !== 4) return false;
  const seen = new Set<number>();
  for (const value of perm) {
    if (!Number.isInteger(value) || value < 0 || value > 3) return false;
    seen.add(value);
  }
  return seen.size === 4;
}

/**
 * Returns a new step with options reordered according to `perm` and
 * `correct_answer` updated to the new index of the previously-correct option.
 * Pure: does not mutate the input step.
 *
 * Example: perm=[1,3,0,2] and correct_answer=0 → the option that was at index 0
 * ends up at index 2 in the new order, so the new correct_answer is 2.
 */
export function applyOptionPermutation(
  step: ChallengeStep,
  perm: OptionPermutation,
): ChallengeStep {
  const [a, b, c, d] = perm;
  const shuffledOptions: MultipleChoiceOptions = [
    step.options[a],
    step.options[b],
    step.options[c],
    step.options[d],
  ];
  const newCorrect = perm.indexOf(step.correct_answer);

  return {
    ...step,
    options: shuffledOptions,
    correct_answer: newCorrect,
  };
}

/**
 * Fisher–Yates shuffle of [0, 1, 2, 3]. Wraps the only call to `Math.random`
 * in this module so `applyOptionPermutation` stays deterministic and testable.
 */
export function randomOptionPermutation(): OptionPermutation {
  const perm: [number, number, number, number] = [0, 1, 2, 3];
  for (let i = perm.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }
  return perm;
}

/**
 * Returns a new challenge with each step's options shuffled by a fresh random
 * permutation. Impure by design (draws from Math.random per step); intended
 * to run once when a challenge is attached to a session, so the persisted
 * shuffled order is stable for that session's lifetime.
 */
export function shuffleChallengeOptions(challenge: Challenge): Challenge {
  return {
    ...challenge,
    steps: challenge.steps.map((step) =>
      applyOptionPermutation(step, randomOptionPermutation()),
    ),
  };
}
