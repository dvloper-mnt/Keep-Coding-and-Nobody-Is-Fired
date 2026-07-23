import { getChallengeById, loadChallenges } from '@/src/data/challenges';

import { getClientQuestionById } from '@/src/data/client-questions';
import { difficultyForSession } from './challenge-difficulty';
import { generateChallenge } from './runtime-generator';
import { checkRateLimit, redisRateLimitStore } from './rate-limit';
import { redisGenerationLockStore, tryAcquireGenerationLock } from './generation-lock';
import { redisSessionLockStore, withSessionLock } from './session-mutex';
import { generateOpaqueToken, generateRoomCode, tokensMatch } from './session-credentials';
import { sanitizeTeamName, scoreFromGameOver } from './leaderboard-score';
import { buildRunSummary } from './run-summary';
import { shuffleChallengeOptions } from './challenge-shuffle';
import {
  bossFormatInstruction,
  isBossFormat,
  pickBossEvent,
  scoreBonusFor,
} from './boss-encounters';
import { resolveRoundForGeneration } from './challenge-difficulty';
import {
  createMemoryLeaderboardStore,
  createRedisLeaderboardStore,
  rankOf,
  readTop10,
  registerScore,
  type LeaderboardStore,
} from './leaderboard-store';
import Redis from 'ioredis';
import {
  getActiveClientQuestionView,
  processClientQuestionSpawnTick,
  submitClientQuestionAnswer,
} from './client-question-engine';
import {
  abandonGame,
  applyNextRoundChallenge,
  buildEndlessGameOverMeta,
  clearLastResult,
  createPendingSession,
  gameDurationSeconds,
  getCoderStepView,
  getHelperSyncView,
  promoteToFirstRound,
  streakMultiplier,
  submitAnswer,
  tickTimer,
} from './game-engine';
import { normalizeSessionLives } from './lives-engine';
import type {
  AnswerResponse,
  Challenge,
  ChallengeLanguage,
  Difficulty,
  ClientQuestionAnswerResponse,
  CoderStepView,
  GameMode,
  GameSession,
  HelperGuideResult,
  HelperStaticGuide,
  LeaderboardTop,
  PlayerRole,
  RegisterScoreResult,
  RoundModifier,
  StartGameResponse,
} from './game-types';

// ---------------------------------------------------------------------------
// Session persistence abstraction
// Sessions live in AWS ElastiCache (Redis) when REDIS_HOST is configured.
// Falls back to an in-memory Map for local development only.
//
// IMPORTANT (audit CRITICAL): in production we must NOT silently fall back to
// memory — that breaks Coder/Helper sync across ECS tasks. If REDIS_HOST is
// missing in production the process fails fast instead of degrading quietly.
// ---------------------------------------------------------------------------

const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PORT = Number(process.env.REDIS_PORT ?? '6379');
const SESSION_TTL_SECONDS = 60 * 60;

// /start abuse = Bedrock cost. Allow a small burst per client, then 429.
const START_RATE_LIMIT = Number(process.env.START_RATE_LIMIT ?? '10');
const START_RATE_WINDOW_SECONDS = Number(process.env.START_RATE_WINDOW_SECONDS ?? '60');

// A generation claim older than this is assumed dead (must clear the 20s Bedrock
// timeout with margin) so a crashed generation never freezes the room.
const GENERATION_CLAIM_TTL_MS = 30_000;

const memorySessions = new Map<string, GameSession>();

// Singleton connection — created once, reused across requests. Without this a
// new TCP connection would open on every serverless invocation.
let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  if (!REDIS_HOST) {
    // Fail fast at RUNTIME (not at build/module load): in production a missing
    // REDIS_HOST means sessions would silently use in-memory storage, breaking
    // Coder/Helper sync across tasks. The build itself does not need Redis.
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'REDIS_HOST is not set in production. Refusing to use in-memory sessions ' +
          '(would break Coder/Helper sync across tasks).',
      );
    }
    return null;
  }
  if (!redisClient) {
    redisClient = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
    // Without an 'error' listener, ioredis emits an unhandled 'error' event on
    // connection failure that can crash the process. We log and swallow here;
    // the per-request commands still reject, so callers surface a clean error.
    redisClient.on('error', (err) => {
      console.error('[redis] connection error:', err.message);
    });
  }
  return redisClient;
}

