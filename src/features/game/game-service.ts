import { getChallengeById, loadChallenges } from '@/src/data/challenges';
import { getClientQuestionById } from '@/src/data/client-questions';
import { generateChallenge } from './runtime-generator';
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



function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
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

export function buildHelperGuide(challenge: Challenge): HelperStaticGuide {
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
  };
}

export async function startGame(language: ChallengeLanguage = 'random'): Promise<StartGameResponse> {
  // Create the room in 'idle' and return its code immediately so the Coder can
  // share it with the Helper. Bedrock generates in the background (kicked off by
  // the first state poll), so nobody waits on a 14s call before getting a code.
  const sessionId = generateRoomCode();
  const session = createPendingSession(sessionId, language, Date.now());
  await setSessionToStore(sessionId, session);
  return { sessionId };
}

// Idempotently turn an 'idle' room into a 'playing' one: generate the challenge
// for the requested language (fall back to a curated one) and promote the
// session. The `generating` flag stops two concurrent polls from doing it twice.
async function ensureChallengeGenerated(session: GameSession): Promise<GameSession> {
  if (session.status !== 'idle') return session;
  if (session.generating) return session;

  const claimed: GameSession = { ...session, generating: true };
  await setSessionToStore(claimed.id, claimed);

  const generated = await generateChallenge(session.language ?? 'random');
  const challenge = generated ?? pickRandomChallenge();

  const playing = createSession(challenge, session.id, session.startedAt);
  if (generated) {
    playing.generatedChallenge = generated;
  }
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

export async function getHelperGuide(sessionId: string): Promise<HelperGuideResult | null> {
  const session = await getSessionFromStore(sessionId);
  if (!session) return null;
  // Room exists but the Coder's challenge isn't ready yet → tell the Helper to
  // wait instead of erroring out (which would read as "room not found").
  if (session.status === 'idle') return { pending: true };
  const challenge = resolveChallenge(session);
  if (!challenge) return null;
  return buildHelperGuide(challenge);
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