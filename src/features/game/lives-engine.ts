import { MAX_LIVES } from '@/src/lib/constants';
import type { DefeatReason, GameSession, PlayerRole } from './game-types';

export function createInitialLives(): Pick<GameSession, 'coderLives' | 'helperLives'> {
  return {
    coderLives: MAX_LIVES,
    helperLives: MAX_LIVES,
  };
}

export function normalizeSessionLives(session: GameSession): GameSession {
  return {
    ...session,
    coderLives: session.coderLives ?? MAX_LIVES,
    helperLives: session.helperLives ?? MAX_LIVES,
    // Sessions created before endless-mode default to classic so behaviour stays intact.
    mode: session.mode ?? 'classic',
    round: session.round ?? 1,
    playedRounds: session.playedRounds ?? 0,
    streak: session.streak ?? 0,
    bestStreak: session.bestStreak ?? 0,
    comboScore: session.comboScore ?? 0,
  };
}

function defeatReasonForRole(role: PlayerRole): DefeatReason {
  return role === 'coder' ? 'coder_lives' : 'helper_lives';
}

export function loseLife(session: GameSession, role: PlayerRole): GameSession {
  if (session.status !== 'playing') {
    return session;
  }

  const livesKey = role === 'coder' ? 'coderLives' : 'helperLives';
  const currentLives = session[livesKey] ?? MAX_LIVES;
  const nextLives = Math.max(0, currentLives - 1);

  if (nextLives === 0) {
    return {
      ...session,
      [livesKey]: 0,
      status: 'defeat',
      defeatReason: session.defeatReason ?? defeatReasonForRole(role),
    };
  }

  return {
    ...session,
    [livesKey]: nextLives,
  };
}

export function getLivesForRole(session: GameSession, role: PlayerRole): number {
  const lives = role === 'coder' ? session.coderLives : session.helperLives;
  return lives ?? MAX_LIVES;
}