# Tasks — Resultados de partida (game-results)

> **Estado (2026-07-23):** implementación en curso. El resumen visual, la card
> compartible OG y los botones de share social ya están en `main`. Falta solo
> el feedback IA en pantalla (streaming SSE via Bedrock).
>
> **Cambio clave (2026-07-23):** SES + email quedan FUERA DE ALCANCE. El
> feedback IA se muestra dentro del juego (streaming token por token, como el
> generador de challenges) con opción de copiar al portapapeles. Cero infra
> nueva de correo, cero verificación DNS, cero sandbox de SES. Ver la sección
> "Cambio de premisa" al pie.
>
> Implementación de adentro hacia afuera (lógica pura → acumulación en sesión
> → generación IA / streaming → endpoints → vista). TDD donde hay lógica pura.
>
> **Refinamiento 2026-07-03:** el score se LEE de `endlessScore` (con combos), no se recalcula. `bestStreak` YA existe (no agregarlo); solo `failuresByLanguage` y `maxDifficulty` son nuevos. `maxDifficulty` incluye `'expert'`. `leaderboard` (nombre de equipo + `sanitizeTeamName`) ya está IMPLEMENTADO — la card compartible reutiliza `sanitizeTeamName`.

- [x] 1. Lógica pura del resumen (TDD primero)
  - [x] 1.1 Crear `src/features/game/run-summary.ts` con `buildRunSummary(gameOverState): RunSummary` que LEA `endlessScore` (con combos, tal cual lo expone `buildEndlessGameOverMeta`), `playedRounds`, `bestStreak` y `durationSeconds` SIN recalcularlos, y derive `topFailure` (de `failuresByLanguage`), `maxDifficulty` (incluye `'expert'`) y `defeatReason`; ausencias como `null`, nunca valores inventados.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  - [x] 1.2 Tests `run-summary.test.ts`: LEE `endlessScore`/`playedRounds`/`bestStreak` tal cual (test con combos: el score del resumen == `endlessScore` de la sesión, NO `playedRounds×1000+segundos`); `topFailure`/`maxDifficulty` `null` cuando no aplica; `maxDifficulty` reconoce `'expert'`.
    - _Requirements: 1.1, 1.2, 1.4, 1.6_

- [x] 2. Acumulación de las métricas NUEVAS (game-service)
  - [x] 2.1 Agregar a `GameSession` (game-types.ts) SOLO los campos que faltan: `failuresByLanguage?: Partial<Record<ChallengeLanguage, number>>` y `maxDifficulty?: Difficulty`. NO agregar `correctStreak`/`bestStreak`: `bestStreak` ya existe y la racha viva es `streak` (scoring-and-combos).
    - _Requirements: 1b.1, 1b.2, 1b.3, 1b.4_
  - [x] 2.2 En `game-service` (al procesar cada respuesta): al errar, `failuresByLanguage[lenguaje de la ronda]++`; en cada ronda generada, actualizar `maxDifficulty` con la dificultad de la ronda (`roundToDifficulty`, orden `easy<medium<hard<expert`). Persistir en Valkey. NO tocar `streak`/`bestStreak` (ya los mantiene el engine). *(Helpers `incrementFailure` + `highestDifficulty` en `game-service.ts`.)*
    - _Requirements: 1b.1, 1b.2_
  - [x] 2.3 Exponer al game over `failuresByLanguage` y `maxDifficulty` junto a los ya expuestos (`endlessScore`/`playedRounds`/`bestStreak`/`durationSeconds`), para que `buildRunSummary` los reduzca. *(`withEndMeta` inyecta `runSummary` en `CoderStepView` y `HelperSyncView`.)*
    - _Requirements: 1.2, 1b.3_
  - [x] 2.4 Agregar tipos en `game-types.ts`: `RunSummary`, `TopFailure` (cero `any`, sin `as`).
    - _Requirements: 1.1_

- [ ] 3. Feedback IA en streaming (Bedrock, sin email)
  - [ ] 3.1 Crear `src/features/game/feedback-generator.ts` con `generateFeedbackStreaming(session, onDelta): Promise<{ done: boolean }>` vía `ConverseStreamCommand`, calcando `runtime-generator.ts::generateChallengeStreaming` (mismo cliente/timeout/`AbortController`/`guardrailConfig`/`try-catch-finally`, mismo patrón de emisión token por token). System prompt en español neutro pidiendo análisis constructivo (qué salió bien, qué mejorar, próximo enfoque). Salida en TEXTO plano; nunca JSON.
    - _Requirements: 4.4, 4.6_
  - [ ] 3.2 Tests `feedback-generator.test.ts`: input con game over válido genera prompt correcto (chequear el mensaje enviado); Bedrock devuelve deltas → callback recibe cada uno; timeout / error / abort → resuelve limpio; sesión inválida (no defeat) → rechazo sin llamar a Bedrock.
    - _Requirements: 4.4_

