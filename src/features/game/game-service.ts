import { getChallengeById, loadChallenges } from '@/src/data/challenges';
import { getClientQuestionById } from '@/src/data/client-questions';
import { generateChallenge } from './runtime-generator';
import { checkRateLimit, redisRateLimitStore } from './rate-limit';
import { generateOpaqueToken, generateRoomCode, tokensMatch } from './session-credentials';
import Redis from 'ioredis';
import {
  getActiveClientQuestionView,
  processClientQuestionSpawnTick,
  submitClientQuestionAnswer,
} from './client-question-engine';
import {
  abandonGame,
  clearLastResult,
  createPendingSession,
  createSession,
  gameDurationSeconds,
  getCoderStepView,
  getHelperSyncView,
  submitAnswer,
  tickTimer,
} from './game-engine';
import type {
  AnswerResponse,
  Challenge,
  ChallengeLanguage,
  ClientQuestionAnswerResponse,
  CoderStepView,
  GameSession,
  HelperGuideResult,
  HelperStaticGuide,
  PlayerRole,
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
  }
  return redisClient;
}

async function getSessionFromStore(id: string): Promise<GameSession | undefined> {
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get(`session:${id}`);
    return raw ? (JSON.parse(raw) as GameSession) : undefined;
  }
  return memorySessions.get(id);
}

async function setSessionToStore(id: string, session: GameSession): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(`session:${id}`, JSON.stringify(session), 'EX', SESSION_TTL_SECONDS);
    return;
  }
  memorySessions.set(id, session);
}



export function pickRandomChallenge(): Challenge {
  const challenges = loadChallenges();
  const index = Math.floor(Math.random() * challenges.length);
  return challenges[index];
}

// A runtime-generated challenge is not in the static catalog, so it is stored on
// the session. Prefer it; otherwise resolve the curated challenge by id.
function resolveChallenge(session: GameSession): Challenge | undefined {
  return session.generatedChallenge ?? getChallengeById(session.challengeId);
}

// Shown to the Coder while the room is still 'idle' (Bedrock generating). No
// challenge data yet — the client renders a "generating" screen on this status.
function pendingCoderView(): CoderStepView {
  return {
    code: '',
    error: '',
    options: [],
    currentStep: 0,
    totalSteps: 0,
    remainingTime: 0,
    status: 'idle',
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

export async function startGame(language: ChallengeLanguage = 'random'): Promise<StartGameResponse> {
  // Create the room in 'idle' and return its code immediately so the Coder can
  // share it with the Helper. Bedrock generates in the background (kicked off by
  // the first state poll), so nobody waits on a 14s call before getting a code.
  const sessionId = generateRoomCode();
  const coderToken = generateOpaqueToken();
  const session = createPendingSession(sessionId, language, Date.now(), coderToken);
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

  if (session.generating) {
    const claimedAt = session.generatingStartedAt ?? 0;
    if (Date.now() - claimedAt < GENERATION_CLAIM_TTL_MS) return null;
  }

  const claimed: GameSession = {
    ...session,
    generating: true,
    generatingStartedAt: Date.now(),
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
  wasGenerated: boolean,
): Promise<void> {
  const playing = createSession(challenge, session.id, session.startedAt);
  if (wasGenerated) {
    playing.generatedChallenge = challenge;
  }
  // Carry the credentials forward — createSession starts a fresh object.
  playing.coderToken = session.coderToken;
  playing.helperToken = session.helperToken;
  await setSessionToStore(session.id, playing);
}

// Idempotently turn an 'idle' room into a 'playing' one: generate the challenge
// for the requested language (fall back to a curated one) and promote the
// session. The `generating` flag stops two concurrent polls from doing it twice.
async function ensureChallengeGenerated(session: GameSession): Promise<GameSession> {
  if (session.status !== 'idle') return session;

  // Honour an in-flight claim, but only until the generation budget elapses. If
  // the claiming request died mid-call the flag would otherwise freeze the room.
  if (session.generating) {
    const claimedAt = session.generatingStartedAt ?? 0;
    if (Date.now() - claimedAt < GENERATION_CLAIM_TTL_MS) return session;
  }

  const claimed: GameSession = {
    ...session,
    generating: true,
    generatingStartedAt: Date.now(),
  };
  await setSessionToStore(claimed.id, claimed);

  const generated = await generateChallenge(session.language ?? 'random');
  const challenge = generated ?? pickRandomChallenge();

  const playing = createSession(challenge, session.id, session.startedAt);
  if (generated) {
    playing.generatedChallenge = generated;
  }
  // Carry the credentials forward — createSession starts a fresh object.
  playing.coderToken = session.coderToken;
  playing.helperToken = session.helperToken;
  await setSessionToStore(session.id, playing);
  return playing;
}

function withEndMeta<T extends { status: string }>(view: T, session: GameSession): T {
  if (session.status !== 'abandoned' && session.status !== 'victory' && session.status !== 'defeat') {
    return view;
  }
  return {
    ...view,
    abandonedBy: session.abandonedBy,
    durationSeconds: gameDurationSeconds(session, Date.now()),
  };
}

export async function processAbandon(
  sessionId: string,
  role: PlayerRole,
): Promise<{ status: GameSession['status'] } | null> {
  const session = await getSessionFromStore(sessionId);
  if (!session) return null;

  const updated = abandonGame(session, role);
  await setSessionToStore(sessionId, updated);
  return { status: updated.status };
}

export async function getSession(sessionId: string): Promise<GameSession | undefined> {
  return getSessionFromStore(sessionId);
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
}

export async function getCoderState(sessionId: string) {
  let session = await getSessionFromStore(sessionId);
  if (!session) return null;

  // First poll on an idle room kicks off Bedrock generation; while it runs the
  // Coder sees the 'idle' (generating) view instead of an error.
  if (session.status === 'idle') {
    session = await ensureChallengeGenerated(session);
    if (session.status === 'idle') return pendingCoderView();
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
}

export async function processAnswer(sessionId: string, answerIndex: number): Promise<AnswerResponse | null> {
  const session = await getSessionFromStore(sessionId);
  if (!session) return null;
  const challenge = resolveChallenge(session);
  if (!challenge) return null;

  const updated = submitAnswer(session, challenge, answerIndex);
  await setSessionToStore(sessionId, updated);

  const result = updated.lastResult === 'correct';
  const response: AnswerResponse = {
    success: result,
    patch: result ? updated.currentCode : undefined,
    penalty: result ? undefined : 10,
    message: result ? undefined : 'El sistema sigue fallando…',
    status: updated.status,
    remainingTime: updated.remainingTime,
  };

  if (updated.status === 'playing' || updated.status === 'victory') {
    response.coderView = getCoderStepView(updated, challenge);
  }

  return response;
}

export async function processTimerTick(sessionId: string): Promise<GameSession | null> {
  const session = await getSessionFromStore(sessionId);
  if (!session) return null;

  const ticked = tickTimer(session);
  const updated = processClientQuestionSpawnTick(ticked);
  await setSessionToStore(sessionId, updated);
  return updated;
}