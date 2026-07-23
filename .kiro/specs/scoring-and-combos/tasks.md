# Tasks — Combos por racha (scoring-and-combos)

Implementación de dominio hacia afuera. TDD en la lógica pura. Depende de `endless-mode` (debe estar implementado antes: aporta `endlessScore`, `playedRounds` y la rama endless de `submitAnswer`).

**Estado (2026-07-02):** feature completa — lógica pura, servicio, UI del Coder y suite de tests (`combo-scoring.test.ts`) verificados. `pnpm run test` 261/261 verde, `tsc --noEmit` 0 errores.

## 1. Modelo de sesión

- [x] 1.1 Agregar a `GameSession` (game-types.ts): `streak: number` (default 0), `bestStreak: number` (default 0), `comboScore: number` (default 0, acumulador de bono de combo). (R2.4, R5.2)
- [x] 1.2 Agregar a `CoderStepView` (game-types.ts): `streak: number` y `multiplier: number`. (R4.6)
- [x] 1.3 Agregar constantes en `constants.ts`: `STREAK_TIERS` (tabla `[{minStreak:7,multiplier:3},{minStreak:5,multiplier:2},{minStreak:3,multiplier:1.5}] as const`), `BASE_MULTIPLIER = 1`, `COMBO_BASE_PER_HIT` (ej. 100). (R1.1, R1.4)

## 2. Lógica de dominio (game-engine.ts, pura + tests)

- [x] 2.1 `streakMultiplier(streak: number): number`: recorre `STREAK_TIERS` de mayor a menor umbral, devuelve el primer multiplicador que aplica; por debajo de 3 → `BASE_MULTIPLIER`. Siempre ≥ 1. (R1.1, R1.2, R1.3, R1.5)
- [x] 2.2 `comboPoints(basePerHit: number, multiplier: number): number`: `Math.round(basePerHit * multiplier)`. (R3.5)
- [x] 2.3 `finalScore(endless: number, comboScore: number): number`: `endless + comboScore`, compone con `endlessScore` de `endless-mode` sin modificarlo. (R3.1, R3.2)
- [x] 2.4 `submitAnswer`: en acierto, `streak + 1` y `bestStreak = Math.max(bestStreak, streak + 1)`; acumular en `comboScore` el bono `comboPoints(COMBO_BASE_PER_HIT, streakMultiplier(streakActual))` SOLO cuando el multiplicador es > 1. En error, `streak: 0` (romper), `bestStreak` intacto. Sin tocar el reloj salvo la penalización existente. (R2.1, R2.2, R2.3, R2.5, R2.6, R5.4)
- [x] 2.5 `getCoderStepView`: exponer `streak: session.streak` y `multiplier: streakMultiplier(session.streak)`. (R4.6)
- [x] 2.6 Tests: `streakMultiplier` (tabla con límites 2/3, 4/5, 6/7), `comboPoints` (redondeo de ×1.5), `finalScore` (sin combo → igual a `endlessScore`, R3.3), `submitAnswer` (acierto incrementa racha + bestStreak; error resetea racha y conserva bestStreak; bono solo si multiplicador > 1). (R3.3, R5.3)

## 3. Servicio (game-service.ts)

- [x] 3.1 `createSession`/`createPendingSession`: inicializar `streak: 0`, `bestStreak: 0`, `comboScore: 0`. (R5.2)
- [x] 3.2 Al game over, componer el puntaje final: `finalScore(endlessScore(playedRounds, secondsSurvived), session.comboScore)` y exponer `bestStreak` para `leaderboard`. (R3.1, R3.4)
- [x] 3.3 Confirmar que `comboScore`, `streak` y `bestStreak` se persisten junto al resto del estado de sesión. (R2.4)

## 4. UI (vista del Coder)

- [x] 4.1 Mostrar el indicador de combo ("Racha ×N 🔥") en el tablero del Coder cuando `multiplier > 1`; ocultar/atenuar cuando es ×1. Español neutro, sin voseo. (R4.1, R4.2, R4.5)
- [x] 4.2 Reflejar el cambio de multiplicador al subir de banda y la caída a ×1 al romperse la racha, en la siguiente actualización de estado. (R4.3, R4.4)

## 5. Coexistencia + verificación

- [x] 5.1 Confirmar que `endlessScore` (endless-mode) queda intacta y los tests existentes de `submitAnswer` y del flujo de partida siguen verdes; actualizar tests acompañando la extensión de `submitAnswer` si cambia su firma de retorno. (R5.1, R5.3)
- [x] 5.2 `pnpm run test` verde (existentes + nuevos), `tsc --noEmit` 0 errores, `pnpm run lint` 0 warnings (cero `any`, sin `as` casts salvo `as const`/`satisfies`). (R5.5)
- [x] 5.3 Smoke test: encadenar 7+ aciertos y ver el indicador subir ×1 → ×1.5 → ×2 → ×3; errar y confirmar que vuelve a ×1 y el puntaje deja de acumular bono; confirmar `bestStreak` correcto al game over. (R1, R2, R4)

## Notas

- Mantener `game-engine.ts` puro: la composición del puntaje final al game over (que usa datos derivados de `endless-mode`) vive en el servicio, no en el engine.
- Depende de `endless-mode` (`endlessScore`, `playedRounds`, rama endless de `submitAnswer`) y alimenta `leaderboard` (`finalScore` + `bestStreak`).
- La regla operativa de compatibilidad (R3.3): el bono de combo solo se acumula con multiplicador > 1, de modo que una partida sin combos da exactamente el puntaje de `endless-mode`. Cubrir con test explícito.
- El combo cuenta aciertos/errores de **steps del challenge**, no de preguntas del cliente (`client-question`).