// Leaderboard store: the Redis-backed sorted set in prod, or a single in-memory
// store reused across requests in dev (mirrors memorySessions). Built lazily so
// the in-memory fallback persists between requests in a single dev process.
let memoryLeaderboard: LeaderboardStore | null = null;

function getLeaderboardStore(): LeaderboardStore {
  const redis = getRedis();
  if (redis) return createRedisLeaderboardStore(redis);
  if (!memoryLeaderboard) memoryLeaderboard = createMemoryLeaderboardStore();
  return memoryLeaderboard;
}

async function getSessionFromStore(id: string): Promise<GameSession | undefined> {
  const redis = getRedis();
  let session: GameSession | undefined;
  if (redis) {
    const raw = await redis.get(`session:${id}`);
    session = raw ? (JSON.parse(raw) as GameSession) : undefined;
  } else {
    session = memorySessions.get(id);
  }
  return session ? normalizeSessionLives(session) : undefined;
}

async function setSessionToStore(id: string, session: GameSession): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(`session:${id}`, JSON.stringify(session), 'EX', SESSION_TTL_SECONDS);
    return;
  }
  memorySessions.set(id, session);
}

// Wraps a read-modify-write on a session so two concurrent requests serialize
// instead of clobbering each other (last-write-wins). Without Redis (single-
// process dev) there is no cross-request race, so it runs the mutation directly.
async function mutateSession<T>(sessionId: string, critical: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  if (!redis) return critical();
  return withSessionLock(redisSessionLockStore(redis), sessionId, critical);
}

const GENERATION_LOCK_TTL_SECONDS = Math.ceil(GENERATION_CLAIM_TTL_MS / 1000);

// Without Redis (single-process dev) there is no cross-request race, so the
// in-memory `generating` flag is enough; with Redis the atomic SET NX lock wins.
async function acquireGenerationLock(session: GameSession): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    return tryAcquireGenerationLock(
      redisGenerationLockStore(redis),
      `lock:gen:${session.id}`,
      GENERATION_LOCK_TTL_SECONDS,
    );
  }

  if (session.generating) {
    const claimedAt = session.generatingStartedAt ?? 0;
    if (Date.now() - claimedAt < GENERATION_CLAIM_TTL_MS) return false;
  }
  return true;
}



export function pickRandomChallenge(): Challenge {
  const challenges = loadChallenges();
  const index = Math.floor(Math.random() * challenges.length);
  return challenges[index];
}

// Fallback for a boss round: a curated multi-step (>3) challenge. Guarantees the
// boss encounter stays multi-step even when Bedrock fails. Falls back to a normal
// curated challenge only if the catalog somehow has no boss challenge.
export function pickBossChallenge(): Challenge {
  const bossChallenges = loadChallenges().filter((c) => c.steps.length > 3);
  if (bossChallenges.length === 0) return pickRandomChallenge();
  const index = Math.floor(Math.random() * bossChallenges.length);
  return bossChallenges[index] ?? pickRandomChallenge();
}

// A runtime-generated challenge is not in the static catalog, so it is stored on
// the session. Prefer it; otherwise resolve the curated challenge by id.
function resolveChallenge(session: GameSession): Challenge | undefined {
  return session.generatedChallenge ?? getChallengeById(session.challengeId);
}

