# Design — Leaderboard global del modo infinito (leaderboard)

## Overview

El leaderboard descansa sobre una idea central: **dejar que la estructura de datos correcta haga el trabajo de ordenar**. Un ranking "top N por score" es exactamente lo que un **sorted set** de Redis/Valkey resuelve sin esfuerzo — la app nunca ordena en memoria, nunca recorre todas las entradas: `ZADD` inserta con un score, `ZREVRANGE` lee las mejores ya ordenadas, `ZREVRANK` ubica una entrada. Reusamos el Valkey de ElastiCache que YA está conectado para sesiones (mismo `getRedis()`), así que el leaderboard no agrega infraestructura: agrega una clave (`leaderboard:global`) y dos comandos.

El cambio se reparte en cuatro capas, de adentro hacia afuera, calcando la separación que ya usa el resto del juego (lógica pura testeable ↔ acceso a Redis ↔ route handler fino ↔ vista):

- **Lógica pura** (`leaderboard-score.ts`): cálculo de puntaje y validación/sanitización del nombre de equipo, sin tocar Redis ni red — testeable en aislamiento (TDD).
- **Servicio** (`game-service.ts` o `leaderboard-store.ts`): orquesta `ZADD`/`ZREVRANGE`/`ZREVRANK` sobre `getRedis()`, con el **fallback en memoria** análogo al `Map` de sesiones para dev sin Valkey.
- **Endpoints** (`app/api/game/leaderboard/route.ts`): `POST` registra, `GET` lee el top 10 — handlers finos que validan, llaman al servicio y traducen a `NextResponse`.
- **Vista** (componente de leaderboard + el game over del modo infinito): pide el nombre, registra y muestra el top 10 con la posición del jugador resaltada.

El principio rector: **la lógica de puntaje y nombre es pura y testeable; Redis solo almacena y ordena; el contrato de sesión del juego no cambia.**

## Modelo de datos en el sorted set

```
Clave:   leaderboard:global   (un único ranking global)
Score:   (rondasResueltas × 1000) + segundosSobrevividos   → entero
Miembro: <nombreSanitizado>#<sufijoOpaco>   → único por entrada
```

El **miembro debe ser único** porque en un sorted set el miembro es la clave: un `ZADD` con un miembro repetido **actualiza** el score en vez de crear una entrada nueva. Si usáramos solo el nombre, dos equipos "Los Debuggers" colisionarían y el segundo pisaría al primero. El sufijo opaco corto (p. ej. 6-8 hex de `crypto.randomBytes`) garantiza unicidad sin exponer nada sensible. El nombre legible se recupera partiendo el miembro por `#` (o se persiste aparte, ver más abajo).

**Rondas en la vista:** el puntaje codifica las rondas de forma recuperable — `rondas = floor(score / 1000)` y `segundos = score mod 1000` —, así que la tabla puede mostrar "rondas alcanzadas" derivándolo del score sin guardar nada extra. Solo si quisiéramos disociar rondas y segundos visualmente con total seguridad ante topes, se persiste un pequeño hash paralelo `leaderboard:meta:<miembro>` con `{ rounds, seconds }`. La derivación por aritmética es la opción por defecto (cero estado extra); el hash es el plan B documentado.

## Flujo de registro y lectura

```
Game over (modo infinito)
  │  el front pide el nombre de equipo  ── validación cliente (UX) ──
  │
  │  POST /api/game/leaderboard { sessionId, token, teamName, rounds?, seconds? }
  │     ├─ sanitizeTeamName(teamName)            (pura) → 400 si inválido
  │     ├─ (ideal) isAuthorizedFor(sessionId,'coder',token)  → atar a partida real
  │     ├─ (ideal) derivar rounds/seconds del estado de sesión persistido (game over)
  │     ├─ computeScore(rounds, seconds)         (pura) → 400 si fuera de rango
  │     ├─ miembro = `${nombre}#${sufijoOpaco}`
  │     ├─ ZADD leaderboard:global <score> <miembro>
  │     ├─ rank = ZREVRANK leaderboard:global <miembro>   (+1 → 1-based)
  │     └─ top  = ZREVRANGE leaderboard:global 0 9 WITHSCORES
  │  ◄── { rank, entries: Top10[] }
  │
  │  GET /api/game/leaderboard
  │     └─ ZREVRANGE leaderboard:global 0 9 WITHSCORES
  │  ◄── { entries: Top10[] }   (lista vacía si no hay puntajes)
```

La **lectura no exige token** (igual que `/state` y `/sync` en security-hardening: conocer el ranking es público). El **registro** sí debería atarse al token de sesión (R6) para no aceptar métricas fabricadas.

## Archivos

```
src/features/game/
  leaderboard-score.ts          ← computeScore(rounds, seconds): número;
                                   sanitizeTeamName(raw): { ok, name } | { ok:false, reason }
                                   (PURO — sin Redis, sin red)
  leaderboard-score.test.ts     ← cubre fórmula, "rondas mandan / tiempo desempata",
                                   rechazo de negativos/no-enteros; nombre vacío, largo,
                                   con control chars / saltos de línea, colapso de espacios
  leaderboard-store.ts          ← registerScore / readTop10 / rankOf usando getRedis()
                                   (zadd/zrevrange/zrevrank) + fallback en memoria (sorted
                                   set simulado) cuando getRedis() === null  (dev)
  game-types.ts                 ← + LeaderboardEntry, LeaderboardTop, RegisterScoreInput,
                                     RegisterScoreResult
