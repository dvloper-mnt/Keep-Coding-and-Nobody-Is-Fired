# Requirements — Adaptive Difficulty (escalado por niveles en modo infinito)

## Introduction

Hoy la dificultad del challenge es **fija**: el `SYSTEM_PROMPT` de Bedrock pide `"difficulty": "medium"` para toda partida y el tipo `Difficulty` solo admite `'easy' | 'medium' | 'hard'`. No importa cuántas rondas lleve el jugador, el incidente que genera la IA tiene siempre el mismo nivel de exigencia.

Esta spec hace que la IA (Bedrock) **escale la dificultad a medida que el jugador avanza en el modo infinito** (ver spec hermana **endless-mode**, que aporta el concepto de "ronda"). El escalado es **por niveles discretos** según el número de ronda:

- ronda 1-3 → `'easy'`
- ronda 4-7 → `'medium'`
- ronda 8-12 → `'hard'`
- ronda 13+ → `'expert'`

El nivel resultante se **inyecta en el prompt** de Bedrock (en `runtime-generator.ts`, en `generateChallenge` y `generateChallengeStreaming`) de forma análoga a como hoy se inyecta el lenguaje (`languageInstruction`), pidiéndole bugs **más sutiles y más encadenados** a mayor dificultad. El campo `difficulty` ya existe en el tipo `Challenge`, pero hoy solo admite tres niveles: esta spec **agrega `'expert'`** al tipo `Difficulty` y al validador `challenge-schema`.

**Decisión de arquitectura clave:** el mapeo ronda → dificultad es **lógica pura y determinista** (`roundToDifficulty(round): Difficulty`), testeable sin tocar Bedrock. La dificultad es una **instrucción adicional en el prompt**, no un cambio en el contrato de datos: el resultado sigue siendo un `Challenge` validado por `isValidChallenge`, y si Bedrock falla se cae al **mismo fallback curado** que ya existe.

**Relato de hackathon:** el modo infinito deja de ser repetitivo. Las primeras rondas enganchan a cualquiera; a partir de la ronda 8 la IA aprieta de verdad, con bugs sutiles y encadenados que separan a los buenos de los cracks. El jurado ve que la IA de AWS Bedrock **adapta el desafío al rendimiento**, no que repite lo mismo en bucle.

### Contexto verificado

