# Design — Resultados de partida (game-results)

## Overview

`game-results` descansa sobre una idea central: **el cierre de partida no produce datos nuevos, los organiza y los presenta**. El game over ya ocurrió (`endless-mode`), el puntaje y las rondas ya están calculados, el nombre de equipo ya fue capturado (`leaderboard`). Esta spec **deriva** un resumen de lo que ya existe, lo pinta en una pantalla, lo serializa en una imagen y —opcionalmente— lo manda por correo con un análisis de IA. Nada de eso debería volver a calcular un puntaje ni volver a pedir un nombre: cada dato tiene un dueño y esta spec **consume**.

El cambio se reparte en capas, de adentro hacia afuera, calcando la separación que ya usa el resto del juego (lógica pura testeable ↔ acceso a I/O ↔ route handler fino ↔ vista):

- **Lógica pura** (`run-summary.ts`, `feedback-email.ts`): armado del resumen a partir de los datos de la partida y validación/sanitización del email — sin tocar Redis, Bedrock, SES ni red. Testeable en aislamiento (TDD).
- **Generación IA** (`feedback-generator.ts`): un análisis de la partida vía Bedrock `ConverseCommand`, calcando `runtime-generator.ts` (mismo cliente, mismo timeout/abort, mismo fallback a `null` ante cualquier fallo) pero con otro `system` prompt y salida en **texto**, no JSON de challenge.
- **Envío de correo** (`ses-mailer.ts`): un wrapper fino sobre `@aws-sdk/client-ses` (`SendEmailCommand`) autenticado por el task role; degrada limpio si SES no está configurado (dev).
- **Endpoints** (`app/api/game/feedback/route.ts` y `app/api/game/share-card/route.ts`): el primero `POST` que valida, genera feedback y envía; el segundo `GET` que devuelve la imagen (`ImageResponse`).
- **Vista** (pantalla de resumen del game over): muestra el resumen, ofrece compartir y el campo opcional de email.

El principio rector: **el resumen y la validación del email son puros y testeables; Bedrock solo analiza; SES solo entrega; la imagen es self-contained; el contrato de sesión del juego no cambia.**

## Modelo del resumen (derivado, no persistido aparte)

```
RunSummary  (derivado al game over, función pura)
  roundsReached:    número (= playedRounds de endless-mode)
  score:            número (= endlessScore, ya calculado por endless-mode)
  secondsSurvived:  número (= gameDurationSeconds(session, now))
  bestStreak:       número (mayor cantidad de aciertos consecutivos)
  topFailure:       { kind: 'language' | 'topic'; label: string } | null
  maxDifficulty:    'easy' | 'medium' | 'hard' | null
  teamName:         string (sanitizado, reutilizado de leaderboard)
```

El resumen **no es un registro nuevo en Valkey**: se arma a demanda desde el estado de sesión persistido del game over más las métricas que `endless-mode` ya expone. Si una métrica derivada necesita acumularse a lo largo de la partida (mejor racha, fallos por lenguaje, dificultad máxima), `endless-mode`/`game-service` la acumula en la sesión durante el juego (campos como `correctStreak`/`bestStreak`, un contador de fallos por lenguaje y la dificultad de cada ronda) y `run-summary.ts` solo la **lee y la reduce** — la acumulación es del servicio, la derivación es pura. Cuando un dato no existe (no hubo fallos → sin `topFailure`), se representa con `null`, nunca con un valor inventado (R1.4).

## Flujo de cierre, compartir y feedback

```
Game over (modo infinito)  ── endless-mode expone score, playedRounds, secondsSurvived ──
  │
  │  El front arma la pantalla de resumen:
  │     summary = buildRunSummary(sessionState, metrics)   (PURO)  → R1
  │     muestra rondas, puntaje, tiempo, mejor racha, fallo top, dificultad máx  → R2
  │     reutiliza teamName ya capturado por leaderboard (no lo re-pide)          → R2.4
  │
  ├── Compartir
  │     GET /api/game/share-card?score=&rounds=&team=…
  │        └─ sanitizeTeamName(team)  (reuso leaderboard) → render con ImageResponse
  │     ◄── image/png   (descargable/copiable; el sistema NO postea)            → R3
  │     fallback: si ImageResponse falla → resultado en texto compartible        → R3.6
  │
  └── Feedback por correo (opcional)
        POST /api/game/feedback { sessionId, token, email }
           ├─ sanitizeEmail(email)              (PURO) → 400 si inválido         → R4.2, R5.1
           ├─ rate-limit (sesión / email / IP)         → 429 si excede           → R5.2
           ├─ isAuthorizedFor(sessionId,'coder',token) → 403 si no coincide      → R5.3
           ├─ summary = buildRunSummary(estado persistido)  (fuente de verdad)   → R5.3
           ├─ feedbackText = generateFeedback(summary)  (Bedrock Converse)       → R4.4
           │     └─ null → fallback de feedback basado solo en el resumen        → R4.6
           ├─ body = renderEmail(summary, feedbackText)  (texto plano, escapado) → R5.4
           └─ sendEmail(SES, from=SES_FROM_ADDRESS, to=email, body)              → R4.5
        ◄── { sent: true } | { sent: false, reason }   (sin filtrar internos)    → R4.7
```

