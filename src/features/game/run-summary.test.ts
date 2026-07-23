import { describe, expect, it } from 'vitest';
import { buildRunSummary } from './run-summary';
import { makeSession } from './testing/fixtures';

// ---------------------------------------------------------------------------
// buildRunSummary is pure: it derives the end-of-run summary from the persisted
// game-over session. It READS the score the engine already produced
// (endlessScore, combos included) — it never recomputes it. Missing data is
// null, never invented. See .kiro/specs/game-results/design.md.
// ---------------------------------------------------------------------------

describe('buildRunSummary', () => {
  it('reads score, rounds and bestStreak from the game over (does not recompute)', () => {
    const session = makeSession({
      mode: 'endless',
      status: 'defeat',
      playedRounds: 8,
      bestStreak: 5,
      comboScore: 900,
      defeatReason: 'timeout',
    });
    const summary = buildRunSummary(session, 420);

    // base = 8*1000 + 420 = 8420; + comboScore 900 = 9320
    expect(summary.score).toBe(9320);
    expect(summary.roundsReached).toBe(8);
    expect(summary.secondsSurvived).toBe(420);
    expect(summary.bestStreak).toBe(5);
    expect(summary.defeatReason).toBe('timeout');
  });

  it('score matches the game over meta including combos (consistency guardrail)', () => {
    // Same regression guard as leaderboard: the summary score must equal what
    // the player saw at game over.
    const session = makeSession({
      mode: 'endless',
      status: 'defeat',
      playedRounds: 3,
      comboScore: 1500,
    });
    const summary = buildRunSummary(session, 200);
    // 3*1000 + 200 + 1500 = 4700
    expect(summary.score).toBe(4700);
  });

  it('derives topFailure as the language with the most failures', () => {
    const session = makeSession({
      mode: 'endless',
      status: 'defeat',
      failuresByLanguage: { php: 2, typescript: 5, python: 1 },
    });
    const summary = buildRunSummary(session, 100);
    expect(summary.topFailure).toEqual({ language: 'typescript', count: 5 });
  });

  it('returns topFailure null when there were no failures', () => {
    const session = makeSession({ mode: 'endless', status: 'defeat' });
    expect(buildRunSummary(session, 100).topFailure).toBeNull();
  });

  it('returns topFailure null when the failures map is empty', () => {
    const session = makeSession({
      mode: 'endless',
      status: 'defeat',
      failuresByLanguage: {},
    });
    expect(buildRunSummary(session, 100).topFailure).toBeNull();
  });

  it('exposes maxDifficulty including the expert level', () => {
    const session = makeSession({
      mode: 'endless',
      status: 'defeat',
      maxDifficulty: 'expert',
    });
    expect(buildRunSummary(session, 100).maxDifficulty).toBe('expert');
  });

  it('returns maxDifficulty null when the session never recorded one', () => {
    const session = makeSession({ mode: 'endless', status: 'defeat' });
    expect(buildRunSummary(session, 100).maxDifficulty).toBeNull();
  });

  it('returns defeatReason null when the session has none', () => {
    const session = makeSession({ mode: 'endless', status: 'defeat' });
    expect(buildRunSummary(session, 100).defeatReason).toBeNull();
  });

  it('picks a deterministic language when two are tied on failures', () => {
    // Ties resolve by the ChallengeLanguage order so the summary is stable.
    const session = makeSession({
      mode: 'endless',
      status: 'defeat',
      failuresByLanguage: { python: 3, go: 3 },
    });
    const summary = buildRunSummary(session, 100);
    expect(summary.topFailure?.count).toBe(3);
    // python comes before go in the ChallengeLanguage union → python wins the tie.
    expect(summary.topFailure?.language).toBe('python');
  });
});
