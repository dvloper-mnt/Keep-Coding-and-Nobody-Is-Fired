# Design — Endurecimiento de seguridad (security-hardening)

## Overview

El endurecimiento descansa sobre una idea central: **separar la dirección de la sala (pública) de la credencial que autoriza mutaciones (secreta)**. El código de sala de 4 caracteres se sigue compartiendo en voz alta para que el Helper se sume, pero dejó de ser una llave: ahora cada jugador porta un **token opaco** por rol, y solo ese token autoriza responder, abandonar o contestar consultas. Encima de eso, `/start` (el único endpoint que cuesta dinero, porque dispara Bedrock) se protege con un rate limit que **falla abierto**, y todas las respuestas salen con cabeceras de seguridad de línea base.

Cuatro piezas, todas ya implementadas:

- `rate-limit.ts` — lógica de ventana fija desacoplada del almacén (testeable sin Redis), fail-open.
- `session-credentials.ts` — generación de código de sala (CSPRNG), tokens opacos y comparación en tiempo constante.
- `game-service.ts` — orquesta autorización (`isAuthorizedFor`), rate limit (`isStartAllowed`) y asiento único de Helper (`getHelperGuide`).
- `proxy.ts` — cabeceras de seguridad en cada respuesta (convención Next 16).

## Flujo de autorización (mutaciones)

```
Front (coder/helper page)
  │  startGame() → POST /api/game/start
  │     ├─ isStartAllowed(clientKey)  ─── rate limit (fail-open) ── 429 si excede
  │     └─ startGame() → genera sessionId (room code) + coderToken
  │  ◄── { sessionId, coderToken }
  │  saveToken(sessionId, 'coder', coderToken)  → localStorage  kc:token:coder:<id>
  │
  │  (Helper) getHelperGuide() → GET /api/game/guide?sessionId=..&token=..
  │     └─ asiento libre → mintea helperToken ; ocupado → 409 ; idle → pending
  │  ◄── { ..., helperToken }
  │  saveToken(sessionId, 'helper', helperToken)
  │
  │  submitAnswer() → POST /api/game/answer { sessionId, answerIndex, token }
  │     └─ isAuthorizedFor(sessionId, 'coder', token)
  │           token = sesión.coderToken ?  → procesar  : 403
  │
  │  submitClientQuestionAnswer() → POST /api/game/client-question
  │     └─ isAuthorizedFor(sessionId, 'helper', token)  → 403 si no
  │
  │  abandonGame(role) → POST /api/game/abandon { sessionId, role, token }
  │     └─ isAuthorizedFor(sessionId, role, token)  → 403 si no
```

Lecturas (`/state`, `/sync`, `/guide` en su parte de lectura) NO exigen token: conocer el código de sala basta para *ver* la partida. Solo las **mutaciones** exigen el token del rol.

## Archivos

```
src/features/game/
  rate-limit.ts                 ← ventana fija + fail-open; store abstracto (Redis o mock)
  rate-limit.test.ts            ← cubre permitir/bloquear/borde/fail-open
  session-credentials.ts        ← generateRoomCode (randomInt), generateOpaqueToken
                                   (randomBytes 32), tokensMatch (timingSafeEqual)
  session-credentials.test.ts   ← cubre alfabeto, longitud, unicidad, timing-safe
  game-service.ts               ← isStartAllowed, isAuthorizedFor, getHelperGuide,
                                   acuñado de coderToken/helperToken
  game-types.ts                 ← coderToken?/helperToken? en GameSession;
                                   StartGameResponse, HelperGuideResult (+Pending/+Occupied)
  api/
    session-token-store.ts      ← saveToken/readToken en localStorage (cliente)
    game-client.ts              ← adjunta el token leído en cada mutación
app/api/game/
  start/route.ts                ← rate limit por IP (x-forwarded-for) → 429
  answer/route.ts               ← isAuthorizedFor coder → 403
  client-question/route.ts      ← isAuthorizedFor helper → 403
  abandon/route.ts              ← isAuthorizedFor role → 403
  guide/route.ts                ← getHelperGuide → 409 si ocupado, pending si idle
app/
  coder/page.tsx                ← saveToken('coder', coderToken) tras /start
  helper/page.tsx               ← saveToken('helper', helperToken) tras guide
proxy.ts                        ← cabeceras de seguridad (Next 16, antes middleware.ts)
```

