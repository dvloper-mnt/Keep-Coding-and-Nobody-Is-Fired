# Requirements — Leaderboard global del modo infinito (leaderboard)

## Introduction

El juego "Keep Coding and Nobody Is Fired" es **anónimo**: no hay login ni cuentas. Hoy una partida termina (game over) y el resultado se pierde — no queda registro de qué tan lejos llegó un equipo. Esta spec agrega un **leaderboard global de top 10** para el **modo infinito**: al terminar una partida de ese modo, se le pide al jugador un **nombre de equipo** (ej. "Los Debuggers"), se calcula su **puntaje** y se guarda en un ranking global compartido. Después se le muestra el top 10 y **su posición** dentro de él.

**Decisión de arquitectura clave:** el ranking vive en un **Redis Sorted Set** del Valkey que YA está conectado (AWS ElastiCache, mismo cliente `ioredis` singleton que usan las sesiones). `ZADD` para guardar, `ZREVRANGE` para leer el top 10. Los sorted sets de Redis están hechos exactamente para rankings: mantienen el orden por score sin que la app tenga que ordenar nada. La clave es `leaderboard:global`.

**FUENTE ÚNICA DE PUNTAJE (decisión clave, actualizada 2026-07-03):** el leaderboard **NO recalcula** el puntaje. Usa como score el `endlessScore` que el juego **ya calculó** al game over. Cuando esta spec se escribió (24-jun) el puntaje del modo infinito no existía en el código y se planeaba definir la fórmula aquí; pero las specs hermanas mergeadas después (`endless-mode`, `scoring-and-combos`) ya lo materializaron: hoy el score real es

```
endlessScore = (playedRounds × 1000 + segundosSobrevividos) + comboScore
```

calculado por `finalScore(base, comboScore)` en `game-engine.ts` (base = `playedRounds × 1000 + segundos`; `comboScore` = bonus de rachas). Ese número — **con combos incluidos** — es el que el jugador VE en su pantalla de game over. Si el leaderboard rankeara con una fórmula propia sin combos, el ranking mostraría un puntaje **distinto** al que el jugador acaba de ver: inconsistencia inaceptable en la demo en vivo. Por eso el leaderboard **lee `endlessScore` de la fuente de verdad del servidor** (el estado de sesión persistido del game over) y lo usa tal cual como score del sorted set. Se mantiene la regla "más lejos manda, el tiempo desempata" porque el término base ya la implementa; los combos solo suman skill por encima.

**Relato de hackathon:** el leaderboard convierte cada partida en un reto social ("¿quién llega más lejos?") y demuestra otro uso del Valkey de AWS más allá de las sesiones — un ranking en tiempo real, sin base de datos relacional, con la estructura de datos correcta para el problema.

### Contexto verificado

- **El puntaje YA existe y ya incluye combos.** `src/features/game/game-engine.ts`: `endlessScore(playedRounds, seconds) = playedRounds * 1000 + seconds` (base), y `finalScore(base, comboScore) = base + comboScore` es el puntaje real. `buildEndlessGameOverMeta(session, durationSeconds)` devuelve `{ playedRounds, endlessScore, bestStreak }` con `endlessScore` = base + combos. El leaderboard NO reimplementa esto: lo consume.
- **Las métricas del game over YA viajan al cliente y ya están atadas al servidor.** `game-service.ts` (`withEndMeta`, ~líneas 316-333) inyecta `durationSeconds`, `playedRounds`, `endlessScore`, `bestStreak` en las vistas cuando `mode === 'endless' && status === 'defeat'`. Todo derivado del estado de sesión persistido (fuente de verdad), no del cliente.
- **`isAuthorizedFor(sessionId, role, token)` YA existe** en `game-service.ts` (~línea 213, usa `tokensMatch`) y ya es el guard de todos los route handlers (`answer`, `abandon`, `tick`, `client-question`, `sync`). El "atado al token" que la v1 de esta spec pintaba como IDEAL es hoy trivial y debe ser el camino POR DEFECTO (ver R6).
- `game-service.ts` ya tiene `getRedis()` (singleton `ioredis`, `lazyConnect`) y el patrón `getSessionFromStore`/`setSessionToStore` (`get`/`set`/`incr`/`expire`). El leaderboard usa el mismo `getRedis()` con `zadd`/`zrevrange`/`zrevrank`.
- **Gotcha de dev confirmado:** sin `REDIS_HOST`, `getRedis()` devuelve `null` y las sesiones caen a un `Map` en memoria (solo dev). El leaderboard necesita un **fallback en memoria análogo** (un sorted set simulado en proceso), igual que hacen hoy las sesiones.
- En **producción** `getRedis()` lanza si falta `REDIS_HOST` (no degrada en silencio). El leaderboard hereda esa garantía.
- CSPRNG para el sufijo opaco del miembro: `session-credentials.ts` ya usa `randomBytes(32).toString('hex')` (`generateOpaqueToken`) — patrón a reutilizar.
- Los endpoints siguen el patrón `app/api/game/*/route.ts` (ver `answer/route.ts`, `start/route.ts`): handlers finos que validan el cuerpo, llaman al servicio y traducen el resultado a `NextResponse`.
- El proyecto mantiene **cero `any`**, **sin `as` casts** (salvo `as const`/`satisfies`), **TDD en la lógica pura** y la **UI en español neutro** (sin voseo).

