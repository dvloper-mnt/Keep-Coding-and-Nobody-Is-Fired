import {
  BASE_MULTIPLIER,
  CLIENT_QUESTION_CONFIG,
  COMBO_BASE_PER_HIT,
  ENDLESS_BASE_SECONDS,
  ENDLESS_REWARD_SECONDS,
  PENALTY_SECONDS,
  STREAK_TIERS,
  WRONG_ANSWER_MESSAGE,
} from '@/src/lib/constants';
import { createInitialLives, loseLife } from './lives-engine';
import type {
  Challenge,
  ChallengeLanguage,
  ChallengeStep,
  CoderStepView,
  GameMode,
  GameSession,
  GameStatus,
  HelperSyncView,
  PlayerRole,
  StepResult,
} from './game-types';

export function resolveMultipleChoice(
  correctIndex: number,
  answerIndex: number,
  wrongPenalty: number = PENALTY_SECONDS,
  wrongMessage: string = WRONG_ANSWER_MESSAGE,
): StepResult {
  if (answerIndex === correctIndex) {
    return { success: true };
  }

  return {
    success: false,
    penalty: wrongPenalty,
    message: wrongMessage,
  };
}

export function resolveStep(step: ChallengeStep, answerIndex: number): StepResult {
  const result = resolveMultipleChoice(step.correct_answer, answerIndex);

  if (result.success) {
    return {
      success: true,
      patch: step.success_state.code_patch,
    };
  }

  return result;
}

export function applyTimeDelta(session: GameSession, deltaSeconds: number): GameSession {
  const newTime = Math.max(0, session.remainingTime + deltaSeconds);
  const timedOut = newTime <= 0 && session.status === 'playing';

  return {
    ...session,
    remainingTime: newTime,
    status: timedOut ? 'defeat' : session.status,
    defeatReason: timedOut && !session.defeatReason ? 'timeout' : session.defeatReason,
  };
}

export function endlessScore(playedRounds: number, secondsSurvived: number): number {
  return playedRounds * 1000 + secondsSurvived;
}

export function streakMultiplier(streak: number): number {
  for (const tier of STREAK_TIERS) {
    if (streak >= tier.minStreak) {
      return tier.multiplier;
    }
  }
  return BASE_MULTIPLIER;
}

export function comboPoints(basePerHit: number, multiplier: number): number {
  return Math.round(basePerHit * multiplier);
}

export function finalScore(endless: number, comboScore: number): number {
  return endless + comboScore;
}

function comboFieldsOnCorrect(session: GameSession): Pick<GameSession, 'streak' | 'bestStreak' | 'comboScore'> {
  const nextStreak = session.streak + 1;
  const multiplier = streakMultiplier(nextStreak);
  const bonus =
    multiplier > BASE_MULTIPLIER ? comboPoints(COMBO_BASE_PER_HIT, multiplier) : 0;

  return {
    streak: nextStreak,
    bestStreak: Math.max(session.bestStreak, nextStreak),
    comboScore: session.comboScore + bonus,
  };
}

export function buildEndlessGameOverMeta(
  session: GameSession,
  durationSeconds: number,
): { playedRounds: number; endlessScore: number; bestStreak: number } {
  const base = endlessScore(session.playedRounds, durationSeconds);
  return {
    playedRounds: session.playedRounds,
    endlessScore: finalScore(base, session.comboScore),
    bestStreak: session.bestStreak,
  };
}

function freshClientQuestions(): GameSession['clientQuestions'] {
  return {
    activeQuestionId: null,
    answeredQuestionIds: [],
    cooldownRemaining: CLIENT_QUESTION_CONFIG.spawnIntervalSeconds,
    totalSpawned: 0,
  };
}

function initialRemainingTime(mode: GameMode, challenge: Challenge): number {
  return mode === 'endless' ? ENDLESS_BASE_SECONDS : challenge.time_limit;
}

export function createSession(
  challenge: Challenge,
  sessionId: string,
  startedAt: number,
  mode: GameMode = 'classic',
): GameSession {
  const firstStep = challenge.steps[0];
  return {
    id: sessionId,
    challengeId: challenge.id,
    currentStep: 1,
    remainingTime: initialRemainingTime(mode, challenge),
    currentCode: firstStep.coder_view.code,
    status: 'playing',
    startedAt,
    clientQuestions: freshClientQuestions(),
    round: 1,
    playedRounds: 0,
    mode,
    streak: 0,
    bestStreak: 0,
    comboScore: 0,
    ...createInitialLives(),
  };
}

/** Promotes an idle room to playing with the first challenge of the session. */
export function promoteToFirstRound(
  session: GameSession,
  challenge: Challenge,
  wasGenerated: boolean,
): GameSession {
  const firstStep = challenge.steps[0];
  const mode = session.mode ?? 'endless';

  return {
    ...session,
    challengeId: challenge.id,
    generatedChallenge: wasGenerated ? challenge : undefined,
    currentStep: 1,
    remainingTime: initialRemainingTime(mode, challenge),
    currentCode: firstStep.coder_view.code,
    status: 'playing',
    round: session.round ?? 1,
    playedRounds: session.playedRounds ?? 0,
    mode,
    clientQuestions: freshClientQuestions(),
    generating: false,
    generatingStartedAt: undefined,
    roundComplete: undefined,
  };
}

