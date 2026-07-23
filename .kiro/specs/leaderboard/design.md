# Design — Leaderboard global del modo infinito (leaderboard)

## Overview

El leaderboard descansa sobre una idea central: **dejar que la estructura de datos correcta haga el trabajo de ordenar**. Un ranking "top N por score" es exactamente lo que un **sorted set** de Redis/Valkey resuelve sin esfuerzo — la app nunca ordena en memoria, nunca recorre todas las entradas: `ZADD` inserta con un score, `ZREVRANGE` lee las mejores ya ordenadas, `ZREVRANK` ubica una entrada. Reusamos el Valkey de ElastiCache que YA está conectado para sesiones (mismo `getRedis()`), así que el leaderboard no agrega infraestructura: agrega una clave (`leaderboard:global`) y dos comandos.

El cambio se reparte en cuatro capas, de adentro hacia afuera, calcando la separación que ya usa el resto del juego (lógica pura testeable ↔ acceso a Redis ↔ route handler fino ↔ vista):

- **Lógica pura** (`leaderboard-score.ts`): cálculo de puntaje y validación/sanitización del nombre de equipo, sin tocar Redis ni red — testeable en aislamiento (TDD).
- **Servicio** (`game-service.ts` o `leaderboard-store.ts`): orquesta `ZADD`/`ZREVRANGE`/`ZREVRANK` sobre `getRedis()`, con el **fallback en memoria** análogo al `Map` de sesiones para dev sin Valkey.
- **Endpoints** (`app/api/game/leaderboard/route.ts`): `POST` registra, `GET` lee el top 10 — handlers finos que validan, llaman al servicio y traducen a `NextResponse`.
- **Vista** (componente de leaderboard + el game over del modo infinito): pide el nombre, registra y muestra el top 10 con la posición del jugador resaltada.

El principio rector: **el puntaje es la fuente de verdad del juego (`endlessScore`, con combos), NO se recalcula aquí; la validación del nombre es pura y testeable; Redis solo almacena y ordena; el registro se ata al token de sesión.**

> **Nota de refinamiento (2026-07-03).** La v1 de esta spec (24-jun) definía una `computeScore(rounds, seconds)` propia. Tras mergearse `scoring-and-combos`, el puntaje real del juego pasó a incluir `comboScore` (`endlessScore = base + comboScore`, `game-engine.ts`). Recalcular aquí produciría un número DISTINTO al que el jugador vio en su game over. El refinamiento: **el leaderboard lee `endlessScore` del estado persistido y lo usa tal cual** — sin fórmula propia. Todo lo demás de la spec (sorted set, fallback en memoria, sanitización, seguridad) se conserva.

## Modelo de datos en el sorted set

```
Clave:   leaderboard:global          (un único ranking global)
Score:   endlessScore                (el del game over, YA incluye combos — NO se recalcula)
Miembro: <nombreSanitizado>#<sufijoOpaco>   → único por entrada
Meta:    leaderboard:meta:<miembro>  → { playedRounds }   (persistido, NO derivado)
```

El **miembro debe ser único** porque en un sorted set el miembro es la clave: un `ZADD` con un miembro repetido **actualiza** el score en vez de crear una entrada nueva. Si usáramos solo el nombre, dos equipos "Los Debuggers" colisionarían y el segundo pisaría al primero. El sufijo opaco corto (hex de `randomBytes`, reusando `session-credentials.ts`) garantiza unicidad. El nombre legible se recupera partiendo el miembro por el último `#`.

**Rondas en la vista — YA NO se derivan del score.** En la v1, `rondas = floor(score / 1000)` funcionaba porque el score era exactamente `rondas×1000 + segundos`. Ahora `endlessScore = rondas×1000 + segundos + comboScore`, así que `floor(score / 1000)` estaría **contaminado por el combo** y daría rondas incorrectas (p. ej. score 5450 con 5 rondas + 450 s daría floor=5, pero si además hay 300 de combo daría 5750 → floor=5, y con combos altos el arrastre puede sumar una ronda fantasma). Por eso `playedRounds` se **persiste** en un hash paralelo `leaderboard:meta:<miembro> = { playedRounds }`, escrito en el mismo registro. La tabla lee las rondas de ahí, no las calcula. Esto ya no es "plan B": es obligatorio dado que el score lleva combos.

