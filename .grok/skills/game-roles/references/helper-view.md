# Helper View

## Screen Purpose

Simulate the senior dev / documentation reader who knows **theory** but is not at the keyboard. The Helper guides the Coder through verbal communication.

---

## Data Exposed

From current step:

```ts
interface HelperStepView {
  rules: string[];        // step.helper_view.rules
  knowledge: string[];    // step.helper_view.knowledge
}
```

From challenge level:
- `title`
- `story_context`
- `difficulty`

Plus global state:
- `remainingTime` (synced)
- `currentStep` / total steps
- Boss messages

---

## UI Components

| Component | Content |
|-----------|---------|
| `StoryHeader` | Level title + story context |
| `ManualPanel` | Rules section (Laravel/PHP/SQL conventions) |
| `KnowledgePanel` | Domain-specific facts about the system |
| `GameTimer` | Synced countdown |
| `BossOverlay` | Same pressure messages as Coder |

---

## Manual Content Structure

Display as a debugging manual:

```
📖 MANUAL DE DEBUGGING

REGLAS:
• Si el método no existe en el controlador → error en runtime
• LoginController solo tiene métodos: login, logout

CONOCIMIENTO:
• LoginController es responsable de autenticación
• Métodos válidos: login, logout
```

---

## Information Boundaries

Helper does NOT receive:

| Hidden | Why |
|--------|-----|
| Full exact code | Would let Helper solve without asking Coder |
| Error message text | Coder must report it verbally |
| Diagnosis options | Only Coder selects answers |
| `correct_answer` | Game integrity |

Helper MAY receive (optional MVP+):
- Partial code context (e.g., "afecta LoginController")
- Generic error category (e.g., "error de importación")

---

## Helper's Job

1. Read rules and knowledge for current step
2. Ask Coder: "¿Qué error ves?"
3. Match Coder's reported error to manual rules
4. Guide Coder verbally toward correct diagnosis
5. Repeat for each new step/error

---

## Design Principle

The manual gives **theory**, not **answers**. Example:

- Rule: "Class not found → falta import del controlador"
- Helper still needs Coder to say "Class LoginController not found"
- Helper connects the symptom to the rule, Coder picks the matching option