// Shown to the Coder while the room is still 'idle' (Bedrock generating). No
// challenge data yet — the client renders a "generating" screen on this status.
function pendingCoderView(session: GameSession): CoderStepView {
  return {
    code: '',
    error: '',
    options: [],
    currentStep: 0,
    totalSteps: 0,
    remainingTime: session.remainingTime,
    status: 'idle',
    language: session.language ?? 'random',
    coderLives: session.coderLives,
    round: session.round,
    mode: session.mode,
    streak: session.streak,
    multiplier: streakMultiplier(session.streak),
  };
}

export function buildHelperGuide(challenge: Challenge, helperToken: string): HelperStaticGuide {
  return {
    title: challenge.title,
    storyContext: challenge.story_context,
    totalExercises: challenge.steps.length,
    sections: challenge.steps.map((step) => ({
      exercise: step.step,
      rules: step.helper_view.rules,
      knowledge: step.helper_view.knowledge,
      hint: step.hint,
    })),
    helperToken,
  };
}

// Rate limit for /start: each game start fires a billable Bedrock call, so this
// is the one endpoint where abuse costs real money. Fails open (see rate-limit).
export async function isStartAllowed(clientKey: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  const store = redisRateLimitStore(redis);
  const { allowed } = await checkRateLimit(store, `ratelimit:start:${clientKey}`, {
    limit: START_RATE_LIMIT,
    windowSeconds: START_RATE_WINDOW_SECONDS,
  });
  return allowed;
}

// Ownership check for state-mutating endpoints: the caller must present the
// token that matches the role they claim. Knowing the room code is not enough.
export async function isAuthorizedFor(
  sessionId: string,
  role: PlayerRole,
  token: string | undefined,
): Promise<boolean> {
  const session = await getSessionFromStore(sessionId);
  if (!session) return false;
  const expected = role === 'coder' ? session.coderToken : session.helperToken;
  return tokensMatch(token, expected);
}

// Discriminated result so the route handler maps each failure to the right HTTP
// status without leaking internals. `already` = idempotent replay of a run that
// was already registered.
export type RegisterOutcome =
  | { kind: 'ok'; result: RegisterScoreResult }
  | { kind: 'invalid-name'; reason: string }
  | { kind: 'unauthorized' }
  | { kind: 'not-game-over'; reason: string }
  | { kind: 'already' };

/**
 * Registers a run in the global leaderboard. The client sends only the team
 * name + session credentials — NEVER the score. The score and rounds are read
 * from the persisted game-over session (server-side source of truth), so a
 * fabricated score is impossible. Idempotent per session.
 */
export async function registerLeaderboardScore(
  sessionId: string,
  token: string | undefined,
  teamNameRaw: string,
): Promise<RegisterOutcome> {
  const name = sanitizeTeamName(teamNameRaw);
  if (!name.ok) return { kind: 'invalid-name', reason: name.reason };

  if (!(await isAuthorizedFor(sessionId, 'coder', token))) {
    return { kind: 'unauthorized' };
  }

  const session = await getSessionFromStore(sessionId);
  if (!session) return { kind: 'unauthorized' };

  // Already registered: don't double-register. Replay the current ranking with
  // the team's rank so the client can show the scoreboard instead of the form.
  // Rank the EXACT stored member — rebuilding it from the name would mint a new
  // opaque suffix that never matches the sorted-set entry (rank would be 0).
  if (session.leaderboardRegistered) {
    const store = getLeaderboardStore();
    const { entries } = await readTop10(store);
    const rank = session.leaderboardMember ? await rankOf(store, session.leaderboardMember) : 0;
    return { kind: 'ok', result: { rank, entries } };
  }

  const durationSeconds = gameDurationSeconds(session, Date.now());
  const score = scoreFromGameOver(session, durationSeconds);
  if (!score.ok) return { kind: 'not-game-over', reason: score.reason };

  const store = getLeaderboardStore();
  const { member, rank } = await registerScore(
    store,
    name.name,
    score.endlessScore,
    score.playedRounds,
  );

  // Mark the run registered (and remember the exact member key) so a client
  // retry cannot double-register it and a reload can re-derive the same rank.
  await setSessionToStore(sessionId, {
    ...session,
    leaderboardRegistered: true,
    leaderboardMember: member,
  });

  const { entries } = await readTop10(store);
  return { kind: 'ok', result: { rank, entries } };
}

