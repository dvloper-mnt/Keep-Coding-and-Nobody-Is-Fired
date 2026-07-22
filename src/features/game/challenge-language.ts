import type { ChallengeLanguage } from './game-types';

export const SELECTABLE_LANGUAGES: readonly ChallengeLanguage[] = [
  'random',
  'php',
  'sql',
  'typescript',
  'javascript',
  'python',
  'go',
  'java',
  'ruby',
] as const;

const CONCRETE_LANGUAGES = SELECTABLE_LANGUAGES.filter(
  (language): language is Exclude<ChallengeLanguage, 'random'> => language !== 'random',
);

const LANGUAGE_LABEL: Record<Exclude<ChallengeLanguage, 'random'>, string> = {
  php: 'PHP (Laravel)',
  sql: 'SQL',
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  python: 'Python',
  go: 'Go',
  java: 'Java',
  ruby: 'Ruby',
};

export function resolveLanguage(language: ChallengeLanguage): Exclude<ChallengeLanguage, 'random'> {
  if (language !== 'random') return language;
  const index = Math.floor(Math.random() * CONCRETE_LANGUAGES.length);
  return CONCRETE_LANGUAGES[index];
}

export function languageInstruction(language: Exclude<ChallengeLanguage, 'random'>): string {
  return (
    `El código, el bug y el mensaje de error deben ser de ${LANGUAGE_LABEL[language]} ` +
    `y usar un error idiomático y realista de ESE lenguaje/framework (no de otro). ` +
    `El ejemplo del sistema usa PHP solo como muestra de CALIDAD; no copies su contenido ` +
    `si el lenguaje pedido es otro.`
  );
}