## Glossary

- **Modo infinito (endless mode)**: modo de juego donde el jugador resuelve rondas sucesivas hasta perder (game over). Su mecánica se especifica en la spec hermana `endless-mode`.
- **`playedRounds`**: rondas COMPLETADAS (todos los steps de un challenge resueltos). Es la métrica de "rondas" que entra al puntaje. Distinta de `round` (la ronda EN CURSO, 1-based). Vocabulario del código real (`game-types.ts`): esta spec usa `playedRounds`, no "rondas resueltas" a secas, para no confundir con `round`.
- **`endlessScore` (score)**: el puntaje final que el juego calcula al game over = `(playedRounds × 1000 + segundosSobrevividos) + comboScore`. **Fuente única**: lo calcula el engine (`finalScore`), viaja en las vistas del game over, y el leaderboard lo usa tal cual como score del sorted set. El leaderboard NO lo recalcula.
- **`comboScore`**: bonus de puntaje por rachas (streaks) que `scoring-and-combos` acumula en la sesión y suma a `endlessScore`. El leaderboard no lo maneja directamente: ya viene incluido en `endlessScore`.
- **Nombre de equipo (team name)**: cadena que el jugador escribe al terminar la partida del modo infinito para identificar su entrada en el ranking. No es una cuenta ni un login: es solo una etiqueta para esa entrada.
- **Sorted set**: estructura de Redis/Valkey que mantiene miembros ordenados por un score numérico. `ZADD` inserta/actualiza; `ZREVRANGE ... WITHSCORES` lee de mayor a menor.
- **Top 10**: las 10 entradas de mayor puntaje del sorted set `leaderboard:global`, leídas con `ZREVRANGE leaderboard:global 0 9 WITHSCORES`.
- **Posición (rank)**: el lugar 1-based de una entrada dentro del ranking global, obtenido con `ZREVRANK`.

---

## Requirement 1 — Puntaje: fuente única (leer, no recalcular)

**User Story:** Como jugador del modo infinito, quiero que el puntaje del ranking sea EXACTAMENTE el que vi en mi pantalla de game over, para que no haya dos números distintos para la misma partida.

### Acceptance Criteria

1. THE SYSTEM SHALL usar como score del sorted set el `endlessScore` que el juego ya calculó al game over (`finalScore` en `game-engine.ts` = `playedRounds × 1000 + segundos + comboScore`), SIN recalcularlo con una fórmula propia. El leaderboard NO define la fórmula de puntaje: la consume.
2. THE SYSTEM SHALL derivar `endlessScore` (y `playedRounds`, `durationSeconds`) del **estado de sesión persistido del game over**, no de valores enviados por el cliente (ver R6).
3. THE SYSTEM SHALL validar que el `endlessScore` derivado sea un entero no negativo antes de registrarlo; WHEN no lo es (sesión corrupta o inexistente) THE SYSTEM SHALL rechazar el registro sin escribir en el sorted set.
4. THE SYSTEM SHALL preservar la regla "más lejos manda, el tiempo desempata": ya la garantiza el término base (`playedRounds × 1000 + segundos`, con `segundos < 1000` por ronda); el `comboScore` suma skill por encima sin invertir el orden por rondas dentro de rangos normales de juego.
5. THE SYSTEM SHALL exponer la lógica de derivación/validación del score como función pura (recibe el estado de game over, devuelve el score validado o un rechazo), testeable sin Redis (TDD). NOTA: `sanitizeTeamName` sigue siendo la otra pieza de lógica pura de esta spec (R2); lo que se elimina es una `computeScore` que RECALCULE la fórmula — porque duplicaría e invalidaría la fuente de verdad.

