export type Difficulty = 'easy' | 'medium' | 'hard';
export type GameStatus = 'idle' | 'playing' | 'victory' | 'defeat';

export type ClientQuestionCategory =
  | 'architecture'
  | 'programming'
  | 'sql'
  | 'design-patterns';

export type MultipleChoiceOptions = [string, string, string, string];

export interface CoderViewData {
  code: string;
  error: string;
}

export interface HelperViewData {
  rules: string[];
  knowledge: string[];
}

export interface SuccessState {
  code_patch: string;
}

export interface ChallengeStep {
  step: number;
  coder_view: CoderViewData;
  helper_view: HelperViewData;
  options: MultipleChoiceOptions;
  correct_answer: number;
  success_state: SuccessState;
  hint?: string;
}

export interface ClientQuestion {
  id: string;
  category: ClientQuestionCategory;
  client_prompt: string;
  options: MultipleChoiceOptions;
  correct_answer: number;
}

export interface ClientQuestionView {
  id: string;
  category: ClientQuestionCategory;
  client_prompt: string;
  options: string[];
}

export interface ClientQuestionSessionState {
  activeQuestionId: string | null;
  answeredQuestionIds: string[];
  cooldownRemaining: number;
  totalSpawned: number;
}

export interface Challenge {
  id: string;
  title: string;
  difficulty: Difficulty;
  story_context: string;
  time_limit: number;
  steps: ChallengeStep[];
}

export interface GameSession {
  id: string;
  challengeId: string;
  currentStep: number;
  remainingTime: number;
  currentCode: string;
  status: GameStatus;
  lastResult?: 'correct' | 'incorrect';
  clientQuestions: ClientQuestionSessionState;
}

export interface StepResult {
  success: boolean;
  patch?: string;
  penalty?: number;
  message?: string;
}

export interface CoderStepView {
  code: string;
  error: string;
  options: string[];
  currentStep: number;
  totalSteps: number;
  remainingTime: number;
  status: GameStatus;
  lastResult?: 'correct' | 'incorrect';
}

export interface HelperGuideSection {
  exercise: number;
  rules: string[];
  knowledge: string[];
  hint?: string;
}

export interface HelperStaticGuide {
  title: string;
  storyContext: string;
  totalExercises: number;
  sections: HelperGuideSection[];
}

export interface HelperSyncView {
  remainingTime: number;
  currentStep: number;
  totalSteps: number;
  status: GameStatus;
  activeClientQuestion: ClientQuestionView | null;
}

export interface ClientQuestionAnswerResponse {
  success: boolean;
  penalty?: number;
  bonus?: number;
  message?: string;
  remainingTime: number;
  status: GameStatus;
  activeClientQuestion: ClientQuestionView | null;
}

export interface StartGameResponse {
  sessionId: string;
  coderView: CoderStepView;
}

export interface AnswerResponse {
  success: boolean;
  patch?: string;
  penalty?: number;
  message?: string;
  status: GameStatus;
  remainingTime: number;
  coderView?: CoderStepView;
}