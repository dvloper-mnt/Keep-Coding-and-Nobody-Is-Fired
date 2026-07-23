import { describe, expect, it } from 'vitest';
import { isValidChallenge } from './challenge-schema';
import type { Challenge } from './game-types';

function validChallenge(): Challenge {
  return {
    id: 'lvl_test_001',
    title: 'Test challenge',
    difficulty: 'medium',
    story_context: 'Some context',
    time_limit: 180,
    steps: [
      {
        step: 1,
        coder_view: { code: 'echo "broken";', error: '500 Internal Server Error' },
        helper_view: { rules: ['rule a'], knowledge: ['fact a'] },
        options: ['a', 'b', 'c', 'd'],
        correct_answer: 0,
        success_state: { code_patch: 'echo "fixed";' },
        hint: 'a hint',
      },
    ],
  };
}

describe('isValidChallenge', () => {
  it('accepts a well-formed challenge', () => {
    expect(isValidChallenge(validChallenge())).toBe(true);
  });

  it('accepts a step without the optional hint', () => {
    const c = validChallenge();
    delete c.steps[0].hint;
    expect(isValidChallenge(c)).toBe(true);
  });

  it.each([null, undefined, 42, 'nope', []])('rejects non-object/empty value %p', (value) => {
    expect(isValidChallenge(value)).toBe(false);
  });

  it('rejects an unknown difficulty', () => {
    expect(isValidChallenge({ ...validChallenge(), difficulty: 'extreme' })).toBe(false);
  });

  it.each(['easy', 'medium', 'hard', 'expert'] as const)(
    'accepts difficulty %s',
    (difficulty) => {
      expect(isValidChallenge({ ...validChallenge(), difficulty })).toBe(true);
    },
  );

  it('rejects an empty steps array', () => {
    expect(isValidChallenge({ ...validChallenge(), steps: [] })).toBe(false);
  });

  it('rejects a step with the wrong number of options', () => {
    const c = validChallenge();
    c.steps[0].options = ['a', 'b', 'c'] as unknown as Challenge['steps'][number]['options'];
    expect(isValidChallenge(c)).toBe(false);
  });

  it('rejects a correct_answer out of range', () => {
    const c = validChallenge();
    c.steps[0].correct_answer = 4;
    expect(isValidChallenge(c)).toBe(false);
  });

  it('rejects a step missing the code patch', () => {
    const c = validChallenge();
    c.steps[0].success_state = { code_patch: '' };
    expect(isValidChallenge(c)).toBe(false);
  });

  it('rejects a step with empty option strings', () => {
    const c = validChallenge();
    c.steps[0].options = ['a', '', 'c', 'd'];
    expect(isValidChallenge(c)).toBe(false);
  });

  it('rejects helper_view that is not string arrays', () => {
    const c = validChallenge();
    c.steps[0].helper_view = { rules: 'not-an-array' as unknown as string[], knowledge: [] };
    expect(isValidChallenge(c)).toBe(false);
  });

  it('rejects an empty rules array (Helper would have nothing to guide with)', () => {
    const c = validChallenge();
    c.steps[0].helper_view = { rules: [], knowledge: ['fact a'] };
    expect(isValidChallenge(c)).toBe(false);
  });

  it('rejects an empty knowledge array', () => {
    const c = validChallenge();
    c.steps[0].helper_view = { rules: ['rule a'], knowledge: [] };
    expect(isValidChallenge(c)).toBe(false);
  });

  it('rejects blank or placeholder entries in rules/knowledge', () => {
    const c = validChallenge();
    c.steps[0].helper_view = { rules: ['  '], knowledge: ['N/A'] };
    expect(isValidChallenge(c)).toBe(false);
  });

  it('rejects an empty coder_view error (no symptom to diagnose)', () => {
    const c = validChallenge();
    c.steps[0].coder_view = { code: 'x', error: '' };
    expect(isValidChallenge(c)).toBe(false);
  });
});
