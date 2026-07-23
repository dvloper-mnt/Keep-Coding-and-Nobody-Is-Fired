# Keep Coding and Nobody Is Fired

Cooperative debugging game built for hackathon demos. Two developers must fix production bugs under time pressure during a live client presentation — neither player can win alone.

Also known internally as **Debug Simulator — Bomb Code: Production Failure**.

---

## What is this?

A two-player web game that simulates a production crisis. One player is the **Coder** (at the keyboard) and the other is the **Helper** (with the debugging manual). Together they diagnose and fix chained bugs before the timer runs out. Challenges span eight languages (PHP/Laravel, SQL, TypeScript, JavaScript, Python, Go, Java, Ruby) and are generated at runtime by AWS Bedrock, with a curated JSON catalog as fallback.

The Coder sees runtime symptoms: broken code, error messages, and multiple-choice diagnoses. The Helper sees a static guide with rules and domain knowledge for the entire challenge. The solution emerges from **verbal coordination**, not from a single screen with all the answers.

---

## Objective

Fix all steps of a multi-stage bug chain within the time limit (default: 180 seconds).

- **Win:** complete every step before the timer hits zero.
- **Lose:** timer reaches zero before the last step is resolved.

Wrong answers cost **10 seconds** from the global timer. Boss pressure messages rotate during play to keep tension high.

---

## How it works

### Roles

| Role | Route | Sees | Does |
|------|-------|------|------|
| **Coder** | `/coder` | Code, error, 4 diagnosis options, timer | Selects answers, drives the timer |
| **Helper** | `/helper` | Full static debugging guide (all exercises), timer, progress | Guides the Coder verbally — cannot submit answers |

### Game flow

1. Coder opens `/coder` → server creates a session and assigns a random challenge.
2. Coder shares the **room code** (e.g. `X7K2`) with the Helper.
3. Helper opens `/helper`, enters the room code, and receives the **complete guide** for that challenge.
4. They talk: Helper asks what error appears; Coder reports it; Helper finds the matching section in the manual.
5. Coder picks a diagnosis → server validates server-side.
6. **Correct:** code updates, next step loads (or victory screen).
7. **Wrong:** −10s penalty, feedback message, retry on the same step.
8. On victory or defeat, both players get a **Volver al inicio** button.

### Helper guide model

The Helper receives **all hints for all exercises at once** when joining a session. The guide does not change per step — the Helper must search the manual to find which section applies to the error the Coder reports right now.

### Session sync

- Sessions are persisted in **AWS ElastiCache (Redis)** via the `ioredis` client.
  - When `REDIS_HOST` is configured, sessions are stored in Redis with a 1-hour TTL (`REDIS_PORT` defaults to `6379`).
  - Falls back to an in-memory Map for local dev only. **In production a missing `REDIS_HOST` fails fast** — degrading to memory would break Coder/Helper sync across ECS tasks.
- **History of the bug (fixed)**: sessions once lived only in a module-level `Map`. On serverless that meant different invocations had separate memory, producing intermittent **"Sesión no encontrada"** (404) on follow-up requests. The fix was durable shared storage (Redis); the production fail-fast guard prevents the bug from ever silently returning.
- Coder polls the timer every second via `POST /api/game/tick`.
- Helper syncs status every second via `GET /api/game/sync`.
- Both share the same `sessionId` and `challengeId`.

---

## Why this design?

### Cooperation is mandatory

The golden rule: **no single player can solve everything alone.**

- The Coder sees symptoms but not domain rules (e.g. which methods exist on a controller, which folder a class belongs to).
- The Helper sees theory but not the live error message or diagnosis options.
- Ambiguous errors (`500 Internal Server Error`) force conversation; specific errors only become solvable when the code block is dense enough that the Helper's context is required.

### One problem, dynamic evolution

Each challenge is not a quiz of isolated questions. It is **one incident** that evolves: each fix reveals the next bug. Steps chain through `code_patch` → next `coder_view`.

### JSON over database (MVP)

Challenges are static JSON files. For a hackathon demo with few levels, this avoids ORM setup, migrations, and deployment config. The game engine loads challenges through a single service — swapping to a database later only changes the data source.

### Server-side validation

`correct_answer` never leaves the server. The client sends only an `answerIndex`. This keeps the game fair and allows role-filtered API responses.

---

## Architecture

Layered, feature-based structure optimized for fast iteration and testable game logic.

```
┌─────────────────────────────────────────────────────────┐
│  UI Layer          app/, src/components/                │
│  CoderScreen, HelperScreen, GameTimer, ManualPanel      │
└─────────────────────┬───────────────────────────────────┘
                      │ fetch
┌─────────────────────▼───────────────────────────────────┐
│  Action Layer      app/api/game/*                         │
│  start, state, guide, sync, answer, tick                  │
└─────────────────────┬───────────────────────────────────┘
                      │ calls
┌─────────────────────▼───────────────────────────────────┐
│  Game Logic        src/features/game/                   │
│  game-engine.ts (pure), game-service.ts (sessions)      │
└─────────────────────┬───────────────────────────────────┘
                      │ reads
┌─────────────────────▼───────────────────────────────────┐
│  Data Layer        src/data/challenges/*.json           │
└─────────────────────────────────────────────────────────┘
```

### Request flow (answer submission)

```
Coder selects option
  → POST /api/game/answer { sessionId, answerIndex }
    → game-service loads session + challenge
      → game-engine.resolveStep(step, answerIndex)
        → correct: advance step or victory
        → wrong: penalty −10s
    → sanitized response (no correct_answer)
  → UI feedback + updated Coder view
```

### Key engine functions