La validación de email y el armado del resumen ocurren **antes de cualquier I/O**: un cuerpo inválido nunca llega a Bedrock ni a SES. El feedback se genera **después** de verificar el token y derivar el resumen del estado persistido (no de lo que mande el cliente), igual que el camino preferente de `leaderboard` R6.

## Archivos

```
src/features/game/
  run-summary.ts            ← buildRunSummary(sessionState, metrics): RunSummary
                               (PURO — sin Redis, sin Bedrock, sin SES, sin red)
  run-summary.test.ts       ← cubre derivación de cada métrica, ausencias (topFailure/maxDifficulty
                               null), mejor racha (reduce de aciertos consecutivos), no recálculo de score
  feedback-email.ts         ← sanitizeEmail(raw): { ok: true; email: string } | { ok: false; reason }
                               + renderEmailBody(summary, feedbackText): string (texto plano escapado)
                               (PURO)
  feedback-email.test.ts    ← email vacío/sin @/dominio inválido/largo → ok:false; válido pasa;
                               cuerpo del correo escapa nombre de equipo, sin CRLF (anti header injection)
  feedback-generator.ts     ← generateFeedback(summary): Promise<string | null> vía ConverseCommand
                               (calca runtime-generator: timeout, abort, fallback a null)
  ses-mailer.ts             ← sendFeedbackEmail(to, subject, body): wrapper de @aws-sdk/client-ses
                               (SendEmailCommand); degrada si SES no configurado (dev)
  game-types.ts             ← + RunSummary, TopFailure, FeedbackRequest, FeedbackResult, ShareCardParams
  constants.ts              ← + límites de rate de feedback, asunto del correo
app/api/game/feedback/
  route.ts                  ← POST: valida email + token, deriva resumen, genera feedback, envía SES
app/api/game/share-card/
  route.ts                  ← GET: ImageResponse con score + rondas + nombre (OG image)
app/  (modo infinito)
  game-over summary view    ← pantalla de resumen: métricas + compartir + email opcional
src/components/
  RunSummary / ShareButton  ← tabla/tarjeta de resumen, botón compartir, campo de email
infra/
  main.tf                   ← + policy ses:SendEmail en aws_iam_role.task (análoga a bedrock)
  variables.tf / main.tf    ← + SES_FROM_ADDRESS y región en el task definition (env, sin secretos)
```

`run-summary.ts` y `feedback-email.ts` (la **lógica pura**) SIEMPRE van aparte y testeadas; `feedback-generator.ts` y `ses-mailer.ts` (el **I/O**) se separan para no inflar `game-service.ts`, igual que `leaderboard-store.ts` se separó allá.

## Decisiones técnicas

### El resumen se deriva, no se persiste

`buildRunSummary` es una función pura que recibe el estado de sesión del game over y las métricas de `endless-mode` y devuelve un `RunSummary`. No escribe en Valkey ni agrega una clave nueva: el game over ya tiene todo lo necesario. La única condición es que las métricas que se **acumulan durante** la partida (mejor racha, fallos por lenguaje, dificultad por ronda) las junte `game-service` en la sesión mientras se juega — porque una función pura no puede reconstruir el pasado. El reparto es nítido: el **servicio acumula** (I/O, estado), la **función pura reduce** (testeable). Así toda la lógica de "qué fue la mejor racha" o "en qué lenguaje falló más" queda capturada en un test unitario, no en una vista.

### Mejor racha, fallo top y dificultad máxima

