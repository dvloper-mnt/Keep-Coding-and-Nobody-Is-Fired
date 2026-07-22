# Tasks — Resultados de partida (game-results)

> Estado: feature NUEVA, aún sin implementar. Todas las tareas están pendientes.
> Implementación de adentro hacia afuera (lógica pura → acumulación en sesión → generación IA / envío → endpoints → vista → infra). TDD donde hay lógica pura.

- [ ] 1. Lógica pura del resumen y del email (TDD primero)
  - [ ] 1.1 Crear `src/features/game/run-summary.ts` con `buildRunSummary(sessionState, metrics): RunSummary` que derive rondas alcanzadas, puntaje, tiempo sobrevivido, mejor racha, lenguaje/tema con más fallos (`topFailure`) y dificultad máxima (`maxDifficulty`), tomando `score`/`playedRounds`/`secondsSurvived` tal cual los expone `endless-mode` (sin recalcular); ausencias como `null`, nunca valores inventados
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [ ] 1.2 Crear `src/features/game/feedback-email.ts` con `sanitizeEmail(raw): { ok: true; email: string } | { ok: false; reason: string }`: `trim` → validar formato (local@dominio) → longitud máxima → rechazar control chars/saltos de línea; discriminated union, sin `as`/`any`
    - _Requirements: 4.2, 5.1, 5.6_
  - [ ] 1.3 En `feedback-email.ts`, `renderEmailBody(summary, feedbackText): string`: cuerpo en texto plano del resumen + feedback, **escapando** el nombre de equipo y sin permitir CRLF inyectable en encabezados (anti header injection)
    - _Requirements: 5.4, 4.4_
  - [ ] 1.4 Tests `run-summary.test.ts`: deriva cada métrica del estado + métricas de `endless-mode`; `topFailure`/`maxDifficulty` `null` cuando no hubo fallos/dificultad; mejor racha como reduce de aciertos consecutivos; NO recalcula score/rondas
    - _Requirements: 1.1, 1.2, 1.4, 1.5_
  - [ ] 1.5 Tests `feedback-email.test.ts`: email vacío/sin `@`/dominio inválido/supera el máximo → `ok:false`; válido pasa intacto; `renderEmailBody` escapa el nombre de equipo y no admite saltos de línea en encabezados
    - _Requirements: 4.2, 5.1, 5.4_

- [ ] 2. Acumulación de métricas durante la partida (game-service / endless-mode)
  - [ ] 2.1 Agregar a `GameSession` (game-types.ts) los campos de acumulación: `correctStreak`, `bestStreak`, `failuresByLanguage: Record<ChallengeLanguage, number>`, `maxDifficulty?: Difficulty` (cero `any`, sin `as`)
    - _Requirements: 1.1, 1.5, 5.6_
  - [ ] 2.2 En `game-service` (al procesar cada respuesta): incrementar `correctStreak` al acertar y actualizar `bestStreak = max(bestStreak, correctStreak)`; resetear `correctStreak` a 0 y `failuresByLanguage[lenguaje]++` al errar; actualizar `maxDifficulty` con la dificultad de la ronda. Persistir en Valkey
    - _Requirements: 1.1, 1.2_
  - [ ] 2.3 Exponer al game over, junto a `score`/`playedRounds`/`secondsSurvived` de `endless-mode`, el `bestStreak`, `failuresByLanguage` y `maxDifficulty` para que `buildRunSummary` los reduzca
    - _Requirements: 1.2_
  - [ ] 2.4 Agregar tipos en `game-types.ts`: `RunSummary`, `TopFailure`, `FeedbackRequest`, `FeedbackResult`, `ShareCardParams` (cero `any`, sin `as`)
    - _Requirements: 1.1, 5.6_

- [ ] 3. Generación del feedback IA (Bedrock) y envío por SES
  - [ ] 3.1 Crear `src/features/game/feedback-generator.ts` con `generateFeedback(summary): Promise<string | null>` vía `ConverseCommand`, calcando `runtime-generator.ts` (mismo cliente/timeout/`AbortController`/`guardrailConfig`/`try-catch-finally`), con un `system` prompt que analice la partida (qué hizo bien, en qué falló, sugerencias) y salida en **texto** español neutro; `null` ante cualquier fallo
    - _Requirements: 4.4, 4.6_
  - [ ] 3.2 Crear `src/features/game/ses-mailer.ts` con `sendFeedbackEmail(to, subject, body)` usando `@aws-sdk/client-ses` (`SendEmailCommand`), autenticado por el **task role** (sin claves en env vars), remitente `SES_FROM_ADDRESS`; degrada (no envía, estado claro) si SES no está configurado (dev)
    - _Requirements: 4.5, 6.2, 6.4_
  - [ ] 3.3 Constantes en `constants.ts`: límites de rate del feedback (ventana + máximo) y asunto del correo
    - _Requirements: 5.2_

- [ ] 4. Endpoint de feedback `POST /api/game/feedback`
  - [ ] 4.1 Crear `app/api/game/feedback/route.ts` (`POST`): parsear el cuerpo `{ sessionId, token, email }`, validar email (`sanitizeEmail`) → `400` si inválido; aplicar rate limit (`incr`/`expire` sobre `getRedis()`, clave por sesión/email/IP) → `429` si excede; verificar `isAuthorizedFor(sessionId, 'coder', token)` → `403` si no coincide
    - _Requirements: 4.2, 4.3, 5.1, 5.2, 5.3_
  - [ ] 4.2 En el mismo route, derivar el resumen del **estado de sesión persistido** del game over (fuente de verdad), generar el feedback (`generateFeedback`, con fallback de feedback basado solo en el resumen si devuelve `null`), renderizar el cuerpo (`renderEmailBody`) y enviar vía `sendFeedbackEmail`
    - _Requirements: 4.4, 4.6, 5.3_
  - [ ] 4.3 Responder un acuse `{ sent }` (o `{ sent: false, reason }`) **sin filtrar** detalles internos de SES/Bedrock en el mensaje al usuario
    - _Requirements: 4.7_

