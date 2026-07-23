export const PENALTY_SECONDS = 10;
export const DEFAULT_TIME_LIMIT = 180;
export const MAX_LIVES = 3;

export const ENDLESS_BASE_SECONDS = Number(process.env.ENDLESS_BASE_SECONDS ?? '120');
export const ENDLESS_REWARD_SECONDS = Number(process.env.ENDLESS_REWARD_SECONDS ?? '30');

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

export const WRONG_ANSWER_MESSAGE = 'El sistema sigue fallando…';
export const LIFE_LOST_MESSAGE = 'Perdiste 1 vida.';