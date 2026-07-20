# Requirements — Game Engine Test Suite

## Introduction

El proyecto se presenta en una demo EN VIVO frente a un jurado y **no tiene ni un solo test**. Toda la lógica del juego (penalizaciones, bonus, transición de pasos, victoria/derrota, spawn de consultas del cliente) vive en funciones puras sin red de seguridad. Cualquier regresión introducida minutos antes de la demo se descubriría on-stage.

Esta spec agrega una suite de tests con **Vitest** sobre las funciones puras de `src/features/game/game-engine.ts` y `src/features/game/client-question-engine.ts`. Es la red de seguridad que se instala **antes** de tocar los fixes de los hallazgos critical/high de la auditoría — para que esos cambios posteriores se hagan con respaldo, no a ciegas.

Las funciones objetivo reciben estado y devuelven estado nuevo, sin I/O: son el caso ideal de testing de tabla, sin mocks.

## Glossary

- **Función pura**: recibe input, devuelve output, sin efectos secundarios ni I/O.
- **Test de tabla**: conjunto de casos `(input, output esperado)` ejecutados sobre la misma función.
- **Status terminal**: `victory` o `defeat` — estados desde los que el juego no debe mutar.

---

## Requirement 1 — Infraestructura de testing

**User Story:** Como desarrollador del equipo, quiero un runner de tests configurado, para poder ejecutar la suite con un solo comando y ver cobertura.

### Acceptance Criteria

1. WHEN se instala el proyecto THE SYSTEM SHALL incluir `vitest` y `@vitest/coverage-v8` en `devDependencies`.
2. WHEN se ejecuta `npm run test` THE SYSTEM SHALL correr todos los archivos `*.test.ts` y reportar el resultado.
3. WHEN se ejecuta `npm run test:coverage` THE SYSTEM SHALL generar un reporte de cobertura.
4. THE SYSTEM SHALL resolver el alias `@/*` en los tests igual que en el código de producción (consistente con `tsconfig.json`).
5. WHERE se agregue configuración de Vitest, THE SYSTEM SHALL mantener el modo `strict` de TypeScript y la regla ESLint `no-explicit-any` en `error` (cero `any` en los tests).

## Requirement 2 — `resolveMultipleChoice`

**User Story:** Como mantenedor, quiero verificar la validación base de respuestas, porque toda la mecánica del juego se apoya en ella.

### Acceptance Criteria

1. WHEN `answerIndex` es igual a `correctIndex` THE SYSTEM SHALL devolver `{ success: true }` sin `penalty` ni `message`.
2. WHEN `answerIndex` difiere de `correctIndex` THE SYSTEM SHALL devolver `success: false` con el `penalty` y el `message` por defecto.
3. WHEN se pasan `wrongPenalty` y `wrongMessage` explícitos en una respuesta incorrecta THE SYSTEM SHALL usar esos valores en lugar de los defaults.

## Requirement 3 — `resolveStep`

**User Story:** Como mantenedor, quiero que un paso resuelto correctamente devuelva el patch de código, para que el siguiente bug se cargue.

### Acceptance Criteria

1. WHEN la respuesta es correcta THE SYSTEM SHALL devolver `success: true` con el `patch` igual a `step.success_state.code_patch`.
2. WHEN la respuesta es incorrecta THE SYSTEM SHALL devolver el resultado de fallo sin `patch`.

## Requirement 4 — `applyTimeDelta`

**User Story:** Como mantenedor, quiero que el ajuste de tiempo nunca produzca tiempo negativo y dispare la derrota al llegar a cero.

### Acceptance Criteria

1. WHEN se aplica un delta positivo THE SYSTEM SHALL sumar al `remainingTime`.
2. WHEN se aplica un delta negativo que dejaría el tiempo bajo cero THE SYSTEM SHALL hacer clamp en `0` (nunca negativo).
3. WHEN el tiempo resultante es `<= 0` Y el status era `playing` THE SYSTEM SHALL cambiar el status a `defeat`.
4. WHEN el status NO era `playing` (ej: `victory`) Y el tiempo llega a `0` THE SYSTEM SHALL conservar el status original (no forzar `defeat`).