- **Mejor racha:** `game-service` mantiene `correctStreak` (se incrementa al acertar, se resetea a 0 al errar) y `bestStreak = max(bestStreak, correctStreak)`. El resumen lee `bestStreak`.
- **Lenguaje/tema con más fallos:** `game-service` mantiene un contador `failuresByLanguage: Record<ChallengeLanguage, number>` (incrementa la entrada del lenguaje de la ronda al errar). `buildRunSummary` reduce ese record a la entrada de mayor cuenta (`topFailure`), o `null` si no hubo fallos.
- **Dificultad máxima alcanzada:** de la dificultad de cada ronda generada (`adaptive-difficulty` la escala), el servicio guarda la más alta vista; el resumen la lee como `maxDifficulty` (orden `easy < medium < hard`), o `null` si no aplica.

Ninguna de estas tres se recalcula en la función pura a partir de un histórico: el servicio las mantiene baratas (O(1) por respuesta) y la función solo las expone.

### Card compartible con `ImageResponse` (self-contained)

La card se genera en el servidor con la generación de imágenes de Next (`ImageResponse` desde `next/og`), que renderiza JSX a PNG **sin servicios externos** — encaja con "self-contained" y no agrega infraestructura. El endpoint `GET /api/game/share-card` recibe `score`, `rounds` y `team` como query params, **sanitiza el nombre** (reusando `sanitizeTeamName` de `leaderboard`) y devuelve `image/png`. El jugador descarga o copia la imagen; el sistema **no** publica en redes (R3.5). Si `ImageResponse` falla, la vista degrada a un texto compartible (puntaje + rondas + nombre) para no dejar la pantalla rota (R3.6).

> Nota de versión: `ImageResponse` y el patrón OG pueden diferir de lo conocido en esta versión de Next — **consultar `node_modules/next/dist/docs/` antes de implementar** (AGENTS.md), no asumir la API de memoria.

### Feedback IA: Bedrock Converse con otro prompt

`feedback-generator.ts` calca `runtime-generator.ts`: mismo `BedrockRuntimeClient`, mismo `RUNTIME_TIMEOUT_MS` con `AbortController`, mismo `guardrailConfig()`, mismo `try/catch/finally` que devuelve `null` ante cualquier fallo. Cambia el `system` prompt (analizar la partida en vez de generar un challenge) y la salida es **texto** (qué hizo bien / en qué falló / sugerencias en español neutro), no JSON validado contra `isValidChallenge`. El `user` message resume las métricas (`buildRunSummary`) como contexto del análisis. Al devolver `null`, el endpoint usa un **fallback de feedback** armado solo del resumen (sin frase de IA) — el correo se envía igual (R4.6), exactamente la misma filosofía que el fallback al challenge curado.

### Envío con AWS SES (autenticado por el task role)

`ses-mailer.ts` usa `@aws-sdk/client-ses` (`SendEmailCommand`). Como Bedrock, **no usa claves en env vars**: el `BedrockRuntimeClient` ya se autentica por el task role de ECS, y el `SESClient` hace lo mismo. La infra agrega al `aws_iam_role.task` una policy con `ses:SendEmail` (análoga a la de `bedrock` en `infra/main.tf`), acotada a la identidad verificada. El remitente (`SES_FROM_ADDRESS`) y la región llegan como **env vars del task definition** (sin secretos), igual que `BEDROCK_GUARDRAIL_ID`. En **dev sin SES** (sin `SES_FROM_ADDRESS`), `sendFeedbackEmail` degrada (no envía, responde un estado claro) sin romper — análogo a Bedrock corriendo sin guardrail localmente.

### Endpoints (convención `app/api/game/*/route.ts`)

- `POST /api/game/feedback`: parsea el cuerpo, valida email (`sanitizeEmail`), aplica rate limit, verifica `isAuthorizedFor(sessionId, 'coder', token)`, **deriva el resumen del estado persistido**, genera el feedback (con fallback), envía vía SES y responde `{ sent }`. `400` email inválido; `429` rate limit; `403` token; sin filtrar internos de SES/Bedrock al usuario (R4.7).
- `GET /api/game/share-card`: recibe `score`/`rounds`/`team`, sanitiza el nombre y devuelve la imagen (`ImageResponse`). Marcado dinámico / sin caché agresiva.

### Seguridad: validar antes de I/O, atar a partida real, anti-inyección

Tres capas, calcando el R6 de `leaderboard`:

