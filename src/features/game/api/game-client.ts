import type {
  AnswerResponse,
  ClientQuestionAnswerResponse,
  CoderStepView,
  HelperStaticGuide,
  HelperSyncView,
  StartGameResponse,
} from '@/src/features/game/game-types';

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

export function startGame(): Promise<StartGameResponse> {
  return postJson<StartGameResponse>('/api/game/start', {});
}

export function getCoderState(sessionId: string): Promise<CoderStepView> {
  return getJson<CoderStepView>(`/api/game/state?sessionId=${sessionId}`);
}

export function tick(sessionId: string): Promise<void> {
  return postJson<void>('/api/game/tick', { sessionId });
}

export function submitAnswer(sessionId: string, answerIndex: number): Promise<AnswerResponse> {
  return postJson<AnswerResponse>('/api/game/answer', { sessionId, answerIndex });
}

export function getHelperGuide(sessionId: string): Promise<HelperStaticGuide> {
  return getJson<HelperStaticGuide>(`/api/game/guide?sessionId=${sessionId}`);
}

export function getHelperSync(sessionId: string): Promise<HelperSyncView> {
  return getJson<HelperSyncView>(`/api/game/sync?sessionId=${sessionId}`);
}

export function submitClientQuestionAnswer(
  sessionId: string,
  answerIndex: number,
): Promise<ClientQuestionAnswerResponse> {
  return postJson<ClientQuestionAnswerResponse>('/api/game/client-question', {
    sessionId,
    answerIndex,
  });
}
