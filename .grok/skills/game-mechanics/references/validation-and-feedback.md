# Validation and Feedback

## Answer Validation

Validation is the core engine function. It must be **deterministic and side-effect free**.

```ts
interface StepResult {
  success: boolean;
  patch?: string;
  penalty?: number;
  message?: string;
}

function resolveStep(step: ChallengeStep, answerIndex: number): StepResult {
  if (answerIndex === step.correct_answer) {
    return {
      success: true,
      patch: step.success_state.code_patch,
    };
  }

  return {
    success: false,
    penalty: 10,
    message: 'El sistema sigue fallando…',
  };
}
```

---

## Security Rules

- `correct_answer` index is NEVER sent to the client
- Server Action / API route performs validation
- Client sends only `answerIndex` (0-3)
- Helper cannot submit answers — only Coder can

---

## Feedback Events

Engine returns result → UI maps to sensory feedback:

| Event | Trigger | UI Response |
|-------|---------|-------------|
| `ANSWER_CORRECT` | `success: true` | Success sound, fix animation, code update |
| `ANSWER_WRONG` | `success: false` | Error sound, screen shake, penalty message |
| `STEP_ADVANCED` | correct + more steps | Transition animation to new error |
| `LEVEL_COMPLETE` | correct + last step | Victory screen |
| `TIME_UP` | timer = 0 | Defeat screen |

---

## Feedback Messages

### Wrong answer
- Primary: "El sistema sigue fallando…"
- Optional: show `step.hint` to Helper (not auto-revealed to Coder)

### Correct answer
- Primary: "Fix applied"
- Code block animates to new `code_patch`

### Level complete
- "Sistema funcionando"
- "Cliente sigue viendo la demo"
- "Nivel completado"

### Defeat
- "Se acabó el tiempo"
- "El jefe no está contento…"

---

## Helper Hints (Optional MVP+)

Helper can reveal `step.hint` manually:
- Consumes time (e.g., -5s) OR uses limited hint tokens
- Hint text comes from challenge data
- Coder does NOT see hint unless Helper communicates verbally

MVP: hints are verbal only (no token system required).

---

## Implementation Checklist

- [ ] `resolveStep` is pure function in `game-engine.ts`
- [ ] Server Action calls engine, returns sanitized result
- [ ] UI components react to `lastResult` state
- [ ] Sounds/animations are UI concerns, triggered by engine events
- [ ] Penalty always 10s (constant, not per-step configurable in MVP)