# Tasks — Modo infinito (endless-mode)

Implementación de dominio hacia afuera. TDD en la lógica pura. NADA implementado aún.

## 1. Modelo de sesión

- [ ] 1.1 Agregar a `GameSession` (game-types.ts): `round: number` (default 1), `mode: 'classic' | 'endless'` (default 'endless'), y un flag transitorio `roundComplete?: boolean`. (R1.3, R5.1)
- [ ] 1.2 Agregar constantes en `constants.ts`: `ENDLESS_BASE_SECONDS = 120`, `ENDLESS_REWARD_SECONDS = 30` (o env vars con esos defaults). (R2.2, R2.3)

## 2. Lógica de dominio (game-engine.ts, pura + tests)

- [ ] 2.1 `submitAnswer`: en modo `endless`, cuando se resuelve el último step, NO marcar `victory` — marcar `roundComplete: true` y sumar `ENDLESS_REWARD_SECONDS` al reloj. En modo `classic`, comportamiento actual (`victory`). (R1.1, R2.3, R5.1)
- [ ] 2.2 Confirmar que el tick a 0 → `defeat` aplica igual en endless (reusar la lógica existente). (R2.5)
- [ ] 2.3 `endlessScore(playedRounds, secondsSurvived)`: función pura `playedRounds * 1000 + secondsSurvived`. (R3.1, R3.5)
- [ ] 2.4 Tests: submitAnswer endless (roundComplete + bono, no victory), classic sigue dando victory, endlessScore (tabla de casos), reloj a 0 → defeat. (R5.2)

## 3. Servicio: cargar la siguiente ronda (game-service.ts)

- [ ] 3.1 En `processAnswer`, cuando la sesión vuelve con `roundComplete`: generar el challenge de la ronda siguiente (Bedrock vía el flujo existente, dificultad según `adaptive-difficulty` con `round + 1`), incrementar `round`, resetear `currentStep`/`currentCode`, limpiar `roundComplete`, persistir en Valkey. Fallback al curado si Bedrock falla. (R1.1, R1.4, R1.5)
- [ ] 3.2 `createSession`/`createPendingSession`: inicializar `round: 1`, `mode`, y el reloj en `ENDLESS_BASE_SECONDS` para endless. (R2.2)
- [ ] 3.3 Exponer `round` y, al game over, `endlessScore` + `playedRounds` para la spec `leaderboard`. (R3.4, R4.2)

## 4. Sincronización Coder/Helper

- [ ] 4.1 Al cargar ronda nueva, la guía del Helper (`getHelperGuide`/sync) refleja el challenge nuevo sin recargar manual. (R4.1)
- [ ] 4.2 Exponer el número de ronda en las vistas del Coder y del Helper. (R4.2)

## 5. UI

- [ ] 5.1 Mostrar la ronda actual (ej. "Ronda 7") en el tablero del Coder y del Helper. (R4.2)
- [ ] 5.2 Transición entre rondas: reusar el estado idle/streaming (`bedrock-streaming`) para mostrar el próximo incidente generándose en vivo. (D5)
- [ ] 5.3 Pantalla de game over con el puntaje final y las rondas alcanzadas (engancha con `leaderboard`). (R3)

## 6. Coexistencia + verificación

- [ ] 6.1 `/start` acepta `mode` (default endless); el modo classic queda disponible y testeado. (R5.1)
- [ ] 6.2 `pnpm run test` verde (existentes + nuevos), `tsc --noEmit` 0 errores, `pnpm run lint` 0 warnings. (R5.4)
- [ ] 6.3 Smoke test: jugar varias rondas, ver el reloj subir al acertar y bajar al errar, confirmar game over a 0 y el puntaje. (R2, R3)

## Notas

- Mantener `game-engine.ts` puro: la generación de la ronda (I/O Bedrock) vive en el servicio, no en el engine.
- Depende de `adaptive-difficulty` (dificultad por ronda) y alimenta `leaderboard` (puntaje + rondas).
- Riesgo de demo: el fallback al curado garantiza que el loop nunca se rompe aunque Bedrock falle.
