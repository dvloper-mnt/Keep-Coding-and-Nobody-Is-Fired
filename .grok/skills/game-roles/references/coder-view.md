# Coder View

## Screen Purpose

Simulate the developer at the keyboard during a live production demo. The Coder sees **what breaks** but not **why** at a theoretical level.

---

## Data Exposed

From current step:

```ts
interface CoderStepView {
  code: string;           // step.coder_view.code
  error: string;          // step.coder_view.error
  options: string[];      // step.options (4 choices)
}
```

Plus global state:
- `remainingTime`
- `currentStep` / total steps
- Boss messages
- `lastResult` for feedback animations

---

## UI Components

| Component | Content |
|-----------|---------|
| `CodePanel` | Syntax-highlighted PHP/Laravel code (read-only) |
| `ErrorBanner` | Runtime error in red monospace |
| `DiagnosisOptions` | 4 clickable buttons |
| `GameTimer` | Countdown with urgency styling |
| `BossOverlay` | Rotating pressure messages |
| `FeedbackOverlay` | Shake on wrong, glow on correct |

---

## Code Display Rules

- Show code exactly as stored in `coder_view.code`
- After correct answer, animate transition to `code_patch`
- Use monospace font, dark terminal aesthetic
- Preserve line breaks (`\n` in JSON)

Example display:

```php
Route::post('/login', [LoginController::class, 'index']);
```

Error below:

```
ERROR: Method index does not exist
```

---

## Diagnosis Options

- Always exactly 4 options
- Rendered as full-width buttons or cards
- Disabled during feedback animation
- Only one selection per step attempt
- Wrong selection → penalty, options remain for retry

---

## What Coder Must Infer

The Coder cannot deduce the answer from code alone. They need Helper input for:

- Which methods exist on a controller
- Laravel import conventions
- PHP syntax rules
- SQL query patterns

Design options so that **symptoms alone are ambiguous** — at least 2 options should seem plausible without Helper knowledge.