/** Public top 10 — no token required (knowing the ranking is public). */
export async function getLeaderboardTop(): Promise<LeaderboardTop> {
  return readTop10(getLeaderboardStore());
}

export async function startGame(
  language: ChallengeLanguage = 'random',
  mode: GameMode = 'endless',
): Promise<StartGameResponse> {
  // Create the room in 'idle' and return its code immediately so the Coder can
  // share it with the Helper. Bedrock generates in the background (kicked off by
  // the first state poll), so nobody waits on a 14s call before getting a code.
  const sessionId = generateRoomCode();
  const coderToken = generateOpaqueToken();
  const session = createPendingSession(sessionId, language, Date.now(), coderToken, mode);
  await setSessionToStore(sessionId, session);
  return { sessionId, coderToken };
}

/**
 * Attempts to claim the `generating` slot on an idle session for the streaming
 * endpoint. Returns `null` if the session doesn't exist, is not idle, or
 * another request already holds a live claim. Returns the claimed session when
 * the caller should proceed with generation.
 *
 * Exported so the SSE route can perform the same idempotency check as
 * `ensureChallengeGenerated` without duplicating the logic.
 */
export async function claimGeneratingSlot(
  sessionId: string,
): Promise<GameSession | null> {
  const session = await getSessionFromStore(sessionId);
  if (!session) return null;
  if (session.status !== 'idle') return null;

  if (!(await acquireGenerationLock(session))) return null;

  // Decide this round's modifier ONCE, here — the single point both generation
  // paths (streaming SSE and polling) share. Math.random() lives in the service;
  // the pure pickBossEvent takes the roll as a parameter. Persisting it on the
  // claim means both paths read the same modifier without recomputing it.
  const round = resolveRoundForGeneration(session);
  const roundModifier: RoundModifier =
    session.mode === 'endless' ? pickBossEvent(round, Math.random()) : 'none';

  const claimed: GameSession = {
    ...session,
    generating: true,
    generatingStartedAt: Date.now(),
    roundModifier,
  };
  await setSessionToStore(sessionId, claimed);
  return claimed;
}

/**
 * Promotes an idle room to `playing` using a challenge that has already been
 * resolved (generated by the streaming path or curated as fallback).
 *
 * This is the write-half of the streaming flow: the SSE route calls
 * `generateChallengeStreaming`, then calls this once the stream closes to
 * persist the result — identical promotion semantics to `ensureChallengeGenerated`,
 * but without the Bedrock call embedded inside.
 */
export async function promoteSessionWithChallenge(
  session: GameSession,
  challenge: Challenge,
): Promise<void> {
  // On a boss round the challenge MUST be multi-step; if the streamed one is not
  // (Bedrock failed or returned ≤3 steps), swap in the curated boss challenge so
  // the encounter is never a plain 3-step round.
  const isBoss = session.roundModifier === 'boss';
  const usableChallenge =
    isBoss && !isBossFormat(challenge) ? pickBossChallenge() : challenge;

  // Neutralize the "option-A bias" (see challenge-shuffle.ts): both the Bedrock
  // prompt example and 3/4 curated fallbacks fix correct_answer at 0, so the
  // model learns to always put the right answer first. Shuffle the options here
  // — the promoted challenge is persisted, so the shuffled order is stable for
  // this session and used consistently for rendering and answer validation.
  const shuffled = shuffleChallengeOptions(usableChallenge);

  const promoted = session.roundComplete
    ? applyNextRoundChallenge(session, shuffled)
    : promoteToFirstRound(session, shuffled);
  // Preserve the round modifier decided at claim time (promotion helpers don't
  // carry it), so the engine and UI see the boss/event context.
  await setSessionToStore(session.id, { ...promoted, roundModifier: session.roundModifier });
}

