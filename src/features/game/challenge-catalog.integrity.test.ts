import { describe, expect, it } from 'vitest';
import { loadChallenges } from '@/src/data/challenges';
import { isValidChallenge } from './challenge-schema';
import { checkCooperativeIntegrity } from './cooperative-integrity';

// ---------------------------------------------------------------------------
// The curated challenges are the fallback when Bedrock fails or leaks. If a
// curated challenge itself leaks the answer to the Helper, the demo breaks the
// same way even with Bedrock working. This is a build guardrail: every curated
// challenge must pass BOTH structural validation and cooperative integrity, so
// a future curated file that serves the answer in its rules breaks the build.
// ---------------------------------------------------------------------------

describe('curated challenge catalog — cooperative integrity guardrail', () => {
  const challenges = loadChallenges();

  it('has at least one curated challenge', () => {
    expect(challenges.length).toBeGreaterThan(0);
  });

  it.each(challenges.map((c) => ({ id: c.id, challenge: c })))(
    '$id is structurally valid',
    ({ challenge }) => {
      expect(isValidChallenge(challenge)).toBe(true);
    },
  );

  it.each(challenges.map((c) => ({ id: c.id, challenge: c })))(
    '$id keeps cooperative integrity (no rule/knowledge leaks the answer)',
    ({ challenge }) => {
      const result = checkCooperativeIntegrity(challenge);
      // Surface the failing step + reason in the assertion message so a broken
      // curated file points straight at what to rewrite.
      expect(
        result,
        result.ok
          ? ''
          : `step ${result.step}: ${result.reason}`,
      ).toEqual({ ok: true });
    },
  );
});
