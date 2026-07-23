import { SELECTABLE_LANGUAGES } from './challenge-language';
import type { ChallengeLanguage, GameMode } from './game-types';

export const DEFAULT_GAME_MODE: GameMode = 'endless';

export const GAME_MODE_OPTIONS = [
  {
    value: 'classic' as const,
    label: 'Partida normal',
    description: 'Un incidente. Lo resuelves y ganas.',
  },
  {
    value: 'endless' as const,
    label: 'Modo infinito',
    description: 'Rondas seguidas. Sobrevives lo más que puedas.',
  },
] as const;

export function parseGameMode(value: unknown): GameMode {
  return value === 'classic' ? 'classic' : 'endless';
}

export function parseChallengeLanguageParam(value: unknown): ChallengeLanguage {
  return typeof value === 'string' &&
    SELECTABLE_LANGUAGES.includes(value as ChallengeLanguage)
    ? (value as ChallengeLanguage)
    : 'random';
}

export function resolveCoderStartParams(
  langParam: unknown,
  modeParam: unknown,
): { language: ChallengeLanguage; mode: GameMode } {
  return {
    language: parseChallengeLanguageParam(langParam),
    mode: parseGameMode(modeParam),
  };
}

export function buildCoderStartPath(language: ChallengeLanguage, mode: GameMode): string {
  const params = new URLSearchParams({ lang: language, mode });
  return `/coder?${params.toString()}`;
}