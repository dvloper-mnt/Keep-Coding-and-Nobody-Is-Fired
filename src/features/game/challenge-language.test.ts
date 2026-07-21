import { describe, expect, it } from 'vitest';
import {
  SELECTABLE_LANGUAGES,
  languageInstruction,
  resolveLanguage,
} from './challenge-language';
import type { ChallengeLanguage } from './game-types';

describe('resolveLanguage', () => {
  it('returns the language unchanged when a concrete one is given', () => {
    expect(resolveLanguage('php')).toBe('php');
    expect(resolveLanguage('sql')).toBe('sql');
  });

  it('resolves "random" to one of the concrete languages', () => {
    const concrete = SELECTABLE_LANGUAGES.filter((l) => l !== 'random');
    for (let i = 0; i < 50; i++) {
      const resolved = resolveLanguage('random');
      expect(concrete).toContain(resolved);
      expect(resolved).not.toBe('random');
    }
  });
});

describe('languageInstruction', () => {
  it('names the concrete language for the Bedrock prompt', () => {
    const cases: Array<{ lang: Exclude<ChallengeLanguage, 'random'>; expect: string }> = [
      { lang: 'php', expect: 'PHP' },
      { lang: 'sql', expect: 'SQL' },
      { lang: 'typescript', expect: 'TypeScript' },
      { lang: 'javascript', expect: 'JavaScript' },
      { lang: 'python', expect: 'Python' },
      { lang: 'go', expect: 'Go' },
      { lang: 'java', expect: 'Java' },
      { lang: 'ruby', expect: 'Ruby' },
    ];
    for (const c of cases) {
      expect(languageInstruction(c.lang)).toContain(c.expect);
    }
  });

  it('produces a non-empty instruction even when given random (after resolving)', () => {
    const resolved = resolveLanguage('random');
    expect(languageInstruction(resolved).length).toBeGreaterThan(0);
  });
});
