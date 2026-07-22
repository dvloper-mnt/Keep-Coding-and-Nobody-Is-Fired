# Requirements — Leaderboard global del modo infinito (leaderboard)

## Introduction

El juego "Keep Coding and Nobody Is Fired" es **anónimo**: no hay login ni cuentas. Hoy una partida termina (game over) y el resultado se pierde — no queda registro de qué tan lejos llegó un equipo. Esta spec agrega un **leaderboard global de top 10** para el **modo infinito**: al terminar una partida de ese modo, se le pide al jugador un **nombre de equipo** (ej. "Los Debuggers"), se calcula su **puntaje** y se guarda en un ranking global compartido. Después se le muestra el top 10 y **su posición** dentro de él.

**Decisión de arquitectura clave:** el ranking vive en un **Redis Sorted Set** del Valkey que YA está conectado (AWS ElastiCache, mismo cliente `ioredis` singleton que usan las sesiones). `ZADD` para guardar, `ZREVRANGE` para leer el top 10. Los sorted sets de Redis están hechos exactamente para rankings: mantienen el orden por score sin que la app tenga que ordenar nada. La clave es `leaderboard:global`.

**El puntaje cuenta una sola historia:** qué tan lejos llegaste manda; el tiempo solo desempata. `puntaje = (rondas resueltas × 1000) + segundos totales sobrevividos`. Ejemplo: 12 rondas resueltas y 300 s sobrevividos → `12 × 1000 + 300 = 12300` pts. Así, un equipo que llegó a la ronda 12 SIEMPRE queda por encima de uno que llegó a la 11, sin importar el tiempo; y entre dos equipos de la misma ronda, gana el que sobrevivió más segundos.

**Relato de hackathon:** el leaderboard convierte cada partida en un reto social ("¿quién llega más lejos?") y demuestra otro uso del Valkey de AWS más allá de las sesiones — un ranking en tiempo real, sin base de datos relacional, con la estructura de datos correcta para el problema.

### Contexto verificado

- `src/features/game/game-service.ts` ya tiene `getRedis()` (singleton `ioredis`, `lazyConnect`) y el patrón `getSessionFromStore`/`setSessionToStore` (uso de `get`/`set`/`incr`/`expire`). El leaderboard usaría el mismo `getRedis()` con `zadd`/`zrevrange`.
- **Gotcha de dev confirmado:** sin `REDIS_HOST`, `getRedis()` devuelve `null` y las sesiones caen a un `Map` en memoria (solo dev). El leaderboard necesita un **fallback en memoria análogo** (un sorted set simulado en proceso) para que el dev funcione sin Valkey, igual que hacen hoy las sesiones.
- En **producción** `getRedis()` lanza si falta `REDIS_HOST` (no degrada en silencio). El leaderboard hereda esa garantía: en producción siempre habrá Valkey real.
- Los endpoints siguen el patrón `app/api/game/*/route.ts` (ver `answer/route.ts`, `start/route.ts`): handlers finos que validan el cuerpo, llaman al servicio y traducen el resultado a `NextResponse`.
- El proyecto mantiene **cero `any`**, **sin `as` casts** (salvo `as const`/`satisfies`), **TDD en la lógica pura** y la **UI en español neutro** (sin voseo).

## Glossary

- **Modo infinito (endless mode)**: modo de juego donde el jugador resuelve rondas sucesivas hasta perder (game over). Aporta dos métricas para el puntaje: **rondas resueltas** y **segundos totales sobrevividos**. Su mecánica se especifica en la spec hermana `endless-mode`.
- **Nombre de equipo (team name)**: cadena que el jugador escribe al terminar la partida del modo infinito para identificar su entrada en el ranking. No es una cuenta ni un login: es solo una etiqueta para esa entrada.
- **Puntaje (score)**: entero `(rondas × 1000) + segundos sobrevividos`. Es el *score* del sorted set.
- **Sorted set**: estructura de Redis/Valkey que mantiene miembros ordenados por un score numérico. `ZADD` inserta/actualiza; `ZREVRANGE ... WITHSCORES` lee de mayor a menor.
- **Top 10**: las 10 entradas de mayor puntaje del sorted set `leaderboard:global`, leídas con `ZREVRANGE leaderboard:global 0 9 WITHSCORES`.
- **Posición (rank)**: el lugar 1-based de una entrada dentro del ranking global, obtenido con `ZREVRANK`.

---

## Requirement 1 — Cálculo del puntaje (lógica pura)

**User Story:** Como jugador del modo infinito, quiero que mi puntaje refleje primero qué tan lejos llegué y use el tiempo solo como desempate, para que avanzar una ronda más siempre valga más que cualquier diferencia de segundos.

