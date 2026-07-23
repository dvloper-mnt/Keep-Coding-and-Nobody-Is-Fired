import { describe, expect, it } from 'vitest';
import {
  buildCoderStartPath,
  DEFAULT_GAME_MODE,
  parseChallengeLanguageParam,
  parseGameMode,
  resolveCoderStartParams,
} from './game-mode';

describe('parseGameMode', () => {
  it.each([
    { input: 'classic', expected: 'classic' },
    { input: 'endless', expected: 'endless' },
    { input: undefined, expected: DEFAULT_GAME_MODE },
    { input: null, expected: DEFAULT_GAME_MODE },
    { input: '', expected: DEFAULT_GAME_MODE },
    { input: 'arcade', expected: DEFAULT_GAME_MODE },
  ])('maps $input to $expected', ({ input, expected }) => {
    expect(parseGameMode(input)).toBe(expected);
  });
});

describe('parseChallengeLanguageParam', () => {
  it('returns the language when it is selectable', () => {
    expect(parseChallengeLanguageParam('python')).toBe('python');
  });

  it('defaults to random when missing or unknown', () => {
    expect(parseChallengeLanguageParam(null)).toBe('random');
    expect(parseChallengeLanguageParam(undefined)).toBe('random');
    expect(parseChallengeLanguageParam('cobol')).toBe('random');
    expect(parseChallengeLanguageParam(42)).toBe('random');
  });
});

describe('resolveCoderStartParams', () => {
  it('combines language and mode from query params', () => {
    expect(resolveCoderStartParams('sql', 'classic')).toEqual({
      language: 'sql',
      mode: 'classic',
    });
  });

  it('defaults language to random and mode to endless', () => {
    expect(resolveCoderStartParams(null, null)).toEqual({
      language: 'random',
      mode: 'endless',
    });
  });
});

describe('buildCoderStartPath', () => {
  it('builds a coder URL with lang and mode query params', () => {
    expect(buildCoderStartPath('typescript', 'endless')).toBe(
      '/coder?lang=typescript&mode=endless',
    );
  });

  it('includes classic mode in the path', () => {
    expect(buildCoderStartPath('random', 'classic')).toBe('/coder?lang=random&mode=classic');
  });
});