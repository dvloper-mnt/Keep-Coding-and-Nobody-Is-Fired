---
name: game-mechanics
description: Define and implement core game mechanics for Keep Coding and Nobody Is Fired (Debug Simulator). Use when building the game loop, answer validation, timer, penalties, feedback, boss pressure messages, or step progression.
---

# Game Mechanics Skill

## Purpose

Implement the **runtime behavior** of the cooperative debugging game. All logic lives in `/src/features/game` — never in UI components.

This skill covers HOW the game runs, not WHAT content each challenge contains (see `game-challenges`) or what each role sees (see `game-roles`).

---

## Game Concept

Two developers (Coder + Helper) fix production bugs under time pressure during a live client demo. Each level is a **multi-step crisis** with chained Laravel/PHP/SQL errors.

---

## Core Loop (MVP)

```
1. Load random challenge
2. Initialize state: step = 1, timer = challenge.time_limit
3. Render role-specific views (Coder / Helper)
4. Players communicate verbally
5. Coder selects a diagnosis option
6. Engine validates answer
   → correct: apply code_patch, advance step (or complete level)
   → incorrect: apply penalty, show failure feedback
7. Repeat until all steps done OR timer reaches 0
```

---

## Validation Rules

Answer validation is **index-based** against `step.correct_answer`.

```ts
// Correct answer
{ success: true, patch: step.success_state.code_patch, nextStep: currentStep + 1 }

// Wrong answer
{ success: false, penalty: 10, message: "El sistema sigue fallando…" }
```

Rules:
- Only the **Coder** submits answers
- Validation runs server-side (Server Action or API route)
- Never expose `correct_answer` to the client
- On success, the Coder view updates with `code_patch` before advancing

---

## Timer Rules

| Rule | Value |
|------|-------|
| Default per mission | 180s (overridable per challenge) |
| Wrong answer penalty | -10s |
| Timer scope | Global per level (not per step) |
| On timeout | Level fails — show defeat screen |

UI behavior (implemented in components, driven by engine state):
- Beep every second
- Sound accelerates at ≤30s remaining
- Progressive red overlay as time decreases

---

## Feedback System

### Wrong answer
- Error sound
- Screen shake (light)
- -10s timer penalty
- Message: "El sistema sigue fallando…"

### Correct answer
- Success sound
- "Fix applied" animation
- Code updates to `code_patch`
- Auto-advance to next step (or victory if last step)

---

## Boss Pressure (Story UI)

Display rotating boss messages during gameplay to increase tension:

- "¿QUÉ ESTÁ PASANDO EN PRODUCCIÓN?"
- "TENEMOS CLIENTES MIRANDO ESTO"
- "SI ESTO FALLA, HAY CONSECUENCIAS"
- "NO TENEMOS TIEMPO"

These are **cosmetic pressure** — they do not affect game logic.

---

## Level Completion

A level is complete when:
- All steps are resolved successfully
- Timer > 0

Victory state:
- System working message
- Client still watching demo
- Boss stops yelling
- Show completion screen

Defeat state (timer = 0):
- Show failure screen
- Option to retry

---

## Engine Responsibilities

`game-engine.ts` must handle:

| Function | Responsibility |
|----------|----------------|
| `startGame(challenge)` | Initialize game state |
| `resolveStep(step, answerIndex)` | Validate and return result |
| `applyPenalty(state, seconds)` | Subtract time, clamp to 0 |
| `advanceStep(state)` | Move to next step or mark complete |
| `getCurrentStepView(state, role)` | Return filtered view for role |

---

## Rules

- Game logic MUST be pure/testable — no React hooks in engine
- Timer countdown can live in a hook, but penalty logic stays in engine
- State transitions are explicit — no implicit side effects
- One challenge = one evolving problem, NOT isolated questions

---

## References

Read before implementing:

- references/game-loop.md
- references/validation-and-feedback.md
- references/timer-and-pressure.md

Also load `game-roles` and `game-challenges` skills when building features end-to-end.