// Idempotently turn an 'idle' room into a 'playing' one: generate the challenge
// for the requested language (fall back to a curated one) and promote the
// session. The `generating` flag stops two concurrent polls from doing it twice.
async function ensureChallengeGenerated(session: GameSession): Promise<GameSession> {
  if (session.status !== 'idle') return session;

  // Atomic claim: only one concurrent caller (this poll or the streaming route)
  // wins the lock and generates. Losers return the session unchanged and let the
  // winner's promotion show up on the next poll.
  if (!(await acquireGenerationLock(session))) return session;

  // Decide this round's modifier once, on the claim (same as claimGeneratingSlot
  // for the streaming path). Math.random() lives here; pickBossEvent is pure.
  const round = resolveRoundForGeneration(session);
  const modifier: RoundModifier =
    session.mode === 'endless' ? pickBossEvent(round, Math.random()) : 'none';
  const isBoss = modifier === 'boss';

  const claimed: GameSession = {
    ...session,
    generating: true,
    generatingStartedAt: Date.now(),
    roundModifier: modifier,
  };
  await setSessionToStore(claimed.id, claimed);

  const roundDifficulty = difficultyForSession(session);

  // A boss round is a FORMAT change (multi-step with memory), not a difficulty
  // bump: it uses the round's natural difficulty plus a format instruction.
  const generated = await generateChallenge(
    session.language ?? 'random',
    roundDifficulty,
    isBoss ? bossFormatInstruction() : '',
  );

  // For a boss round the generated challenge must actually be multi-step; if
  // Bedrock failed or returned ≤3 steps, fall back to the curated boss challenge
  // so the encounter is never a plain 3-step round.
  const generatedIsUsable = generated !== null && (!isBoss || isBossFormat(generated));
  const challenge = generatedIsUsable
    ? generated
    : isBoss
      ? pickBossChallenge()
      : pickRandomChallenge();

  // Same anti-bias shuffle as the streaming path (see promoteSessionWithChallenge).
  const shuffled = shuffleChallengeOptions(challenge);

  const promoted = session.roundComplete
    ? applyNextRoundChallenge(session, shuffled)
    : promoteToFirstRound(session, shuffled);
  // Track the highest difficulty faced across the run (run summary) and the
  // active round modifier (boss / event), for the engine and the UI.
  const playing: GameSession = {
    ...promoted,
    maxDifficulty: highestDifficulty(session.maxDifficulty, roundDifficulty),
    roundModifier: modifier,
  };
  await setSessionToStore(session.id, playing);
  return playing;
}

function withEndMeta<T extends { status: string }>(view: T, session: GameSession): T {
  const durationSeconds = gameDurationSeconds(session, Date.now());
  const isEndlessGameOver = session.mode === 'endless' && session.status === 'defeat';
  const endlessMeta = isEndlessGameOver
    ? buildEndlessGameOverMeta(session, durationSeconds)
    : {};
  // The run summary rides along at endless game over so the results screen reads
  // it from one source instead of reassembling the fields client-side.
  const runSummary = isEndlessGameOver
    ? { runSummary: buildRunSummary(session, durationSeconds) }
    : {};

  if (session.status !== 'abandoned' && session.status !== 'victory' && session.status !== 'defeat') {
    return view;
  }
  return {
    ...view,
    abandonedBy: session.abandonedBy,
    durationSeconds,
    defeatReason: session.defeatReason,
    // So the results UI can show the ranking (not the form) after a reload.
    leaderboardRegistered: session.leaderboardRegistered ?? false,
    ...endlessMeta,
    ...runSummary,
  };
}

export async function processAbandon(
  sessionId: string,
  role: PlayerRole,
): Promise<{ status: GameSession['status'] } | null> {
  return mutateSession(sessionId, async () => {
    const session = await getSessionFromStore(sessionId);
    if (!session) return null;

    const updated = abandonGame(session, role);
    await setSessionToStore(sessionId, updated);
    return { status: updated.status };
  });
}