## Requirement 2 — Identidad anónima: nombre de equipo validado

**User Story:** Como jugador anónimo, quiero ponerle un nombre a mi equipo al terminar la partida, para aparecer identificable en el ranking sin tener que crear una cuenta.

### Acceptance Criteria

1. WHEN una partida del modo infinito termina (game over) THE SYSTEM SHALL solicitar al jugador un nombre de equipo antes de registrar su puntaje.
2. THE SYSTEM SHALL validar el nombre de equipo como lógica pura: no vacío tras recortar espacios (`trim`), con una longitud máxima acotada (default 24 caracteres) y sanitizado (eliminar saltos de línea y caracteres de control, colapsar espacios).
3. WHEN el nombre de equipo es vacío tras recortar, o excede la longitud máxima, THE SYSTEM SHALL rechazar el registro con un mensaje en español neutro (`«Ingresa un nombre de equipo válido.»`) y NO escribir en el ranking.
4. THE SYSTEM SHALL persistir el nombre ya sanitizado, NUNCA el texto crudo, para que la vista del ranking nunca muestre saltos de línea ni caracteres de control.
5. THE SYSTEM SHALL exponer la validación/sanitización del nombre como función pura testeable, separada del acceso a Redis (TDD).

## Requirement 3 — Registro del puntaje en el sorted set

**User Story:** Como jugador, quiero que mi puntaje quede guardado en el ranking global al terminar, para competir contra todos los demás equipos.

### Acceptance Criteria

1. THE SYSTEM SHALL exponer `POST /api/game/leaderboard` que reciba `{ sessionId, token, teamName }`, valide el nombre (R2), verifique el token contra la sesión (R6.1) y derive el `endlessScore`/`playedRounds` del estado de game over persistido (R1.2) — NO recibe métricas crudas del cliente.
2. THE SYSTEM SHALL escribir la entrada con `ZADD leaderboard:global <endlessScore> <miembro>`, usando el `getRedis()` existente (mismo cliente `ioredis` singleton que las sesiones).
3. THE SYSTEM SHALL construir un miembro **único por entrada** (p. ej. nombre de equipo + un sufijo opaco corto de `randomBytes`), para que dos equipos con el mismo nombre, o el mismo equipo jugando dos veces, NO se pisen en el sorted set (donde el miembro es la clave única).
4. WHEN el registro tiene éxito THE SYSTEM SHALL devolver la posición (rank, 1-based, vía `ZREVRANK`) de la entrada recién creada y el top 10 actualizado, en una sola respuesta.
5. WHEN la validación de nombre falla THE SYSTEM SHALL responder `400`; WHEN el token no autoriza la sesión THE SYSTEM SHALL responder `403`; WHEN la sesión no está en game over válido THE SYSTEM SHALL rechazar el registro. En todos los casos NO tocar el sorted set.
6. THE SYSTEM SHALL evitar el registro duplicado de la MISMA partida: una sesión de game over ya registrada no debe poder registrarse dos veces (p. ej. marcar la sesión como `leaderboardRegistered` tras el primer registro, o derivar el miembro de forma idempotente por sesión). Un reintento del cliente no debe inflar el ranking con la misma partida.
7. WHERE no hay Redis configurado (dev local) THE SYSTEM SHALL usar un sorted set en memoria análogo al `Map` de sesiones, de modo que el flujo completo funcione en dev sin Valkey.

## Requirement 4 — Lectura del top 10

**User Story:** Como jugador o espectador, quiero ver el top 10 global de equipos, para saber quién llegó más lejos.

### Acceptance Criteria

