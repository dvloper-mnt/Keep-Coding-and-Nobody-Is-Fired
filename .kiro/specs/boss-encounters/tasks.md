# Tasks — Encuentros con el jefe (boss-encounters)

Implementación de dominio hacia afuera. TDD en la lógica pura (azar inyectado, nunca `Math.random` adentro). Se monta sobre el loop de **endless-mode**; usa la dificultad NATURAL de la ronda (adaptive-difficulty) y el validador de **cooperative-prompt-integrity**. El jefe es FORMATO (multi-etapa con memoria), NO dificultad. NADA implementado aún.

## 1. Constantes y catálogo de eventos

- [ ] 1.1 Agregar a `constants.ts` el catálogo de eventos como datos: `BOSS_EVENTS` (`audit` con `notice` en español + `timeBonusFactor: 0.5`; `watching` con `notice` + `penaltyFactor: 2`), tipado `as const`. (R4.1)
- [ ] 1.2 Agregar a `constants.ts`: `BOSS_EVENT_CHANCE = 0.2`, `BOSS_REWARD_SECONDS = 60`, `BOSS_SCORE_BONUS = 2000`. (R3.1, R3.2, R4.4)

## 2. Lógica de dominio (boss-encounters.ts, pura + tests)

- [ ] 2.1 Crear `src/features/game/boss-encounters.ts` con los tipos `BossEventId = 'audit' | 'watching'` y `RoundModifier = 'none' | 'boss' | BossEventId`. (R4.1)
- [ ] 2.2 `isBossRound(round: number): boolean` — entero, `>= 1` y múltiplo de 10 → `true`; cualquier otra cosa → `false`. Pura, sin azar. (R1.1, R1.2, R1.3)
- [ ] 2.3 `pickBossEvent(round: number, roll: number): RoundModifier` — si `isBossRound(round)` → `'boss'`; si `roll < BOSS_EVENT_CHANCE` → un id del catálogo (derivado del `roll`); si no → `'none'`. `roll` inyectado, sin leer `Math.random` adentro. (R4.2, R4.3, R4.4)
- [ ] 2.4 `rewardSecondsFor(modifier)`, `penaltyFor(modifier)`, `scoreBonusFor(modifier)` — funciones puras que mapean el modificador al bono de tiempo / penalización / bono de puntaje (jefe = mayor; `audit` = bono a la mitad; `watching` = penalización doble). No mutan estado. (R3.1, R3.2, R4.5)
- [ ] 2.5 `isBossFormat(challenge: Challenge): boolean` — `true` si el challenge tiene más de 3 pasos (`steps.length > 3`). Pura, sin azar. Es el guardrail de que un challenge de jefe realmente sea multi-etapa. (R2.4)
- [ ] 2.6 `bossFormatInstruction(): string` — instrucción de prompt en español: encuentro con el jefe, incidente encadenado de 4–6 pasos (no 3), al menos un paso con respuesta CONDICIONADA por una decisión de un paso anterior (memoria), manteniendo integridad cooperativa (rules/knowledge no revelan la respuesta). (R2.1, R2.2, R2.3, R2.5)
- [ ] 2.7 Tests `boss-encounters.test.ts`: `isBossRound` (bordes 0/1/9/10/11/19/20/100/negativos/no-enteros); `pickBossEvent` (jefe → `'boss'` con cualquier `roll`; normal bajo/sobre umbral; ambos ids del catálogo); `rewardSecondsFor`/`penaltyFor`/`scoreBonusFor` (tabla por modificador); `isBossFormat` (>3 → true, ≤3 → false); `bossFormatInstruction` (texto no vacío que menciona >3 pasos y dependencia entre pasos). Sin Bedrock. (R7.3)

## 3. Modelo de sesión

- [ ] 3.1 Agregar a `GameSession` (game-types.ts): `roundModifier?: RoundModifier` (ausente → ronda normal). (R1.5, R4.6)
- [ ] 3.2 Exponer el modificador de la ronda en las vistas del Coder y del Helper (campos de `CoderStepView` / `HelperSyncView`). (R5.3)

## 4. Engine: bono y penalización parametrizados (game-engine.ts, puro + tests)

- [ ] 4.1 `submitAnswer`: al completar la ronda, sumar `rewardSecondsFor(modifier)` (en vez del bono fijo de endless); al errar, restar `penaltyFor(modifier)` (en vez de la penalización fija). Mantener `submitAnswer` puro: el modificador (o la penalización ya resuelta) entra por parámetro. (R6.3, R6.4)
- [ ] 4.2 Confirmar que el clamp a 0 → `defeat` de `applyTimeDelta`/`tickTimer` sigue aplicando con la penalización duplicada de `watching`. (R6.4)
- [ ] 4.3 Confirmar que el fin del challenge (`currentStep >= numSteps`) sigue siendo DINÁMICO: un challenge de jefe con N>3 pasos avanza y termina en el paso N sin tocar el engine. Test explícito con un challenge de 5 pasos. (R1.6, R6.5)
- [ ] 4.4 Tests engine: `submitAnswer` con `'watching'` resta el doble; con `'boss'`/`'audit'` aplica el bono correcto al completar; sin modificador = comportamiento endless base. (R6.3)

## 5. Servicio: cablear el modificador en el loop (game-service.ts)