1. **Validación pura antes de I/O** (siempre): `sanitizeEmail` rechaza formatos inválidos → `400`, sin tocar Bedrock ni SES. Igual el rango de las métricas para la card.
2. **Atado al token + derivación del estado persistido**: el feedback se arma de la **fuente de verdad del servidor** (sesión del game over), no de métricas crudas del cliente; el `coderToken` (de security-hardening) garantiza que es la partida del jugador (R5.3).
3. **Anti-inyección en el correo**: el nombre de equipo y el email se **escapan/neutralizan** antes de ir al cuerpo y a los encabezados del correo — sin CRLF (header injection), sin HTML interpretado. El nombre ya viene sanitizado de `leaderboard`; el cuerpo del correo es texto plano (R5.4).

El **rate limit** del envío reutiliza el patrón de `incr`/`expire` sobre `getRedis()` que ya usan las sesiones (una clave `feedback:rate:<clave>` con TTL), para no spamear SES ni quemar su reputación de envío (R5.2).

### Consideración operativa: SES sandbox y verificación del dominio

SES arranca en **sandbox**: solo envía a **direcciones verificadas** y desde un remitente verificado. Para la demo, verificar el/los email(s) destinatario(s) en SES alcanza; para producción con destinatarios arbitrarios hay que **salir del sandbox** (solicitud a AWS) y **verificar el dominio remitente** `hackaton.dvloper.com.co` agregando en Hostinger los **registros DNS** (TXT de verificación + 3 CNAME de DKIM que SES entrega). Esto se documenta como paso operativo (R6.3) — Terraform agrega el permiso IAM y la env var del remitente, pero el alta de DNS y la salida del sandbox son acciones de cuenta/dominio, fuera del `apply`.

## Componentes afectados

| Archivo | Cambio |
|---|---|
| `src/features/game/run-summary.ts` | NUEVO — `buildRunSummary` (puro): deriva rondas, puntaje, tiempo, mejor racha, fallo top, dificultad máx |
| `src/features/game/run-summary.test.ts` | NUEVO — tests de derivación y ausencias (null), reduce de racha/fallos |
| `src/features/game/feedback-email.ts` | NUEVO — `sanitizeEmail`, `renderEmailBody` (puro, anti-CRLF/HTML) |
| `src/features/game/feedback-email.test.ts` | NUEVO — validación de email y escape del cuerpo |
| `src/features/game/feedback-generator.ts` | NUEVO — `generateFeedback` vía Bedrock Converse (calca runtime-generator, fallback a null) |
| `src/features/game/ses-mailer.ts` | NUEVO — `sendFeedbackEmail` (SES SendEmailCommand, degrada sin config) |
| `src/features/game/game-service.ts` | acumular `bestStreak`, `failuresByLanguage`, `maxDifficulty` durante la partida; exponer al game over |
| `src/features/game/game-types.ts` | + `RunSummary`, `TopFailure`, `FeedbackRequest`, `FeedbackResult`, `ShareCardParams`; campos de acumulación en `GameSession` |
| `src/lib/constants.ts` | + límites de rate de feedback, asunto del correo |
| `app/api/game/feedback/route.ts` | NUEVO — `POST` validar+generar+enviar |
| `app/api/game/share-card/route.ts` | NUEVO — `GET` imagen `ImageResponse` |
| pantalla de game over (modo infinito) | resumen + compartir + email opcional |
| `src/components/...` | NUEVO — `RunSummary`, `ShareButton`, campo de email |
| `infra/main.tf` | + policy `ses:SendEmail` en `aws_iam_role.task`; env `SES_FROM_ADDRESS` en el task definition |

## Testing

- **Unitario (puro, sin I/O):** `buildRunSummary` — deriva cada métrica del estado + métricas de `endless-mode`; `topFailure`/`maxDifficulty` `null` cuando no aplica; mejor racha como reduce de aciertos consecutivos; NO recalcula score/rondas (los toma tal cual). `sanitizeEmail` — vacío, sin `@`, dominio inválido, supera el máximo → `ok:false`; válido pasa. `renderEmailBody` — escapa el nombre de equipo, sin saltos de línea inyectables en encabezados (anti header injection).
- **Generación IA (Bedrock mockeado):** `generateFeedback` devuelve texto en éxito; `null` ante timeout/abort/error → el endpoint usa el fallback de feedback. No se llama a Bedrock con email inválido.
- **Endpoint:** email inválido → `400` sin tocar SES; rate limit excedido → `429`; token incorrecto → `403`; éxito → `{ sent: true }` y SES invocado una vez (mock).
- **Sin SES (dev):** `sendFeedbackEmail` degrada y el endpoint responde un estado claro sin romper.
- **Sin regresión:** la suite existente sigue verde; el contrato de `GameSession` y los demás route handlers no rompen.
- tsc 0 errores, lint 0 warnings, cero `any` / sin `as`.