## Decisiones técnicas

### Rate limit: ventana fija con almacén abstracto y fail-open

El almacén se modela como interfaz `RateLimitStore` con un solo método `hit(key, windowSeconds): Promise<number>`, que devuelve el conteo corriente en la ventana. Esto desacopla la **decisión** (¿supera el límite?) del **mecanismo** (Redis), y permite testear la lógica sin levantar Redis (los tests usan un mock que devuelve un conteo fijo).

```ts
export async function checkRateLimit(store, key, { limit, windowSeconds }) {
  try {
    const count = await store.hit(key, windowSeconds);
    return { allowed: count <= limit };
  } catch {
    return { allowed: true }; // FAIL-OPEN
  }
}
```

La implementación Redis hace `INCR` y, solo en el primer hit (`count === 1`), un `EXPIRE` para que la ventana se deslice y el contador se autoexpire:

```ts
async hit(key, windowSeconds) {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds);
  return count;
}
```

**Decisión clave — fail-open, no fail-closed:** ante un error del almacén dejamos pasar. Razón: el rate limit existe para proteger presupuesto, no para ser una barrera de seguridad dura; bloquear a un jugador real por un hipo de Redis en plena demo sería peor que tolerar unos pocos `/start` extra. El abuso real requiere volumen sostenido, que un Redis sano sí frena.

La clave de cliente sale del **primer** valor de `x-forwarded-for` (la IP real detrás del ALB); `unknown` si falta. La clave Redis es `ratelimit:start:<clientKey>`.

### Código de sala vs. token: dos cosas distintas a propósito

| | Código de sala | Token opaco |
|---|---|---|
| Propósito | dirección de la sala | credencial de mutación |
| Longitud | 4 chars | 32 bytes (256 bits) |
| Generación | `crypto.randomInt` sobre alfabeto sin glifos ambiguos (`I/O/0/1` excluidos) | `crypto.randomBytes(32).toString('hex')` |
| Compartido | sí, en voz alta | no, vive en `localStorage` del dueño |
| ¿Autoriza mutar? | NO | SÍ |