app/api/game/leaderboard/
  route.ts                      ← POST (registrar) + GET (top 10), handlers finos
app/  (modo infinito)
  endless game-over view        ← pide nombre de equipo → POST → muestra top 10 + posición
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

### Fórmula de puntaje: rondas en los miles, segundos en las unidades

`score = rounds × 1000 + seconds`. El factor `1000` "empuja" las rondas a un orden de magnitud superior al tiempo, así que el orden lexicográfico por score respeta la regla del producto: **más lejos > más rápido**. La fórmula es total siempre que `seconds < 1000` por ronda (asumible: una ronda que dura 1000 s ya no es jugable); si una ronda pudiera durar ≥ 1000 s habría que ampliar el factor, pero para el modo infinito 1000 es holgado. La función es pura: recibe dos enteros, devuelve uno; toda la dificultad del feature (qué desempata qué) queda capturada en un test unitario, no en una query.

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

El registro NO debe ser un buzón abierto para puntajes fabricados. Dos capas:

1. **Validación de rangos en servidor** (siempre): rondas y segundos enteros, no negativos, bajo topes razonables; un cuerpo fuera de rango → `400`, sin tocar Redis.
2. **Atado al token de sesión** (ideal, R6.2/R6.3): el jugador del modo infinito ya porta el `coderToken` (de security-hardening). Lo correcto es verificar `isAuthorizedFor(sessionId, 'coder', token)` y, mejor aún, **derivar rondas y segundos del estado de sesión persistido del game over** (fuente de verdad del servidor) en vez de confiar en las métricas que manda el cliente. Esto se diseña como el camino preferente; el alcance exacto del atado depende de qué expone la spec `endless-mode` al cerrar la partida.

## Componentes afectados

| Archivo | Cambio |
|---|---|
| `src/features/game/leaderboard-score.ts` | NUEVO — `computeScore`, `sanitizeTeamName` (puro) |
| `src/features/game/leaderboard-score.test.ts` | NUEVO — tests de fórmula y validación de nombre |
| `src/features/game/leaderboard-store.ts` | NUEVO — `registerScore`/`readTop10`/`rankOf` (Redis + fallback memoria) |
| `src/features/game/game-types.ts` | + tipos `LeaderboardEntry`, `LeaderboardTop`, `RegisterScoreInput`, `RegisterScoreResult` |
| `app/api/game/leaderboard/route.ts` | NUEVO — `POST` registrar + `GET` top 10 |
| vista de game over (modo infinito) | pide nombre, registra, muestra top 10 + posición |
| `src/components/...` (Leaderboard) | NUEVO — tabla del top 10, fila del jugador resaltada |

## Testing

- **Unitario (puro, sin Redis):** `computeScore` — fórmula exacta del ejemplo (12 rondas, 300 s → 12300), "más rondas siempre gana", rechazo de negativos/no-enteros. `sanitizeTeamName` — vacío tras trim, supera el máximo, control chars / saltos de línea eliminados, espacios colapsados, nombre válido pasa.
- **Store con fallback en memoria:** registrar varias entradas y verificar el orden del top 10, la posición (`rankOf`), el corte en 10, y que dos nombres iguales NO se pisan (miembro único). Sin levantar Valkey real (igual que los tests de sesiones corren sobre el `Map`).
- **Sin regresión:** la suite existente sigue verde; el contrato de `GameSession` y los demás route handlers no cambian.
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

- **Riesgo:** scores fabricados si el `POST` confía ciegamente en las métricas del cliente. **Mitigación:** validación de rangos en servidor (siempre) + atado al token de sesión y derivación de métricas desde el estado persistido del game over (R6) como camino preferente.
- **Riesgo:** colisión de miembros homónimos sobrescribiendo entradas. **Mitigación:** miembro único `nombre#sufijoOpaco` (CSPRNG), nunca solo el nombre.
- **Riesgo:** XSS via nombre de equipo. **Mitigación:** sanitización al registrar (control chars / saltos de línea fuera, longitud acotada) + render como texto plano en la vista — doble barrera.
- **Riesgo:** el `score = rounds×1000 + seconds` se rompe si una ronda dura ≥ 1000 s. **Mitigación:** asumido holgado para el modo infinito; documentado el ajuste del factor si esa premisa cambiara.
- **Riesgo de demo:** depender de `endless-mode` para las métricas. **Mitigación:** la lógica pura (`computeScore`, `sanitizeTeamName`) y el store se construyen y testean independientes; el atado a las métricas reales es el último cable a conectar.

## Out of scope

Leaderboards por idioma/dificultad/periodo o ligas, cuentas de usuario y reclamar nombres, antifraude fuerte (firmas / prueba de trabajo), paginación más allá del top 10 y búsqueda en el ranking completo. La mecánica del modo infinito y la dificultad adaptativa pertenecen a las specs hermanas (`endless-mode` y la de dificultad), de las que esta spec **depende** para obtener rondas resueltas y segundos sobrevividos.
