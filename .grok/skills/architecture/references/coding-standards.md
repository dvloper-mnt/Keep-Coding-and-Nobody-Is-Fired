# Coding Standards

Standards for **Keep Coding and Nobody Is Fired** — Next.js 16, TypeScript, Tailwind CSS v4.

---

## General Rules

- Keep functions small and focused
- Use clear, descriptive names
- Avoid nested logic — prefer early returns
- Prefer readability over cleverness
- Only write code required for the current task — no drive-by refactors

---

## Naming

### Variables — `camelCase`

```ts
const remainingTime = 180;
const currentStep = 1;
const answerIndex = 0;
```

### Functions — verb-based `camelCase`

```ts
startGame()
resolveStep()
submitAnswer()
getStepView()
tickTimer()
applyPenalty()
```

### Types & Interfaces — `PascalCase`

```ts
type GameStatus = 'idle' | 'playing' | 'victory' | 'defeat';
interface GameState { ... }
interface StepResult { ... }
```

Use union types over enums for game states (`GameStatus`, `Difficulty`, `GameRole`).

### Constants — `SCREAMING_SNAKE_CASE`

```ts
const PENALTY_SECONDS = 10;
const DEFAULT_TIME_LIMIT = 180;
const BOSS_MESSAGE_INTERVAL_MS = 15_000;
```

### React Components — `PascalCase` files

```bash
CoderScreen.tsx
HelperScreen.tsx
GameTimer.tsx
ErrorBanner.tsx
```

### Logic & utility files — `kebab-case`

```bash
game-engine.ts
game-types.ts
game-service.ts
challenge-schema.ts
```

### Challenge data — `kebab-case` JSON

```bash
login-chaos.json
```

---

## TypeScript

- No `any` — use proper types or `unknown` with narrowing
- Always type function inputs and outputs
- All game types live in `src/features/game/game-types.ts`
- Use `Readonly<>` for props when applicable
- Prefer `interface` for object shapes, `type` for unions

```ts
// ✅ GOOD
function resolveStep(step: ChallengeStep, answerIndex: number): StepResult {
  if (answerIndex === step.correct_answer) {
    return { success: true, patch: step.success_state.code_patch };
  }
  return { success: false, penalty: PENALTY_SECONDS, message: 'El sistema sigue fallando…' };
}

// ❌ BAD
function resolveStep(step: any, answer: any): boolean { ... }
```

---

## Project Structure

```
app/
  coder/page.tsx       → Coder screen
  helper/page.tsx      → Helper screen
  api/game/            → API routes (if not using Server Actions)

src/
  features/game/
    game-engine.ts     → pure game logic (core)
    game-types.ts      → all TypeScript types
    game-service.ts    → session/helpers
  components/          → reusable UI
  data/challenges/     → static JSON challenges
  lib/                 → shared utilities
```

### Import alias

`tsconfig.json` maps `@/*` to project root:

```ts
import { resolveStep } from '@/src/features/game/game-engine';
import { GameTimer } from '@/src/components/GameTimer';
import type { Challenge } from '@/src/features/game/game-types';
```

---

## Layer Responsibilities

| Layer | Location | Responsibility |
|-------|----------|----------------|
| UI | `app/`, `src/components/` | Render, input, animations, sounds |
| Actions | `app/api/` or Server Actions | Receive requests, call engine, return sanitized data |
| Game Logic | `src/features/game/` | Validation, state transitions, penalties |
| Data | `src/data/challenges/` | Static challenge JSON |

### Golden separation rule

```ts
// ❌ BAD — logic inside component
function CoderScreen() {
  const isCorrect = answerIndex === step.correct_answer;
}

// ✅ GOOD — component calls engine
import { resolveStep } from '@/src/features/game/game-engine';
```

---

## Next.js Conventions

### Server vs Client

- **Server Components** (default) — data fetching, layouts, static content
- **Client Components** (`'use client'`) — timer, animations, sounds, user interactions

```ts
// Client only when needed
'use client';

export function GameTimer({ remainingTime }: { remainingTime: number }) { ... }
```

### API / Server Actions

- Answer validation runs **server-side only**
- Never send `correct_answer` to the client
- Return role-filtered views (`CoderStepView` / `HelperStepView`)

```ts
// ✅ Server response for Coder
{ code, error, options, remainingTime, status }

// ❌ NEVER include in any client response
{ correct_answer, full ChallengeStep }
```

### Routes

| Route | Role |
|-------|------|
| `/coder` | Coder screen — code, error, options, submit |
| `/helper` | Helper screen — manual, rules, knowledge |

---

## Game-Specific Rules

### Engine (`game-engine.ts`)

- Pure functions when possible — no React, no DOM, no `fetch`
- Deterministic validation — same input, same output
- State transitions are explicit (`playing` → `victory` | `defeat`)

### Roles (`game-roles`)

- Coder submits answers; Helper does not
- Filter data per role before sending to client
- UI must not bypass cooperation (no shared debug panel)

### Challenges (`game-challenges`)

- Challenge JSON uses `snake_case` keys (`coder_view`, `correct_answer`, `time_limit`)
- TypeScript types use `camelCase` in view DTOs (`storyContext`)
- Exactly 4 options per step
- `correct_answer` is zero-based index — server only

### Feedback constants

| Event | Value |
|-------|-------|
| Wrong answer penalty | `PENALTY_SECONDS = 10` |
| Default timer | `DEFAULT_TIME_LIMIT = 180` |
| Wrong answer message | `'El sistema sigue fallando…'` |

---

## Components

- One component, one responsibility
- Props typed with `interface` or inline types
- No business logic — delegate to `game-engine` or Server Actions
- Styling with Tailwind CSS utility classes
- Game UI strings in Spanish (messages, boss pressure, feedback)

```tsx
interface ErrorBannerProps {
  error: string;
}

export function ErrorBanner({ error }: ErrorBannerProps) {
  return (
    <div className="rounded-md bg-red-950 px-4 py-3 font-mono text-sm text-red-300">
      ERROR: {error}
    </div>
  );
}
```

---

## Error Handling

- Always handle errors in API routes and Server Actions
- Never fail silently — return meaningful error responses
- Engine functions return result objects, not thrown exceptions for game flow

```ts
// Game flow — result object
return { success: false, penalty: 10, message: 'El sistema sigue fallando…' };

// Infrastructure — throw or return error
if (!session) {
  return Response.json({ error: 'Session not found' }, { status: 404 });
}
```

---

## Comments

- Only when the *why* is not obvious
- No comments that restate what the code does
- No verbose docstrings on trivial functions

---

## Related Skills

- `architecture` — layers and folder strategy
- `game-mechanics` — loop, validation, timer
- `game-roles` — Coder/Helper views
- `game-challenges` — schema and content authoring

---

## Golden Rule

If it's hard to read, it's wrong.