import { beforeEach, describe, expect, it } from 'vitest';
import {
  createMemoryLeaderboardStore,
  readTop10,
  rankOf,
  registerScore,
  type LeaderboardStore,
} from './leaderboard-store';

// ---------------------------------------------------------------------------
// The store orchestrates the sorted set (ZADD/ZREVRANGE/ZREVRANK) plus a meta
// hash for playedRounds. These tests run against the in-memory implementation
// (the dev fallback), which mirrors the Redis one — same as how the session
// tests run over the in-memory Map. No Valkey required.
// ---------------------------------------------------------------------------

describe('leaderboard store (in-memory)', () => {
  let store: LeaderboardStore;

  beforeEach(() => {
    store = createMemoryLeaderboardStore();
  });

  it('registers a score and returns its 1-based rank', async () => {
    const { rank } = await registerScore(store, 'Los Debuggers', 5000, 5);
    expect(rank).toBe(1);
  });

  it('orders the top 10 by score, highest first', async () => {
    await registerScore(store, 'Bronce', 3000, 3);
    await registerScore(store, 'Oro', 9000, 9);
    await registerScore(store, 'Plata', 6000, 6);

    const { entries } = await readTop10(store);
    expect(entries.map((e) => e.teamName)).toEqual(['Oro', 'Plata', 'Bronce']);
    expect(entries.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('reads playedRounds from the meta, NOT from floor(score / 1000)', async () => {
    // Score carries combos: 5 rounds + 250s + 2000 combo = 7250. floor(7250/1000)
    // would wrongly say 7 rounds. The meta must return the real 5.
    await registerScore(store, 'Combo Kings', 7250, 5);

    const { entries } = await readTop10(store);
    const entry = entries.find((e) => e.teamName === 'Combo Kings');
    expect(entry?.score).toBe(7250);
    expect(entry?.playedRounds).toBe(5);
  });

  it('does not let two teams with the same name overwrite each other', async () => {
    await registerScore(store, 'Los Debuggers', 4000, 4);
    await registerScore(store, 'Los Debuggers', 8000, 8);

    const { entries } = await readTop10(store);
    const sameName = entries.filter((e) => e.teamName === 'Los Debuggers');
    expect(sameName).toHaveLength(2);
  });

  it('caps the top read at 10 entries', async () => {
    for (let i = 1; i <= 15; i++) {
      await registerScore(store, `Equipo ${i}`, i * 1000, i);
    }
    const { entries } = await readTop10(store);
    expect(entries).toHaveLength(10);
    // Highest score first: Equipo 15 (15000) down to Equipo 6 (6000).
    expect(entries[0]?.teamName).toBe('Equipo 15');
    expect(entries[9]?.teamName).toBe('Equipo 6');
  });

  it('returns an empty list when there are no scores', async () => {
    const { entries } = await readTop10(store);
    expect(entries).toEqual([]);
  });

  it('reports the global rank of an entry even when it is outside the top 10', async () => {
    for (let i = 1; i <= 12; i++) {
      await registerScore(store, `Equipo ${i}`, i * 1000, i);
    }
    // Register a low score that lands last (rank 13 of 13).
    const { member } = await registerScore(store, 'Último', 500, 0);
    const rank = await rankOf(store, member);
    expect(rank).toBe(13);
  });

  it('returns the member key so the caller can look up its rank', async () => {
    const { member } = await registerScore(store, 'Los Debuggers', 5000, 5);
    // Member is unique: team name plus an opaque suffix.
    expect(member.startsWith('Los Debuggers#')).toBe(true);
  });
});
