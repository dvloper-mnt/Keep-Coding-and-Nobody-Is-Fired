# Game Loop

## State Machine

```
[IDLE] → startGame() → [PLAYING]
[PLAYING] → correct answer (last step) → [VICTORY]
[PLAYING] → correct answer (more steps) → [PLAYING] (step++)
[PLAYING] → wrong answer → [PLAYING] (penalty applied)
[PLAYING] → timer = 0 → [DEFEAT]
[DEFEAT|VICTORY] → restart → [PLAYING]
```

---

## GameState Shape

```ts
interface GameState {
  challengeId: string;
  currentStep: number;       // 1-based index
  remainingTime: number;     // seconds
  currentCode: string;       // updated after each successful fix
  status: 'idle' | 'playing' | 'victory' | 'defeat';
  lastResult?: 'correct' | 'incorrect';
}
```

---

## Step-by-Step Flow

### 1. Game Start

```ts
function startGame(challenge: Challenge): GameState {
  const firstStep = challenge.steps[0];
  return {
    challengeId: challenge.id,
    currentStep: 1,
    remainingTime: challenge.time_limit,
    currentCode: firstStep.coder_view.code,
    status: 'playing',
  };
}
```

### 2. Answer Submission

Only triggered by Coder action:

```ts
function submitAnswer(state: GameState, challenge: Challenge, answerIndex: number): GameState {
  const step = challenge.steps[state.currentStep - 1];
  const result = resolveStep(step, answerIndex);

  if (result.success) {
    const isLastStep = state.currentStep >= challenge.steps.length;
    return {
      ...state,
      currentCode: result.patch,
      currentStep: isLastStep ? state.currentStep : state.currentStep + 1,
      status: isLastStep ? 'victory' : 'playing',
      lastResult: 'correct',
    };
  }

  return {
    ...state,
    remainingTime: Math.max(0, state.remainingTime - result.penalty),
    status: state.remainingTime - result.penalty <= 0 ? 'defeat' : 'playing',
    lastResult: 'incorrect',
  };
}
```

### 3. Timer Tick

Called every second by UI timer hook:

```ts
function tickTimer(state: GameState): GameState {
  if (state.status !== 'playing') return state;

  const newTime = state.remainingTime - 1;
  return {
    ...state,
    remainingTime: newTime,
    status: newTime <= 0 ? 'defeat' : 'playing',
  };
}
```

---

## Key Design Insight

A level is **one problem with dynamic evolution**, not a quiz.

Each step:
- Builds on the previous fix
- Introduces a new error caused by the partial fix
- Simulates real debugging progression

Example chain (Login en caos):
1. Wrong method name → fix method
2. Missing import → add use statement
3. Syntax error (double `;`) → clean syntax

---

## Random Challenge Selection

MVP: pick random challenge from available pool.

```ts
function pickRandomChallenge(challenges: Challenge[]): Challenge {
  const index = Math.floor(Math.random() * challenges.length);
  return challenges[index];
}
```

Future: difficulty filter, session-based dedup.