| Function | Responsibility |
|----------|----------------|
| `resolveStep` | Validate answer index against step |
| `submitAnswer` | Apply result, advance step or penalty |
| `tickTimer` | Decrement global timer |
| `getCoderStepView` | Role-filtered Coder payload |
| `buildHelperGuide` | Aggregate all `helper_view` sections into static guide |

---

## Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| [Next.js](https://nextjs.org/) | 16.2 | App Router, API routes, SSR |
| [React](https://react.dev/) | 19.2 | UI components |
| [TypeScript](https://www.typescriptlang.org/) | 5.x | Types, strict mode |
| [Tailwind CSS](https://tailwindcss.com/) | 4.x | Styling |
| [ESLint](https://eslint.org/) | 9.x | Linting (eslint-config-next) |

Sessions use AWS ElastiCache (Redis) via `ioredis` when configured. Challenges are static JSON, optionally regenerated with AWS Bedrock at runtime.

---

## Setup

### Prerequisites

- Node.js 22+ (see `.nvmrc`)
- pnpm 9 (`corepack enable` picks up the pinned `pnpm@9.15.0`)

### Install and run

```bash
# Clone the repository
git clone <repo-url>
cd hackathon

# Install dependencies
pnpm install

# Development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Other scripts

```bash
pnpm build          # Production build
pnpm start          # Start production server
pnpm lint           # Run ESLint
pnpm test           # Run the Vitest suite
pnpm test:coverage  # Coverage report
```

### How to play locally

1. Open two browser tabs (or two devices on the same network).
2. Tab 1 → **Soy Coder** → note the room code.
3. Tab 2 → **Soy Helper** → enter the room code.
4. Communicate out loud and fix the bugs before time runs out.

---

## Project structure

```
app/
  page.tsx                 # Landing — role selection
  coder/page.tsx           # Coder screen
  helper/page.tsx          # Helper screen
  api/game/
    start/route.ts         # POST — create session
    state/route.ts         # GET — Coder view
    guide/route.ts         # GET — Helper static guide
    sync/route.ts          # GET — Helper timer/progress
    answer/route.ts        # POST — submit diagnosis
    tick/route.ts          # POST — timer decrement

src/
  features/game/
    game-engine.ts         # Pure game logic
    game-service.ts        # Sessions, challenge loading
    game-types.ts          # TypeScript interfaces
  components/              # UI components
  data/challenges/         # Challenge JSON files
  lib/constants.ts         # PENALTY_SECONDS, BOSS_MESSAGES

.grok/skills/              # Agent skills (architecture, game rules)
```

Import alias: `@/*` maps to the project root (`tsconfig.json`).

---

## API reference

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| `POST` | `/api/game/start` | Coder | Create session, returns `sessionId` + `coderToken`. The room starts `idle`; the first view arrives via the first `state` poll |
| `GET` | `/api/game/state?sessionId=` | Coder | Current step view (code, error, options) |
| `GET` | `/api/game/guide?sessionId=` | Helper | Full static guide for the session challenge |
| `GET` | `/api/game/sync?sessionId=` | Helper | Timer, step progress, game status |
| `POST` | `/api/game/answer` | Coder | Submit `{ sessionId, answerIndex, token }` |
| `POST` | `/api/game/tick` | Coder | Decrement timer by 1 second (token-authorized) |
| `POST` | `/api/game/abandon` | Both | Leave the room as the given role |
| `POST` | `/api/game/client-question` | Helper | Answer a client trivia question |
| `GET` | `/api/game/generate-stream?sessionId=` | Coder | SSE stream of the challenge being generated (decorative preview) |
| `GET` / `POST` | `/api/game/leaderboard` | Coder | GET top scores · POST registers a game-over score (server-derived) |

---

## Challenges

Challenges live in `src/data/challenges/` as JSON files (the curated fallback catalog). Each file defines a multi-step debugging scenario; at runtime, most challenges are generated by AWS Bedrock across the eight supported languages.

### Schema (simplified)

```json
{
  "id": "lvl_login_001",
  "title": "Login en caos",
  "difficulty": "medium",
  "story_context": "Live demo scenario description",
  "time_limit": 180,
  "steps": [
    {
      "step": 1,
      "coder_view": { "code": "...", "error": "..." },
      "helper_view": { "rules": [], "knowledge": [] },
      "options": ["...", "...", "...", "..."],
      "correct_answer": 0,
      "success_state": { "code_patch": "..." },
      "hint": "..."
    }
  ]
}
```

### Included challenge

- **Login en caos** (`login-chaos.json`) — 3-step auth route chain: wrong method → wrong namespace → syntax error.

### Adding a new challenge

1. Create `src/data/challenges/my-challenge.json` following the schema.
2. Register it in `src/data/challenges/index.ts`.
3. Validate with the cooperation checklist: Coder cannot solve alone, Helper cannot solve alone.

Reference files: `LEVEL_GUIDE.json`, `GAME_INFORMATION.md`.

---

## Game constants

| Constant | Value |
|----------|-------|
| Default time limit | 180s (per challenge) |
| Wrong answer penalty | −10s |
| Boss message rotation | every 15s |

Defined in `src/lib/constants.ts`.

---

## Agent skills

Development conventions and game rules are documented in `.grok/skills/`:

| Skill | Purpose |
|-------|---------|
| `architecture` | Layers, folder structure, coding standards |
| `game-mechanics` | Loop, validation, timer, feedback |
| `game-roles` | Coder/Helper asymmetry, cooperation rule |
| `game-challenges` | JSON schema, content authoring |

---

## Roadmap (post-MVP)

- Database-backed challenges
- WebSocket sync between devices
- Additional levels (SQL, Eloquent, middleware)
- Hint token system for Helper
- Leaderboard / scoring

Session persistence uses AWS ElastiCache (Redis) (see "Session sync" section).

---

## License

Private — hackathon project.