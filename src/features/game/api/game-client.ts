import type {
  AnswerResponse,
  ClientQuestionAnswerResponse,
  CoderStepView,
  GameStatus,
  HelperGuideResult,
  HelperSyncView,
  PlayerRole,
  StartGameResponse,
} from '@/src/features/game/game-types';
import { readToken } from './session-token-store';

class GameApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GameApiError';
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new GameApiError(`GET ${url} failed`, res.status);
  }
  return (await res.json()) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new GameApiError(`POST ${url} failed`, res.status);
  }
  return (await res.json()) as T;
}

export { GameApiError };

export function startGame(language?: string, mode?: 'classic' | 'endless'): Promise<StartGameResponse> {
  return postJson<StartGameResponse>('/api/game/start', { language, mode });
}

export function getCoderState(sessionId: string): Promise<CoderStepView> {
  return getJson<CoderStepView>(`/api/game/state?sessionId=${sessionId}`);
}

export function tick(sessionId: string): Promise<void> {
  const token = readToken(sessionId, 'coder');
  return postJson<void>('/api/game/tick', { sessionId, token });
}

export function submitAnswer(sessionId: string, answerIndex: number): Promise<AnswerResponse> {
  const token = readToken(sessionId, 'coder');
  return postJson<AnswerResponse>('/api/game/answer', { sessionId, answerIndex, token });
}

export function getHelperGuide(sessionId: string): Promise<HelperGuideResult> {
  const token = readToken(sessionId, 'helper');
  const query = token ? `&token=${encodeURIComponent(token)}` : '';
  return getJson<HelperGuideResult>(`/api/game/guide?sessionId=${sessionId}${query}`);
}

export function getHelperSync(sessionId: string): Promise<HelperSyncView> {
  return getJson<HelperSyncView>(`/api/game/sync?sessionId=${sessionId}`);
}

export function submitClientQuestionAnswer(
  sessionId: string,
  answerIndex: number,
): Promise<ClientQuestionAnswerResponse> {
  const token = readToken(sessionId, 'helper');
  return postJson<ClientQuestionAnswerResponse>('/api/game/client-question', {
    sessionId,
    answerIndex,
    token,
  });
}

export function abandonGame(
  sessionId: string,
  role: PlayerRole,
): Promise<{ status: GameStatus }> {
  const token = readToken(sessionId, role);
  return postJson<{ status: GameStatus }>('/api/game/abandon', { sessionId, role, token });
}