export async function getSession(sessionId: string): Promise<GameSession | undefined> {
  return getSessionFromStore(sessionId);
}

// Caches the mentor feedback for a finished run so repeat requests replay it
// instead of firing another Bedrock stream. Idempotent: the first write wins;
// concurrent requests that already found a cached value skip the overwrite.
// `text` is the analysis on success, or '' to record a failed attempt.
export async function persistFeedbackText(sessionId: string, text: string): Promise<void> {
  await mutateSession(sessionId, async () => {
    const session = await getSessionFromStore(sessionId);
    if (!session || session.feedbackText !== undefined) return;
    await setSessionToStore(sessionId, { ...session, feedbackText: text });
  });
}

export async function getSessionChallenge(sessionId: string): Promise<Challenge | undefined> {
  const session = await getSessionFromStore(sessionId);
  if (!session) return undefined;
  return resolveChallenge(session);
}

export type HelperJoinResult = HelperGuideResult | { occupied: true };

// A room has exactly one Helper seat. The first joiner claims it (mints the
// token); anyone after that is rejected unless they present the same token
// (the original Helper reloading). This is both the IDOR fix and the
// "one Coder, one Helper" rule.
export async function getHelperGuide(
  sessionId: string,
  presentedToken?: string,
): Promise<HelperJoinResult | null> {
  return mutateSession(sessionId, async () => {
  const session = await getSessionFromStore(sessionId);
  if (!session) return null;
  // Room exists but the Coder's challenge isn't ready yet → tell the Helper to
  // wait instead of erroring out (which would read as "room not found").
  if (session.status === 'idle') return { pending: true };
  const challenge = resolveChallenge(session);
  if (!challenge) return null;

  if (session.helperToken) {
    // Seat already taken: only the same Helper (matching token) may return.
    if (!tokensMatch(presentedToken, session.helperToken)) return { occupied: true };
    return buildHelperGuide(challenge, session.helperToken);
  }

  // First Helper: claim the seat.
  const helperToken = generateOpaqueToken();
  await setSessionToStore(sessionId, { ...session, helperToken });
  return buildHelperGuide(challenge, helperToken);
  });
}

export async function getCoderState(sessionId: string) {
  let session = await getSessionFromStore(sessionId);
  if (!session) return null;

  // First poll on an idle room kicks off Bedrock generation; while it runs the
  // Coder sees the 'idle' (generating) view instead of an error.
  if (session.status === 'idle') {
    session = await ensureChallengeGenerated(session);
    if (session.status === 'idle') return pendingCoderView(session);
  }

  const challenge = resolveChallenge(session);
  if (!challenge) return null;

  let current = session;
  if (session.lastResult === 'correct' && session.status === 'playing') {
    current = clearLastResult(session);
    await setSessionToStore(sessionId, current);
  }

  return withEndMeta(getCoderStepView(current, challenge), current);
}

export async function getHelperSync(sessionId: string) {
  const session = await getSessionFromStore(sessionId);
  if (!session) return null;

  if (session.status === 'idle') {
    return withEndMeta(
      {
        remainingTime: session.remainingTime,
        currentStep: 0,
        totalSteps: 0,
        status: 'idle' as const,
        activeClientQuestion: null,
        helperLives: session.helperLives,
        round: session.round,
        mode: session.mode,
      },
      session,
    );
  }

  const challenge = resolveChallenge(session);
  if (!challenge) return null;
  return withEndMeta(
    getHelperSyncView(
      session,
      challenge,
      getActiveClientQuestionView(session.clientQuestions),
    ),
    session,
  );
}

export async function processClientQuestionAnswer(
  sessionId: string,
  answerIndex: number,
): Promise<ClientQuestionAnswerResponse | null> {
  return mutateSession(sessionId, async () => {
    const session = await getSessionFromStore(sessionId);
    if (!session) return null;

    const activeQuestionId = session.clientQuestions.activeQuestionId;
    if (!activeQuestionId) return null;

    const question = getClientQuestionById(activeQuestionId);
    if (!question) return null;

    const { session: updated, response } = submitClientQuestionAnswer(
      session,
      question,
      answerIndex,
    );
    await setSessionToStore(sessionId, updated);
    return response;
  });
}