- `src/features/game/game-types.ts`: `type Difficulty = 'easy' | 'medium' | 'hard'` — falta `'expert'`.
- `src/features/game/challenge-schema.ts`: `VALID_DIFFICULTIES = ['easy', 'medium', 'hard'] as const` — `isValidChallenge` rechazaría un challenge con `difficulty: 'expert'`. Hay que sumar `'expert'`.
- `src/features/game/runtime-generator.ts`: el `SYSTEM_PROMPT` (reescrito en inglés con técnica few-shot en el PR #42) tiene `"difficulty": "medium"` hardcodeado en el bloque OUTPUT FORMAT y la regla `EXACTLY 3 chained steps`. `generateChallenge(language)` y `generateChallengeStreaming(language, onDelta)` arman el mensaje de usuario con `` `Genera un desafío nuevo. ${languageInstruction(resolved)} Devuelve solo el JSON del objeto challenge.` ``. La dificultad se inyecta de forma análoga, con una `difficultyInstruction(difficulty)` que se concatena al mensaje de usuario (NO se reescribe el SYSTEM_PROMPT).
- `src/features/game/challenge-language.ts` es el patrón a calcar: `SELECTABLE_LANGUAGES`, `resolveLanguage`, `languageInstruction` — funciones puras, sin estado, fáciles de testear. `languageInstruction` ya advierte que el contenido del juego va en español y el código en el lenguaje pedido; `difficultyInstruction` sigue la misma forma.
- IMPORTANTE (post-PR #49): `isValidChallenge` ahora exige rules/knowledge NO vacíos y sin placeholders. La instrucción de dificultad NO debe inducir al modelo a dejar campos vacíos en niveles altos.
- El número de ronda es aportado por la spec hermana **endless-mode** (esta spec NO define cómo se cuenta ni se persiste la ronda; solo la consume).

## Glossary

- **Ronda**: el contador de desafíos resueltos consecutivamente en el modo infinito. Lo define y persiste la spec **endless-mode**; esta spec lo consume como un `number` (1-based).
- **Nivel de dificultad**: uno de `'easy' | 'medium' | 'hard' | 'expert'`. Es el valor de `Challenge.difficulty`.
- **`roundToDifficulty`**: función pura que mapea un número de ronda al nivel de dificultad según los rangos discretos definidos arriba.
- **`difficultyInstruction`**: función pura que traduce un nivel de dificultad a una instrucción en español para el prompt de Bedrock (qué tan sutiles y encadenados deben ser los bugs).
- **Fallback**: el challenge curado (`pickRandomChallenge`), igual que hoy.

---

## Requirement 1 — Mapeo ronda → dificultad (lógica pura)

**User Story:** Como mantenedor, quiero una función pura y determinista que traduzca el número de ronda al nivel de dificultad, para poder testear el escalado sin depender de Bedrock.

### Acceptance Criteria

1. THE SYSTEM SHALL exponer una función pura `roundToDifficulty(round: number): Difficulty` sin estado ni efectos secundarios.
2. WHEN la ronda está entre 1 y 3 (inclusive) THE SYSTEM SHALL devolver `'easy'`.
3. WHEN la ronda está entre 4 y 7 (inclusive) THE SYSTEM SHALL devolver `'medium'`.
4. WHEN la ronda está entre 8 y 12 (inclusive) THE SYSTEM SHALL devolver `'hard'`.
5. WHEN la ronda es 13 o mayor THE SYSTEM SHALL devolver `'expert'`.
6. WHEN la ronda es menor que 1 o no es un entero válido THE SYSTEM SHALL tratarla como ronda 1 (devolver `'easy'`), para nunca generar un nivel indefinido.

## Requirement 2 — El nivel `'expert'` existe en el tipo y el validador

**User Story:** Como mantenedor, quiero que `'expert'` sea un nivel de dificultad de primera clase, para que un challenge experto no sea rechazado por la validación.

### Acceptance Criteria

1. THE SYSTEM SHALL ampliar `type Difficulty` a `'easy' | 'medium' | 'hard' | 'expert'` en `game-types.ts`.
2. THE SYSTEM SHALL incluir `'expert'` en `VALID_DIFFICULTIES` de `challenge-schema.ts`, de modo que `isValidChallenge` acepte `difficulty: 'expert'`.
3. THE SYSTEM SHALL mantener `'easy' | 'medium' | 'hard'` como niveles válidos, sin romper challenges existentes ni el catálogo curado.

## Requirement 3 — Inyección de la dificultad en el prompt de Bedrock

**User Story:** Como equipo, quiero que la IA reciba el nivel de dificultad pedido para esa ronda, para que genere bugs más sutiles y más encadenados a mayor nivel.

### Acceptance Criteria

1. THE SYSTEM SHALL exponer una función pura `difficultyInstruction(difficulty: Difficulty): string` que devuelva una instrucción en español describiendo el nivel pedido (qué tan sutiles y encadenados deben ser los bugs), análoga a `languageInstruction`.
2. THE SYSTEM SHALL aceptar un parámetro de dificultad en `generateChallenge` y `generateChallengeStreaming` e inyectar `difficultyInstruction(difficulty)` en el mensaje de usuario, junto a `languageInstruction(resolved)`.
3. THE SYSTEM SHALL pedir explícitamente en el prompt que el campo `"difficulty"` del JSON devuelto coincida con el nivel solicitado, en vez del `"medium"` hardcodeado en el ejemplo del `SYSTEM_PROMPT` (hoy en la línea `"difficulty": "medium"` del bloque OUTPUT FORMAT).
4. WHEN no se provee dificultad THE SYSTEM SHALL usar `'easy'` por defecto, de modo que cualquier llamador previo (sin modo infinito) siga funcionando con el nivel más bajo.
5. THE SYSTEM SHALL mantener la estructura de **EXACTAMENTE 3 steps** en todos los niveles, incluido `'expert'`. "Bugs más encadenados/sutiles" en dificultad alta significa bugs más difíciles de diagnosticar DENTRO de los 3 steps (causas menos obvias, distractores más creíbles), NO más de 3 steps — la UI, la validación (`isValidChallenge`) y el contrato del `Challenge` esperan 3 steps y NO cambian.

## Requirement 4 — La ronda activa determina la dificultad de la generación

**User Story:** Como jugador del modo infinito, quiero que cada nuevo incidente sea acorde a mi ronda actual, para que el juego escale conmigo y no repita siempre el mismo nivel.

### Acceptance Criteria

1. WHEN se genera el challenge de una ronda THE SYSTEM SHALL derivar el nivel con `roundToDifficulty(round)` y pasarlo a la generación de Bedrock.
2. THE SYSTEM SHALL obtener el número de ronda del estado de sesión que aporta la spec **endless-mode**, sin definir aquí cómo se cuenta ni se persiste.
3. WHEN el modo infinito no está activo (partida normal de ronda única) THE SYSTEM SHALL comportarse como ronda 1 (`'easy'`), preservando el flujo actual.

## Requirement 5 — Fallback robusto (sin regresión)

**User Story:** Como presentador en la hackathon, quiero que el juego nunca se quede sin challenge aunque pida un nivel experto, porque una falla de Bedrock no puede romper la demo.

### Acceptance Criteria

1. WHEN la generación con dificultad falla (error de red, abort/timeout, throttling, JSON inválido, validación fallida) THE SYSTEM SHALL caer al challenge curado (`pickRandomChallenge`), igual que hoy.
2. THE SYSTEM SHALL registrar el motivo del fallback con `console.error('[bedrock] ...')`, consistente con el logging actual.
3. THE SYSTEM SHALL garantizar que toda ronda termina con un challenge jugable, generado (a cualquier nivel) o curado.

## Requirement 6 — Calidad y consistencia

**User Story:** Como mantenedor, quiero que el cambio respete las reglas del proyecto.

### Acceptance Criteria

1. THE SYSTEM SHALL mantener cero `any` y sin `as` casts (salvo `as const`/`satisfies`).
2. THE SYSTEM SHALL cubrir con tests unitarios la lógica nueva pura (`roundToDifficulty` en todos los rangos y bordes, `difficultyInstruction` por nivel), sin llamar a Bedrock real.
3. THE SYSTEM SHALL mantener verdes lint, tsc y la suite de tests existente.

## Out of scope

- Cómo se cuenta, incrementa o persiste la ronda del modo infinito (lo aporta la spec **endless-mode**).
- El reloj / `time_limit`, el puntaje y el leaderboard (son de specs hermanas).
- Cambiar el modelo de Bedrock o el mecanismo de streaming (se reutiliza el de la spec **bedrock-streaming**).
- Escalado continuo o por curva (esta spec usa niveles discretos por rango de ronda, decisión ya tomada).
- Ajustar la dificultad de las client-questions (esta spec es solo para el challenge de la ronda).
