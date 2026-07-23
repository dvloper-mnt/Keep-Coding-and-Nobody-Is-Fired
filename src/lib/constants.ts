export const PENALTY_SECONDS = 10;
export const DEFAULT_TIME_LIMIT = 180;
export const MAX_LIVES = 3;

export const ENDLESS_BASE_SECONDS = Number(process.env.ENDLESS_BASE_SECONDS ?? '240');
export const ENDLESS_REWARD_SECONDS = Number(process.env.ENDLESS_REWARD_SECONDS ?? '60');

// Boss encounters (see .kiro/specs/boss-encounters). The boss is a FORMAT change
// (multi-step with memory), not a difficulty bump. Surprise events twist the
// rules of a normal round; the boss round rewards more.
export const BOSS_EVENTS = {
  audit: {
    id: 'audit',
    notice: 'Auditoría sorpresa: el bono de tiempo de esta ronda viene reducido.',
    timeBonusFactor: 0.5, // half the completion time bonus
    penaltyFactor: 1,
  },
  watching: {
    id: 'watching',
    notice: 'El jefe está mirando: los errores de esta ronda cuestan el doble.',
    timeBonusFactor: 1,
    penaltyFactor: 2, // double penalty on a wrong answer
  },
} as const;

export const BOSS_EVENT_CHANCE = 0.2; // probability of an event on a normal round
export const BOSS_REWARD_SECONDS = 120; // boss-round time bonus (vs 60 normal)
export const BOSS_SCORE_BONUS = 2000; // extra score for beating the boss

export const CLIENT_QUESTION_CONFIG = {
  spawnIntervalSeconds: 40,
  spawnChance: 0.45,
  wrongPenaltySeconds: 10,
  correctBonusSeconds: 5,
  maxQuestionsPerSession: 6,
} as const;

export const CLIENT_QUESTION_WRONG_MESSAGE =
  'El cliente no quedó conforme con la respuesta…';
export const CLIENT_QUESTION_CORRECT_MESSAGE =
  'Buena respuesta. El cliente queda tranquilo por ahora.';

export const BOSS_MESSAGES = [
  '¿QUÉ ESTÁ PASANDO EN PRODUCCIÓN?',
  'TENEMOS CLIENTES MIRANDO ESTO',
  'SI ESTO FALLA, HAY CONSECUENCIAS',
  'NO TENEMOS TIEMPO',
  '¿POR QUÉ SIGUE TODO EN ROJO?',
  'EL CLIENTE ESTÁ PREGUNTANDO DEMASIADO',
  'NECESITO UNA ACTUALIZACIÓN YA',
  '¿QUIÉN TOCÓ PRODUCCIÓN?',
  '¿POR QUÉ HAY MÁS ERRORES AHORA?',
  'NECESITO BUENAS NOTICIAS',
  'ESTE ERA NUESTRO MOMENTO DE BRILLAR',
  'CADA SEGUNDO CUENTA',
  'NECESITO VER PROGRESO',
  'FINGIR CONFIANZA YA NO ESTÁ FUNCIONANDO',
  'NO SÉ QUÉ HACEN, PERO HÁGANLO MÁS RÁPIDO',
] as const;

export const BOSS_PRESSURE_CONFIG = {
  messages: BOSS_MESSAGES,
  spawnIntervalMs: 15_000,
  maxVisibleMessages: 7,
  // Toasts live in the side columns only, never over the central panel where the
  // code, error and options are — otherwise the boss pressure hides the very
  // thing the Coder needs to read. leftPercent stays under sideZoneMaxPercent
  // (left column) or over its mirror (right column).
  edgeMarginPercent: 8,
  sideZoneMaxPercent: 26,
} as const;

// Intensified pressure during a boss round / surprise event: toasts appear more
// often and more of them at once. Same side-column zone (never over the code),
// so it raises tension without hiding what the Coder must read.
export const BOSS_PRESSURE_CONFIG_INTENSE = {
  ...BOSS_PRESSURE_CONFIG,
  spawnIntervalMs: 7_000,
  maxVisibleMessages: 10,
} as const;

export const WRONG_ANSWER_MESSAGE = 'El sistema sigue fallando…';
export const LIFE_LOST_MESSAGE = 'Perdiste 1 vida.';

/** Combo tiers — highest minStreak first; edit here to tune balance without touching engine logic. */
export const STREAK_TIERS = [
  { minStreak: 7, multiplier: 3 },
  { minStreak: 5, multiplier: 2 },
  { minStreak: 3, multiplier: 1.5 },
] as const;

export const BASE_MULTIPLIER = 1;
export const COMBO_BASE_PER_HIT = 100;