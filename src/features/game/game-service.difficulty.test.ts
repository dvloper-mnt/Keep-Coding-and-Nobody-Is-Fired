import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Difficulty } from './game-types';

const generateChallengeMock = vi.fn();
const generateChallengeStreamingMock = vi.fn();

vi.mock('./runtime-generator', () => ({
  generateChallenge: (...args: unknown[]) => generateChallengeMock(...args),
  generateChallengeStreaming: (...args: unknown[]) => generateChallengeStreamingMock(...args),
}));

import { difficultyForSession } from './challenge-difficulty';
import { getCoderState, startGame } from './game-service';

const curatedChallenge = {
  id: 'lvl_curated',
  title: 'Curado',
  difficulty: 'medium' as Difficulty,
  story_context: 'ctx',
  time_limit: 180,
  steps: [
    {
      step: 1,
      coder_view: { code: 'x', error: 'err' },
      helper_view: { rules: ['r'], knowledge: ['k'] },
      options: ['a', 'b', 'c', 'd'] as [string, string, string, string],
      correct_answer: 0,
      success_state: { code_patch: 'y' },
    },
  ],
};

afterEach(() => {
  vi.clearAllMocks();
  generateChallengeMock.mockResolvedValue(curatedChallenge);
});

describe('difficultyForSession — generation wiring', () => {
  it('uses easy for classic mode regardless of round', () => {
    expect(
      difficultyForSession({ mode: 'classic', round: 15, roundComplete: true }),
    ).toBe('easy');
  });

  it('maps endless round 1 to easy on first generation', () => {
    expect(difficultyForSession({ mode: 'endless', round: 1 })).toBe('easy');
  });

  it('maps endless upcoming round 4 to medium after roundComplete', () => {
    expect(
      difficultyForSession({ mode: 'endless', round: 3, roundComplete: true }),
    ).toBe('medium');
  });

  it('maps endless upcoming round 13 to expert after roundComplete', () => {
    expect(
      difficultyForSession({ mode: 'endless', round: 12, roundComplete: true }),
    ).toBe('expert');
  });
});

describe('getCoderState — passes session-derived difficulty to generateChallenge', () => {
  it('passes easy on first endless idle poll', async () => {
    const { sessionId } = await startGame('php', 'endless');
    await getCoderState(sessionId);

    // Third arg is the boss format instruction: empty on a normal (non-boss) round.
    expect(generateChallengeMock).toHaveBeenCalledWith('php', 'easy', '');
  });

  it('passes easy on first classic idle poll', async () => {
    const { sessionId } = await startGame('php', 'classic');
    await getCoderState(sessionId);

    expect(generateChallengeMock).toHaveBeenCalledWith('php', 'easy', '');
  });
});