- [ ] 5. Card compartible `GET /api/game/share-card`
  - [ ] 5.1 Crear `app/api/game/share-card/route.ts` (`GET`): recibir `score`/`rounds`/`team` por query, **sanitizar el nombre** reutilizando `sanitizeTeamName` de `leaderboard`, y devolver la imagen con `ImageResponse` (`next/og`), `Content-Type: image/png`. Leer `node_modules/next/dist/docs/` antes de codear la API de OG (AGENTS.md)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 6. Vista del resumen al game over
  - [ ] 6.1 Pantalla/sección de resumen al game over: mostrar rondas alcanzadas, puntaje, tiempo sobrevivido, mejor racha, lenguaje/tema con más fallos y dificultad máxima (datos ausentes como «—»); español neutro (sin voseo)
    - _Requirements: 2.1, 2.2, 1.4_
  - [ ] 6.2 Reutilizar el **nombre de equipo** ya capturado por `leaderboard` (no re-pedirlo); renderizarlo como texto plano (nunca HTML interpretado)
    - _Requirements: 2.4, 2.5_
  - [ ] 6.3 Acción de **compartir**: pedir/descargar la card (`/api/game/share-card`) para copiar o guardar; el sistema NO publica en redes; degradar a un resultado en texto compartible si la imagen falla
    - _Requirements: 3.1, 3.5, 3.6_
  - [ ] 6.4 Campo **opcional** de email con validación de UX en cliente; al enviar, hacer el `POST /api/game/feedback`; mostrar el acuse de envío o el error en español neutro; permitir cerrar la partida sin ingresar email
    - _Requirements: 4.1, 2.3, 4.7_

- [ ] 7. Infraestructura SES (Terraform)
  - [ ] 7.1 En `infra/main.tf`, agregar al `aws_iam_role.task` una policy con `ses:SendEmail` (y `ses:SendRawEmail` si se usa correo crudo), acotada a la identidad verificada, de forma análoga a la policy `bedrock`
    - _Requirements: 6.1_
  - [ ] 7.2 Exponer `SES_FROM_ADDRESS` (y región de SES si difiere) como env var del task definition (sin secretos), igual que `BEDROCK_GUARDRAIL_ID`
    - _Requirements: 6.2_
  - [ ] 7.3 Documentar los pasos operativos (no automatizados acá): verificar el dominio remitente `hackaton.dvloper.com.co` en SES con los registros DNS en Hostinger (TXT de verificación + CNAME de DKIM) y la salida del **sandbox** de SES para destinatarios arbitrarios
    - _Requirements: 5.5, 6.3_

- [ ] 8. Verificación
  - [ ] 8.1 `npm run test` verde (tests de `run-summary`, `feedback-email`, `feedback-generator` con Bedrock mockeado, y del endpoint de feedback) + suite existente sin regresión; `tsc --noEmit` 0 errores; `npm run lint` 0 warnings; cero `any` / sin `as`
    - _Requirements: 1.3, 4.2, 5.6_
  - [ ] 8.2 Smoke en local (sin SES): terminar una partida del modo infinito, ver el resumen, generar la card, e intentar el envío de feedback confirmando que degrada limpio sin SES configurado
    - _Requirements: 2.1, 3.1, 6.4_
  - [ ] 8.3 Verificar en producción tras deploy: con SES verificado y destinatario válido, el feedback IA se genera (Bedrock) y el correo llega vía SES; confirmar `400` con email inválido y `429` al exceder el rate limit
    - _Requirements: 4.3, 4.5, 5.1, 5.2_

## Notas

- **Dependencias:** esta spec depende de `endless-mode` (rondas, puntaje, segundos, y la acumulación de racha/fallos/dificultad durante la partida) y de `leaderboard` (nombre de equipo sanitizado + `sanitizeTeamName`). La lógica pura (1.x) y el `feedback-generator`/`ses-mailer` (3.x) se pueden implementar y testear con datos de prueba ANTES de que esas specs estén listas; el último cable a conectar son las métricas y el nombre reales.
- **AWS:** el feedback IA reutiliza el patrón Bedrock Converse de `runtime-generator.ts` con otro prompt; el envío usa AWS SES autenticado por el **task role** (sin claves en env vars), igual que Bedrock. Solo se agrega el permiso `ses:SendEmail` y la env `SES_FROM_ADDRESS` — análogo a como se agregó `bedrock:*`.
- **SES sandbox:** en sandbox SES solo entrega a direcciones verificadas; para la demo se verifican los destinatarios, y para producción hay que salir del sandbox y verificar el dominio remitente con DNS en Hostinger (tarea 7.3).
- **Seguridad:** validar/sanitizar el email antes de cualquier I/O, rate-limitear el envío para no spamear SES, atar a la partida real vía token y derivar las métricas del estado persistido del game over.
- Fuera de alcance (specs hermanas): la mecánica del modo infinito, el ranking global y la dificultad adaptativa.
