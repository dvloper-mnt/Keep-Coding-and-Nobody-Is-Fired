# Content Guidelines

## Challenge Authoring for Laravel / PHP / SQL

Every challenge simulates a **real production debugging session**. Errors must feel authentic, not academic.

---

## Error Categories

### Laravel
| Error type | Example | Helper rule |
|------------|---------|-------------|
| Wrong method | `Method index does not exist` | Check controller method list |
| Missing import | `Class 'X' not found` | Controllers need `use` statement |
| Wrong namespace | `Target class does not exist` | Verify `App\Http\Controllers` |
| Route mismatch | `Route not defined` | Check route file and HTTP method |
| Middleware | `Unauthorized` | Check middleware stack |
| Eloquent | `Column not found` | Check migration vs model |

### PHP
| Error type | Example | Helper rule |
|------------|---------|-------------|
| Syntax | `unexpected ';'` | Check duplicate/missing semicolons |
| Type error | `must be of type X` | Check parameter types |
| Undefined variable | `Undefined variable $x` | Check variable scope |
| Parse error | `unexpected token` | Check brackets, quotes |

### SQL
| Error type | Example | Helper rule |
|------------|---------|-------------|
| Column missing | `Unknown column` | Check migration schema |
| FK constraint | `foreign key constraint fails` | Check relationship setup |
| Syntax | `SQL syntax error` | Check query structure |
| Duplicate entry | `Duplicate entry for key` | Check unique constraints |

---

## Step Design Pattern

Each challenge follows this narrative arc:

```
1. SYMPTOM     → obvious runtime error (Coder reports)
2. ROOT CAUSE  → requires Helper's domain knowledge
3. PARTIAL FIX → code_patch fixes symptom but reveals deeper issue
4. REPEAT      → new error, new diagnosis
5. RESOLUTION  → final step, system works
```

---

## Distractor Design

Each step needs **3 wrong options** that are plausible:

| Distractor type | Example |
|-----------------|---------|
| Wrong layer | "Error de base de datos" when it's a route issue |
| Previous step issue | "Falta importar" when import was already fixed |
| Adjacent concept | "Problema de middleware" for auth errors |

Avoid:
- Joke options
- Obviously wrong answers
- Options that duplicate each other

---

## Code Realism

- Use real Laravel syntax (`Route::post`, `[Controller::class, 'method']`)
- Use real PHP patterns (`use App\Http\Controllers\...`)
- Use real SQL (`SELECT`, `JOIN`, `WHERE`)
- Errors should match real Laravel/PHP error messages
- Code snippets should be 1-5 lines (not full files)

---

## Difficulty Scaling

| Level | Steps | Error subtlety | Domain mix |
|-------|-------|----------------|------------|
| easy | 2-3 | Obvious symptoms | Single domain (PHP syntax) |
| medium | 3 | Requires cross-referencing rules | Laravel + PHP |
| hard | 4-5 | Ambiguous symptoms | Laravel + PHP + SQL |

---

## Story Context

Every challenge needs `story_context` that sets the scene:

> "Están presentando el sistema de autenticación a un cliente en vivo cuando ocurre un error en producción."

Good story contexts:
- Mention the live demo pressure
- Reference a specific feature being presented
- Imply client is watching

---

## Checklist for New Challenge

```
[ ] id is unique and descriptive (e.g., lvl_login_001)
[ ] title is catchy and clear
[ ] story_context sets live-demo scene
[ ] 3+ chained steps
[ ] Each step: code → error → 4 options → patch
[ ] code_patch of step N = coder_view.code of step N+1 (with new error)
[ ] Helper rules point to correct answer given Coder's error report
[ ] Coder cannot solve alone
[ ] Helper cannot solve alone
[ ] Tested mentally as conversation flow
```

---

## Future Challenge Ideas

| ID | Title | Domain | Steps |
|----|-------|--------|-------|
| lvl_migration_001 | Migración rota | SQL + Laravel | 3 |
| lvl_api_001 | API 500 | Laravel routes | 3 |
| lvl_eloquent_001 | Query N+1 | Eloquent + SQL | 4 |
| lvl_middleware_001 | Auth bloqueado | Middleware | 3 |