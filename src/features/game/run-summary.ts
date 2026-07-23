import { buildEndlessGameOverMeta } from './game-engine';
import type {
  ChallengeLanguage,
  GameSession,
  RunSummary,
  TopFailure,
} from './game-types';

// ---------------------------------------------------------------------------
// Pure derivation of the end-of-run summary. It READS the score the engine
// already produced (endlessScore, combos included) via buildEndlessGameOverMeta
// — it never recomputes the formula. failuresByLanguage and maxDifficulty are
// accumulated by the service during the run; here they are only reduced/exposed.
// Missing data is null, never invented. See game-results/design.md.
// ---------------------------------------------------------------------------

// Canonical order of ChallengeLanguage, used to break ties in topFailure so the
// summary is deterministic. Kept in sync with the union in game-types.ts.
const LANGUAGE_ORDER: readonly ChallengeLanguage[] = [
  'random',
  'php',
  'sql',
  'typescript',
  'javascript',
  'python',
  'go',
  'java',
  'ruby',
];

function deriveTopFailure(
  failures: Partial<Record<ChallengeLanguage, number>> | undefined,
): TopFailure | null {
  if (!failures) return null;

  let best: TopFailure | null = null;
  for (const language of LANGUAGE_ORDER) {
    const count = failures[language];
    if (count === undefined || count <= 0) continue;
    // Strictly greater keeps the FIRST language (by canonical order) on ties.
    if (best === null || count > best.count) {
      best = { language, count };
    }
  }
  return best;
}

/**
 * Builds the run summary from a game-over session. Reads the score/rounds/streak
 * the game already computed; derives the top failure language and exposes the
 * max difficulty and defeat reason. Pure — no Redis, no Bedrock, no network.
 *
 * @param session         the persisted game-over session (source of truth)
 * @param durationSeconds seconds survived, computed by the service at game over
 */
export function buildRunSummary(session: GameSession, durationSeconds: number): RunSummary {
  const meta = buildEndlessGameOverMeta(session, durationSeconds);

  return {
    roundsReached: meta.playedRounds,
    score: meta.endlessScore,
    secondsSurvived: durationSeconds,
    bestStreak: meta.bestStreak,
    topFailure: deriveTopFailure(session.failuresByLanguage),
    maxDifficulty: session.maxDifficulty ?? null,
    defeatReason: session.defeatReason ?? null,
  };
}
