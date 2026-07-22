# Requirements — Endurecimiento de seguridad (security-hardening)

## Introduction

Esta spec documenta **retroactivamente** el endurecimiento de seguridad que YA está implementado en el juego. No propone nada nuevo: describe el contrato que el código vigente cumple, surgido de una auditoría de seguridad sobre el back de la partida (rutas `/api/game/*`) y de los hallazgos sobre el modelo de credenciales del juego.

El juego es cooperativo: un **Coder** abre una sala y comparte un **código de sala** de 4 caracteres para que un **Helper** se sume. Antes del endurecimiento, ese código corto era a la vez la dirección de la sala Y la única credencial — quien adivinaba o veía el código podía mutar la partida ajena (responder, abandonar, contestar las consultas del cliente). Además, `/api/game/start` no tenía límite, y cada `/start` dispara una llamada **facturable a Bedrock**: un atacante podía quemar presupuesto a voluntad.

El endurecimiento cubre cuatro frentes, todos ya en producción:

1. **Rate limiting en `/start`** — el único endpoint cuyo abuso cuesta dinero real (Bedrock). Hallazgo **CRITICAL** del audit.
2. **Tokens opacos + cierre de IDOR** — el código de sala deja de ser credencial; cada jugador porta un token secreto por rol y solo ese token autoriza mutaciones.
3. **Un Coder = un Helper** — la sala tiene exactamente un asiento de Helper; el primero lo reclama, el resto es rechazado salvo que presente el mismo token.
4. **Security headers** — cabeceras de seguridad de línea base en cada respuesta (HSTS, CSP, anti-clickjacking, etc.).

### Contexto verificado (audit)

