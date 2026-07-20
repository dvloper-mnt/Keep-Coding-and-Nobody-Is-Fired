import { getChallengeById, loadChallenges } from '@/src/data/challenges';
import { getClientQuestionById } from '@/src/data/client-questions';
import { kv } from '@vercel/kv';
import {
  getActiveClientQuestionView,
  processClientQuestionSpawnTick,
  submitClientQuestionAnswer,
} from './client-question-engine';
import {
  clearLastResult,
  createSession,
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
  const challenge = pickRandomChallenge();
  const sessionId = generateRoomCode();
  const session = createSession(challenge, sessionId);
  await setSessionToStore(sessionId, session);
  return {
    sessionId,
    coderView: getCoderStepView(session, challenge),
  };
}

export async function getSession(sessionId: string): Promise<GameSession | undefined> {
  return getSessionFromStore(sessionId);
}

export async function getSessionChallenge(sessionId: string): Promise<Challenge | undefined> {
  const session = await getSessionFromStore(sessionId);
  if (!session) return undefined;
  return getChallengeById(session.challengeId);
}

export async function getHelperGuide(sessionId: string): Promise<HelperStaticGuide | null> {
  const session = await getSessionFromStore(sessionId);
  if (!session) return null;
  const challenge = getChallengeById(session.challengeId);
  if (!challenge) return null;
  return buildHelperGuide(challenge);
}

export async function getCoderState(sessionId: string) {
  const session = await getSessionFromStore(sessionId);
  if (!session) return null;
  const challenge = getChallengeById(session.challengeId);
  if (!challenge) return null;

  let current = session;
  if (session.lastResult === 'correct' && session.status === 'playing') {
    current = clearLastResult(session);
    await setSessionToStore(sessionId, current);
  }

  return getCoderStepView(current, challenge);
}

export async function getHelperSync(sessionId: string) {
  const session = await getSessionFromStore(sessionId);
  if (!session) return null;
  const challenge = getChallengeById(session.challengeId);
  if (!challenge) return null;
  return getHelperSyncView(
    session,
    challenge,
    getActiveClientQuestionView(session.clientQuestions),
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
  const challenge = getChallengeById(session.challengeId);
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