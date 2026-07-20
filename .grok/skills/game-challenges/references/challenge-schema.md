# Challenge Schema

## Full TypeScript Types

```ts
export type Difficulty = 'easy' | 'medium' | 'hard';
export type GameRole = 'coder' | 'helper';
export type GameStatus = 'idle' | 'playing' | 'victory' | 'defeat';

export interface Challenge {
  id: string;
  title: string;
  difficulty: Difficulty;
  story_context: string;
  time_limit: number;
  steps: ChallengeStep[];
}

export interface ChallengeStep {
  step: number;
  coder_view: CoderViewData;
  helper_view: HelperViewData;
  options: [string, string, string, string];
  correct_answer: number;
  success_state: SuccessState;
  hint?: string;
}

export interface CoderViewData {
  code: string;
  error: string;
}

export interface HelperViewData {
  rules: string[];
  knowledge: string[];
}

export interface SuccessState {
  code_patch: string;
}

export interface GameState {
  challengeId: string;
  currentStep: number;
  remainingTime: number;
  currentCode: string;
  status: GameStatus;
  lastResult?: 'correct' | 'incorrect';
}

export interface StepResult {
  success: boolean;
  patch?: string;
  penalty?: number;
  message?: string;
}

export interface CoderStepView {
  code: string;
  error: string;
  options: string[];
}

export interface HelperStepView {
  title: string;
  storyContext: string;
  rules: string[];
  knowledge: string[];
  currentStep: number;
  totalSteps: number;
}
```

---

## Reference Challenge: Login en Caos

```json
{
  "id": "lvl_login_001",
  "title": "Login en caos",
  "difficulty": "medium",
  "story_context": "Están presentando el sistema de autenticación a un cliente en vivo cuando ocurre un error en producción.",
  "time_limit": 180,
  "steps": [
    {
      "step": 1,
      "coder_view": {
        "code": "Route::post('/login', [LoginController::class, 'index']);",
        "error": "Method index does not exist"
      },
      "helper_view": {
        "rules": [
          "Si el método no existe en el controlador → puede causar error en runtime",
          "LoginController solo tiene métodos: login, logout"
        ],
        "knowledge": [
          "LoginController es responsable de autenticación",
          "Métodos válidos: login, logout"
        ]
      },
      "options": [
        "El método index no existe en LoginController",
        "El controlador no está importado",
        "Error en base de datos",
        "La ruta está mal definida"
      ],
      "correct_answer": 0,
      "success_state": {
        "code_patch": "Route::post('/login', [LoginController::class, 'login']);"
      },
      "hint": "Revisa si el método llamado realmente existe en el controlador"
    },
    {
      "step": 2,
      "coder_view": {
        "code": "Route::post('/login', [LoginController::class, 'login']);",
        "error": "Class 'LoginController' not found"
      },
      "helper_view": {
        "rules": [
          "Class not found → falta import del controlador",
          "En Laravel los controladores deben importarse con namespace completo"
        ],
        "knowledge": [
          "Controladores están en App\\Http\\Controllers"
        ]
      },
      "options": [
        "Falta importar LoginController",
        "El método login no existe",
        "Error de sintaxis",
        "La ruta está mal definida"
      ],
      "correct_answer": 0,
      "success_state": {
        "code_patch": "use App\\Http\\Controllers\\LoginController;\n\nRoute::post('/login', [LoginController::class, 'login']);"
      },
      "hint": "El problema no está en la ruta ni en el método"
    },
    {
      "step": 3,
      "coder_view": {
        "code": "use App\\Http\\Controllers\\LoginController;\n\nRoute::post('/login', [LoginController::class, 'login']);;",
        "error": "Parse error: syntax error, unexpected ';'"
      },
      "helper_view": {
        "rules": [
          "Errores de sintaxis en PHP suelen ser por caracteres extra o faltantes",
          "Revisar puntos y comas duplicados"
        ],
        "knowledge": [
          "PHP es sensible a errores de sintaxis mínimos"
        ]
      },
      "options": [
        "Falta importar el controlador",
        "Hay un error de sintaxis en el código",
        "El método login no existe",
        "Error en base de datos"
      ],
      "correct_answer": 1,
      "success_state": {
        "code_patch": "use App\\Http\\Controllers\\LoginController;\n\nRoute::post('/login', [LoginController::class, 'login']);"
      },
      "hint": "Revisa cuidadosamente el final de la línea"
    }
  ]
}
```

---

## Step Chaining Diagram

```
Step 1 code ──fix──► code_patch ──becomes──► Step 2 code ──fix──► ...
     ↓                                              ↓
  error A                                        error B
```

Each step's `coder_view.code` should reflect the state AFTER previous fixes, with a NEW error introduced.

---

## DB Schema (Future)

```sql
CREATE TABLE challenges (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  difficulty    TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  story_context TEXT NOT NULL,
  time_limit    INTEGER NOT NULL DEFAULT 180,
  steps         JSON NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
```