## Flujo de registro y lectura

```
Game over (modo infinito)
  │  el front pide el nombre de equipo  ── validación cliente (UX) ──
  │
  │  POST /api/game/leaderboard { sessionId, token, teamName }   ← SIN métricas del cliente
  │     ├─ sanitizeTeamName(teamName)            (pura) → 400 si inválido
  │     ├─ isAuthorizedFor(sessionId,'coder',token)  → 403 si no autoriza   (POR DEFECTO)
  │     ├─ leer sesión persistida; exigir mode==='endless' && status==='defeat'
  │     ├─ endlessScore, playedRounds ← del estado de game over (buildEndlessGameOverMeta)
  │     │       (NO se recalcula; ya incluye comboScore)
  │     ├─ validar endlessScore entero ≥ 0 bajo tope  → rechazar si corrupto
  │     ├─ idempotencia: si la sesión ya se registró → no duplicar (R3.6)
  │     ├─ miembro = `${nombreSanitizado}#${sufijoOpaco}`
  │     ├─ ZADD leaderboard:global <endlessScore> <miembro>
  │     ├─ HSET leaderboard:meta:<miembro> playedRounds <playedRounds>
  │     ├─ rank = ZREVRANK leaderboard:global <miembro>   (+1 → 1-based)
  │     └─ top  = ZREVRANGE leaderboard:global 0 9 WITHSCORES  (+ meta de cada miembro)
  │  ◄── { rank, entries: Top10[] }
  │
  │  GET /api/game/leaderboard
  │     └─ ZREVRANGE leaderboard:global 0 9 WITHSCORES  (+ playedRounds del meta)
  │  ◄── { entries: Top10[] }   (lista vacía si no hay puntajes)
```

La **lectura no exige token** (igual que `/state` y `/sync` en security-hardening: conocer el ranking es público). El **registro se ata al token de sesión por defecto** (R6) y deriva el score del servidor — el cliente no manda métricas, así que no hay vía para puntajes fabricados.

## Archivos

```
src/features/game/
  leaderboard-score.ts          ← sanitizeTeamName(raw): { ok, name } | { ok:false, reason };
                                   scoreFromGameOver(session): { ok, endlessScore, playedRounds }
                                     | { ok:false, reason }   (deriva y valida del estado de
                                     game over; NO recalcula la fórmula)
                                   (PURO — sin Redis, sin red)
                                   NOTA: NO hay computeScore(rounds, seconds). El score es
                                   endlessScore, ya calculado por el engine (con combos).
  leaderboard-score.test.ts     ← nombre vacío, largo, con control chars / saltos de línea,
                                   colapso de espacios; scoreFromGameOver con sesión de game
                                   over válida → score correcto, sesión en curso → rechazo,
                                   endlessScore corrupto/negativo → rechazo
  leaderboard-store.ts          ← registerScore / readTop10 / rankOf usando getRedis()
                                   (zadd/zrevrange/zrevrank + hset/hget del meta) + fallback
                                   en memoria (sorted set + meta simulados) cuando
                                   getRedis() === null  (dev)
  game-types.ts                 ← + LeaderboardEntry, LeaderboardTop, RegisterScoreInput
                                     ({ sessionId, token, teamName }), RegisterScoreResult
  game-service.ts               ← reusar isAuthorizedFor + lectura de sesión + marcar
                                     la sesión como registrada (idempotencia, R3.6)
app/api/game/leaderboard/
  route.ts                      ← POST (registrar, ata al token) + GET (top 10), handlers finos
