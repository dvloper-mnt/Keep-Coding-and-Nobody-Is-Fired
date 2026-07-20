# Cooperation Rule

## Core Principle

> Coder sees symptoms. Helper sees theory. Solution is born from conversation.

This is the **most important design rule** of the entire game.

---

## Why Asymmetry Matters

| If both see everything | Result |
|------------------------|--------|
| Both see code + manual | One player solves alone, other is useless |
| Both see options + answer | Becomes a solo quiz, not cooperative |
| Helper can submit answers | Coder becomes passive |

The game must **force** verbal coordination.

---

## Information Split

```
CODER                          HELPER
─────                          ──────
code (exact)                   rules (generic)
error (exact)                  knowledge (domain)
options (4 choices)            story context
timer                          timer
boss messages                  boss messages
```

Overlap is intentional only for:
- Timer (shared pressure)
- Boss messages (shared narrative)
- Step progress indicator

---

## Validation of Good Challenge Design

A step is well-designed when:

1. Coder cannot pick the right answer from code/error alone
2. Helper cannot pick the right answer without Coder's error report
3. At least 2 options sound plausible to the Coder
4. Helper's rules clearly point to ONE option once symptoms are known
5. The fix (`code_patch`) logically follows from the diagnosis

---

## Example: Login Step 1

**Coder sees:**
```php
Route::post('/login', [LoginController::class, 'index']);
// ERROR: Method index does not exist
```

**Coder alone might think:**
- "Method doesn't exist" ✓ (correct but needs confirmation)
- "Missing import" ✗ (plausible but wrong at this stage)
- "Database error" ✗ (plausible distractor)
- "Middleware issue" ✗ (plausible distractor)

**Helper sees:**
- "LoginController solo tiene métodos: login, logout"
- "Si el método no existe → revisar definición del controlador"

**Together:** Helper asks error → Coder reports "index does not exist" → Helper says "no tiene index, usa login" → Coder selects correct option.

---

## Implementation Enforcement

### Server-side
- API returns different payloads per role
- `correct_answer` never in any response
- Separate routes: `/api/game/coder` and `/api/game/helper`

### Client-side
- Separate pages: `/coder` and `/helper`
- No "switch role" toggle in MVP
- No shared debug panel showing both views

### Content-side
- Every challenge step must be tested: "Can Coder solve alone?" → must be NO
- Every challenge step must be tested: "Can Helper solve alone?" → must be NO