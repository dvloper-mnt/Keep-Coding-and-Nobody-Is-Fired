import {
  BOSS_EVENT_CHANCE,
  BOSS_EVENTS,
  BOSS_REWARD_SECONDS,
  BOSS_SCORE_BONUS,
  ENDLESS_REWARD_SECONDS,
  PENALTY_SECONDS,
} from '@/src/lib/constants';
import type { BossEventId, Challenge, RoundModifier } from './game-types';

// ---------------------------------------------------------------------------
// Boss encounters: the "boss" intervenes in the endless loop. Two faces —
// a periodic boss round (every 10th round, a FORMAT change: multi-step with
// memory) and random surprise events on normal rounds (they twist the rules).
// All logic here is pure: the boss round depends only on the round number, and
// event selection takes an injected `roll` (never reads Math.random) so it is
// deterministic in tests. See .kiro/specs/boss-encounters/design.md.
// ---------------------------------------------------------------------------

// Catalog event ids, in a stable order so `pickBossEvent` maps a roll to one
// deterministically.
const EVENT_IDS: readonly BossEventId[] = ['audit', 'watching'];

/** True when the round is a boss round: an integer ≥ 1 that is a multiple of 10. */
export function isBossRound(round: number): boolean {
  return Number.isInteger(round) && round >= 1 && round % 10 === 0;
}

/**
 * Decides the modifier of a round. Boss rounds always return `'boss'` (and never
 * an event — they are mutually exclusive). On a normal round, a `roll` below the
 * configured chance selects a catalog event; otherwise `'none'`.
 *
 * @param round the round number
 * @param roll  injected random value in [0, 1) — the ONLY source of randomness,
 *              passed in so this function stays pure and testable.
 */
export function pickBossEvent(round: number, roll: number): RoundModifier {
  if (isBossRound(round)) return 'boss';
  if (roll < BOSS_EVENT_CHANCE) {
    // Map the roll's position within the chance window to a catalog id.
    const fraction = BOSS_EVENT_CHANCE > 0 ? roll / BOSS_EVENT_CHANCE : 0;
    const index = Math.min(EVENT_IDS.length - 1, Math.floor(fraction * EVENT_IDS.length));
    return EVENT_IDS[index] ?? 'none';
  }
  return 'none';
}

/** Time bonus awarded on completing a round, per active modifier. */
export function rewardSecondsFor(modifier: RoundModifier): number {
  if (modifier === 'boss') return BOSS_REWARD_SECONDS;
  if (modifier === 'audit') {
    return Math.round(ENDLESS_REWARD_SECONDS * BOSS_EVENTS.audit.timeBonusFactor);
  }
  return ENDLESS_REWARD_SECONDS;
}

/** Penalty applied on a wrong answer, per active modifier. */
export function penaltyFor(modifier: RoundModifier): number {
  if (modifier === 'watching') return PENALTY_SECONDS * BOSS_EVENTS.watching.penaltyFactor;
  return PENALTY_SECONDS;
}

/** Extra score awarded on top of the endless score, per active modifier. */
export function scoreBonusFor(modifier: RoundModifier): number {
  return modifier === 'boss' ? BOSS_SCORE_BONUS : 0;
}

/** True when a challenge is in boss format: more than 3 steps (multi-step). */
export function isBossFormat(challenge: Challenge): boolean {
  return challenge.steps.length > 3;
}

/**
 * Prompt instruction (Spanish) appended to the user message for a boss round.
 * Asks Bedrock for a 4–6 step chained incident where at least one step's correct
 * answer depends on a decision from an earlier step (memory) — while keeping
 * cooperative integrity (rules/knowledge never reveal the answer).
 */
export function bossFormatInstruction(): string {
  return (
    'Esto es un ENCUENTRO CON EL JEFE. Genera un incidente encadenado de 4 a 6 pasos ' +
    '(no 3). Al menos un paso debe tener su respuesta correcta CONDICIONADA por una ' +
    'decisión tomada en un paso anterior: su enunciado u opciones deben aludir a lo que ' +
    'se resolvió antes, de modo que los jugadores deban RECORDAR juntos qué decidieron. ' +
    'Mantén la integridad cooperativa: las rules y knowledge del Helper NO revelan la ' +
    'respuesta ni el símbolo concreto a corregir; solo teoría y contexto de dominio.'
  );
}
