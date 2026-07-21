import { CLIENT_QUESTION_CONFIG, PENALTY_SECONDS, WRONG_ANSWER_MESSAGE } from '@/src/lib/constants';
import type {
  Challenge,
  ChallengeStep,
  CoderStepView,
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
  const status =
    newTime <= 0 && session.status === 'playing' ? 'defeat' : session.status;

  return {
    ...session,
    remainingTime: newTime,
    status,
  };
}

export function createSession(
  challenge: Challenge,
  sessionId: string,
  startedAt: number,
): GameSession {
  const firstStep = challenge.steps[0];
  return {
    id: sessionId,
    challengeId: challenge.id,
    currentStep: 1,
    remainingTime: challenge.time_limit,
    currentCode: firstStep.coder_view.code,
    status: 'playing',
    startedAt,
    clientQuestions: {
      activeQuestionId: null,
      answeredQuestionIds: [],
      cooldownRemaining: CLIENT_QUESTION_CONFIG.spawnIntervalSeconds,
      totalSpawned: 0,
    },
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
    return {
      ...session,
      currentCode: result.patch!,
      currentStep: isLastStep ? session.currentStep : session.currentStep + 1,
      status: isLastStep ? 'victory' : 'playing',
      lastResult: 'correct',
    };
  }

  return {
    ...applyTimeDelta(session, -(result.penalty ?? PENALTY_SECONDS)),
    lastResult: 'incorrect',
  };
}

export function tickTimer(session: GameSession): GameSession {
  if (session.status !== 'playing') {
    return session;
  }

  const newTime = session.remainingTime - 1;
  return {
    ...session,
    remainingTime: newTime,
    status: newTime <= 0 ? 'defeat' : session.status,
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