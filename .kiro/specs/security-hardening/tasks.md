# Tasks — Endurecimiento de seguridad (security-hardening)

> Estado: TODAS las tareas completadas. Esta spec documenta retroactivamente código ya en producción.

- [x] 1. Rate limiting en `/start` (CRITICAL del audit)
  - [x] 1.1 Crear `src/features/game/rate-limit.ts` con un contador de **ventana fija** desacoplado del almacén: interfaz `RateLimitStore.hit(key, windowSeconds)`, `checkRateLimit(store, key, { limit, windowSeconds })` que devuelve `{ allowed }`, y **fail-open** (un error del almacén deja pasar la petición)
    - _Requirements: 1.1, 1.3, 1.6_
  - [x] 1.2 Implementar `redisRateLimitStore(redis)`: `INCR` la clave y, solo en el primer hit, `EXPIRE` con la ventana para que el contador se deslice y autoexpire
    - _Requirements: 1.3_
  - [x] 1.3 En `game-service.ts` exponer `isStartAllowed(clientKey)`: leer `START_RATE_LIMIT` (10) y `START_RATE_WINDOW_SECONDS` (60) del entorno, usar clave Redis `ratelimit:start:<clientKey>`; sin Redis (dev) devolver `true`
    - _Requirements: 1.3, 1.7_
  - [x] 1.4 En `app/api/game/start/route.ts` derivar la clave de cliente del primer valor de `x-forwarded-for` (fallback `unknown`) y llamar a `isStartAllowed` ANTES de cualquier trabajo; si no se permite, responder `429` con el mensaje en español
    - _Requirements: 1.1, 1.2, 1.4, 1.5_
  - [x] 1.5 Cubrir con tests (`rate-limit.test.ts`): permite bajo el límite, permite exactamente en el límite, bloquea al superarlo, usa clave+ventana correctas, y **fail-open** cuando el store lanza
    - _Requirements: 1.5, 1.6_

- [x] 2. Tokens opacos y comparación en tiempo constante
  - [x] 2.1 Crear `src/features/game/session-credentials.ts`: `generateRoomCode()` con `crypto.randomInt` sobre el alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sin glifos ambiguos `I/O/0/1`), NO `Math.random()`
    - _Requirements: 2.1, 2.2_
  - [x] 2.2 Implementar `generateOpaqueToken()` con `crypto.randomBytes(32).toString('hex')` (256 bits) para los secretos por jugador
    - _Requirements: 2.3, 2.4_
  - [x] 2.3 Implementar `tokensMatch(a, b)` con `crypto.timingSafeEqual`: rechaza `undefined` y desigualdad de longitud sin lanzar, compara en tiempo constante para no filtrar coincidencias parciales
    - _Requirements: 2.7_
  - [x] 2.4 Cubrir con tests (`session-credentials.test.ts`): código de 4 chars del alfabeto seguro, no constante entre llamadas, token hex largo y único, y `tokensMatch` (iguales, distintos, faltante, longitud distinta sin throw)
    - _Requirements: 2.1, 2.3, 2.7_

- [x] 3. Acuñado de tokens y modelo de sesión
  - [x] 3.1 Agregar `coderToken?` y `helperToken?` a `GameSession` en `game-types.ts`, y `coderToken` a `StartGameResponse`; documentar que el código de sala es dirección pública y el token la credencial de mutación
    - _Requirements: 2.2, 2.3, 2.4_
  - [x] 3.2 En `startGame()` acuñar el `coderToken` y devolverlo en la respuesta; al promover la sala de `idle` a `playing` en `ensureChallengeGenerated`, arrastrar explícitamente `coderToken`/`helperToken` (porque `createSession` arranca un objeto nuevo)
    - _Requirements: 2.3_

- [x] 4. Cierre de IDOR en endpoints mutadores
  - [x] 4.1 En `game-service.ts` exponer `isAuthorizedFor(sessionId, role, token)`: cargar la sesión, elegir el token esperado según el rol (`coder`→`coderToken`, `helper`→`helperToken`) y delegar en `tokensMatch`; `false` si la sesión no existe o no coincide
    - _Requirements: 2.5, 2.6_
  - [x] 4.2 En `app/api/game/answer/route.ts` exigir `isAuthorizedFor(sessionId, 'coder', token)` → `403` `«No autorizado para esta partida.»` si no
    - _Requirements: 2.5, 2.6_
  - [x] 4.3 En `app/api/game/client-question/route.ts` exigir `isAuthorizedFor(sessionId, 'helper', token)` → `403` si no
    - _Requirements: 2.5, 2.6_
  - [x] 4.4 En `app/api/game/abandon/route.ts` exigir `isAuthorizedFor(sessionId, role, token)` con el `role` del cuerpo → `403` si no
    - _Requirements: 2.5, 2.6_

