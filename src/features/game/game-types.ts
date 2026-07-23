export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
export type GameMode = 'classic' | 'endless';
export type GameStatus = 'idle' | 'playing' | 'victory' | 'defeat' | 'abandoned';
export type PlayerRole = 'coder' | 'helper';
export type DefeatReason = 'timeout' | 'coder_lives' | 'helper_lives';

// The Coder may request a language for the generated challenge; 'random' (the
// default) lets the generator pick one.
export type ChallengeLanguage =
  | 'random'
  | 'php'
  | 'sql'
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'java'
  | 'ruby';

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
  startedAt: number;
  abandonedBy?: PlayerRole;
  // When the challenge was generated at runtime (Bedrock) it is not in the static
  // catalog, so it travels with the session. Absent → resolve from the catalog by id.
  generatedChallenge?: Challenge;
  // A room is created in 'idle' before its challenge exists: the Coder shares the
  // code while Bedrock generates in the background for this language. `generating`
  // guards against two concurrent polls kicking off generation twice.
  language?: ChallengeLanguage;
  generating?: boolean;
  // When generation was claimed. If a claim is older than the generation budget
  // the previous attempt is assumed dead (request died mid-call) and a new poll
  // retries — otherwise a crashed generation would freeze the room forever.
  generatingStartedAt?: number;
  // Opaque per-player secrets. The room code lets you read the game; mutating it
  // (answer/abandon) requires the matching token. The Coder's is minted at start;
  // the Helper's the first time they fetch the guide.
  coderToken?: string;
  helperToken?: string;
  coderLives: number;
  helperLives: number;
  defeatReason?: DefeatReason;
  /** Current round (1-based). Persists across the endless loop. */
  round: number;
  /** Rounds fully completed — increments only when all steps of a challenge are solved. */
  playedRounds: number;
  mode: GameMode;
  /** Transient: last step solved in endless mode; service loads the next challenge. */
  roundComplete?: boolean;
  /** Consecutive correct step answers without an error in between. */
  streak: number;
  /** Longest streak reached during this session (survives streak breaks). */
  bestStreak: number;
  /** Accumulated combo bonus points (added to endlessScore at game over). */
  comboScore: number;
  /** Set once this session's score has been registered in the leaderboard, so a
   * client retry cannot register the same run twice. */
  leaderboardRegistered?: boolean;
}

export interface StepResult {
  success: boolean;
  patch?: string;
  penalty?: number;
  message?: string;
}

// A single row of the global leaderboard. `score` is the endlessScore (with
// combos) read from the game over — the leaderboard never recomputes it.
// `playedRounds` is persisted alongside the entry, NOT derived from the score
// (the combo bonus would contaminate floor(score / 1000)).
export interface LeaderboardEntry {
  rank: number;
  teamName: string;
  score: number;
  playedRounds: number;
}

export interface LeaderboardTop {
  entries: LeaderboardEntry[];
}

// The client sends only these three fields — never the score. The server reads
// the score from the persisted game-over session, so a fabricated score is not
// possible.
export interface RegisterScoreInput {
  sessionId: string;
  token: string;
  teamName: string;
}

export interface RegisterScoreResult {
  rank: number;
  entries: LeaderboardEntry[];
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
  abandonedBy?: PlayerRole;
  durationSeconds?: number;
  coderLives: number;
  defeatReason?: DefeatReason;
  // Set only on the 'idle' view: the language being generated, so the Coder's
  // waiting screen can tail a production log in that language.
  language?: ChallengeLanguage;
  round?: number;
  mode?: GameMode;
  playedRounds?: number;
  endlessScore?: number;
  streak: number;
  multiplier: number;
  bestStreak?: number;
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
  // Minted on the Helper's first guide fetch; required to mutate (answer client
  // questions, abandon). Stored client-side, like the Coder's token.
  helperToken: string;
}

// Returned to a Helper who joins while the room is still 'idle' (Bedrock
// generating). The client shows a "waiting for the Coder" screen and retries.
export interface HelperGuidePending {
  pending: true;
}

// The room's single Helper seat is already taken by someone else.
export interface HelperGuideOccupied {
  occupied: true;
}

export type HelperGuideResult =
  | HelperStaticGuide
  | HelperGuidePending
  | HelperGuideOccupied;

export interface HelperSyncView {
  remainingTime: number;
  currentStep: number;
  totalSteps: number;
  status: GameStatus;
  activeClientQuestion: ClientQuestionView | null;
  abandonedBy?: PlayerRole;
  durationSeconds?: number;
  helperLives: number;
  defeatReason?: DefeatReason;
  round?: number;
  mode?: GameMode;
  playedRounds?: number;
  endlessScore?: number;
  bestStreak?: number;
}

export interface ClientQuestionAnswerResponse {
  success: boolean;
  penalty?: number;
  bonus?: number;
  message?: string;
  remainingTime: number;
  status: GameStatus;
  activeClientQuestion: ClientQuestionView | null;
  livesRemaining?: number;
  lifeLost?: boolean;
}

export interface StartGameResponse {
  sessionId: string;
  coderToken: string;
}

export interface AnswerResponse {
  success: boolean;
  patch?: string;
  penalty?: number;
  message?: string;
  status: GameStatus;
  remainingTime: number;
  coderView?: CoderStepView;
  livesRemaining?: number;
  lifeLost?: boolean;
}