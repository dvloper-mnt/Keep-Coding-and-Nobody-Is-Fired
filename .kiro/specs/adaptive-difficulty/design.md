# Design — Adaptive Difficulty (escalado por niveles en modo infinito)

## Overview

El cambio toca cuatro puntos, de adentro hacia afuera, y reutiliza el patrón exacto de `challenge-language.ts`:

1. **Tipo y validador** (`game-types.ts` + `challenge-schema.ts`): agregar `'expert'` al tipo `Difficulty` y a `VALID_DIFFICULTIES`. Sin esto, un challenge experto sería rechazado por `isValidChallenge`.
2. **Lógica pura nueva** (`challenge-difficulty.ts`, archivo nuevo análogo a `challenge-language.ts`): `roundToDifficulty(round)` y `difficultyInstruction(difficulty)` — funciones puras, deterministas, testeables sin Bedrock.
3. **Generador** (`runtime-generator.ts`): `generateChallenge` y `generateChallengeStreaming` aceptan un parámetro de dificultad e inyectan `difficultyInstruction(difficulty)` en el mensaje de usuario, junto al `languageInstruction(resolved)` que ya existe. El `SYSTEM_PROMPT` deja de hardcodear `"difficulty": "medium"`.
4. **Cableado de la ronda** (`game-service.ts` + `app/api/game/generate-stream/route.ts`): donde hoy se llama a `generateChallenge(language)` / `generateChallengeStreaming(language, onDelta)`, se deriva `roundToDifficulty(round)` del estado de sesión y se pasa.

El principio rector: **la dificultad es una instrucción de prompt derivada de forma pura de la ronda; el contrato de datos `Challenge` no cambia** (solo se amplía el conjunto de valores de un campo que ya existe).

## Dependencia: endless-mode

Esta spec **depende de endless-mode**, que aporta el concepto de **ronda** (el contador de desafíos resueltos consecutivamente y su persistencia en sesión). Esta spec NO define cómo se cuenta ni se persiste la ronda: la consume como un `number` (1-based) leído del estado de sesión. Si endless-mode aún no expone la ronda, el cableado del Requirement 4 usa ronda 1 por defecto (`'easy'`), preservando el flujo actual de partida única.

## Decisiones de arquitectura

### D1 — `'expert'` como nivel de primera clase

`type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'` en `game-types.ts`, y `VALID_DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const` en `challenge-schema.ts`. El cambio es aditivo: los tres niveles previos siguen válidos, así que ni el catálogo curado ni los challenges generados hoy se rompen.

### D2 — Lógica pura aislada (calca `challenge-language.ts`)

Archivo nuevo `src/features/game/challenge-difficulty.ts`, espejo de `challenge-language.ts`:

```ts
export function roundToDifficulty(round: number): Difficulty {
  // round < 1 o no-entero → tratar como ronda 1 (R1.6)
  // 1-3 → 'easy' · 4-7 → 'medium' · 8-12 → 'hard' · 13+ → 'expert'
}

export function difficultyInstruction(difficulty: Difficulty): string {
  // texto en español por nivel: a mayor nivel, bugs más sutiles y más encadenados
}
```

- `roundToDifficulty` es un mapeo de rangos discretos. Determinista, sin estado, sin `Math.random` — a diferencia de `resolveLanguage`, acá NO hay azar: la ronda manda.
- `difficultyInstruction` devuelve, por ejemplo, para `'easy'` un bug evidente y poco encadenado; para `'expert'` bugs sutiles, varios encadenados, distractores plausibles. El texto exacto se afina en implementación.
- Ambas son trivialmente testeables: tabla de entrada → salida esperada, incluidos los bordes (0, 1, 3, 4, 7, 8, 12, 13, números grandes, no-enteros).

### D3 — Inyección en el prompt (análoga a `languageInstruction`)

Hoy el mensaje de usuario es:

```ts
text: `Genera un desafío nuevo. ${languageInstruction(resolved)} Devuelve solo el JSON del objeto challenge.`
```

Pasa a:

```ts
text: `Genera un desafío nuevo. ${languageInstruction(resolved)} ${difficultyInstruction(difficulty)} Devuelve solo el JSON del objeto challenge.`
```

