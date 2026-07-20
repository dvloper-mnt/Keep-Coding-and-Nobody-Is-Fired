# Game State

## Runtime State

Separate **content** (Challenge) from **runtime** (GameState).

| Concept | Mutable | Lives in |
|---------|---------|----------|
| Challenge | No (immutable content) | `/src/data/challenges/` or DB |
| GameState | Yes (runtime) | Server session / client state |

---

## GameState Fields

```ts
interface GameState {
  challengeId: string;       // which challenge is active
  currentStep: number;       // 1-based, which step player is on
  remainingTime: number;     // seconds left
  currentCode: string;       // latest code (updated on each fix)
  status: GameStatus;        // idle | playing | victory | defeat
  lastResult?: 'correct' | 'incorrect';  // for UI feedback
}
```

---

## State Transitions

| Event | State changes |
|-------|---------------|
| `startGame(challenge)` | Reset all fields, step=1, time=time_limit, status=playing |
| `submitAnswer(correct)` | Update currentCode, advance step or victory |
| `submitAnswer(wrong)` | Decrease time by 10, lastResult=incorrect |
| `tickTimer()` | Decrease time by 1, defeat if 0 |
| `restart()` | Same as startGame |

---

## Session Model (MVP)

```ts
interface GameSession {
  id: string;                // shared between Coder + Helper
  state: GameState;
  challenge: Challenge;
  createdAt: number;
}
```

### MVP Sync Options
1. **Same device** — two tabs, localStorage/sessionStorage
2. **Two devices** — API polling or WebSocket on shared session ID
3. **Hackathon demo** — two browser windows side by side

---

## API Response Shapes

### Coder endpoint
```ts
interface CoderGameResponse {
  code: string;
  error: string;
  options: string[];
  remainingTime: number;
  currentStep: number;
  totalSteps: number;
  status: GameStatus;
  lastResult?: 'correct' | 'incorrect';
}
```

### Helper endpoint
```ts
interface HelperGameResponse {
  title: string;
  storyContext: string;
  rules: string[];
  knowledge: string[];
  remainingTime: number;
  currentStep: number;
  totalSteps: number;
  status: GameStatus;
}
```

### Submit answer (Coder only)
```ts
// Request
{ sessionId: string, answerIndex: number }

// Response
{
  success: boolean;
  patch?: string;
  penalty?: number;
  message?: string;
  status: GameStatus;
  remainingTime: number;
}
```

---

## What NOT to Store in State

- `correct_answer` — always read from challenge server-side at validation time
- Full challenge object on client — only role-filtered views
- Helper view data on Coder session (and vice versa)