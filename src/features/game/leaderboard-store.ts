import type Redis from 'ioredis';
import { generateOpaqueToken } from './session-credentials';
import type { LeaderboardEntry, LeaderboardTop } from './game-types';

// ---------------------------------------------------------------------------
// Storage for the global leaderboard. A sorted set holds the ranking (score =
// endlessScore, member = `${name}#${suffix}`); a parallel meta hash holds each
// entry's playedRounds (persisted, NOT derived from the score, because combos
// contaminate floor(score / 1000)).
//
// The store is an injectable interface with two implementations — Redis (prod)
// and in-memory (dev fallback / tests) — mirroring how the project injects
// rate-limit / session-lock / generation-lock stores. See leaderboard/design.md.
// ---------------------------------------------------------------------------

const LEADERBOARD_KEY = 'leaderboard:global';
const TOP_N = 10;
// Short opaque suffix so two teams with the same name (or the same team twice)
// get distinct sorted-set members instead of overwriting each other.
const MEMBER_SUFFIX_BYTES = 8;

function metaKey(member: string): string {
  return `leaderboard:meta:${member}`;
}

/** The narrow storage contract the leaderboard needs. */
export interface LeaderboardStore {
  add(score: number, member: string): Promise<void>;
  setPlayedRounds(member: string, playedRounds: number): Promise<void>;
  getPlayedRounds(member: string): Promise<number | null>;
  /** Members with scores, highest first, capped at `limit`. */
  topWithScores(limit: number): Promise<Array<{ member: string; score: number }>>;
  /** 0-based reverse rank of a member, or null if absent. */
  reverseRank(member: string): Promise<number | null>;
}

/** Splits a unique member `${name}#${suffix}` back into its display name. */
function displayNameFromMember(member: string): string {
  const hash = member.lastIndexOf('#');
  return hash === -1 ? member : member.slice(0, hash);
}

function buildMember(teamName: string): string {
  return `${teamName}#${generateOpaqueToken().slice(0, MEMBER_SUFFIX_BYTES)}`;
}

/**
 * Registers a score. Returns the member key (so the caller can rank it) and its
 * 1-based rank in the ranking. Persists playedRounds in the meta hash.
 */
export async function registerScore(
  store: LeaderboardStore,
  teamName: string,
  score: number,
  playedRounds: number,
): Promise<{ member: string; rank: number }> {
  const member = buildMember(teamName);
  await store.add(score, member);
  await store.setPlayedRounds(member, playedRounds);
  const rank = await rankOf(store, member);
  return { member, rank };
}

/** The top 10 entries, highest score first, with playedRounds from the meta. */
export async function readTop10(store: LeaderboardStore): Promise<LeaderboardTop> {
  const rows = await store.topWithScores(TOP_N);
  const entries: LeaderboardEntry[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const playedRounds = (await store.getPlayedRounds(row.member)) ?? 0;
    entries.push({
      rank: i + 1,
      teamName: displayNameFromMember(row.member),
      score: row.score,
      playedRounds,
    });
  }
  return { entries };
}

/** 1-based global rank of a member (its place in the full ranking). */
export async function rankOf(store: LeaderboardStore, member: string): Promise<number> {
  const reverse = await store.reverseRank(member);
  return reverse === null ? 0 : reverse + 1;
}

// Rank for a raw team name (encapsulates buildMember). Returns 0 when the team
// is not in the leaderboard. Used to re-derive an already-registered team's
// position on a reload.
export async function rankOfTeam(store: LeaderboardStore, teamName: string): Promise<number> {
  return rankOf(store, buildMember(teamName));
}

// ---------------------------------------------------------------------------
// In-memory implementation — the dev fallback, used when getRedis() is null.
// A plain array kept sorted on read; fine for a single-process dev / test run.
// ---------------------------------------------------------------------------

export function createMemoryLeaderboardStore(): LeaderboardStore {
  const scores = new Map<string, number>();
  const rounds = new Map<string, number>();

  function sortedMembers(): Array<{ member: string; score: number }> {
    return [...scores.entries()]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => b.score - a.score);
  }

  return {
    add(score, member) {
      scores.set(member, score);
      return Promise.resolve();
    },
    setPlayedRounds(member, playedRounds) {
      rounds.set(member, playedRounds);
      return Promise.resolve();
    },
    getPlayedRounds(member) {
      return Promise.resolve(rounds.has(member) ? (rounds.get(member) ?? null) : null);
    },
    topWithScores(limit) {
      return Promise.resolve(sortedMembers().slice(0, limit));
    },
    reverseRank(member) {
      const index = sortedMembers().findIndex((row) => row.member === member);
      return Promise.resolve(index === -1 ? null : index);
    },
  };
}

// ---------------------------------------------------------------------------
// Redis (Valkey/ElastiCache) implementation — production. Uses the sorted set
// natively (ZADD / ZREVRANGE / ZREVRANK) and a per-member hash for playedRounds.
// ---------------------------------------------------------------------------

export function createRedisLeaderboardStore(redis: Redis): LeaderboardStore {
  return {
    async add(score, member) {
      await redis.zadd(LEADERBOARD_KEY, score, member);
    },
    async setPlayedRounds(member, playedRounds) {
      await redis.hset(metaKey(member), 'playedRounds', String(playedRounds));
    },
    async getPlayedRounds(member) {
      const raw = await redis.hget(metaKey(member), 'playedRounds');
      if (raw === null) return null;
      const parsed = Number.parseInt(raw, 10);
      return Number.isInteger(parsed) ? parsed : null;
    },
    async topWithScores(limit) {
      // WITHSCORES returns a flat [member, score, member, score, ...] array.
      const flat = await redis.zrevrange(LEADERBOARD_KEY, 0, limit - 1, 'WITHSCORES');
      const rows: Array<{ member: string; score: number }> = [];
      for (let i = 0; i < flat.length; i += 2) {
        const member = flat[i];
        const score = flat[i + 1];
        if (member === undefined || score === undefined) continue;
        rows.push({ member, score: Number.parseInt(score, 10) });
      }
      return rows;
    },
    async reverseRank(member) {
      const rank = await redis.zrevrank(LEADERBOARD_KEY, member);
      return rank === null ? null : rank;
    },
  };
}