## Requirement 5 — `submitAnswer`

**User Story:** Como mantenedor, quiero que enviar una respuesta avance el juego correctamente y respete los estados terminales.

### Acceptance Criteria

1. WHEN el status NO es `playing` THE SYSTEM SHALL devolver la sesión sin cambios.
2. WHEN la respuesta es correcta Y NO es el último paso THE SYSTEM SHALL incrementar `currentStep`, aplicar el `code_patch` a `currentCode`, mantener status `playing` y marcar `lastResult: 'correct'`.
3. WHEN la respuesta es correcta Y ES el último paso THE SYSTEM SHALL cambiar el status a `victory`, NO incrementar `currentStep` más allá del último, y marcar `lastResult: 'correct'`.
4. WHEN la respuesta es incorrecta THE SYSTEM SHALL restar la penalización al tiempo (vía `applyTimeDelta`) y marcar `lastResult: 'incorrect'`, sin avanzar el paso.

## Requirement 6 — `tickTimer`

**User Story:** Como mantenedor, quiero que el decremento del timer respete los estados terminales y dispare la derrota.

### Acceptance Criteria

1. WHEN el status NO es `playing` THE SYSTEM SHALL devolver la sesión sin cambios (no decrementar).
2. WHEN el status es `playing` THE SYSTEM SHALL decrementar `remainingTime` en 1.
3. WHEN el decremento deja `remainingTime <= 0` THE SYSTEM SHALL cambiar el status a `defeat`.

## Requirement 7 — `clearLastResult` e `isTerminalStatus`

**User Story:** Como mantenedor, quiero verificar los helpers de estado para evitar regresiones sutiles.

### Acceptance Criteria

1. WHEN se llama `clearLastResult` sobre una sesión con `lastResult` THE SYSTEM SHALL devolver una sesión sin la propiedad `lastResult`.
2. WHEN se evalúa `isTerminalStatus('victory')` o `isTerminalStatus('defeat')` THE SYSTEM SHALL devolver `true`.
3. WHEN se evalúa `isTerminalStatus('playing')` o `isTerminalStatus('idle')` THE SYSTEM SHALL devolver `false`.

## Requirement 8 — `submitClientQuestionAnswer`

**User Story:** Como mantenedor, quiero verificar la mecánica de consultas del cliente (bonus/penalty y guardas), porque corre concurrentemente con el resto del juego.

### Acceptance Criteria

1. WHEN el status NO es `playing` THE SYSTEM SHALL devolver `success: false` con mensaje "La partida ya terminó." y NO mutar el tiempo.
2. WHEN no hay una consulta activa que coincida con la pregunta enviada THE SYSTEM SHALL devolver `success: false` con mensaje de consulta no activa, sin mutar el tiempo.
3. WHEN la respuesta a la consulta es correcta THE SYSTEM SHALL sumar `correctBonusSeconds` al tiempo, limpiar `activeQuestionId`, agregar el id a `answeredQuestionIds`, y devolver `success: true` con el `bonus`.
4. WHEN la respuesta a la consulta es incorrecta THE SYSTEM SHALL restar `wrongPenaltySeconds` al tiempo y devolver `success: false` con el `penalty`, manteniendo la consulta activa.

## Non-functional / Out of scope

- Esta spec **NO** cubre las funciones impuras (`pickRandomClientQuestion`, `processClientQuestionSpawnTick`, `getActiveClientQuestionView`) que dependen de `Math.random()` y de `loadClientQuestions()`. Testearlas requiere control de aleatoriedad/datos y se trata aparte.
- Esta spec **NO** modifica la lógica de producción: solo agrega tests. Si un test revela un bug, se documenta — el fix va en su propia spec.