El alfabeto del código (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`) omite `I/O/0/1` para evitar ambigüedad cuando un jugador lo dicta en voz alta. Aun así el código se genera con `randomInt` (CSPRNG): aunque ya no sea credencial, no tiene sentido dejarlo predecible.

### Comparación de tokens en tiempo constante

`tokensMatch` evita la fuga por timing: primero descarta `undefined` y desigualdad de longitud (sin lanzar), y solo entonces compara con `timingSafeEqual`. Comparar con `===` filtraría — por cuánto tarda — cuántos caracteres iniciales coincidieron, abriendo un ataque de adivinación byte a byte.

```ts
export function tokensMatch(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a), bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
```

### Autorización centralizada en `isAuthorizedFor`

Un único guard server-side resuelve toda mutación: carga la sesión, elige el token esperado según el rol (`coder` → `coderToken`, `helper` → `helperToken`) y delega en `tokensMatch`. Devuelve `false` (→ 403 en el route) si la sesión no existe o el token no coincide. Cada route handler llama a este guard ANTES de procesar, así que la regla vive en un solo lugar y los handlers solo traducen el booleano a un `403`.

### Asiento único de Helper (cierre de IDOR + regla 1-a-1)

`getHelperGuide` es a la vez el fix de IDOR para el Helper y la regla «un Coder, un Helper»:

- Sala `idle` (Bedrock aún generando) → `{ pending: true }` (el Helper espera, no error).
- Asiento libre → se acuña `helperToken`, se persiste en la sesión, se devuelve la guía con el token (el primero gana).
- Asiento ocupado y token presentado NO coincide → `{ occupied: true }` → `409`.
- Asiento ocupado y token coincide → es el mismo Helper recargando → se le devuelve la guía.

El Coder, en cambio, recibe su token en la respuesta de `/start` (no hay «reclamo» porque el que inicia es por definición el Coder).

### Acuñado de tokens y persistencia de sesión

- `coderToken` se acuña en `startGame()` y viaja en `StartGameResponse`. Importante: cuando la sala `idle` se promueve a `playing` (en `ensureChallengeGenerated`), `createSession` arranca un objeto nuevo, así que el código **arrastra explícitamente** `coderToken` y `helperToken` para no perderlos.
- `helperToken` se acuña en `getHelperGuide` la primera vez.
- Ambos viven en la sesión persistida (Redis en producción / Map en memoria solo en dev) con `SESSION_TTL_SECONDS = 3600`.
- Del lado del cliente, `session-token-store.ts` los guarda en `localStorage` bajo `kc:token:<rol>:<sessionId>`; `game-client.ts` los lee y los adjunta en cada mutación.

### Security headers vía `proxy.ts` (convención Next 16)

En Next 16 el antiguo `middleware.ts` pasó a llamarse `proxy.ts` (export `proxy()` + `config.matcher`). La función parte de `NextResponse.next()` y setea las cabeceras de un mapa estático. El `matcher` excluye assets estáticos. La CSP es ajustada porque el juego no carga scripts de terceros; `'unsafe-inline'` en `script-src`/`style-src` se concede porque el framework y Tailwind inyectan estilos/scripts inline.

## Manejo de errores y degradaciones

| Situación | Respuesta del sistema |
|---|---|
| Redis caído al chequear rate limit | fail-open → se permite el `/start` |
| Sin Redis (dev local) | `isStartAllowed` devuelve `true` (sin límite) |
| Sin `REDIS_HOST` en **producción** | falla rápido (`throw`) — NO degrada a memoria silenciosamente, porque rompería la sync Coder/Helper entre tasks |
| Token faltante o incorrecto en mutación | `403` `«No autorizado para esta partida.»` |
| Sala con Helper ya ocupado | `409` `«Esta sala ya tiene un Helper…»` |
| `localStorage` no disponible (modo privado) | degrada: la pestaña activa juega, no se puede reanudar tras recargar |

## Riesgos y mitigaciones

- **Riesgo:** el fail-open del rate limit permite un pequeño exceso de `/start` durante un fallo de Redis. **Mitigación:** asumido a propósito — el costo de bloquear a un jugador real en demo supera al de unos pocos `/start` extra; el abuso a volumen requiere un Redis sano que sí frena.
- **Riesgo:** `'unsafe-inline'` en la CSP debilita la defensa contra XSS inyectado. **Mitigación:** aceptado por la inyección inline del framework/Tailwind; el resto de la CSP (sin orígenes de terceros, `frame-ancestors 'none'`, `base-uri`/`form-action 'self'`) sigue cerrando vectores.
- **Riesgo:** los tokens en `localStorage` son legibles por JS de la página (vulnerables a XSS). **Mitigación:** la CSP minimiza la superficie de XSS; el token autoriza solo operaciones de juego de baja sensibilidad (no hay datos personales ni dinero del usuario detrás).
- **Riesgo:** un cliente sin `x-forwarded-for` cae a la clave `unknown` y comparte cupo con otros. **Mitigación:** detrás del ALB la cabecera siempre está presente; `unknown` es solo un piso defensivo.

## Out of scope

Autenticación de cuentas, rate limit en otros endpoints, rotación/expiración explícita de tokens más allá del TTL de sesión, cifrado en reposo, WAF y DDoS de red. La corrección semántica del contenido de Bedrock pertenece a `bedrock-question-gen`.
