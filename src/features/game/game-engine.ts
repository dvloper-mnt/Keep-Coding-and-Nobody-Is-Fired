import { PENALTY_SECONDS, WRONG_ANSWER_MESSAGE } from '@/src/lib/constants';
import type {
  Challenge,
  ChallengeStep,
  CoderStepView,
  GameSession,
  GameStatus,
  HelperSyncView,
  StepResult,
} from './game-types';

export function resolveStep(step: ChallengeStep, answerIndex: number): StepResult {
  if (answerIndex === step.correct_answer) {
    return {
      success: true,
      patch: step.success_state.code_patch,
    };
  }

  return {
    success: false,
    penalty: PENALTY_SECONDS,
    message: WRONG_ANSWER_MESSAGE,
  };
}

export function createSession(challenge: Challenge, sessionId: string): GameSession {
  const firstStep = challenge.steps[0];
  return {
    id: sessionId,
    challengeId: challenge.id,
    currentStep: 1,
    remainingTime: challenge.time_limit,
    currentCode: firstStep.coder_view.code,
    status: 'playing',
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

export function getHelperSyncView(session: GameSession, challenge: Challenge): HelperSyncView {
  return {
    remainingTime: session.remainingTime,
    currentStep: session.currentStep,
    totalSteps: challenge.steps.length,
    status: session.status,
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

  const newTime = Math.max(0, session.remainingTime - (result.penalty ?? PENALTY_SECONDS));
  return {
    ...session,
    remainingTime: newTime,
    status: newTime <= 0 ? 'defeat' : 'playing',
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
  const { lastResult: _, ...rest } = session;
  return rest;
}

export function isTerminalStatus(status: GameStatus): boolean {
  return status === 'victory' || status === 'defeat';
}