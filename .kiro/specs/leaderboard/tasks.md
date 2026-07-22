# Tasks — Leaderboard global del modo infinito (leaderboard)

> Estado: feature NUEVA, aún sin implementar. Todas las tareas están pendientes.
> Implementación de adentro hacia afuera (lógica pura → store → endpoint → vista). TDD donde hay lógica pura.

- [ ] 1. Lógica pura de puntaje y nombre (TDD primero)
  - [ ] 1.1 Crear `src/features/game/leaderboard-score.ts` con `computeScore(rounds, seconds): number` = `(rounds × 1000) + seconds`, rechazando (no produciendo puntaje) entradas negativas, no enteras o no numéricas
    - _Requirements: 1.1, 1.2, 1.4_
  - [ ] 1.2 En el mismo archivo, `sanitizeTeamName(raw): { ok: true; name: string } | { ok: false; reason: string }`: `trim` → eliminar control chars y saltos de línea → colapsar espacios → recortar a `MAX_TEAM_NAME` (24); discriminated union, sin `as`/`any`
    - _Requirements: 2.2, 2.3, 2.4, 2.5_
  - [ ] 1.3 Tests `leaderboard-score.test.ts` para `computeScore`: ejemplo 12 rondas + 300 s → 12300; "más rondas SIEMPRE gana" (ronda 12 > ronda 11 con cualquier tiempo, asumiendo segundos < 1000); rechazo de negativos/no-enteros
    - _Requirements: 1.1, 1.3, 1.2_
  - [ ] 1.4 Tests para `sanitizeTeamName`: vacío tras trim → `ok:false`; supera el máximo → recorta o rechaza según contrato; control chars / `\n` eliminados; espacios colapsados; nombre válido pasa intacto
    - _Requirements: 2.2, 2.3, 2.4_

- [ ] 2. Store del leaderboard (Redis + fallback en memoria)
  - [ ] 2.1 Crear `src/features/game/leaderboard-store.ts` reutilizando el `getRedis()` existente; `registerScore(name, score)` → componer miembro único `` `${name}#${sufijoOpaco}` `` (sufijo CSPRNG, mismo enfoque que `session-credentials.ts`) y `ZADD leaderboard:global <score> <miembro>`
    - _Requirements: 3.2, 3.3_
  - [ ] 2.2 `readTop10()` → `ZREVRANGE leaderboard:global 0 9 WITHSCORES`, mapeando a `LeaderboardEntry[]` (posición 1-based, nombre legible partiendo el miembro por el último `#`, puntaje, rondas = `floor(score/1000)`); lista vacía si no hay entradas
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [ ] 2.3 `rankOf(miembro)` → `ZREVRANK` + 1 (1-based) para la posición global de una entrada, incluso fuera del top 10
    - _Requirements: 3.4, 5.2_
  - [ ] 2.4 Fallback en memoria análogo al `Map` de sesiones: cuando `getRedis()` devuelve `null` (dev), un sorted set simulado en proceso que implemente `zadd`/`zrevrange`/`zrevrank` lo justo para el flujo completo; en producción se usa siempre el Redis real
    - _Requirements: 3.6_
  - [ ] 2.5 Agregar a `game-types.ts` los tipos `LeaderboardEntry`, `LeaderboardTop`, `RegisterScoreInput`, `RegisterScoreResult` (cero `any`, sin `as`)
    - _Requirements: 6.4_
  - [ ] 2.6 Tests del store sobre el fallback en memoria (sin Valkey real): orden del top 10 de mayor a menor, corte en 10 entradas, `rankOf` correcto, y que dos equipos homónimos NO se pisan (miembro único)
    - _Requirements: 3.3, 4.3, 4.5, 3.4_

- [ ] 3. Endpoints `POST`/`GET /api/game/leaderboard`
  - [ ] 3.1 Crear `app/api/game/leaderboard/route.ts` (`POST`): parsear cuerpo, validar nombre (`sanitizeTeamName`) y métricas (`computeScore` + rangos), registrar vía el store y responder `{ rank, entries }`; `400` con mensaje en español si la validación falla
    - _Requirements: 3.1, 3.4, 3.5, 6.1_
  - [ ] 3.2 En el mismo route, `GET` que devuelva `{ entries }` con el top 10 (lista vacía si no hay puntajes); sin token; marcar el route como dinámico / `no-store`
    - _Requirements: 4.1, 4.4_
  - [ ] 3.3 Seguridad del registro (R6): validar rangos en servidor SIEMPRE; donde esté disponible, verificar `isAuthorizedFor(sessionId, 'coder', token)` y derivar rondas/segundos del estado de sesión persistido del game over en vez de confiar en métricas crudas del cliente (`403` si el token no coincide)
    - _Requirements: 6.1, 6.2, 6.3_

- [ ] 4. Vista del leaderboard y posición del jugador
  - [ ] 4.1 Componente de leaderboard (tabla del top 10): columnas posición, nombre de equipo, puntaje y rondas alcanzadas; estado vacío «aún no hay puntajes»; UI en español neutro (sin voseo)
    - _Requirements: 5.1, 4.4, 5.4_
  - [ ] 4.2 En el game over del modo infinito: pedir el nombre de equipo (con validación de UX en cliente), hacer el `POST`, y mostrar el top 10 con la posición global devuelta (`rank`), incluso si cae fuera del top 10 visible
    - _Requirements: 2.1, 5.2_
  - [ ] 4.3 Resaltar la fila del jugador cuando su posición está dentro del top 10; renderizar el nombre de equipo como texto plano (nunca HTML interpretado) como segunda barrera de seguridad
    - _Requirements: 5.3, 5.5_

- [ ] 5. Verificación
  - [ ] 5.1 `npm run test` verde (tests de `leaderboard-score` y del store en memoria) + suite existente sin regresión; `tsc --noEmit` 0 errores; `npm run lint` 0 warnings; cero `any` / sin `as`
    - _Requirements: 1.4, 2.5, 6.4_
  - [ ] 5.2 Smoke en local (sin Valkey): terminar una partida del modo infinito, registrar un nombre, ver el puntaje en el top 10 y la posición; confirmar que el fallback en memoria sostiene el flujo completo
    - _Requirements: 3.6, 5.1, 5.2_
  - [ ] 5.3 Verificar en producción tras deploy: registrar un puntaje real escribe en `leaderboard:global` (Valkey/ElastiCache), `ZREVRANGE` devuelve el top 10 ordenado y la posición resaltada coincide
    - _Requirements: 3.2, 4.1, 5.3_

## Notas

- **Dependencia:** esta spec depende de `endless-mode`, que aporta las **rondas resueltas** y los **segundos sobrevividos** al game over. Las tareas de lógica pura (1.x) y del store (2.x) se pueden implementar y testear ANTES de que `endless-mode` esté listo; el último cable a conectar es de dónde salen las métricas reales (tarea 3.3).
- El leaderboard NO agrega infraestructura: reutiliza el `getRedis()` (Valkey de ElastiCache) que ya usan las sesiones. Solo agrega la clave `leaderboard:global` y los comandos `ZADD`/`ZREVRANGE`/`ZREVRANK`.
- Fuera de alcance (specs hermanas): la mecánica del modo infinito y la dificultad adaptativa.
