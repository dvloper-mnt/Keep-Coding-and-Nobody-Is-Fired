import { describe, expect, it } from 'vitest';
import { sanitizeTeamName, scoreFromGameOver } from './leaderboard-score';
import { makeSession } from './testing/fixtures';

// ---------------------------------------------------------------------------
// The leaderboard does NOT recompute the score. `scoreFromGameOver` reads the
// endlessScore the game already produced at game over (with combos) from the
// persisted session, and only validates it. `sanitizeTeamName` cleans the
// player-provided team name before it ever reaches Redis or the view.
// See .kiro/specs/leaderboard/design.md.
// ---------------------------------------------------------------------------

describe('sanitizeTeamName', () => {
  it('accepts a normal name and trims surrounding whitespace', () => {
    const result = sanitizeTeamName('  Los Debuggers  ');
    expect(result).toEqual({ ok: true, name: 'Los Debuggers' });
  });

  it('rejects an empty name after trimming', () => {
    expect(sanitizeTeamName('   ')).toEqual({
      ok: false,
      reason: expect.any(String),
    });
  });

  it('rejects a name that is only control characters', () => {
    expect(sanitizeTeamName('\n\t\r')).toEqual({
      ok: false,
      reason: expect.any(String),
    });
  });

  it('turns control characters and newlines within the name into a single space', () => {
    // \n and \t become spaces, then collapse — the name stays readable and
    // free of injectable characters.
    const result = sanitizeTeamName('Los\nDebuggers\t2026');
    expect(result).toEqual({ ok: true, name: 'Los Debuggers 2026' });
  });

  it('collapses runs of whitespace into a single space', () => {
    const result = sanitizeTeamName('Los     Debuggers');
    expect(result).toEqual({ ok: true, name: 'Los Debuggers' });
  });

  it('truncates a name longer than the maximum to the maximum length', () => {
    const long = 'A'.repeat(50);
    const result = sanitizeTeamName(long);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.name.length).toBe(24);
    }
  });

  it('rejects a non-string input', () => {
    // Simulate a malformed request body field.
    expect(sanitizeTeamName(undefined as unknown as string).ok).toBe(false);
    expect(sanitizeTeamName(42 as unknown as string).ok).toBe(false);
  });
});

describe('scoreFromGameOver', () => {
  it('reads endlessScore and playedRounds from an endless game-over session', () => {
    // base = playedRounds*1000 + duration; endlessScore = base + comboScore.
    // The session carries the raw fields; the game over meta is derived from them.
    const session = makeSession({
      mode: 'endless',
      status: 'defeat',
      playedRounds: 7,
      comboScore: 450,
      startedAt: 0,
    });
    // durationSeconds is passed in (the service computes it); here 300s.
    const result = scoreFromGameOver(session, 300);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // base = 7*1000 + 300 = 7300; + comboScore 450 = 7750
      expect(result.endlessScore).toBe(7750);
      expect(result.playedRounds).toBe(7);
    }
  });

  it('rejects a session that is not in defeat status', () => {
    const session = makeSession({ mode: 'endless', status: 'playing' });
    expect(scoreFromGameOver(session, 100).ok).toBe(false);
  });

  it('rejects a classic-mode session (leaderboard is endless-only)', () => {
    const session = makeSession({ mode: 'classic', status: 'defeat' });
    expect(scoreFromGameOver(session, 100).ok).toBe(false);
  });

  it('rejects when the derived score would be negative or non-integer', () => {
    const session = makeSession({
      mode: 'endless',
      status: 'defeat',
      playedRounds: -1,
      comboScore: 0,
    });
    expect(scoreFromGameOver(session, 0).ok).toBe(false);
  });

  it('the score it returns equals the game over meta (includes combos)', () => {
    // Guardrail against the regression that motivated the refinement: the
    // leaderboard score must match what the player saw at game over.
    const session = makeSession({
      mode: 'endless',
      status: 'defeat',
      playedRounds: 5,
      comboScore: 1200,
    });
    const result = scoreFromGameOver(session, 250);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 5*1000 + 250 + 1200 = 6450
      expect(result.endlessScore).toBe(6450);
    }
  });
});
