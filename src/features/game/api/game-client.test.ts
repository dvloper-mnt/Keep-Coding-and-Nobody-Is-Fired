import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GameApiError,
  getCoderState,
  getHelperGuide,
  getHelperSync,
  startGame,
  submitAnswer,
  submitClientQuestionAnswer,
  tick,
} from './game-client';

function mockFetch(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('game-client', () => {
  it('startGame posts to /api/game/start and returns the parsed response', async () => {
    const response = { sessionId: 'X7K2', coderView: { code: 'c' } };
    const fetchMock = mockFetch(response);

    const result = await startGame();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/game/start',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual(response);
  });

  it('getCoderState GETs the state endpoint with the sessionId', async () => {
    const fetchMock = mockFetch({ code: 'x', status: 'playing' });

    await getCoderState('X7K2');

    expect(fetchMock).toHaveBeenCalledWith('/api/game/state?sessionId=X7K2');
  });

  it('tick posts the sessionId to /api/game/tick', async () => {
    const fetchMock = mockFetch({});

    await tick('X7K2');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/game/tick');
    expect(JSON.parse(init.body)).toEqual({ sessionId: 'X7K2' });
  });

  it('submitAnswer sends sessionId and answerIndex', async () => {
    const fetchMock = mockFetch({ success: true, status: 'playing', remainingTime: 100 });

    await submitAnswer('X7K2', 2);

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ sessionId: 'X7K2', answerIndex: 2 });
  });

  it('getHelperGuide GETs the guide endpoint', async () => {
    const fetchMock = mockFetch({ title: 'T', sections: [] });

    await getHelperGuide('X7K2');

    expect(fetchMock).toHaveBeenCalledWith('/api/game/guide?sessionId=X7K2');
  });

  it('getHelperSync GETs the sync endpoint', async () => {
    const fetchMock = mockFetch({ status: 'playing', remainingTime: 100 });

    await getHelperSync('X7K2');

    expect(fetchMock).toHaveBeenCalledWith('/api/game/sync?sessionId=X7K2');
  });

  it('submitClientQuestionAnswer sends sessionId and answerIndex', async () => {
    const fetchMock = mockFetch({ success: false, status: 'playing', remainingTime: 90 });

    await submitClientQuestionAnswer('X7K2', 1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/game/client-question');
    expect(JSON.parse(init.body)).toEqual({ sessionId: 'X7K2', answerIndex: 1 });
  });

  it('throws GameApiError with the status code when the response is not ok', async () => {
    mockFetch({ error: 'not found' }, false, 404);

    await expect(getCoderState('NOPE')).rejects.toBeInstanceOf(GameApiError);
    await expect(getCoderState('NOPE')).rejects.toMatchObject({ status: 404 });
  });
})