### Acceptance Criteria

1. THE SYSTEM SHALL calcular el puntaje como `(rondasResueltas × 1000) + segundosSobrevividos`, devolviendo un entero.
2. THE SYSTEM SHALL tratar `rondasResueltas` y `segundosSobrevividos` como enteros no negativos; WHEN cualquiera de los dos es negativo, no entero o no numérico THE SYSTEM SHALL rechazar la entrada (no producir un puntaje).
3. THE SYSTEM SHALL garantizar que un equipo con MÁS rondas resueltas obtiene SIEMPRE mayor puntaje que uno con menos rondas, sin importar los segundos, asumiendo `segundosSobrevividos < 1000` por ronda (el tiempo solo desempata dentro de la misma ronda).
4. THE SYSTEM SHALL exponer este cálculo como una función pura, sin dependencias de Redis ni de la red, para poder testearla en aislamiento (TDD).

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

1. THE SYSTEM SHALL exponer `POST /api/game/leaderboard` que reciba el nombre de equipo y las métricas del modo infinito (rondas resueltas, segundos sobrevividos), valide ambos (R1, R2) y registre la entrada.
2. THE SYSTEM SHALL escribir la entrada con `ZADD leaderboard:global <puntaje> <miembro>`, usando el `getRedis()` existente (mismo cliente `ioredis` singleton que las sesiones).
3. THE SYSTEM SHALL construir un miembro **único por entrada** (p. ej. nombre de equipo + un sufijo opaco corto), para que dos equipos con el mismo nombre, o el mismo equipo jugando dos veces, NO se pisen en el sorted set (donde el miembro es la clave única).
4. WHEN el registro tiene éxito THE SYSTEM SHALL devolver la posición (rank, 1-based, vía `ZREVRANK`) de la entrada recién creada y el top 10 actualizado, en una sola respuesta.
5. WHEN la validación de nombre o métricas falla THE SYSTEM SHALL responder `400` con el mensaje en español correspondiente y NO tocar el sorted set.
6. WHERE no hay Redis configurado (dev local) THE SYSTEM SHALL usar un sorted set en memoria análogo al `Map` de sesiones, de modo que el flujo completo funcione en dev sin Valkey.

## Requirement 4 — Lectura del top 10

**User Story:** Como jugador o espectador, quiero ver el top 10 global de equipos, para saber quién llegó más lejos.

### Acceptance Criteria

1. THE SYSTEM SHALL exponer `GET /api/game/leaderboard` que devuelva el top 10 leyendo `ZREVRANGE leaderboard:global 0 9 WITHSCORES`.
2. THE SYSTEM SHALL devolver, por cada entrada, su posición (1-based), nombre de equipo, puntaje y rondas alcanzadas; las rondas se derivan del puntaje (`floor(puntaje / 1000)`) o se persisten junto a la entrada.
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

1. THE SYSTEM SHALL validar en el servidor los rangos de las métricas recibidas (rondas y segundos no negativos, dentro de topes razonables) antes de calcular y registrar el puntaje, de modo que un cuerpo malformado no produzca una entrada.
2. THE SYSTEM SHALL considerar (y documentar como ideal) atar el registro al **token de sesión** existente del modo infinito (el `coderToken` que ya porta el jugador), de modo que solo se registre el puntaje de una partida real y terminada, en vez de aceptar métricas crudas de cualquier cliente.
3. WHERE la verificación contra la sesión esté disponible, THE SYSTEM SHALL preferir derivar rondas y segundos del **estado de sesión persistido** del game over (fuente de verdad del servidor) antes que confiar en valores enviados por el cliente.
4. THE SYSTEM SHALL mantener cero `any` y sin `as` casts (salvo `as const`/`satisfies`) en el código nuevo.

## Out of scope

- La **mecánica del modo infinito** en sí (rondas sucesivas, game over) y la **dificultad adaptativa** — pertenecen a las specs hermanas (`endless-mode` y la de dificultad). Esta spec **depende** de `endless-mode` para obtener rondas resueltas y segundos sobrevividos.
- Leaderboards por idioma, por dificultad, por periodo (diario/semanal) o ligas: aquí solo hay **un** ranking global.
- Cuentas de usuario, login persistente o reclamar/editar un nombre de equipo ya registrado: la identidad sigue siendo anónima y por entrada.
- Antifraude fuerte (firmas, prueba de trabajo, detección de bots) más allá de la validación de rangos y el atado al token de sesión descrito en R6.
- Paginación más allá del top 10 o búsqueda de un equipo concreto en el ranking completo.
