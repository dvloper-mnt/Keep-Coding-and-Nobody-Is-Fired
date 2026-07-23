import { describe, expect, it } from 'vitest';
import { getSession, startGame } from './game-service';

describe('startGame — mode selection', () => {
  it('creates an endless session by default', async () => {
    const { sessionId } = await startGame('random');
    const session = await getSession(sessionId);

    expect(session?.mode).toBe('endless');
    expect(session?.round).toBe(1);
    expect(session?.playedRounds).toBe(0);
  });

  it('creates a classic session when mode is classic', async () => {
    const { sessionId } = await startGame('php', 'classic');
    const session = await getSession(sessionId);

    expect(session?.mode).toBe('classic');
    expect(session?.language).toBe('php');
  });
});