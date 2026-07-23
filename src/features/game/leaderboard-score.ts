import { buildEndlessGameOverMeta } from './game-engine';
import type { GameSession } from './game-types';

// ---------------------------------------------------------------------------
// Pure logic for the leaderboard: name sanitization and score DERIVATION (not
// recomputation). The score of the ranking is the endlessScore the game already
// produced at game over — reading it from the persisted session guarantees the
// ranking shows the same number the player saw. See leaderboard/design.md.
// ---------------------------------------------------------------------------

export const MAX_TEAM_NAME = 24;

export type TeamNameResult =
  | { ok: true; name: string }
  | { ok: false; reason: string };

export type GameOverScore =
  | { ok: true; endlessScore: number; playedRounds: number }
  | { ok: false; reason: string };

// Matches ASCII control characters (C0 range \x00-\x1F plus DEL \x7F). Newlines
// and tabs are a subset, so this also neutralizes header/content injection via
// the team name.
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

/**
 * Cleans a player-provided team name before it reaches Redis or any view:
 * strips control characters and newlines, collapses whitespace, trims, and
 * caps the length. Returns a discriminated union — the caller turns `ok:false`
 * into a 400. The sanitized name is what gets stored; the raw text never is.
 */
export function sanitizeTeamName(raw: string): TeamNameResult {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'El nombre de equipo es obligatorio.' };
  }

  const cleaned = raw
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned === '') {
    return { ok: false, reason: 'Ingresa un nombre de equipo válido.' };
  }

  return { ok: true, name: cleaned.slice(0, MAX_TEAM_NAME) };
}

/**
 * Derives the leaderboard score from a game-over session. It does NOT recompute
 * the formula — it reads the endlessScore the engine produced (combos included)
 * via `buildEndlessGameOverMeta`, and validates it. Rejects any session that is
 * not a valid endless game over, or whose derived score is not a non-negative
 * integer.
 *
 * @param session         the persisted session (server-side source of truth)
 * @param durationSeconds seconds survived, computed by the service at game over
 */
export function scoreFromGameOver(
  session: GameSession,
  durationSeconds: number,
): GameOverScore {
  if (session.mode !== 'endless') {
    return { ok: false, reason: 'El leaderboard solo aplica al modo infinito.' };
  }
  if (session.status !== 'defeat') {
    return { ok: false, reason: 'La partida no ha terminado.' };
  }
  if (!Number.isInteger(durationSeconds) || durationSeconds < 0) {
    return { ok: false, reason: 'Duración de partida inválida.' };
  }

  const meta = buildEndlessGameOverMeta(session, durationSeconds);

  if (
    !Number.isInteger(meta.endlessScore) ||
    meta.endlessScore < 0 ||
    !Number.isInteger(meta.playedRounds) ||
    meta.playedRounds < 0
  ) {
    return { ok: false, reason: 'Puntaje de partida inválido.' };
  }

  return {
    ok: true,
    endlessScore: meta.endlessScore,
    playedRounds: meta.playedRounds,
  };
}
