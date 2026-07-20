import { getChallengeById, loadChallenges } from '@/src/data/challenges';
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
  GameSession,
  HelperStaticGuide,
  StartGameResponse,
} from './game-types';

const sessions = new Map<string, GameSession>();

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

export function startGame(): StartGameResponse {
  const challenge = pickRandomChallenge();
  const sessionId = generateRoomCode();
  const session = createSession(challenge, sessionId);
  sessions.set(sessionId, session);

  return {
    sessionId,
    coderView: getCoderStepView(session, challenge),
  };
}

export function getSession(sessionId: string): GameSession | undefined {
  return sessions.get(sessionId);
}

export function getSessionChallenge(sessionId: string): Challenge | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  return getChallengeById(session.challengeId);
}

export function getHelperGuide(sessionId: string): HelperStaticGuide | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const challenge = getChallengeById(session.challengeId);
  if (!challenge) return null;
  return buildHelperGuide(challenge);
}

export function getCoderState(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const challenge = getChallengeById(session.challengeId);
  if (!challenge) return null;

  let current = session;
  if (session.lastResult === 'correct' && session.status === 'playing') {
    current = clearLastResult(session);
    sessions.set(sessionId, current);
  }

  return getCoderStepView(current, challenge);
}

export function getHelperSync(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const challenge = getChallengeById(session.challengeId);
  if (!challenge) return null;
  return getHelperSyncView(session, challenge);
}

export function processAnswer(sessionId: string, answerIndex: number): AnswerResponse | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const challenge = getChallengeById(session.challengeId);
  if (!challenge) return null;

  const updated = submitAnswer(session, challenge, answerIndex);
  sessions.set(sessionId, updated);

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

export function processTimerTick(sessionId: string): GameSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const updated = tickTimer(session);
  sessions.set(sessionId, updated);
  return updated;
}