app/  (modo infinito)
  endless game-over view        ← pide nombre de equipo → POST { sessionId, token, teamName }
                                     → muestra top 10 + posición
src/components/                  ← Leaderboard (tabla top 10), fila resaltada del jugador
```

`leaderboard-store.ts` se separa de `game-service.ts` para no inflar ese archivo; si se prefiere homogeneidad con el resto del juego, las funciones pueden vivir en `game-service.ts` reutilizando `getRedis()`. El criterio: la **lógica pura** (`leaderboard-score.ts`) SIEMPRE va aparte y testeada; el acceso a Redis puede ir donde encaje mejor con la convención del repo.

## Decisiones técnicas

### Por qué sorted set y no una lista o un hash

| Estructura | Insertar | Leer top N ordenado | Posición de uno | Veredicto |
|---|---|---|---|---|
| Lista (`LPUSH` + ordenar en app) | O(1) | la app ordena TODO en memoria | recorrer todo | mal — la app hace el trabajo del store |
| Hash (`HSET` por equipo) | O(1) | sin orden — la app ordena TODO | recorrer todo | mal — no hay orden nativo |
| **Sorted set (`ZADD`/`ZREVRANGE`/`ZREVRANK`)** | O(log n) | **nativo, ya ordenado** | **`ZREVRANK` directo** | **correcto** |

El sorted set existe para esto: el ranking se mantiene ordenado por score en inserción, leer el top 10 es `ZREVRANGE 0 9` y ubicar a un jugador es `ZREVRANK` — ninguna de las dos operaciones recorre todo el set. Elegir lista o hash sería pelear contra el store haciendo a mano lo que Redis ya hace.

### Puntaje: fuente única (leer del game over, no recalcular)

El score del sorted set es el `endlessScore` que el engine ya calculó: `finalScore(base, comboScore)` donde `base = playedRounds × 1000 + segundos`. El factor `1000` en la base "empuja" las rondas a un orden de magnitud superior al tiempo, así que **más lejos > más rápido** dentro de la misma cantidad de combos; el `comboScore` premia el skill de encadenar aciertos por encima. La base es total siempre que `segundos < 1000` por ronda (holgado para el modo infinito).

Lo que esta spec NO hace: reimplementar esa fórmula. `scoreFromGameOver(session)` LEE `endlessScore` de `buildEndlessGameOverMeta` (o del campo ya expuesto en la vista de game over) y solo lo VALIDA (entero ≥ 0, bajo tope). Toda la dificultad de "qué desempata qué" ya está capturada y testeada en `combo-scoring.test.ts` del juego, no se duplica aquí. Duplicarla es exactamente lo que rompería la consistencia con la pantalla que el jugador ya vio.

### Validación y sanitización del nombre (pura, antes de Redis)

`sanitizeTeamName(raw)` hace, en orden: `trim` → eliminar caracteres de control y saltos de línea → colapsar espacios múltiples → recortar a `MAX_TEAM_NAME = 24`. Devuelve un discriminated union `{ ok: true, name } | { ok: false, reason }` (sin `as`, sin `any`). El route handler traduce `ok:false` a `400` con el mensaje en español. Se guarda **solo** el nombre sanitizado, nunca el crudo — esa es la primera barrera; el render como texto plano en la vista (R5.5) es la segunda. Defensa en profundidad: el nombre nunca es HTML interpretado ni contiene control chars que ensucien la tabla.

### Miembro único: nombre + sufijo opaco

Como el miembro es la clave del sorted set, se compone `` `${name}#${suffix}` `` donde `suffix` sale de `crypto.randomBytes` (hex corto), reutilizando el mismo enfoque CSPRNG que `session-credentials.ts`. Esto evita que dos equipos homónimos —o el mismo equipo en dos partidas— se sobrescriban. La vista parte por el último `#` para mostrar el nombre legible.

### Fallback en memoria para dev (análogo al Map de sesiones)

