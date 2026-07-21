import { getChallengeById, loadChallenges } from '@/src/data/challenges';
import { getClientQuestionById } from '@/src/data/client-questions';
import { generateChallenge } from './runtime-generator';
import { kv } from '@vercel/kv';
import {
  getActiveClientQuestionView,
  processClientQuestionSpawnTick,
  submitClientQuestionAnswer,
} from './client-question-engine';
import {
  abandonGame,
  clearLastResult,
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
  ClientQuestionAnswerResponse,
  GameSession,
  HelperStaticGuide,
  PlayerRole,
  StartGameResponse,
} from './game-types';

// ---------------------------------------------------------------------------
// Session persistence abstraction
// Sessions are stored using Upstash Redis (via @vercel/kv) when the
// corresponding environment variables are configured. Falls back to an
// in-memory Map for local development when no KV store is configured.
// ---------------------------------------------------------------------------

const USE_KV =
  !!process.env.KV_REST_API_URL || !!process.env.UPSTASH_REDIS_REST_URL;

// Simple in-memory fallback (dev only, or when no KV)
const memorySessions = new Map<string, GameSession>();

async function getSessionFromStore(id: string): Promise<GameSession | undefined> {
  if (USE_KV) {
    const data = await kv.get<GameSession>(`session:${id}`);
    return data ?? undefined;
  }
  return memorySessions.get(id);
}

async function setSessionToStore(id: string, session: GameSession): Promise<void> {
  if (USE_KV) {
    await kv.set(`session:${id}`, session, { ex: 60 * 60 });
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

export async function startGame(): Promise<StartGameResponse> {
  // Try a fresh AI-generated challenge; fall back to a curated one if Bedrock is
  // slow, unavailable, or returns something invalid. The game never fails to start.
  const generated = await generateChallenge();
  const challenge = generated ?? pickRandomChallenge();

  const sessionId = generateRoomCode();
  const session = createSession(challenge, sessionId, Date.now());
  if (generated) {
    session.generatedChallenge = generated;
  }
  await setSessionToStore(sessionId, session);
  return {
    sessionId,
    coderView: getCoderStepView(session, challenge),
  };
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

export async function getHelperGuide(sessionId: string): Promise<HelperStaticGuide | null> {
  const session = await getSessionFromStore(sessionId);
  if (!session) return null;
  const challenge = resolveChallenge(session);
  if (!challenge) return null;
  return buildHelperGuide(challenge);
}

export async function getCoderState(sessionId: string) {
  const session = await getSessionFromStore(sessionId);
  if (!session) return null;
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