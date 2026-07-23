import type { Difficulty, GameMode } from './game-types';

export function roundToDifficulty(round: number): Difficulty {
  if (!Number.isInteger(round) || round < 1) return 'easy';
  if (round <= 3) return 'easy';
  if (round <= 7) return 'medium';
  if (round <= 12) return 'hard';
  return 'expert';
}

/** Derives the round number used for difficulty when generating the next challenge. */
export function resolveRoundForGeneration(session: {
  mode: GameMode;
  round: number;
  roundComplete?: boolean;
}): number {
  if (session.mode !== 'endless') return 1;
  if (session.roundComplete) {
    const nextRound = session.round + 1;
    return Number.isInteger(nextRound) && nextRound >= 1 ? nextRound : 1;
  }
  if (!Number.isInteger(session.round) || session.round < 1) return 1;
  return session.round;
}

const DIFFICULTY_INSTRUCTION: Record<Difficulty, string> = {
  easy:
    'Nivel de dificultad: FÁCIL. El bug debe ser evidente y directo de diagnosticar con la teoría del Helper. ' +
    'Usa distractores poco creíbles. Mantén EXACTAMENTE 3 pasos encadenados; en cada paso un solo bug obvio. ' +
    'Las rules y knowledge deben seguir siendo completas y útiles (nunca vacías ni placeholders).',
  medium:
    'Nivel de dificultad: MEDIO. El bug debe requerir cruzar síntoma con teoría; los distractores deben ser plausibles. ' +
    'Mantén EXACTAMENTE 3 pasos encadenados con bugs moderadamente encadenados (la corrección de un paso revela el siguiente). ' +
    'Las rules y knowledge deben seguir siendo completas y útiles (nunca vacías ni placeholders).',
  hard:
    'Nivel de dificultad: DIFÍCIL. Los bugs deben ser sutiles: causas menos obvias, síntomas que pueden confundirse con otro problema. ' +
    'Mantén EXACTAMENTE 3 pasos encadenados con bugs claramente encadenados entre sí. Distractores muy creíbles. ' +
    'Las rules y knowledge deben seguir siendo completas y útiles (nunca vacías ni placeholders).',
  expert:
    'Nivel de dificultad: EXPERTO. Bugs muy sutiles y varios encadenados dentro de los 3 pasos: cada fix revela un problema más profundo. ' +
    'Distractores altamente creíbles que parecen la causa correcta. Mantén EXACTAMENTE 3 pasos (NO agregues más). ' +
    'Las rules y knowledge deben seguir siendo completas y útiles (nunca vacías ni placeholders).',
};

export function difficultyInstruction(difficulty: Difficulty): string {
  return DIFFICULTY_INSTRUCTION[difficulty];
}

export function difficultyForSession(session: {
  mode: GameMode;
  round: number;
  roundComplete?: boolean;
}): Difficulty {
  return roundToDifficulty(resolveRoundForGeneration(session));
}