- Cada `POST /api/game/start` genera una sala en estado `idle` y, en el primer poll, dispara una invocación a **Bedrock** (facturable). Sin límite, `/start` era un vector de gasto.
- El **código de sala** (4 chars del alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`) se comparte socialmente (el Helper lo tipea), así que es corto y NO puede ser secreto.
- El audit marcó como CRITICAL: (a) falta de rate limit en `/start`; (b) IDOR — endpoints mutadores autorizaban solo por conocer el `sessionId` (= código de sala).

## Glossary

- **Código de sala (room code)**: identificador corto de 4 caracteres de la partida, compartido socialmente. Es la *dirección* de la sala, NO una credencial. Equivale al `sessionId`.
- **Token opaco (opaque token)**: secreto por jugador y por rol, de 256 bits (32 bytes), generado con CSPRNG. Habilita las mutaciones. Hay `coderToken` y `helperToken`.
- **Rol (`PlayerRole`)**: `coder` o `helper`. Cada uno tiene su propio token.
- **Mutación**: operación que cambia el estado de la partida — responder (`/answer`), responder consulta del cliente (`/client-question`), abandonar (`/abandon`).
- **IDOR** (Insecure Direct Object Reference): poder operar sobre el recurso de otro con solo conocer su identificador. Aquí: mutar una partida ajena conociendo solo el código de sala.
- **Fail-open**: ante un error de infraestructura (Redis caído), la decisión de rate limit deja pasar la petición en vez de bloquearla.
- **Ventana fija (fixed window)**: estrategia de rate limit que cuenta peticiones por clave dentro de una ventana temporal que se reinicia al expirar.

---

## Requirement 1 — Rate limiting en `/start` (hallazgo CRITICAL del audit)

**User Story:** Como responsable del presupuesto de la hackathon, quiero limitar cuántas partidas puede iniciar un mismo cliente por minuto, porque cada `/start` dispara una llamada facturable a Bedrock y sin límite un atacante puede quemar dinero a voluntad.

### Acceptance Criteria

1. THE SYSTEM SHALL aplicar un rate limit en `POST /api/game/start` ANTES de ejecutar cualquier trabajo, dado que cada inicio dispara una llamada facturable a Bedrock.
2. THE SYSTEM SHALL identificar al cliente por su IP real, tomada del primer valor de la cabecera `x-forwarded-for` (la app corre detrás del ALB); a falta de cabecera, SHALL usar la clave `unknown`.
3. THE SYSTEM SHALL implementar un contador de **ventana fija** por clave de cliente, con límite por defecto `START_RATE_LIMIT = 10` y ventana por defecto `START_RATE_WINDOW_SECONDS = 60` segundos, ambos configurables por entorno.
4. WHEN el número de inicios de un cliente dentro de la ventana SUPERA el límite THE SYSTEM SHALL responder `429` con un mensaje en español (`«Demasiadas partidas en poco tiempo. Espera un momento e intenta de nuevo.»`) y NO iniciar la partida.
5. WHEN el contador está en o por debajo del límite (incluida la enésima petición exacta) THE SYSTEM SHALL permitir el inicio.
6. WHEN el almacén de rate limit (Redis) lanza un error THE SYSTEM SHALL **fail-open** (permitir la petición), porque un hipo transitorio de infraestructura nunca debe bloquear a un jugador real en plena demo.
7. WHERE no hay Redis configurado (desarrollo local) THE SYSTEM SHALL permitir todos los inicios (no hay límite que aplicar sin almacén compartido).

## Requirement 2 — Tokens opacos y cierre de IDOR en endpoints mutadores

**User Story:** Como jugador, quiero que solo yo pueda operar mi rol en mi partida, porque conocer el código de sala (que se comparte en voz alta) no debe alcanzar para que un tercero responda, conteste consultas o abandone por mí.

### Acceptance Criteria

1. THE SYSTEM SHALL generar el código de sala con un CSPRNG (`crypto.randomInt`), NUNCA con `Math.random()`, eliminando la predictibilidad.
2. THE SYSTEM SHALL tratar el código de sala como **dirección pública** de la partida y NO como credencial: conocerlo permite *leer* el estado, pero NO mutarlo.
3. THE SYSTEM SHALL acuñar un **token opaco** de 32 bytes (256 bits) con `crypto.randomBytes` para el Coder en el momento de `/start`, y devolverlo en la respuesta como `coderToken`.
4. THE SYSTEM SHALL acuñar un token opaco análogo (`helperToken`) para el Helper la primera vez que solicita su guía.
5. WHEN se invoca un endpoint mutador (`/answer`, `/client-question`, `/abandon`) THE SYSTEM SHALL exigir el token correspondiente al rol y SHALL responder `403` (`«No autorizado para esta partida.»`) si el token falta o no coincide.
6. THE SYSTEM SHALL ligar cada endpoint mutador a un rol concreto: `/answer` exige el token del **Coder**; `/client-question` exige el token del **Helper**; `/abandon` exige el token del rol declarado en el cuerpo de la petición.
7. THE SYSTEM SHALL comparar tokens en **tiempo constante** (`crypto.timingSafeEqual`), de modo que un fallo no filtre cuántos caracteres coincidieron; SHALL rechazar sin lanzar excepción cuando las longitudes difieran o cuando falte cualquiera de los dos lados.
8. THE SYSTEM SHALL persistir los tokens del lado del cliente en `localStorage`, por sala y por rol (clave `kc:token:<rol>:<sessionId>`), de modo que una recarga conserve el asiento; el front SHALL adjuntar el token guardado en cada llamada mutadora.
9. WHERE `localStorage` no está disponible (modo privado u otro) THE SYSTEM SHALL degradar silenciosamente: la partida sigue funcionando en la pestaña activa, solo se pierde la capacidad de reanudar tras recargar.

## Requirement 3 — Un Coder, un Helper (asiento único de Helper)

**User Story:** Como Coder, quiero que mi sala tenga un solo Helper, porque la partida es cooperativa 1-a-1 y un tercero entrometido conociendo el código rompería la dinámica.

### Acceptance Criteria

1. THE SYSTEM SHALL exponer `getHelperGuide(sessionId, presentedToken?)` como único punto de entrada del Helper a la sala.
2. WHEN el primer Helper solicita la guía y el asiento está libre THE SYSTEM SHALL reclamar el asiento acuñando un `helperToken`, persistirlo en la sesión, y devolver la guía junto con ese token.
3. WHEN un segundo Helper (sin token o con token distinto) solicita la guía de una sala con asiento ya ocupado THE SYSTEM SHALL devolver `{ occupied: true }`, que el endpoint traduce a `409` (`«Esta sala ya tiene un Helper. Pídele al Coder un código nuevo.»`).
4. WHEN el Helper original recarga y presenta el `helperToken` que coincide THE SYSTEM SHALL devolverle la guía (no lo trata como intruso).
5. WHEN la sala existe pero el desafío aún no está listo (estado `idle`, Bedrock generando) THE SYSTEM SHALL devolver `{ pending: true }` para que el Helper espere, en vez de un error que se leería como «sala no encontrada».
6. WHEN la sala no existe THE SYSTEM SHALL devolver `404`.

## Requirement 4 — Security headers de línea base

**User Story:** Como operador del sitio, quiero cabeceras de seguridad consistentes en cada respuesta, para reducir clases enteras de ataque (clickjacking, sniffing de MIME, downgrade a HTTP, fuga de referer) sin tocar la lógica del juego.

### Acceptance Criteria

1. THE SYSTEM SHALL adjuntar cabeceras de seguridad de línea base en cada respuesta mediante el proxy de Next 16 (`proxy.ts`, antes `middleware.ts`).
2. THE SYSTEM SHALL enviar `Strict-Transport-Security: max-age=63072000; includeSubDomains` (HSTS), dado que el sitio se sirve por HTTPS detrás del ALB.
3. THE SYSTEM SHALL enviar `X-Frame-Options: DENY` y `frame-ancestors 'none'` en la CSP para impedir el embebido en iframes (anti-clickjacking).
4. THE SYSTEM SHALL enviar `X-Content-Type-Options: nosniff`.
5. THE SYSTEM SHALL enviar `Referrer-Policy: strict-origin-when-cross-origin`.
6. THE SYSTEM SHALL enviar `Permissions-Policy: camera=(), microphone=(), geolocation=()` (deshabilita APIs sensibles que el juego no usa).
7. THE SYSTEM SHALL enviar una `Content-Security-Policy` ajustada al hecho de que el juego no carga scripts de terceros e inyecta sus propios estilos: `default-src 'self'`, `script-src 'self' 'unsafe-inline'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data:`, `connect-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`.
8. THE SYSTEM SHALL aplicar las cabeceras a todas las rutas EXCEPTO los assets estáticos de Next (`_next/static`, `_next/image`, `favicon.ico`), que no las necesitan.

## Out of scope

- Autenticación de usuarios / cuentas: el modelo es anónimo por sala; los tokens autorizan operaciones, no identifican personas.
- Rate limiting en los demás endpoints (`/answer`, `/state`, `/sync`, `/tick`, etc.): solo `/start` cuesta dinero (Bedrock); el resto opera sobre estado ya creado.
- Rotación o expiración explícita de tokens más allá del TTL de sesión (`SESSION_TTL_SECONDS = 3600`).
- Cifrado en reposo del estado de sesión en Redis, WAF, o protección DDoS a nivel de red (responsabilidad de la infraestructura/ALB, no de la app).
- Corrección semántica del contenido generado por Bedrock (cubierta por la spec `bedrock-question-gen`).