- [ ] 5.1 En la transición de ronda (donde endless-mode carga la siguiente ronda): calcular `const roll = Math.random()` (único punto con azar), `pickBossEvent(round, roll)`, y persistir `session.roundModifier` en Valkey junto a `round`. (R6.2)
- [ ] 5.2 Formato de generación: si `isBossRound(round)` → concatenar `bossFormatInstruction()` al mensaje de usuario y usar la dificultad NATURAL `roundToDifficulty(round)` (NO forzar `'expert'`); si no → generación estándar de 3 pasos. Mismo flujo Bedrock + `isValidChallenge` + `hasCooperativeIntegrity`. (R1.4, R2.1, R2.3)
- [ ] 5.3 Validación de formato de jefe: tras validar, si es ronda de jefe y el challenge NO cumple `isBossFormat` (≤3 pasos), tratarlo como generación fallida de jefe → fallback al curado de jefe (tarea 5.5). (R2.4)
- [ ] 5.4 Al completar la ronda, aplicar el bono de tiempo con `applyTimeDelta(session, +rewardSecondsFor(modifier))` y acumular `scoreBonusFor(modifier)` al puntaje del modo infinito, expuesto al game over para `leaderboard`. (R3.1, R3.2, R6.3)
- [ ] 5.5 Selector de fallback consciente del jefe: si la ronda es de jefe y la generación falla o no cumple `isBossFormat` → elegir el **curado de jefe** (tarea 8); si es ronda normal → `pickRandomChallenge` como hoy. (R5.5)

## 6. UI

- [ ] 6.1 Aviso del modificador al empezar la ronda: banner/toast en español neutro — "Jefe final" para la ronda de jefe, o `BOSS_EVENTS[id].notice` para el evento. Visible al Coder y al Helper. (R5.1, R5.2, R5.3)
- [ ] 6.2 UI de "jefe final" distinta en el tablero (color/título), leyendo `roundModifier === 'boss'`. El indicador de progreso (paso X de N) ya refleja los pasos extra porque es dinámico. (R1.5)
- [ ] 6.3 Intensificar la presión visual durante jefe/evento: montar `BossOverlay` con `active` (y, opcional, una config con `spawnIntervalMs` menor / `maxVisibleMessages` mayor), reusando el overlay y `boss-position.ts` sin reescribir. (R5.4)

## 7. Fallback curado de jefe

- [ ] 7.1 Crear un challenge de jefe curado (multi-etapa, 4–6 pasos, con una dependencia de memoria explícita entre pasos) en `src/data/challenges/` y registrarlo en `index.ts` como fallback de jefe. NO tocar los curados normales. (R5.5)
- [ ] 7.2 Test de catálogo: el curado de jefe pasa `isValidChallenge` + `hasCooperativeIntegrity` + `isBossFormat` (guardrail de build). (R2.3, R2.4, R5.5)

## 8. Integración + verificación

- [ ] 8.1 Los encuentros aplican SOLO en modo `endless`; el modo `classic` queda intacto. (R6.1)
- [ ] 8.2 `corepack pnpm@9.15.0 run test` verde (existentes + nuevos), `tsc --noEmit` 0 errores, `corepack pnpm@9.15.0 run lint` 0 warnings; cero `any`, sin `as` casts salvo `as const`/`satisfies`. (Usar corepack pnpm@9.15.0 en esta Mac, no el pnpm del PATH — ver gotcha de entorno.) (R6.5, R7.1, R7.5)
- [ ] 8.3 Smoke test: jugar hasta ronda 10 y ver el jefe (UI distinta, challenge multi-etapa >3 pasos con memoria, bono mayor); forzar un evento sorpresa en ronda normal y confirmar el aviso + el efecto (bono reducido por `audit`, penalización doble por `watching`). Confirmar que si Bedrock devuelve un jefe de ≤3 pasos, cae al curado de jefe. (R2, R3, R4, R5)

## Notas

- **Cambio de premisa vs. v1:** el jefe YA NO se pide a `'expert'` (adaptive-difficulty ya vuelve todo experto desde la ronda 13, lo que hacía redundante un boss experto). El jefe es FORMATO: multi-etapa con memoria entre pasos. Escala la CONVERSACIÓN, no el número.
- Mantener `game-engine.ts` puro: la generación del challenge de jefe (I/O Bedrock) y la persistencia del modificador viven en el servicio. El fin dinámico del challenge (`currentStep >= numSteps`) ya soporta >3 pasos sin cambios.
- El contrato `Challenge`/`ChallengeStep` NO cambia: la "memoria" se expresa en el CONTENIDO generado (enunciado/opciones que aluden a pasos previos), no en un campo nuevo. El validador ya acepta `steps.length >= 1`.
- Depende de **endless-mode** (ronda + reloj + punto de carga de ronda), usa **adaptive-difficulty** (`roundToDifficulty`, NO `'expert'`) y **cooperative-prompt-integrity** (`hasCooperativeIntegrity`); alimenta **leaderboard** (bono de puntaje del jefe).
- Toda la aleatoriedad se inyecta (`roll`): `Math.random` vive solo en el servicio, fuera de la lógica pura, para que `pickBossEvent` sea determinista en los tests.
- Reusar el jefe visual existente (`BossOverlay`, `boss-position.ts`, `BOSS_PRESSURE_CONFIG`) en vez de inventar una mecánica nueva.
- Riesgo de demo: el fallback al **curado de jefe** garantiza que la ronda de jefe SIEMPRE sea multi-etapa aunque Bedrock falle o devuelva ≤3 pasos.
- Español neutro en la UI (sin voseo), según reglas del proyecto.