- [ ] 4. Endpoint SSE `/api/game/feedback-stream`
  - [ ] 4.1 Crear `app/api/game/feedback-stream/route.ts` (`GET`, `Content-Type: text/event-stream`): parsear `sessionId` + `token` de query, `isAuthorizedFor(sessionId, 'coder', token)` (403 vía evento SSE `error`), rate limit por sesión reusando `rate-limit.ts` (429 vía evento SSE `error`), leer sesión + validar game over endless (rechazo si no).
    - _Requirements: 4.2, 4.3, 5.1, 5.2, 5.3_
  - [ ] 4.2 Emitir eventos SSE análogos a `generate-stream/route.ts`: `delta` con el texto acumulado JSON-encoded en cada callback, `done` al completar, `error` con mensaje en español si el stream falla o Bedrock rechaza.
    - _Requirements: 4.4, 4.6_
  - [ ] 4.3 Idempotencia: no marcar la sesión con un flag persistente (el feedback es re-generable a demanda); el rate-limit basta para prevenir abuso.
    - _Requirements: 5.2_

- [x] 5. Card compartible `GET /api/game/share-card` (implementado en PR #5)
  - [x] 5.1 Crear `app/api/game/share-card/route.tsx` (`GET`): recibir `score`/`rounds`/`team` por query y devolver la imagen con `ImageResponse` (`next/og`), `Content-Type: image/png`. Referencia: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/image-response.md` (Next 16 mantiene la firma de Next 14/15 en `ImageResponse`; el breaking change de `params`/`searchParams` solo afectó pages y file conventions).
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 5.2 Sanitizar el `team` reutilizando `sanitizeTeamName` de `leaderboard-score`. Fallback `'Equipo anónimo'` cuando falta o queda vacío tras sanitizar. Cap defensivo en `score` y `rounds` para prevenir layouts rotos con valores absurdos (via `parseShareCardParams` puro, con tests).
    - _Requirements: 3.4_

- [x] 6. Vista del resumen al game over
  - [x] 6.1 Pantalla/sección de resumen al game over (`RunSummaryPanel` en `src/components/organisms/`): rondas alcanzadas, puntaje (`endlessScore`, el MISMO que ve en el juego), tiempo sobrevivido, mejor racha, lenguaje/tema con más fallos, dificultad máxima y razón de derrota (`defeat-messages.ts`); datos ausentes como «—»; español neutro (tuteo).
    - _Requirements: 2.1, 2.2, 1.4_
  - [x] 6.2 El **nombre de equipo** lo aporta `leaderboard` (no re-pedirlo); renderizarlo como texto plano (nunca HTML interpretado). *(Wire-up completo: registro en `LeaderboardPanel`, y el mismo panel muestra el CTA de descargar la tarjeta al completar el registro.)*
    - _Requirements: 2.4, 2.5_
  - [x] 6.3 Acción de **compartir**: `ShareScoreButtons` (X, LinkedIn, Facebook — social intent URLs) para compartir texto + link, y CTA "Descargar tarjeta" que abre `/api/game/share-card` con team + score + rounds. Degrada a texto compartible si la imagen falla. El sistema NO postea.
    - _Requirements: 3.1, 3.5, 3.6_
  - [x] 6.4 Paridad Helper: `HelperBoard` muestra el mismo `RunSummaryPanel` + `LeaderboardTable` (read-only) al game over endless. Registro sigue siendo Coder-only. *(PR #4.)*
    - _Requirements: 2.1, 2.2_

- [ ] 7. Vista del feedback IA (streaming inline)
  - [x] 7.1 Componente `AiFeedbackPanel` (`src/components/organisms/`) que auto-inicia la conexión SSE al game over endless, renderiza el texto acumulado con efecto typewriter natural (del stream), muestra caret parpadeante mientras llega, y expone botón "Copiar análisis" cuando termina. Español neutro (tuteo).
    - _Requirements: 4.1, 2.3_
  - [x] 7.2 Hook `useFeedbackStream(sessionId, active)` (`src/features/game/hooks/`): abre `EventSource` a `/api/game/feedback-stream`, acumula deltas, expone `{ text, streamDone, error }`. Mismo patrón de lifecycle que `useChallengeStream` (guard `openedRef`, cierre en unmount, sin sync setState en useEffect).
    - _Requirements: 4.4, 4.6_
  - [x] 7.3 Wire en `CoderBoard`: renderizar `AiFeedbackPanel` entre `RunSummaryPanel` y `LeaderboardPanel` al `defeat` en `endless`.
    - _Requirements: 2.1, 4.1_

- [ ] 8. Verificación final
  - [ ] 8.1 `corepack pnpm@9.15.0 run test` verde (tests de `run-summary` incluido el de CONSISTENCIA score-con-combos, `feedback-generator` con Bedrock mockeado, endpoint de feedback-stream con SSE) + suite existente sin regresión; `tsc --noEmit` 0 errores; `corepack pnpm@9.15.0 run lint` 0 warnings; cero `any` / sin `as`.
    - _Requirements: 1.3, 4.2_
  - [ ] 8.2 Smoke en local: terminar una partida del modo infinito CON combos, ver el resumen y confirmar que el puntaje mostrado == el del game over (con combos); ver el feedback IA aparecer en streaming; copiar el análisis; descargar la tarjeta.
    - _Requirements: 2.1, 3.1, 4.4_
  - [ ] 8.3 Verificar en producción tras deploy: Bedrock genera el feedback en streaming en menos de ~20s (mismo timeout que challenges); rate limit responde 429 al abuso; auth falla con 403 sin token válido.
    - _Requirements: 4.3, 5.1, 5.2_

## Cambio de premisa vs. v1 (SES/email fuera de alcance)

La versión original de esta spec (2026-06-24) planteaba entregar el feedback IA por email vía AWS SES. Esa vía tenía tres bloqueos operativos:

1. Verificación del dominio remitente en SES (DKIM en Hostinger) — hasta 72h de propagación DNS, fuera del ciclo del hackathon.
2. Salida del sandbox de SES para enviar a destinatarios arbitrarios — hasta 24h de aprobación de AWS.
3. Infra Terraform + IAM `ses:SendEmail` + `SES_FROM_ADDRESS` — bajo costo pero acumula superficie.

**Decisión (2026-07-23):** cortar SES y mostrar el feedback IA DENTRO del juego, en streaming, con opción de copiar al portapapeles. Ventajas concretas:

- Cero infra DNS / sandbox / Terraform adicional.
- El feedback IA sigue siendo un "wow" técnico para la demo (Bedrock generando análisis en vivo, token por token, en la pantalla del jugador).
- Se reutiliza el patrón exacto de `generate-stream` + `useChallengeStream`: SSE + `EventSource`, mismo esqueleto que ya está probado en producción.
- El jugador NO tiene que dar su email para ver el análisis, reduciendo fricción y riesgo de privacidad.

Todas las secciones que originalmente dependían de SES (`feedback-email.ts` con `sanitizeEmail`/`renderEmailBody`, `ses-mailer.ts`, endpoint `POST /api/game/feedback` con envío por correo, UI de input de email, Terraform SES, verificación sandbox) fueron **eliminadas de este plan**.

## Notas

- **Score:** `buildRunSummary` LEE `endlessScore` (con `comboScore`, de scoring-and-combos) — nunca lo reconstruye. Reconstruirlo daría un número distinto al del game over.
- **Dependencia:** `leaderboard` (nombre de equipo + `sanitizeTeamName`) YA está implementado y en producción. La card compartible reutiliza `sanitizeTeamName` directamente vía `parseShareCardParams`.
- **AWS:** el feedback IA reutiliza el patrón Bedrock Converse Streaming de `runtime-generator.ts` con otro prompt. NO se agregan servicios AWS nuevos (SES eliminado).
- **Seguridad del feedback endpoint:** atar al `coderToken` existente (`isAuthorizedFor`), rate-limitear con `rate-limit.ts`, y validar que la sesión sea game over endless antes de invocar Bedrock (no gastar tokens en sesiones vivas).
- **Escalado natural con Kiro/Bedrock:** el feedback usa el mismo `ConverseStreamCommand` que los challenges, comparte el guardrail (`BEDROCK_GUARDRAIL_ID`), y sale por CloudWatch en la misma serie de métricas (visible en el dashboard `keep-coding-game`).
- Fuera de alcance (specs hermanas): la mecánica del modo infinito, el ranking global, la dificultad adaptativa, el cálculo de combos (ya incluido en `endlessScore`).
