# Design — Game Engine Test Suite

## Overview

Instalar Vitest y escribir tests de tabla sobre las funciones puras del juego. **Cero cambios al código de producción.** El enfoque es maximizar cobertura de la lógica crítica con el mínimo andamiaje, aprovechando que las funciones no tienen I/O.

## Decisiones de arquitectura

### Por qué Vitest (no Jest)

- ESM nativo y TypeScript sin transpilación extra — el proyecto es TS estricto + ESM.
- Resuelve el alias `@/*` vía `vite-tsconfig-paths` o `resolve.alias`, alineado con `tsconfig.json`.
- API compatible con Jest (`describe`/`it`/`expect`), curva de aprendizaje nula.
- Rápido — importa para iterar en una hackathon.

### Ubicación de los tests

Co-localizados junto al código que verifican (convención de `structure.md`):

```
src/features/game/
  game-engine.ts
  game-engine.test.ts            ← nuevo
  client-question-engine.ts
  client-question-engine.test.ts ← nuevo
```

### Estilo: tests de tabla

Cada función se prueba con un array de casos `{ name, input, expected }` iterado con `it.each` (o `describe` + `it` por rama cuando el assert es estructural). Sin mocks: las funciones son puras.

## Configuración

### `vitest.config.ts` (raíz)

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',          // lógica pura, no necesita jsdom
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/features/game/game-engine.ts', 'src/features/game/client-question-engine.ts'],
    },
  },
});
```

> Nota de versión: verificar la API de `defineConfig`/coverage contra la versión de Vitest que `npm install` resuelva. Next 16 trae Vite/SWC moderno; no asumir flags de versiones viejas.

### `package.json` — scripts

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

### devDependencies a agregar

`vitest`, `@vitest/coverage-v8`, `vite-tsconfig-paths`.

## Estrategia de fixtures

Las funciones operan sobre `GameSession`, `ChallengeStep`, `ClientQuestion`. Para evitar duplicar mocks entre specs, un helper tipado:

```ts
// src/features/game/testing/fixtures.ts
import type { GameSession, ChallengeStep, ClientQuestion } from '../game-types';

export function makeSession(overrides: Partial<GameSession> = {}): GameSession { /* defaults sanos */ }
export function makeStep(overrides: Partial<ChallengeStep> = {}): ChallengeStep { /* ... */ }
export function makeClientQuestion(overrides: Partial<ClientQuestion> = {}): ClientQuestion { /* ... */ }
```

Tipadas con `Partial<T>` — **sin `any`, sin `as`** (salvo `as const`). Los defaults representan una sesión `playing` válida en el paso 1.

## Mapa función → requisito

| Función | Archivo | Requisito |
|---------|---------|-----------|
| `resolveMultipleChoice` | game-engine.test.ts | R2 |
| `resolveStep` | game-engine.test.ts | R3 |
| `applyTimeDelta` | game-engine.test.ts | R4 |
| `submitAnswer` | game-engine.test.ts | R5 |
| `tickTimer` | game-engine.test.ts | R6 |
| `clearLastResult`, `isTerminalStatus` | game-engine.test.ts | R7 |
| `submitClientQuestionAnswer` | client-question-engine.test.ts | R8 |

## Casos borde explícitos (lo que NO se debe olvidar)

- `applyTimeDelta`: delta que cruza exactamente 0; status `victory` con tiempo 0 (NO debe pasar a `defeat`).
- `submitAnswer`: el `>= ` de `isLastStep` — probar el penúltimo paso (avanza) vs el último (victory). Verificar que `currentStep` no se pasa del total.
- `submitAnswer` con status `victory`/`defeat`: retorna sin cambios (inmutabilidad).
- `submitClientQuestionAnswer`: las dos guardas (`status !== 'playing'` y `activeQuestionId !== question.id`) NO deben mutar el tiempo.

## Riesgos y mitigaciones

- **Riesgo:** la API de config de Vitest difiere de versiones previas. **Mitigación:** leer la doc de la versión instalada antes de escribir `vitest.config.ts`; no copiar config de memoria.
- **Riesgo:** un test revela un bug real (ej: el penalty hardcodeado). **Mitigación:** documentarlo como hallazgo, NO arreglar producción en esta spec — el fix va aparte. Esta spec solo instala la red.

## Out of scope

Tests de los route handlers (`app/api/game/*`), de componentes React, y de las funciones impuras de spawn. Se tratan en specs posteriores.
