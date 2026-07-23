# Tasks — Leaderboard global del modo infinito (leaderboard)

> **Estado (2026-07-23): IMPLEMENTADO y en producción.** Suite verde, endpoints
> deployados a ECS Fargate, escribiendo en Valkey/ElastiCache. Queda solo la
> verificación de la paridad Helper (ver PR #4) — cubierta por la spec hermana
> `game-results` (paridad de vista al game over).
> Se conserva como registro histórico de cómo se construyó.
> **Refinamiento 2026-07-03:** el leaderboard usa como score el `endlessScore` que el juego YA calcula (con combos), NO recalcula la fórmula. El registro se ata al `coderToken` y deriva el score del servidor. Ver requirements/design.

- [x] 1. Lógica pura de nombre y derivación de score (TDD primero)
  - [x] 1.1 Crear `src/features/game/leaderboard-score.ts` con `sanitizeTeamName(raw): { ok: true; name: string } | { ok: false; reason: string }`: `trim` → eliminar control chars y saltos de línea → colapsar espacios → recortar a `MAX_TEAM_NAME` (24); discriminated union, sin `as`/`any`.
    - _Requirements: 2.2, 2.3, 2.4, 2.5_
  - [x] 1.2 En el mismo archivo, `scoreFromGameOver(session): { ok: true; endlessScore: number; playedRounds: number } | { ok: false; reason: string }`: exige `mode === 'endless' && status === 'defeat'`, LEE `endlessScore` y `playedRounds` del estado de game over (via `buildEndlessGameOverMeta` o campos ya expuestos), y valida `endlessScore` entero ≥ 0 bajo tope. NO recalcula la fórmula. Puro.
    - _Requirements: 1.1, 1.2, 1.3, 1.5_
  - [x] 1.3 Tests para `sanitizeTeamName`: vacío tras trim → `ok:false`; supera el máximo → recorta o rechaza según contrato; control chars / `\n` eliminados; espacios colapsados; nombre válido pasa intacto.
    - _Requirements: 2.2, 2.3, 2.4_
  - [x] 1.4 Tests para `scoreFromGameOver`: sesión de game over endless con combos → `endlessScore` == el de la vista de game over (mismo número que ve el jugador), `playedRounds` correcto; sesión en curso o mode classic → `ok:false`; `endlessScore` negativo/corrupto → `ok:false`. NO debe existir un test que verifique una fórmula `rounds×1000+seconds` recalculada aquí.
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Store del leaderboard (Redis + fallback en memoria)
  - [x] 2.1 Crear `src/features/game/leaderboard-store.ts` reutilizando `getRedis()`; `registerScore(name, endlessScore, playedRounds)` → miembro único `` `${name}#${sufijoOpaco}` `` (sufijo CSPRNG, `randomBytes`, como `session-credentials.ts`), `ZADD leaderboard:global <endlessScore> <miembro>` y `HSET leaderboard:meta:<miembro> playedRounds <playedRounds>`.
    - _Requirements: 3.2, 3.3_
  - [x] 2.2 `readTop10()` → `ZREVRANGE leaderboard:global 0 9 WITHSCORES`, mapeando a `LeaderboardEntry[]` (posición 1-based, nombre legible partiendo el miembro por el último `#`, puntaje = score, `playedRounds` LEÍDO del meta `HGET leaderboard:meta:<miembro> playedRounds` — NO `floor(score/1000)`, que con combos daría mal); lista vacía si no hay entradas.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [x] 2.3 `rankOf(miembro)` → `ZREVRANK` + 1 (1-based) para la posición global de una entrada, incluso fuera del top 10.
    - _Requirements: 3.4, 5.2_
  - [x] 2.4 Fallback en memoria análogo al `Map` de sesiones: cuando `getRedis()` devuelve `null` (dev), un sorted set + meta simulados en proceso que implementen `zadd`/`zrevrange`/`zrevrank`/`hset`/`hget` lo justo para el flujo completo; en producción se usa siempre el Redis real.
    - _Requirements: 3.7_
  - [x] 2.5 Agregar a `game-types.ts` los tipos `LeaderboardEntry` (incluye `playedRounds`), `LeaderboardTop`, `RegisterScoreInput` (`{ sessionId, token, teamName }` — SIN métricas), `RegisterScoreResult` (cero `any`, sin `as`).
    - _Requirements: 6.5_
  - [x] 2.6 Tests del store sobre el fallback en memoria (sin Valkey real): orden del top 10 por `endlessScore`, corte en 10, `rankOf` correcto, dos homónimos NO se pisan (miembro único), y que las rondas salen del meta persistido (test con un score de combos alto que rompería `floor(score/1000)`).
    - _Requirements: 3.3, 4.2, 4.3, 4.5, 3.4_

- [x] 3. Endpoints `POST`/`GET /api/game/leaderboard`
  - [x] 3.1 Crear `app/api/game/leaderboard/route.ts` (`POST`): parsear `{ sessionId, token, teamName }`, `sanitizeTeamName` (400 si inválido), `isAuthorizedFor(sessionId,'coder',token)` (403 si no), leer sesión + `scoreFromGameOver` (rechazo si no es game over válido), registrar vía el store y responder `{ rank, entries }`.
    - _Requirements: 3.1, 3.4, 3.5, 6.1, 6.2, 6.3_
  - [x] 3.2 Idempotencia: marcar la sesión como registrada (flag `leaderboardRegistered` en `GameSession`) tras el primer registro; un segundo `POST` de la misma sesión no crea otra entrada (responde `409 already`).
    - _Requirements: 3.6_
  - [x] 3.3 En el mismo route, `GET` que devuelva `{ entries }` con el top 10 (lista vacía si no hay puntajes); sin token; marcar el route como dinámico / `no-store`.
    - _Requirements: 4.1, 4.4_

- [x] 4. Vista del leaderboard y posición del jugador
  - [x] 4.1 Componente de leaderboard (tabla del top 10): columnas posición, nombre de equipo, puntaje (`endlessScore`) y rondas alcanzadas (`playedRounds` del meta); estado vacío «aún no hay puntajes»; UI en español neutro (sin voseo). *(`LeaderboardTable` en `LeaderboardPanel.tsx`; el prop `playerRank` es opcional para el modo espectador — ver PR #4.)*
    - _Requirements: 5.1, 4.4, 5.4_
  - [x] 4.2 En el game over del modo infinito: pedir el nombre de equipo (validación de UX en cliente), hacer el `POST { sessionId, token, teamName }`, y mostrar el top 10 con la posición global devuelta (`rank`), incluso si cae fuera del top 10 visible. El puntaje mostrado DEBE coincidir con el que el jugador ya vio en su game over (mismo `endlessScore`).
    - _Requirements: 2.1, 5.2, 1.1_
  - [x] 4.3 Resaltar la fila del jugador cuando su posición está dentro del top 10; renderizar el nombre de equipo como texto plano (nunca HTML interpretado) como segunda barrera de seguridad.
    - _Requirements: 5.3, 5.5_

- [x] 5. Verificación
  - [x] 5.1 `corepack pnpm@9.15.0 run test` verde (tests de `leaderboard-score` y del store en memoria, incluido el test de CONSISTENCIA score-registrado == score-de-game-over) + suite existente sin regresión; `tsc --noEmit` 0 errores; `corepack pnpm@9.15.0 run lint` 0 warnings; cero `any` / sin `as`.
    - _Requirements: 1.5, 2.5, 6.5_
  - [x] 5.2 Smoke en local (sin Valkey): terminar una partida del modo infinito CON combos, registrar un nombre, y confirmar que el puntaje del top 10 == el puntaje que se vio en el game over (no un número recalculado sin combos), y que las rondas son correctas.
    - _Requirements: 1.1, 3.7, 5.1, 5.2_
  - [x] 5.3 Verificar en producción tras deploy: registrar un puntaje real escribe en `leaderboard:global` (Valkey/ElastiCache), `ZREVRANGE` devuelve el top 10 ordenado, las rondas salen del meta, y la posición resaltada coincide. *(Deploy CI/CD automático desde `main` a ECS Fargate.)*
    - _Requirements: 3.2, 4.1, 5.3_

## Notas

- **Cambio de premisa vs. v1:** la v1 planeaba una `computeScore(rounds, seconds)` propia. Tras `scoring-and-combos`, el score real del juego es `endlessScore = base + comboScore`. Recalcular aquí mostraría en el ranking un número DISTINTO al que el jugador vio → inconsistencia en la demo. El leaderboard LEE `endlessScore` de la fuente de verdad (estado de game over persistido), no lo recalcula. Ese es el guardrail del test de consistencia (5.1/5.2).
- **Dependencia:** `endless-mode` + `scoring-and-combos` YA aportan `endlessScore`/`playedRounds` en el game over (`buildEndlessGameOverMeta`, `withEndMeta`), e `isAuthorizedFor` ya existe. Lo que la v1 marcaba como "último cable a conectar / ideal" hoy está disponible: el atado al token y la derivación del score son el camino POR DEFECTO.
- **`game-results`** (spec hermana) DEPENDE de esta: consume el nombre de equipo y `sanitizeTeamName` para su card compartible y el email. Implementar leaderboard primero.
- El leaderboard NO agrega infraestructura: reutiliza `getRedis()` (Valkey de ElastiCache). Agrega la clave `leaderboard:global`, el meta `leaderboard:meta:<miembro>`, y los comandos `ZADD`/`ZREVRANGE`/`ZREVRANK`/`HSET`/`HGET`.
- Fuera de alcance (specs hermanas): la mecánica del modo infinito, la dificultad adaptativa, el cálculo de combos (ya incluido en `endlessScore`).
