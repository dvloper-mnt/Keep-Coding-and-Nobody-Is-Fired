import type {
  ChallengeStep,
  ClientQuestion,
  ClientQuestionCategory,
  ClientQuestionSessionState,
  GameSession,
  MultipleChoiceOptions,
} from '../game-types';

// ---------------------------------------------------------------------------
// Default values represent a valid session in step 1, status 'playing'.
// All factories accept Partial<T> overrides — zero `any`, zero `as` casts.
// ---------------------------------------------------------------------------

const DEFAULT_OPTIONS: MultipleChoiceOptions = [
  'Option A',
  'Option B',
  'Option C',
  'Option D',
];

export function makeClientQuestionState(
  overrides: Partial<ClientQuestionSessionState> = {},
): ClientQuestionSessionState {
  return {
    activeQuestionId: null,
    answeredQuestionIds: [],
    cooldownRemaining: 40,
    totalSpawned: 0,
    ...overrides,
  };
}

export function makeSession(overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: 'TEST',
    challengeId: 'test-challenge',
    currentStep: 1,
    remainingTime: 180,
    currentCode: 'echo "step 1";',
    status: 'playing',
    startedAt: 1_000_000,
    clientQuestions: makeClientQuestionState(),
    ...overrides,
  };
}

export function makeStep(overrides: Partial<ChallengeStep> = {}): ChallengeStep {
  return {
    step: 1,
    coder_view: {
      code: 'echo "broken";',
      error: 'Fatal error: step 1',
    },
    helper_view: {
      rules: ['Rule A'],
      knowledge: ['Knowledge A'],
    },
    options: DEFAULT_OPTIONS,
    correct_answer: 0,
    success_state: {
      code_patch: 'echo "fixed";',
    },
    ...overrides,
  };
}

export function makeClientQuestion(
  overrides: Partial<ClientQuestion> = {},
): ClientQuestion {
  const defaultCategory: ClientQuestionCategory = 'programming';
  return {
    id: 'q-test-001',
    category: defaultCategory,
    client_prompt: 'What does SOLID stand for?',
    options: DEFAULT_OPTIONS,
    correct_answer: 0,
    ...overrides,
  };
}
