# Tasks — Encuentros con el jefe (boss-encounters)

Implementación de dominio hacia afuera. TDD en la lógica pura (azar inyectado, nunca `Math.random` adentro). Se monta sobre el loop de **endless-mode** y la dificultad de **adaptive-difficulty**. NADA implementado aún.

## 1. Constantes y catálogo de eventos

- [ ] 1.1 Agregar a `constants.ts` el catálogo de eventos como datos: `BOSS_EVENTS` (`audit` con `notice` en español + `timeBonusFactor: 0.5`; `watching` con `notice` + `penaltyFactor: 2`), tipado `as const`. (R3.1)
- [ ] 1.2 Agregar a `constants.ts`: `BOSS_EVENT_CHANCE = 0.2`, `BOSS_REWARD_SECONDS = 60`, `BOSS_SCORE_BONUS = 2000`. (R2.1, R2.2, R3.4)

## 2. Lógica de dominio (boss-encounters.ts, pura + tests)

- [ ] 2.1 Crear `src/features/game/boss-encounters.ts` con los tipos `BossEventId = 'audit' | 'watching'` y `RoundModifier = 'none' | 'boss' | BossEventId`. (R3.1)
- [ ] 2.2 `isBossRound(round: number): boolean` — entero, `>= 1` y múltiplo de 10 → `true`; cualquier otra cosa → `false`. Pura, sin azar. (R1.1, R1.2, R1.3)
- [ ] 2.3 `pickBossEvent(round: number, roll: number): RoundModifier` — si `isBossRound(round)` → `'boss'`; si `roll < BOSS_EVENT_CHANCE` → un id del catálogo (derivado del `roll`); si no → `'none'`. `roll` inyectado, sin leer `Math.random` adentro. (R3.2, R3.3, R3.4)
- [ ] 2.4 `rewardSecondsFor(modifier)`, `penaltyFor(modifier)`, `scoreBonusFor(modifier)` — funciones puras que mapean el modificador al bono de tiempo / penalización / bono de puntaje (jefe = mayor; `audit` = bono a la mitad; `watching` = penalización doble). No mutan estado. (R2.1, R2.2, R2.3, R3.5)
- [ ] 2.5 Tests `boss-encounters.test.ts`: `isBossRound` (bordes 0/1/9/10/11/19/20/100/negativos/no-enteros), `pickBossEvent` (jefe → `'boss'` con cualquier `roll`; normal bajo/sobre umbral; ambos ids del catálogo), `rewardSecondsFor`/`penaltyFor`/`scoreBonusFor` (tabla por modificador). Sin Bedrock. (R6.3)

## 3. Modelo de sesión

- [ ] 3.1 Agregar a `GameSession` (game-types.ts): `roundModifier?: RoundModifier` (ausente → ronda normal). (R1.5, R3.6)
- [ ] 3.2 Exponer el modificador de la ronda en las vistas del Coder y del Helper (campos de `CoderStepView` / `HelperSyncView`). (R4.3)

## 4. Engine: bono y penalización parametrizados (game-engine.ts, puro + tests)

- [ ] 4.1 `submitAnswer`: al completar la ronda, sumar `rewardSecondsFor(modifier)` (en vez del bono fijo de endless); al errar, restar `penaltyFor(modifier)` (en vez de `PENALTY_SECONDS` fijo). Mantener `submitAnswer` puro: el modificador (o la penalización ya resuelta) entra por parámetro. (R5.3, R5.4)
- [ ] 4.2 Confirmar que el clamp a 0 → `defeat` de `applyTimeDelta`/`tickTimer` sigue aplicando con la penalización duplicada de `watching`. (R5.4)
- [ ] 4.3 Tests engine: `submitAnswer` con `'watching'` resta el doble; con `'boss'`/`'audit'` aplica el bono correcto al completar; sin modificador = comportamiento endless base. (R6.3)

## 5. Servicio: cablear el modificador en el loop (game-service.ts)

- [ ] 5.1 En la transición de ronda (donde endless-mode carga la siguiente ronda): calcular `const roll = Math.random()` (único punto con azar), `pickBossEvent(round, roll)`, y persistir `session.roundModifier` en Valkey junto a `round`. (R5.2)
- [ ] 5.2 Dificultad de generación: si `isBossRound(round)` → pedir `'expert'` a Bedrock; si no → `roundToDifficulty(round)` (adaptive-difficulty). Mismo flujo + fallback al curado (`pickRandomChallenge`). (R1.4)
- [ ] 5.3 Al completar la ronda, aplicar el bono de tiempo con `applyTimeDelta(session, +rewardSecondsFor(modifier))` y acumular `scoreBonusFor(modifier)` al puntaje del modo infinito, expuesto al game over para `leaderboard`. (R2.1, R2.2, R5.3)

## 6. UI

- [ ] 6.1 Aviso del modificador al empezar la ronda: banner/toast en español neutro — "Jefe final" para la ronda de jefe, o `BOSS_EVENTS[id].notice` para el evento. Visible al Coder y al Helper. (R4.1, R4.2, R4.3)
- [ ] 6.2 UI de "jefe final" distinta en el tablero (color/título), leyendo `roundModifier === 'boss'`. (R1.5)
- [ ] 6.3 Intensificar la presión visual durante jefe/evento: montar `BossOverlay` con `active` (y, opcional, una config con `spawnIntervalMs` menor / `maxVisibleMessages` mayor), reusando el overlay y `boss-position.ts` sin reescribir. (R4.4)

## 7. Integración + verificación

- [ ] 7.1 Los encuentros aplican SOLO en modo `endless`; el modo `classic` queda intacto. (R5.1)
- [ ] 7.2 `pnpm run test` verde (existentes + nuevos), `tsc --noEmit` 0 errores, `pnpm run lint` 0 warnings; cero `any`, sin `as` casts salvo `as const`/`satisfies`. (R5.5, R6.1, R6.5)
- [ ] 7.3 Smoke test: jugar hasta ronda 10 y ver el jefe (UI distinta, `'expert'`, bono mayor); forzar un evento sorpresa en ronda normal y confirmar el aviso + el efecto (bono reducido por `audit`, penalización doble por `watching`). (R2, R3, R4)

## Notas

- Mantener `game-engine.ts` puro: la generación del challenge de jefe (I/O Bedrock) y la persistencia del modificador viven en el servicio.
- Depende de **endless-mode** (ronda + reloj + punto de carga de ronda) y de **adaptive-difficulty** (`'expert'` + `roundToDifficulty`); alimenta **leaderboard** (bono de puntaje del jefe).
- Toda la aleatoriedad se inyecta (`roll`): `Math.random` vive solo en el servicio, fuera de la lógica pura, para que `pickBossEvent` sea determinista en los tests.
- Reusar el jefe visual existente (`BossOverlay`, `boss-position.ts`, `BOSS_PRESSURE_CONFIG`) en vez de inventar una mecánica nueva.
- Riesgo de demo: el fallback al curado garantiza que la ronda de jefe nunca rompe el loop aunque Bedrock falle a nivel `'expert'`.
- Español neutro en la UI (sin voseo), según reglas del proyecto.
