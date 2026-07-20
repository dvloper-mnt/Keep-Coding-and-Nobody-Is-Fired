---
name: game-challenges
description: Define challenge data model, JSON schema, TypeScript types, and content authoring rules for Keep Coding and Nobody Is Fired. Use when creating challenges, writing Laravel/PHP/SQL scenarios, seeding data, or defining game types.
---

# Game Challenges Skill

## Purpose

Define **what** a challenge contains and **how** to author valid multi-step debugging scenarios. Challenge data is content — game engine logic lives in `game-mechanics`.

---

## Content Domains

All challenge scenarios relate to:

- **Laravel** — routes, controllers, middleware, facades, Eloquent
- **PHP** — syntax, namespaces, imports, types
- **SQL** — queries, migrations, relationships, constraints

---

## Challenge Structure

A challenge is **one evolving problem** with chained steps. Each step introduces a new error after the previous fix.

```ts
interface Challenge {
  id: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  story_context: string;
  time_limit: number;        // seconds, default 180
  steps: ChallengeStep[];
}
```

---

## Step Structure

```ts
interface ChallengeStep {
  step: number;              // 1-based
  coder_view: {
    code: string;
    error: string;
  };
  helper_view: {
    rules: string[];
    knowledge: string[];
  };
  options: string[];         // exactly 4
  correct_answer: number;    // 0-3 index, SERVER ONLY
  success_state: {
    code_patch: string;
  };
  hint?: string;             // optional, for Helper
}
```

---

## Authoring Rules

1. **3-5 steps per challenge** (MVP: 3 is ideal)
2. **Exactly 4 options** per step
3. **Chained progression** — each `code_patch` becomes next step's `coder_view.code` (with new error introduced)
4. **Plausible distractors** — wrong options must sound reasonable
5. **Cooperation required** — verify with `game-roles` cooperation rule
6. **`correct_answer` is zero-based index** into `options` array

---

## Storage

### MVP (static JSON)
```
/src/data/challenges/
  login-chaos.json
  index.ts              // exports all challenges
```

### Production (DB)
```
Table: challenges
  id          TEXT PK
  title       TEXT
  difficulty  TEXT
  story_context TEXT
  time_limit  INTEGER
  steps       JSON
```

---

## Type Definitions Location

All types in `/src/features/game/game-types.ts`:

```ts
export type Difficulty = 'easy' | 'medium' | 'hard';
export type GameRole = 'coder' | 'helper';
export type GameStatus = 'idle' | 'playing' | 'victory' | 'defeat';

export interface Challenge { ... }
export interface ChallengeStep { ... }
export interface GameState { ... }
export interface StepResult { ... }
export interface CoderStepView { ... }
export interface HelperStepView { ... }
```

---

## Validation (Content)

Before adding a challenge, verify:

- [ ] Steps chain correctly (code_patch → next code)
- [ ] Each step has unique, realistic error
- [ ] 4 options, 1 clearly correct WITH Helper input
- [ ] Helper rules map to correct option
- [ ] Coder cannot solve without Helper
- [ ] Helper cannot solve without Coder's error report
- [ ] `correct_answer` index matches intended option

---

## References

Read before authoring content:

- references/challenge-schema.md
- references/game-state.md
- references/content-guidelines.md