`game-service.ts` ya degrada a un `Map` en memoria cuando `getRedis()` devuelve `null` (solo dev; en producción lanza). El leaderboard replica ese patrón con un **sorted set simulado en proceso**: una estructura ordenada por score en memoria que implementa las tres operaciones (`zadd`/`zrevrange`/`zrevrank`) lo justo para que el flujo completo —registrar, leer top 10, ver posición— funcione en `npm run dev` sin Valkey. En producción nunca se usa: `getRedis()` devuelve el cliente real (o lanza si falta `REDIS_HOST`).

### Endpoints (convención `app/api/game/*/route.ts`)

Un único route handler `app/api/game/leaderboard/route.ts` con `POST` (registrar) y `GET` (leer), espejando handlers existentes como `answer/route.ts`:

- `POST`: parsea el cuerpo, valida (nombre + métricas) vía la lógica pura, opcionalmente verifica el token de sesión (R6), registra y responde `{ rank, entries }`. `400` si la validación falla; `403` si se exige token y no coincide.
- `GET`: lee el top 10 y responde `{ entries }` (lista vacía si no hay nada). Sin token.
- Marcado dinámico / `no-store`: el ranking es estado vivo, no debe cachearse entre lecturas.

### Seguridad: no aceptar scores arbitrarios

El registro NO es un buzón abierto para puntajes fabricados — y ahora eso es el camino POR DEFECTO, no una aspiración, porque toda la infraestructura ya existe:

1. **Atado al token de sesión** (por defecto): el jugador del modo infinito ya porta el `coderToken` (de security-hardening). El `POST` verifica `isAuthorizedFor(sessionId, 'coder', token)` — que YA existe y es el guard de todos los demás endpoints — → `403` si no autoriza.
2. **Score derivado del servidor** (por defecto): el cliente envía `{ sessionId, token, teamName }`, NUNCA el score. El servidor lee la sesión, exige `mode==='endless' && status==='defeat'`, y toma `endlessScore`/`playedRounds` del estado de game over (`buildEndlessGameOverMeta`, ya disponible vía `withEndMeta`). No hay métrica cruda del cliente que fabricar.
3. **Validación de cordura** (siempre): `endlessScore` entero ≥ 0 bajo tope razonable — defensa contra estado corrupto, no contra el cliente (que ya no manda el score).
4. **Idempotencia** (R3.6): marcar la sesión como registrada tras el primer `ZADD`; un reintento no infla el ranking con la misma partida.

Lo que la v1 marcaba como "ideal / depende de qué exponga endless-mode" hoy es trivial: endless-mode ya expone `endlessScore`/`playedRounds` en el game over, e `isAuthorizedFor` ya está. El atado NO es opcional en el refinamiento.

## Componentes afectados

| Archivo | Cambio |
|---|---|
| `src/features/game/leaderboard-score.ts` | NUEVO — `sanitizeTeamName` + `scoreFromGameOver` (puro; NO `computeScore`) |
| `src/features/game/leaderboard-score.test.ts` | NUEVO — validación de nombre + derivación/validación del score desde game over |
| `src/features/game/leaderboard-store.ts` | NUEVO — `registerScore`/`readTop10`/`rankOf` (Redis: zadd/zrevrange/zrevrank + hset/hget del meta; + fallback memoria) |
| `src/features/game/game-types.ts` | + `LeaderboardEntry`, `LeaderboardTop`, `RegisterScoreInput` (`{ sessionId, token, teamName }`), `RegisterScoreResult`; opcional flag de idempotencia en `GameSession` |
| `src/features/game/game-service.ts` | reusar `isAuthorizedFor` + lectura de sesión + marcar sesión registrada (idempotencia) |
| `app/api/game/leaderboard/route.ts` | NUEVO — `POST` (ata al token, deriva el score) + `GET` top 10 |
| vista de game over (modo infinito) | pide nombre, `POST { sessionId, token, teamName }`, muestra top 10 + posición |
| `src/components/...` (Leaderboard) | NUEVO — tabla del top 10, fila del jugador resaltada |