// Difficulty ranked low→high, for tracking the run's max difficulty.
const DIFFICULTY_RANK: Record<Difficulty, number> = {
  easy: 0,
  medium: 1,
  hard: 2,
  expert: 3,
};

// Returns whichever difficulty is higher. `current` may be absent on the first
// round; then the round's own difficulty is the max so far.
function highestDifficulty(
  current: Difficulty | undefined,
  round: Difficulty,
): Difficulty {
  if (current === undefined) return round;
  return DIFFICULTY_RANK[round] > DIFFICULTY_RANK[current] ? round : current;
}

// Returns a new failuresByLanguage map with the given language's counter bumped
// by one. Pure: does not mutate the session's existing map.
function incrementFailure(
  session: GameSession,
  language: ChallengeLanguage | undefined,
): GameSession['failuresByLanguage'] {
  const key: ChallengeLanguage = language ?? 'random';
  const current = session.failuresByLanguage ?? {};
  return { ...current, [key]: (current[key] ?? 0) + 1 };
}

export async function processAnswer(sessionId: string, answerIndex: number): Promise<AnswerResponse | null> {
  return mutateSession(sessionId, async () => {
  const session = await getSessionFromStore(sessionId);
  if (!session) return null;
  const challenge = resolveChallenge(session);
  if (!challenge) return null;

  const modifier: RoundModifier = session.roundModifier ?? 'none';
  const answered = submitAnswer(session, challenge, answerIndex, modifier);

  // Accumulate the run-summary metric: which language the player failed most.
  // Keyed by the session's requested language (the concrete language per round
  // is not tracked separately; 'random' groups honestly under 'random').
  const withFailures =
    answered.lastResult === 'incorrect'
      ? { ...answered, failuresByLanguage: incrementFailure(answered, session.language) }
      : answered;

  // Beating a boss round awards an extra score bonus, accumulated into comboScore
  // so it flows into the final endlessScore (and thus the leaderboard).
  const updated =
    withFailures.roundComplete && scoreBonusFor(modifier) > 0
      ? { ...withFailures, comboScore: withFailures.comboScore + scoreBonusFor(modifier) }
      : withFailures;

  const sessionToStore =
    updated.roundComplete && updated.mode === 'endless' && updated.status === 'playing'
      ? { ...updated, status: 'idle' as const, generating: false }
      : updated;
  await setSessionToStore(sessionId, sessionToStore);

  const result = updated.lastResult === 'correct';
  const response: AnswerResponse = {
    success: result,
    patch: result ? updated.currentCode : undefined,
    penalty: result ? undefined : 10,
    message: result ? undefined : 'El sistema sigue fallando…',
    status: sessionToStore.status,
    remainingTime: sessionToStore.remainingTime,
  };

  if (!result) {
    response.livesRemaining = updated.coderLives;
    response.lifeLost = true;
  }

  if (
    sessionToStore.status === 'idle' ||
    sessionToStore.status === 'playing' ||
    sessionToStore.status === 'victory' ||
    sessionToStore.status === 'defeat'
  ) {
    response.coderView =
      sessionToStore.status === 'idle'
        ? pendingCoderView(sessionToStore)
        : getCoderStepView(sessionToStore, challenge);
  }

  return response;
  });
}

export async function processTimerTick(sessionId: string): Promise<GameSession | null> {
  return mutateSession(sessionId, async () => {
    const session = await getSessionFromStore(sessionId);
    if (!session) return null;

    const ticked = tickTimer(session);
    const updated = processClientQuestionSpawnTick(ticked);
    await setSessionToStore(sessionId, updated);
    return updated;
  });
}