/** Applies a newly generated challenge as the next endless round. */
export function applyNextRoundChallenge(
  session: GameSession,
  challenge: Challenge,
  wasGenerated: boolean,
): GameSession {
  const firstStep = challenge.steps[0];

  return {
    ...session,
    round: session.round + 1,
    challengeId: challenge.id,
    generatedChallenge: wasGenerated ? challenge : undefined,
    currentStep: 1,
    currentCode: firstStep.coder_view.code,
    status: 'playing',
    roundComplete: undefined,
    lastResult: undefined,
    clientQuestions: freshClientQuestions(),
    generating: false,
    generatingStartedAt: undefined,
  };
}

// A room created before its challenge exists: status 'idle', no challenge yet.
// The Coder shares the code while Bedrock generates for `language` in the
// background; the first state poll promotes it to 'playing'.
export function createPendingSession(
  sessionId: string,
  language: ChallengeLanguage | undefined,
  startedAt: number,
  coderToken?: string,
  mode: GameMode = 'endless',
): GameSession {
  return {
    id: sessionId,
    challengeId: '',
    currentStep: 1,
    remainingTime: 0,
    currentCode: '',
    status: 'idle',
    startedAt,
    language: language ?? 'random',
    generating: false,
    coderToken,
    clientQuestions: freshClientQuestions(),
    round: 1,
    playedRounds: 0,
    mode,
    streak: 0,
    bestStreak: 0,
    comboScore: 0,
    ...createInitialLives(),
  };
}

export function abandonGame(session: GameSession, role: PlayerRole): GameSession {
  if (session.status !== 'playing') {
    return session;
  }

  return {
    ...session,
    status: 'abandoned',
    abandonedBy: role,
  };
}

export function gameDurationSeconds(session: GameSession, now: number): number {
  return Math.max(0, Math.round((now - session.startedAt) / 1000));
}

function viewMeta(session: GameSession): Pick<CoderStepView, 'round' | 'mode' | 'streak' | 'multiplier'> {
  return {
    round: session.round,
    mode: session.mode,
    streak: session.streak,
    multiplier: streakMultiplier(session.streak),
  };
}

export function getCoderStepView(session: GameSession, challenge: Challenge): CoderStepView {
  const step = challenge.steps[session.currentStep - 1];

  if (session.status === 'victory') {
    return {
      code: session.currentCode,
      error: '',
      options: [],
      currentStep: session.currentStep,
      totalSteps: challenge.steps.length,
      remainingTime: session.remainingTime,
      status: session.status,
      lastResult: session.lastResult,
      coderLives: session.coderLives,
      defeatReason: session.defeatReason,
      ...viewMeta(session),
    };
  }

  return {
    code: step.coder_view.code,
    error: step.coder_view.error,
    options: [...step.options],
    currentStep: session.currentStep,
    totalSteps: challenge.steps.length,
    remainingTime: session.remainingTime,
    status: session.status,
    lastResult: session.lastResult,
    coderLives: session.coderLives,
    defeatReason: session.defeatReason,
    ...viewMeta(session),
  };
}

export function getHelperSyncView(
  session: GameSession,
  challenge: Challenge,
  activeClientQuestion: HelperSyncView['activeClientQuestion'],
): HelperSyncView {
  return {
    remainingTime: session.remainingTime,
    currentStep: session.currentStep,
    totalSteps: challenge.steps.length,
    status: session.status,
    activeClientQuestion,
    helperLives: session.helperLives,
    defeatReason: session.defeatReason,
    round: session.round,
    mode: session.mode,
  };
}

export function submitAnswer(
  session: GameSession,
  challenge: Challenge,
  answerIndex: number,
): GameSession {
  if (session.status !== 'playing') {
    return session;
  }

  const step = challenge.steps[session.currentStep - 1];
  const result = resolveStep(step, answerIndex);

  if (result.success) {
    const isLastStep = session.currentStep >= challenge.steps.length;

    if (isLastStep && session.mode === 'endless') {
      const withReward = applyTimeDelta(session, ENDLESS_REWARD_SECONDS);
      return {
        ...withReward,
        ...comboFieldsOnCorrect(session),
        currentCode: result.patch!,
        status: 'playing',
        roundComplete: true,
        playedRounds: session.playedRounds + 1,
        lastResult: 'correct',
      };
    }

    return {
      ...session,
      ...comboFieldsOnCorrect(session),
      currentCode: result.patch!,
      currentStep: isLastStep ? session.currentStep : session.currentStep + 1,
      status: isLastStep ? 'victory' : 'playing',
      lastResult: 'correct',
    };
  }

  const afterLifeLoss = loseLife(session, 'coder');
  return {
    ...applyTimeDelta(afterLifeLoss, -(result.penalty ?? PENALTY_SECONDS)),
    streak: 0,
    lastResult: 'incorrect',
  };
}

export function tickTimer(session: GameSession): GameSession {
  if (session.status !== 'playing') {
    return session;
  }

  const newTime = session.remainingTime - 1;
  const timedOut = newTime <= 0;

  return {
    ...session,
    remainingTime: Math.max(0, newTime),
    status: timedOut ? 'defeat' : session.status,
    defeatReason: timedOut && !session.defeatReason ? 'timeout' : session.defeatReason,
  };
}

export function clearLastResult(session: GameSession): GameSession {
  const { lastResult, ...rest } = session;
  void lastResult;
  return rest;
}

export function isTerminalStatus(status: GameStatus): boolean {
  return status === 'victory' || status === 'defeat';
}