## Testing

- **Unitario (puro, sin Redis):** `sanitizeTeamName` — vacío tras trim, supera el máximo, control chars / saltos de línea eliminados, espacios colapsados, nombre válido pasa. `scoreFromGameOver` — sesión de game over endless válida → `{ ok, endlessScore, playedRounds }` correctos (incluidos combos); sesión en curso o mode classic → rechazo; `endlessScore` negativo/corrupto → rechazo.
- **Store con fallback en memoria:** registrar varias entradas y verificar el orden del top 10 por `endlessScore`, la posición (`rankOf`), el corte en 10, que dos nombres iguales NO se pisan (miembro único), y que las **rondas leídas salen del meta persistido** (no de `floor(score/1000)`, que con combos daría mal). Sin levantar Valkey real.
- **Consistencia de score (clave):** un test que arme una sesión de game over con combos y verifique que el score registrado == el `endlessScore` de la vista de game over (el mismo número que vio el jugador). Este test es el guardrail contra la regresión que motivó el refinamiento.
- **Idempotencia:** registrar dos veces la misma sesión no crea dos entradas.
- **Sin regresión:** la suite existente sigue verde; el contrato de `GameSession` no cambia (salvo el flag opcional de idempotencia) y los demás route handlers no cambian.
- tsc 0 errores, lint 0 warnings, cero `any` / sin `as`.

## Manejo de errores y degradaciones

| Situación | Respuesta del sistema |
|---|---|
| Nombre vacío tras trim o supera el máximo | `400` `«Ingresa un nombre de equipo válido.»` — no se escribe en el sorted set |
| Rondas/segundos negativos, no enteros o fuera de tope | `400` — no se calcula puntaje ni se registra |
| Token de sesión ausente/incorrecto (si se exige, R6) | `403` `«No autorizado para esta partida.»` |
| Sin Redis (dev local) | sorted set en memoria — el flujo completo funciona sin Valkey |
| Sin `REDIS_HOST` en producción | `getRedis()` lanza (heredado de sesiones) — no degrada en silencio |
| Sorted set vacío en `GET` | `200` con `entries: []` — la vista muestra «aún no hay puntajes» |

## Riesgos y mitigaciones

- **Riesgo (el que motivó el refinamiento):** el ranking muestra un puntaje distinto al que el jugador vio en su game over. **Mitigación:** fuente única — el leaderboard LEE `endlessScore` (con combos) del servidor, no lo recalcula; un test de consistencia lo garantiza.
- **Riesgo:** scores fabricados. **Mitigación:** atado al token (`isAuthorizedFor`) + score derivado del estado persistido; el cliente no manda el score. Esto ya no es "preferente", es el diseño por defecto.
- **Riesgo:** rondas mal mostradas por derivarlas del score contaminado con combos. **Mitigación:** `playedRounds` se persiste en `leaderboard:meta:<miembro>`, no se calcula con `floor(score/1000)`.
- **Riesgo:** colisión de miembros homónimos sobrescribiendo entradas. **Mitigación:** miembro único `nombre#sufijoOpaco` (CSPRNG), nunca solo el nombre.
- **Riesgo:** XSS via nombre de equipo. **Mitigación:** sanitización al registrar (control chars / saltos de línea fuera, longitud acotada) + render como texto plano en la vista — doble barrera.
- **Riesgo:** registro duplicado de la misma partida por reintento del cliente. **Mitigación:** idempotencia por sesión (R3.6).

## Out of scope

Leaderboards por idioma/dificultad/periodo o ligas, cuentas de usuario y reclamar nombres, antifraude fuerte (firmas / prueba de trabajo), paginación más allá del top 10 y búsqueda en el ranking completo. La mecánica del modo infinito y la dificultad adaptativa pertenecen a las specs hermanas (`endless-mode` y la de dificultad), de las que esta spec **depende** para obtener rondas resueltas y segundos sobrevividos.