- [x] 5. Persistencia de tokens del lado del cliente
  - [x] 5.1 Crear `src/features/game/api/session-token-store.ts`: `saveToken`/`readToken` en `localStorage` con clave `kc:token:<rol>:<sessionId>`, degradando silenciosamente (try/catch) si `localStorage` no está disponible
    - _Requirements: 2.8, 2.9_
  - [x] 5.2 En `game-client.ts` leer el token guardado y adjuntarlo en cada mutación: `submitAnswer` (coder), `submitClientQuestionAnswer` (helper), `abandonGame` (rol), y pasar el token del helper como query a `getHelperGuide`
    - _Requirements: 2.5, 2.8_
  - [x] 5.3 En `app/coder/page.tsx` guardar el `coderToken` tras `/start`; en `app/helper/page.tsx` guardar el `helperToken` tras obtener la guía
    - _Requirements: 2.8_

- [x] 6. Un Coder, un Helper (asiento único)
  - [x] 6.1 En `getHelperGuide(sessionId, presentedToken?)`: si la sala está `idle` devolver `{ pending: true }`; si el asiento está libre acuñar y persistir `helperToken` y devolver la guía con el token; si está ocupado y el token no coincide devolver `{ occupied: true }`; si coincide (mismo Helper recargando) devolver la guía; si la sala no existe, `null`
    - _Requirements: 3.1, 3.2, 3.4, 3.5_
  - [x] 6.2 Agregar los tipos `HelperGuidePending` (`{ pending: true }`), `HelperGuideOccupied` (`{ occupied: true }`) y la unión `HelperGuideResult` en `game-types.ts`; incluir `helperToken` en `HelperStaticGuide`
    - _Requirements: 3.2, 3.3, 3.5_
  - [x] 6.3 En `app/api/game/guide/route.ts` traducir `{ occupied: true }` a `409` (`«Esta sala ya tiene un Helper…»`) y la ausencia de sesión a `404`; aceptar el `token` por query string
    - _Requirements: 3.3, 3.6_

- [x] 7. Security headers de línea base
  - [x] 7.1 Crear `proxy.ts` (convención Next 16, antes `middleware.ts`) con `proxy()` que parte de `NextResponse.next()` y setea: `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` y una `Content-Security-Policy` ajustada (sin terceros, `frame-ancestors 'none'`, `base-uri`/`form-action 'self'`)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_
  - [x] 7.2 Configurar `config.matcher` para aplicar a todo EXCEPTO los assets estáticos de Next (`_next/static`, `_next/image`, `favicon.ico`)
    - _Requirements: 4.8_

- [x] 8. Endurecimiento de la persistencia de sesión (defensa relacionada del audit)
  - [x] 8.1 En `getRedis()` fallar rápido (`throw`) cuando falta `REDIS_HOST` en **producción**, en vez de degradar silenciosamente a memoria (rompería la sync Coder/Helper entre tasks); permitir el Map en memoria solo en dev
    - _Requirements: 1.7_

- [x] 9. Verificación
  - [x] 9.1 Correr la suite de tests de seguridad (`rate-limit.test.ts`, `session-credentials.test.ts`) → todo verde
    - _Requirements: 1.5, 1.6, 2.1, 2.3, 2.7_
  - [x] 9.2 Verificar manualmente el cierre de IDOR: intentar `/answer` y `/abandon` con token ausente o ajeno → `403`; con el token correcto → procesa
    - _Requirements: 2.5, 2.6_
  - [x] 9.3 Verificar el asiento único: un segundo Helper sin el token original → `409`; el Helper original recargando con su token → recupera la guía
    - _Requirements: 3.3, 3.4_
  - [x] 9.4 Verificar el rate limit: superar `START_RATE_LIMIT` `/start` dentro de la ventana → `429`; confirmar fail-open con Redis caído
    - _Requirements: 1.4, 1.6_
  - [x] 9.5 Verificar las cabeceras de seguridad en una respuesta real (HSTS, CSP, `X-Frame-Options`, etc.) y que NO se aplican a assets estáticos
    - _Requirements: 4.1, 4.8_
