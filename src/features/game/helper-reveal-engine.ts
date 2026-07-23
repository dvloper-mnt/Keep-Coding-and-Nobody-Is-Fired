import type {
  Challenge,
  GameSession,
  HelperRevealTarget,
} from './game-types';

// ---------------------------------------------------------------------------
// Helper reveal: knowledge items and the hint start LOCKED per step. The Helper
// pays a time cost to unlock each individual item; once revealed, it stays
// revealed for the rest of the round. Rules are always visible — the Helper
// still needs theory to lecture the Coder.
//
// Everything here is PURE: no Redis, no I/O. The service (`processHelperReveal`)
// runs the cost + persistence around these functions. Tests cover the state
// transitions without touching the game clock or the session store.
// ---------------------------------------------------------------------------

// The keyed lookup in `revealedHelperItems` uses stringified step numbers so
// the object survives a JSON round-trip through Redis.
function keyFor(step: number): string {
  return String(step);
}

function entryFor(session: GameSession, step: number): { knowledge: number[]; hint: boolean } {
  return session.revealedHelperItems?.[keyFor(step)] ?? { knowledge: [], hint: false };
}

export function isKnowledgeRevealed(
  session: GameSession,
  step: number,
  index: number,
): boolean {
  return entryFor(session, step).knowledge.includes(index);
}

export function isHintRevealed(session: GameSession, step: number): boolean {
  return entryFor(session, step).hint;
}

/**
 * Returns the current locked knowledge indices for a given step's helper_view.
 * Any index in `[0, knowledge.length)` that is NOT in the revealed set is locked.
 */
export function lockedKnowledgeIndicesFor(
  session: GameSession,
  step: number,
  knowledgeCount: number,
): number[] {
  const revealed = new Set(entryFor(session, step).knowledge);
  const locked: number[] = [];
  for (let i = 0; i < knowledgeCount; i++) {
    if (!revealed.has(i)) locked.push(i);
  }
  return locked;
}

/**
 * Records a reveal in the session. Pure: returns a new session; the original
 * is untouched. The caller is responsible for applying the time cost (via
 * `applyTimeDelta` in game-engine) and persisting.
 */
export function markHelperItemRevealed(
  session: GameSession,
  target: HelperRevealTarget,
): GameSession {
  const key = keyFor(target.step);
  const current = entryFor(session, target.step);

  const nextEntry =
    target.type === 'knowledge'
      ? {
          ...current,
          knowledge: current.knowledge.includes(target.index)
            ? current.knowledge
            : [...current.knowledge, target.index],
        }
      : { ...current, hint: true };

  return {
    ...session,
    revealedHelperItems: {
      ...(session.revealedHelperItems ?? {}),
      [key]: nextEntry,
    },
  };
}

// Validates that a reveal target is BOTH structurally sound (positive integer
// indices, step within the challenge) AND currently locked. Prevents no-op
// reveals from charging the Helper twice, and out-of-bounds requests from
// wasting time on a step/knowledge item that doesn't exist. Returns a
// discriminated union so the caller can pick the right HTTP status.
export type RevealValidation =
  | { ok: true }
  | { ok: false; reason: 'out-of-range' | 'already-revealed' };

export function validateReveal(
  session: GameSession,
  challenge: Challenge,
  target: HelperRevealTarget,
): RevealValidation {
  if (!Number.isInteger(target.step) || target.step < 1) {
    return { ok: false, reason: 'out-of-range' };
  }
  const step = challenge.steps.find((s) => s.step === target.step);
  if (!step) return { ok: false, reason: 'out-of-range' };

  if (target.type === 'knowledge') {
    if (!Number.isInteger(target.index) || target.index < 0) {
      return { ok: false, reason: 'out-of-range' };
    }
    if (target.index >= step.helper_view.knowledge.length) {
      return { ok: false, reason: 'out-of-range' };
    }
    if (isKnowledgeRevealed(session, target.step, target.index)) {
      return { ok: false, reason: 'already-revealed' };
    }
    return { ok: true };
  }

  // type === 'hint'
  if (!step.hint) return { ok: false, reason: 'out-of-range' };
  if (isHintRevealed(session, target.step)) {
    return { ok: false, reason: 'already-revealed' };
  }
  return { ok: true };
}
