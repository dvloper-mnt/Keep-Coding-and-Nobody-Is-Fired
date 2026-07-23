import { sanitizeTeamName } from './leaderboard-score';

// ---------------------------------------------------------------------------
// Parses and validates the query params of the share-card OG endpoint. Pure:
// takes a URL, returns a discriminated union. All values are UNTRUSTED — the
// endpoint composes this with @vercel/og to render a PNG, so we sanitize the
// team name (reused from leaderboard-score) and clamp/reject nonsense values
// on score/rounds. See .kiro/specs/game-results/design.md (D2).
// ---------------------------------------------------------------------------

export interface ShareCardParams {
  score: number;
  rounds: number;
  team: string;
}

export type ShareCardParamsResult =
  | ({ ok: true } & ShareCardParams)
  | { ok: false; reason: string };

// Safety cap: numbers above this would render as absurd digit strings that
// break the card layout AND signal a manipulated / corrupt caller.
export const MAX_SCORE = 1_000_000_000;
export const MAX_ROUNDS = 100_000;

// Fallback used when the team name is missing or empty after sanitization. The
// card ALWAYS renders — an anonymous share is better than a 400 for a static
// image asset that only exists for social sharing.
export const ANONYMOUS_TEAM = 'Equipo anónimo';

function parseNonNegativeInt(raw: string | null, cap: number): number | null {
  if (raw === null) return null;
  // Number.parseInt tolerates trailing garbage ("12abc" → 12), so we require
  // a strict digits-only shape first.
  if (!/^\d+$/.test(raw)) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 0 || value > cap) return null;
  return value;
}

export function parseShareCardParams(url: URL): ShareCardParamsResult {
  const scoreRaw = url.searchParams.get('score');
  const roundsRaw = url.searchParams.get('rounds');
  const teamRaw = url.searchParams.get('team');

  const score = parseNonNegativeInt(scoreRaw, MAX_SCORE);
  if (score === null) return { ok: false, reason: 'Puntaje inválido.' };

  const rounds = parseNonNegativeInt(roundsRaw, MAX_ROUNDS);
  if (rounds === null) return { ok: false, reason: 'Rondas inválidas.' };

  const teamResult = sanitizeTeamName(teamRaw ?? '');
  const team = teamResult.ok ? teamResult.name : ANONYMOUS_TEAM;

  return { ok: true, score, rounds, team };
}
