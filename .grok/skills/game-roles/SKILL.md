---
name: game-roles
description: Define Coder and Helper roles, asymmetric information, and cooperation rules for Keep Coding and Nobody Is Fired. Use when building coder/helper screens, filtering views by role, or enforcing that no single player can solve alone.
---

# Game Roles Skill

## Purpose

Enforce **information asymmetry** between two cooperative players. The game only works when Coder and Helper communicate — neither role has enough data to win alone.

---

## The Golden Rule

> **NUNCA un jugador debe poder resolver todo solo.**

| Role | Has | Needs from partner |
|------|-----|-------------------|
| Coder | Symptoms (code + runtime error) | Theory (rules, causes, Laravel/PHP knowledge) |
| Helper | Theory (manual, rules, hints) | Symptoms (exact error message, code context) |

Solution emerges from **conversation**, not from UI shortcuts.

---

## Coder Role

Route: `/coder`

### Sees
- Laravel/PHP code (current broken state)
- Runtime error message
- 4 diagnosis options (multiple choice)
- Bomb timer + visual/audio feedback
- Boss pressure messages

### Does NOT See
- Full internal system rules
- Deep debugging manual
- `helper_view.rules` or `helper_view.knowledge`
- `correct_answer` index
- `step.hint` (unless Helper tells them verbally)

### Actions
- Select diagnosis option (only role that submits answers)
- Observe code updates after successful fixes

---

## Helper Role

Route: `/helper`

### Sees
- Debugging manual (`helper_view.rules`)
- System knowledge (`helper_view.knowledge`)
- Possible causes (derived from rules, not exact code)
- Story context of the level
- Shared timer + boss messages

### Does NOT See
- Complete exact code (only partial context if needed for manual)
- Diagnosis options (Coder's choices)
- `correct_answer`
- Full `coder_view.code` — may see sanitized/partial version

### Actions
- Read manual and guide Coder verbally
- Optional: reveal hint (MVP+ feature)

---

## View Filtering

Engine must expose role-specific views:

```ts
function getStepView(step: ChallengeStep, role: 'coder' | 'helper') {
  if (role === 'coder') {
    return {
      code: step.coder_view.code,
      error: step.coder_view.error,
      options: step.options,
    };
  }

  return {
    rules: step.helper_view.rules,
    knowledge: step.helper_view.knowledge,
    storyContext: step.story_context, // from challenge level
  };
}
```

Never send the full `ChallengeStep` object to the client.

---

## Conversation Flow (Expected UX)

Typical player interaction per step:

1. **Helper**: "¿Qué error te aparece?"
2. **Coder**: "Dice Method index does not exist"
3. **Helper**: "LoginController no tiene index, solo login y logout"
4. **Coder**: Selects correct diagnosis option
5. New error appears → repeat

This loop is the **core experience**. UI must not bypass it with auto-hints or shared screens.

---

## Screen Layout Guidelines

### Coder Screen
- Code editor panel (read-only, monospace)
- Error banner (red, prominent)
- 4 option buttons
- Timer (top, always visible)
- Boss message overlay

### Helper Screen
- Manual panel (rules + knowledge)
- Story context header
- Timer (synced)
- Boss message overlay
- NO code editor, NO answer buttons

---

## Anti-Patterns (NEVER DO)

- Single screen with all information visible
- Helper submitting answers
- Coder seeing the debugging manual
- Auto-hints that reveal the answer without Helper involvement
- Showing `correct_answer` or highlighting the right option

---

## References

Read before building role screens:

- references/coder-view.md
- references/helper-view.md
- references/cooperation-rule.md