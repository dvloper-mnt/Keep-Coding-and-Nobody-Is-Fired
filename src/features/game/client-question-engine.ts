import { loadClientQuestions } from '@/src/data/client-questions';
import {
  CLIENT_QUESTION_CONFIG,
  CLIENT_QUESTION_CORRECT_MESSAGE,
  CLIENT_QUESTION_WRONG_MESSAGE,
} from '@/src/lib/constants';
import { applyTimeDelta, resolveMultipleChoice } from './game-engine';
import { loseLife } from './lives-engine';
import type {
  ClientQuestion,
  ClientQuestionAnswerResponse,
  ClientQuestionSessionState,
  ClientQuestionView,
  GameSession,
  StepResult,
} from './game-types';

export function createClientQuestionState(): ClientQuestionSessionState {
  return {
    activeQuestionId: null,
    answeredQuestionIds: [],
    cooldownRemaining: CLIENT_QUESTION_CONFIG.spawnIntervalSeconds,
    totalSpawned: 0,
  };
}

export function toClientQuestionView(question: ClientQuestion): ClientQuestionView {
  return {
    id: question.id,
    category: question.category,
    client_prompt: question.client_prompt,
    options: [...question.options],
  };
}

export function pickRandomClientQuestion(excludeIds: string[]): ClientQuestion | null {
  const pool = loadClientQuestions().filter((q) => !excludeIds.includes(q.id));
  if (pool.length === 0) return null;

  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

export function getActiveClientQuestionView(
  state: ClientQuestionSessionState,
): ClientQuestionView | null {
  if (!state.activeQuestionId) return null;

  const question = loadClientQuestions().find((q) => q.id === state.activeQuestionId);
  return question ? toClientQuestionView(question) : null;
}

export function resolveClientQuestion(question: ClientQuestion, answerIndex: number): StepResult {
  return resolveMultipleChoice(
    question.correct_answer,
    answerIndex,
    CLIENT_QUESTION_CONFIG.wrongPenaltySeconds,
    CLIENT_QUESTION_WRONG_MESSAGE,
  );
}

function spawnClientQuestion(session: GameSession): GameSession {
  const { clientQuestions } = session;

  if (clientQuestions.activeQuestionId) return session;
  if (clientQuestions.totalSpawned >= CLIENT_QUESTION_CONFIG.maxQuestionsPerSession) {
    return session;
  }

  const question = pickRandomClientQuestion(clientQuestions.answeredQuestionIds);
  if (!question) return session;

  return {
    ...session,
    clientQuestions: {
      ...clientQuestions,
      activeQuestionId: question.id,
      totalSpawned: clientQuestions.totalSpawned + 1,
      cooldownRemaining: CLIENT_QUESTION_CONFIG.spawnIntervalSeconds,
    },
  };
}

export function processClientQuestionSpawnTick(session: GameSession): GameSession {
  if (session.status !== 'playing') return session;

  const { clientQuestions } = session;

  if (clientQuestions.activeQuestionId) return session;

  const cooldownRemaining = clientQuestions.cooldownRemaining - 1;

  if (cooldownRemaining > 0) {
    return {
      ...session,
      clientQuestions: {
        ...clientQuestions,
        cooldownRemaining,
      },
    };
  }

  const shouldSpawn = Math.random() < CLIENT_QUESTION_CONFIG.spawnChance;
  const withCooldown = {
    ...session,
    clientQuestions: {
      ...clientQuestions,
      cooldownRemaining: CLIENT_QUESTION_CONFIG.spawnIntervalSeconds,
    },
  };

  return shouldSpawn ? spawnClientQuestion(withCooldown) : withCooldown;
}

export function submitClientQuestionAnswer(
  session: GameSession,
  question: ClientQuestion,
  answerIndex: number,
): { session: GameSession; response: ClientQuestionAnswerResponse } {
  if (session.status !== 'playing') {
    return {
      session,
      response: {
        success: false,
        message: 'La partida ya terminó.',
        remainingTime: session.remainingTime,
        status: session.status,
        activeClientQuestion: getActiveClientQuestionView(session.clientQuestions),
      },
    };
  }

  if (session.clientQuestions.activeQuestionId !== question.id) {
    return {
      session,
      response: {
        success: false,
        message: 'No hay una consulta activa del cliente.',
        remainingTime: session.remainingTime,
        status: session.status,
        activeClientQuestion: getActiveClientQuestionView(session.clientQuestions),
      },
    };
  }

  const result = resolveClientQuestion(question, answerIndex);

  if (result.success) {
    const updatedSession: GameSession = {
      ...applyTimeDelta(session, CLIENT_QUESTION_CONFIG.correctBonusSeconds),
      clientQuestions: {
        ...session.clientQuestions,
        activeQuestionId: null,
        answeredQuestionIds: [...session.clientQuestions.answeredQuestionIds, question.id],
      },
    };

    return {
      session: updatedSession,
      response: {
        success: true,
        bonus: CLIENT_QUESTION_CONFIG.correctBonusSeconds,
        message: CLIENT_QUESTION_CORRECT_MESSAGE,
        remainingTime: updatedSession.remainingTime,
        status: updatedSession.status,
        activeClientQuestion: null,
      },
    };
  }

  const afterLifeLoss = loseLife(session, 'helper');
  const penalizedSession = applyTimeDelta(
    afterLifeLoss,
    -CLIENT_QUESTION_CONFIG.wrongPenaltySeconds,
  );

  return {
    session: penalizedSession,
    response: {
      success: false,
      penalty: CLIENT_QUESTION_CONFIG.wrongPenaltySeconds,
      message: result.message ?? CLIENT_QUESTION_WRONG_MESSAGE,
      remainingTime: penalizedSession.remainingTime,
      status: penalizedSession.status,
      activeClientQuestion: getActiveClientQuestionView(penalizedSession.clientQuestions),
      livesRemaining: penalizedSession.helperLives,
      lifeLost: true,
    },
  };
}