## Manejo de errores y degradaciones

| Situación | Respuesta del sistema |
|---|---|
| Email vacío, sin `@`, dominio inválido o supera el máximo | `400` `«Ingresa un correo válido.»` — no se genera feedback ni se envía |
| Rate limit de envío excedido | `429` `«Demasiados envíos. Intenta más tarde.»` — no se envía |
| Token de sesión ausente/incorrecto | `403` `«No autorizado para esta partida.»` |
| Generación del feedback IA falla (timeout/abort/error) | fallback de feedback basado solo en el resumen — el correo se envía igual |
| `ImageResponse` falla al generar la card | la vista degrada a un resultado en texto compartible — la pantalla no se rompe |
| SES no configurado (dev local sin `SES_FROM_ADDRESS`) | `sendFeedbackEmail` degrada — endpoint responde `{ sent: false, reason }`, sin romper |
| SES en sandbox y destinatario no verificado (producción) | SES rechaza el envío — error registrado en logs, al usuario un mensaje genérico sin filtrar internos |
| Dato de resumen ausente (sin fallos, sin dificultad) | el resumen lo marca `null` y la vista muestra «—», nunca un valor inventado |

## Riesgos y mitigaciones

- **Riesgo:** abuso del endpoint de feedback para spamear correo vía SES (quema la reputación de envío). **Mitigación:** rate limit por sesión/email/IP (`incr`/`expire` sobre `getRedis()`), validación de email pura antes de I/O y atado al token de sesión.
- **Riesgo:** inyección de encabezados (CRLF) o contenido en el correo via nombre de equipo / email. **Mitigación:** sanitización (nombre ya sanitizado por `leaderboard`, email validado), cuerpo en texto plano escapado, sin interpolar texto crudo en encabezados.
- **Riesgo:** SES en sandbox no entrega a destinatarios no verificados — la demo "envía" pero no llega. **Mitigación:** verificar los destinatarios de la demo en SES; documentar la salida del sandbox y la verificación del dominio remitente (DNS en Hostinger) para producción.
- **Riesgo:** la API de `ImageResponse`/OG difiere en esta versión de Next respecto del training data. **Mitigación:** leer `node_modules/next/dist/docs/` antes de implementar (AGENTS.md); fallback a texto compartible si la generación falla.
- **Riesgo:** depender de `endless-mode` para las métricas y de `leaderboard` para el nombre. **Mitigación:** la lógica pura (`buildRunSummary`, `sanitizeEmail`, `renderEmailBody`) y el `feedback-generator` se construyen y testean independientes con datos de prueba; el atado a las métricas y al nombre reales es el último cable a conectar.
- **Riesgo:** costo de Bedrock multiplicado por cada feedback. **Mitigación:** el feedback es **opcional** (solo si el jugador pide correo), el rate limit acota la frecuencia, y el fallback evita reintentos agresivos.

## Dependencias

- `endless-mode` — aporta `score`, `playedRounds` y `secondsSurvived` al game over, y acumula durante la partida `bestStreak`, `failuresByLanguage` y la dificultad por ronda que el resumen reduce.
- `leaderboard` — aporta el **nombre de equipo** sanitizado (reutilizado, no re-pedido) y la función `sanitizeTeamName` para la card.
- `adaptive-difficulty` — escala la dificultad por ronda, de donde sale la "dificultad máxima alcanzada".

## Out of scope

Cuentas de usuario, doble opt-in del email, historial/desuscripción de correos, plantillas HTML elaboradas o multi-idioma, envíos diferidos/encolados y reintentos asíncronos de SES. La salida del sandbox de SES y la automatización Terraform del alta de DNS en Hostinger se documentan como pasos operativos, no se implementan. La mecánica del modo infinito, el ranking global y la dificultad adaptativa pertenecen a las specs hermanas (`endless-mode`, `leaderboard`, `adaptive-difficulty`), de las que esta spec **depende**.
