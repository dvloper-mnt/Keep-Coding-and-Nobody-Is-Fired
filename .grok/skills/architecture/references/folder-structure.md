# Folder Structure

Directory layout for **Keep Coding and Nobody Is Fired** — Next.js 16 App Router.

---

## Root Structure

```bash
app/
  page.tsx              # landing / role selection (MVP)
  layout.tsx
  globals.css
  coder/
    page.tsx            # Coder screen
  helper/
    page.tsx            # Helper screen
  api/
    game/
      route.ts          # start session, get state
      answer/route.ts   # submit answer (Coder only)

src/
  features/
    game/
      game-engine.ts    # pure logic: validation, state transitions
      game-types.ts     # Challenge, GameState, StepResult, views
      game-service.ts   # session helpers, challenge loading
  components/
    CoderScreen.tsx
    HelperScreen.tsx
    GameTimer.tsx
    ErrorBanner.tsx
    CodePanel.tsx
    ManualPanel.tsx
    BossOverlay.tsx
  data/
    challenges/
      login-chaos.json
      index.ts          # exports all challenges
  lib/
    constants.ts        # PENALTY_SECONDS, BOSS_MESSAGES, etc.
```

---

## Layer → Folder Mapping

| Layer | Location |
|-------|----------|
| UI (pages) | `app/coder/`, `app/helper/`, `app/page.tsx` |
| UI (components) | `src/components/` |
| Actions | `app/api/game/` (or Server Actions colocated in `app/`) |
| Game Logic | `src/features/game/` |
| Data | `src/data/challenges/` |

---

## Folder Details

### `app/`

Next.js App Router — routes and API handlers only.

| Path | Purpose |
|------|---------|
| `app/coder/` | Coder screen — code, error, options, timer |
| `app/helper/` | Helper screen — manual, rules, knowledge |
| `app/api/game/` | Server endpoints — validate answers, manage session |

Pages compose components from `src/components/`. No business logic here.

### `src/features/game/`

Core game logic — the heart of the project.

| File | Responsibility |
|------|----------------|
| `game-engine.ts` | `startGame`, `resolveStep`, `submitAnswer`, `tickTimer`, `getStepView` |
| `game-types.ts` | All TypeScript interfaces and union types |
| `game-service.ts` | Load challenges, session management, role-filtered responses |

### `src/components/`

Reusable UI — presentation only, no validation or state rules.

### `src/data/challenges/`

Static challenge JSON for MVP. One file per challenge, kebab-case naming.

### `src/lib/`

Shared utilities and constants not tied to game engine logic.

---

## Import Alias

`tsconfig.json` maps `@/*` to project root:

```ts
import { resolveStep } from '@/src/features/game/game-engine';
import type { Challenge } from '@/src/features/game/game-types';
import { GameTimer } from '@/src/components/GameTimer';
import challenges from '@/src/data/challenges';
```

---

## Rules

- Game logic lives **only** in `src/features/game/`
- UI must **not** contain business logic
- API routes / Server Actions call game engine — never validate inline
- `correct_answer` never leaves the server
- Role-filtered views: Coder and Helper get different payloads

---

## Examples

```ts
// ❌ BAD — logic inside component
const isCorrect = answerIndex === step.correct_answer;

// ✅ GOOD — delegate to engine
import { resolveStep } from '@/src/features/game/game-engine';
const result = resolveStep(step, answerIndex);
```

```ts
// ❌ BAD — full challenge sent to client
return Response.json(challenge);

// ✅ GOOD — role-filtered view
return Response.json(getStepView(step, 'coder'));
```

---

## Current State

The repo currently has only the Next.js scaffold (`app/page.tsx`, `app/layout.tsx`). The structure above is the **target layout** to implement.

---

## Related Skills

- `coding-standards` — naming and conventions
- `game-mechanics` — engine functions and loop
- `game-roles` — what each screen shows
- `game-challenges` — challenge JSON schema