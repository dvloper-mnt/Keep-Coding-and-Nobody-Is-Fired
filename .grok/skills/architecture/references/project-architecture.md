# Project Architecture

Architecture for **Keep Coding and Nobody Is Fired** — cooperative debugging game under production pressure.

---

## Overview

Simple, pragmatic layered architecture optimized for:

- fast hackathon iteration
- clear separation of concerns
- testable game logic
- easy scaling later (DB, WebSocket sync)

---

## Layers

### 1. UI Layer

**Location:** `app/`, `src/components/`

**Responsible for:**
- rendering Coder and Helper screens
- handling user input (option selection, start game)
- timer display, sounds, animations, boss messages
- triggering server actions / API calls

**Examples:**
- `app/coder/page.tsx` — Coder route
- `app/helper/page.tsx` — Helper route
- `GameTimer`, `ErrorBanner`, `CodePanel`, `ManualPanel`

**Rule:** No validation, no `correct_answer` checks, no state transition logic.

---

### 2. Action Layer

**Location:** `app/api/game/`

**Responsible for:**
- receiving user actions (submit answer, start game)
- calling game engine functions
- returning role-filtered, sanitized responses
- managing game session state

**Examples:**
- `POST /api/game` — start session, pick random challenge
- `GET /api/game` — get current state (filtered by role)
- `POST /api/game/answer` — Coder submits diagnosis

**Rules:**
- Validation always runs here (server-side)
- Never expose `correct_answer` or full `ChallengeStep` to client
- Coder and Helper endpoints return different view shapes

---

### 3. Game Logic Layer

**Location:** `src/features/game/`

**Responsible for:**
- challenge progression (step advance, level complete)
- answer validation (`resolveStep`)
- penalty application (`PENALTY_SECONDS = 10`)
- timer state transitions (`tickTimer`)
- role-based view filtering (`getStepView`)

This is the **core of the game** — pure TypeScript, no React dependencies.

**Key functions:**
```ts
startGame(challenge) → GameState
resolveStep(step, answerIndex) → StepResult
submitAnswer(state, challenge, answerIndex) → GameState
tickTimer(state) → GameState
getStepView(step, role) → CoderStepView | HelperStepView
```

---

### 4. Data Layer

**Location:** `src/data/challenges/`

**Responsible for:**
- challenge definitions (JSON)
- static content for MVP

**MVP:** Static JSON files with multi-step Laravel/PHP/SQL scenarios.

**Future:** `challenges` table in DB with `steps` as JSON column.

---

## Request Flow

```
Coder clicks option
  → UI calls POST /api/game/answer
    → Action layer loads session + challenge
      → game-engine.resolveStep(step, answerIndex)
        → correct: apply patch, advance step (or victory)
        → wrong: penalty -10s, return failure message
    → Action layer returns sanitized result
  → UI shows feedback (sound, animation, updated code)
```

---

## Key Rules

1. **Game logic must be independent from UI** — testable without React
2. **Cooperation is mandatory** — Coder sees symptoms, Helper sees theory; neither solves alone
3. **Server-side validation** — client never knows the correct answer index
4. **One problem, dynamic evolution** — steps chain via `code_patch`, not isolated questions
5. **Pure engine functions** — deterministic input → output, no side effects

---

## Role Architecture

| Concern | Coder | Helper |
|---------|-------|--------|
| Route | `/coder` | `/helper` |
| Sees | code, error, options | rules, knowledge, story |
| Submits answers | Yes | No |
| Data shape | `CoderStepView` | `HelperStepView` |

Both share: timer, boss messages, step progress, game status.

---

## Client vs Server

| Concern | Server | Client (`'use client'`) |
|---------|--------|-------------------------|
| Answer validation | ✅ | ❌ |
| Challenge loading | ✅ | ❌ |
| Role filtering | ✅ | ❌ |
| Timer countdown | state from server | interval hook for tick |
| Sounds / animations | ❌ | ✅ |
| Option button clicks | triggers API call | ✅ |

---

## MVP Scope

Included:
- Static JSON challenges
- Coder + Helper screens
- Timer with penalties
- Boss pressure messages
- Multi-step chained bugs

Deferred:
- Database persistence
- WebSocket real-time sync between devices
- Hint token system
- Scoring / leaderboard

---

## Goal

Keep logic reusable, testable, and independent from UI — so the game engine can be unit-tested without rendering a single component.

---

## Related Skills

- `folder-structure` — directory layout
- `coding-standards` — naming and conventions
- `game-mechanics` — loop, validation, timer
- `game-roles` — asymmetric views
- `game-challenges` — data schema