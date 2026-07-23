# Tasks — Modo infinito (endless-mode)

Implementación de dominio hacia afuera. TDD en la lógica pura.

**Estado (2026-06-30):** endless mode + selector de modo completos (smoke tests verificados). Pendiente: integración `adaptive-difficulty` en generación por ronda (3.1, spec hermana), `localStorage` opcional (7.5).

## 1. Modelo de sesión

- [x] 1.1 Agregar a `GameSession` (game-types.ts): `round: number` (default 1, ronda actual), `playedRounds: number` (default 0, rondas completadas — sube SOLO al completar una ronda), `mode: 'classic' | 'endless'` (default 'endless'), y un flag transitorio `roundComplete?: boolean`. (R1.3, R3.2, R5.1)
- [x] 1.2 Agregar constantes en `constants.ts`: `ENDLESS_BASE_SECONDS = 120`, `ENDLESS_REWARD_SECONDS = 30` (o env vars con esos defaults). (R2.2, R2.3)

## 2. Lógica de dominio (game-engine.ts, pura + tests)

- [x] 2.1 `submitAnswer`: en modo `endless`, cuando se resuelve el último step, NO marcar `victory` — marcar `roundComplete: true`, sumar `ENDLESS_REWARD_SECONDS` al reloj e incrementar `playedRounds`. En modo `classic`, comportamiento actual (`victory`). La pantalla de "Nivel completado" (victory) NO se muestra en endless; solo en classic. (R1.1, R1b, R1c, R2.3, R3.2, R5.1)
- [x] 2.2 Confirmar que el tick a 0 → `defeat` con `defeatReason: 'timeout'` aplica igual en endless. (R2.5)
- [x] 2.2b Doble presión vidas+reloj: en endless, el error del Coder SIGUE llamando a `loseLife` (resta vida además del tiempo); perder por vidas a 0 (`coder_lives`/`helper_lives`) también termina la partida aunque el reloj no esté en 0. Termina por lo que llegue primero. (R2.4, R2.6, R2.7 — usa `lives-system`)
- [x] 2.3 `endlessScore(playedRounds, secondsSurvived)`: función pura `playedRounds * 1000 + secondsSurvived`. (R3.1, R3.5)
- [x] 2.4 Tests: submitAnswer endless (roundComplete + bono, no victory), classic sigue dando victory, endlessScore (tabla de casos), reloj a 0 → defeat timeout, vidas a 0 → defeat coder_lives/helper_lives. (R5.2)

## 3. Servicio: cargar la siguiente ronda (game-service.ts)

- [x] 3.1 En `processAnswer`, cuando la sesión vuelve con `roundComplete`: generar el challenge de la ronda siguiente (Bedrock vía el flujo existente, fallback al curado), incrementar `round`, resetear `currentStep`/`currentCode`, limpiar `roundComplete`, persistir en Valkey. *(Dificultad por `round + 1` vía `adaptive-difficulty` queda pendiente — hoy genera con dificultad fija del prompt.)* (R1.1, R1.4, R1.5)
- [x] 3.2 `createSession`/`createPendingSession`: inicializar `round: 1`, `mode`, y el reloj en `ENDLESS_BASE_SECONDS` para endless. (R2.2)
- [x] 3.3 Exponer `round` y, al game over, `endlessScore` + `playedRounds` para la spec `leaderboard`. (R3.4, R4.2)

## 4. Sincronización Coder/Helper

- [x] 4.1 Al cargar ronda nueva, la guía del Helper (`getHelperGuide`/sync) refleja el challenge nuevo sin recargar manual. (R4.1)
- [x] 4.2 Exponer el número de ronda en las vistas del Coder y del Helper. (R4.2)

## 5. UI (in-game)

- [x] 5.1 Mostrar la ronda actual (ej. "Ronda 7") en el tablero del Coder y del Helper. (R4.2)
- [x] 5.2 Transición entre rondas: reusar el estado idle/streaming (`bedrock-streaming`) para mostrar el próximo incidente generándose en vivo. (D5)
- [x] 5.3 Pantalla de game over con el puntaje final y las rondas alcanzadas (engancha con `leaderboard`). (R3)

## 6. Coexistencia + verificación

- [x] 6.1 `/start` acepta `mode` (default endless); el modo classic queda disponible y testeado. (R5.1)
- [x] 6.2 `pnpm run test` verde (existentes + nuevos), `tsc --noEmit` 0 errores, `pnpm run lint` 0 warnings. (R5.4)
- [x] 6.3 Smoke test: jugar varias rondas, ver el reloj subir al acertar y bajar al errar, confirmar game over a 0 y el puntaje. (R2, R3)

## 7. Selector de modo (pre-partida, Coder)

Decisión de UX (2026-06-30): el jugador elige el modo en el **modal de confirmación del Coder** (`StartGameButton`), **antes** del selector de idioma. El Helper no elige modo — entra a una sala ya creada. Ver R6 y D7.

- [x] 7.1 `StartGameButton.tsx`: control de modo (`classic` | `endless`) en el modal, **encima** del selector de idioma, con copy claro por opción. (R6.1, R6.2, D7)
- [x] 7.2 Al confirmar inicio, propagar `mode` en la URL vía `buildCoderStartPath`: `/coder?lang=<language>&mode=<mode>`. (R6.3, D7)
- [x] 7.3 `app/coder/page.tsx`: leer params con `resolveCoderStartParams` y pasar a `startGame(language, mode)`. Default `endless` si falta el param. (R6.3, D7)
- [x] 7.4 `game-mode.ts`: funciones puras `parseGameMode`, `parseChallengeLanguageParam`, `resolveCoderStartParams`, `buildCoderStartPath`; reutilizadas por `/start`, modal y bootstrap. (R6.3, D7)
- [ ] 7.5 *(Opcional)* Recordar último modo elegido en `localStorage` para rejugabilidad. (R6.5)

### 7.6 Tests automatizados (R6.6, R6.7)

- [x] 7.6.1 `game-mode.test.ts`: `parseGameMode` (classic, endless, valores inválidos → default), `parseChallengeLanguageParam`, `resolveCoderStartParams`, `buildCoderStartPath`.
- [x] 7.6.2 `game-client.test.ts`: `startGame(language, mode)` serializa ambos campos en el body del POST.
- [x] 7.6.3 `game-service.start.test.ts`: `startGame` persiste `mode: 'endless'` por default y `mode: 'classic'` cuando se pide.
- [x] 7.7 Smoke test manual del selector: elegir **Partida normal** → victoria al completar; elegir **Modo infinito** → loop + score en defeat. (R6.7)

## Notas

- Mantener `game-engine.ts` puro: la generación de la ronda (I/O Bedrock) vive en el servicio, no en el engine.
- Depende de `adaptive-difficulty` (dificultad por ronda) y alimenta `leaderboard` (puntaje + rondas).
- Riesgo de demo: el fallback al curado garantiza que el loop nunca se rompe aunque Bedrock falle.
- El parsing de `mode`/`lang` vive en `game-mode.ts` (puro, testeable); `/start` y `coder/page` lo reutilizan — sin duplicar lógica en la route.