1. THE SYSTEM SHALL exponer `GET /api/game/leaderboard` que devuelva el top 10 leyendo `ZREVRANGE leaderboard:global 0 9 WITHSCORES`.
2. THE SYSTEM SHALL devolver, por cada entrada, su posición (1-based), nombre de equipo, puntaje (`endlessScore`) y rondas alcanzadas (`playedRounds`). IMPORTANTE: como `endlessScore` ahora incluye `comboScore`, las rondas YA NO se pueden derivar con `floor(score / 1000)` (el combo contamina ese cálculo). Las rondas SE PERSISTEN junto a la entrada (hash paralelo `leaderboard:meta:<miembro>` con `{ playedRounds }`, o miembro que codifique el dato) — NO se derivan aritméticamente del score.
3. WHEN el sorted set tiene menos de 10 entradas THE SYSTEM SHALL devolver solo las existentes, en orden de mayor a menor puntaje.
4. WHEN el sorted set está vacío THE SYSTEM SHALL devolver una lista vacía (no un error), para que la vista muestre un estado «aún no hay puntajes».
5. THE SYSTEM SHALL ordenar de mayor a menor puntaje delegando el orden en el sorted set (NO ordenar en la app), porque esa es la razón de usar esta estructura.

## Requirement 5 — Vista del leaderboard y posición del jugador

**User Story:** Como jugador, quiero ver el top 10 y resaltada mi posición tras registrar mi puntaje, para saber en qué lugar quedé respecto del resto.

### Acceptance Criteria

1. THE SYSTEM SHALL mostrar una pantalla/sección de leaderboard con la tabla del top 10: posición, nombre de equipo, puntaje y rondas alcanzadas.
2. WHEN el jugador acaba de registrar su puntaje THE SYSTEM SHALL mostrarle su posición global (rank), incluso si esa posición está fuera del top 10 visible.
3. WHEN la posición del jugador está dentro del top 10 THE SYSTEM SHALL resaltar su fila en la tabla.
4. THE SYSTEM SHALL presentar toda la UI en español neutro (sin voseo), consistente con el resto del juego.
5. THE SYSTEM SHALL escapar/renderizar el nombre de equipo de forma segura (texto, nunca HTML interpretado), como segunda barrera además de la sanitización del registro (R2.4).

## Requirement 6 — Consideración de seguridad: scores no arbitrarios

**User Story:** Como responsable de la integridad del ranking, quiero que no se puedan inyectar puntajes falsos arbitrarios, para que el leaderboard refleje partidas reales y no peticiones fabricadas.

### Acceptance Criteria

1. THE SYSTEM SHALL atar el registro al **token de sesión** existente (el `coderToken` que el jugador ya porta) verificando `isAuthorizedFor(sessionId, 'coder', token)` — que YA existe — como camino POR DEFECTO, no como ideal opcional. Sin token válido → `403`, sin tocar el sorted set.
2. THE SYSTEM SHALL derivar `endlessScore` y `playedRounds` del **estado de sesión persistido del game over** (fuente de verdad del servidor), que ya está disponible vía la sesión leída por `sessionId`. El cliente envía solo `{ sessionId, token, teamName }`; NUNCA el score. Esto elimina la vía de puntajes fabricados de raíz.
3. THE SYSTEM SHALL verificar que la sesión esté efectivamente en game over del modo infinito (`mode === 'endless' && status === 'defeat'`) antes de registrar; una sesión en curso o inexistente no produce entrada.
4. THE SYSTEM SHALL validar el `endlessScore` derivado como entero no negativo bajo un tope razonable (defensa contra estado corrupto) antes del `ZADD`.
5. THE SYSTEM SHALL mantener cero `any` y sin `as` casts (salvo `as const`/`satisfies`) en el código nuevo.

## Out of scope

- La **mecánica del modo infinito** en sí (rondas sucesivas, game over) y la **dificultad adaptativa** — pertenecen a las specs hermanas (`endless-mode` y la de dificultad). Esta spec **depende** de `endless-mode` para obtener rondas resueltas y segundos sobrevividos.
- Leaderboards por idioma, por dificultad, por periodo (diario/semanal) o ligas: aquí solo hay **un** ranking global.
- Cuentas de usuario, login persistente o reclamar/editar un nombre de equipo ya registrado: la identidad sigue siendo anónima y por entrada.
- Antifraude fuerte (firmas, prueba de trabajo, detección de bots) más allá de la validación de rangos y el atado al token de sesión descrito en R6.
- Paginación más allá del top 10 o búsqueda de un equipo concreto en el ranking completo.