Y el `SYSTEM_PROMPT` deja de fijar `"difficulty": "medium"` en el ejemplo de forma: se le pide que el campo `"difficulty"` del JSON **coincida con el nivel solicitado** en el mensaje. El validador ya acepta los cuatro niveles (D1), así que el resultado pasa `isValidChallenge` sin tocar la forma del objeto.

Firmas resultantes (la dificultad va con default `'easy'` para no romper llamadores previos — R3.4):

```ts
generateChallenge(language?: ChallengeLanguage, difficulty?: Difficulty): Promise<Challenge | null>
generateChallengeStreaming(language: ChallengeLanguage, onDelta: (t: string) => void, difficulty?: Difficulty): Promise<Challenge | null>
```

### D4 — Cableado de la ronda

- En `app/api/game/generate-stream/route.ts`, donde hoy se llama `generateChallengeStreaming(session.language ?? 'random', onDelta)`, se deriva la dificultad de la ronda de la sesión: `roundToDifficulty(<ronda de endless-mode>)` y se pasa como tercer argumento.
- En `game-service.ts` (`ensureChallengeGenerated`), donde hoy se llama `generateChallenge(session.language ?? 'random')`, mismo tratamiento: derivar la dificultad de la ronda y pasarla.
- Mientras endless-mode no exponga la ronda, ambos puntos pasan ronda 1 → `'easy'`, idéntico al comportamiento actual (R4.3).

### D5 — Fallback sin regresión

La cadena de fallback es la misma de hoy, indiferente al nivel pedido:

```
generación a nivel N falla / texto inválido / no valida
        → pickRandomChallenge()  (curado, su propia difficulty)
        → promoteSessionWithChallenge(...)
```

Pedir `'expert'` no aumenta el riesgo de demo: si Bedrock falla, cae al curado igual que hoy. El nivel solo cambia el prompt, no la red de seguridad.

## Componentes afectados

| Archivo | Cambio |
|---|---|
| `src/features/game/game-types.ts` | `type Difficulty` += `'expert'` |
| `src/features/game/challenge-schema.ts` | `VALID_DIFFICULTIES` += `'expert'` |
| `src/features/game/challenge-difficulty.ts` | NUEVO — `roundToDifficulty`, `difficultyInstruction` |
| `src/features/game/runtime-generator.ts` | `generateChallenge` / `generateChallengeStreaming` aceptan `difficulty`; prompt inyecta `difficultyInstruction`; `SYSTEM_PROMPT` deja de fijar `"difficulty": "medium"` |
| `src/features/game/game-service.ts` | `ensureChallengeGenerated` deriva y pasa la dificultad de la ronda |
| `app/api/game/generate-stream/route.ts` | pasa la dificultad derivada de la ronda a `generateChallengeStreaming` |

## Testing

- **Unitario puro (sin Bedrock):** `challenge-difficulty.test.ts` con tabla exhaustiva para `roundToDifficulty` (todos los rangos y bordes: 0, 1, 3, 4, 7, 8, 12, 13, 100, no-enteros) y `difficultyInstruction` (los cuatro niveles devuelven texto no vacío y distinto por nivel).
- **Generador con dificultad (stream/no-stream mockeado):** verificar que el prompt enviado a Bedrock incluye el fragmento de `difficultyInstruction(difficulty)`; verificar que un challenge `difficulty: 'expert'` retornado pasa `isValidChallenge`; verificar que sin dificultad explícita se usa `'easy'`.
- **Sin regresión:** la suite existente (incluida la de `runtime-generator` y `challenge-schema`) sigue verde; el contrato `Challenge` no cambia de forma.
- tsc 0 errores, lint 0 warnings.

## Riesgos y mitigaciones

- **`'expert'` rechazado por validación:** mitigado por D1 — el tipo y `VALID_DIFFICULTIES` se amplían juntos; un test cubre que `isValidChallenge` acepta `'expert'`.
- **Llamadores previos rotos por la nueva firma:** mitigado por el default `'easy'` (R3.4) — `generateChallenge()` sin dificultad sigue compilando y comportándose como hoy.
- **endless-mode aún no integrado:** mitigado por D4 — ronda 1 por defecto = `'easy'` = comportamiento actual; el cableado real de la ronda se conecta cuando endless-mode lo exponga.
- **Bedrock ignora el nivel pedido:** posible que el modelo no module realmente la sutileza. No bloquea: la difficulty del JSON se valida igual; afinar el wording de `difficultyInstruction` es iterativo y barato (solo prompt).
