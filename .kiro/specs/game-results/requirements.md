# Requirements — Resultados de partida (game-results)

## Introduction

Hoy una partida del modo infinito termina en **game over** (`status: 'defeat'`) y, salvo lo que aporta `leaderboard`, el resultado se evapora: el jugador no recibe un **cierre** de lo que jugó. No sabe cuántas rondas resolvió de un vistazo, no tiene nada para **compartir** en redes, ni un feedback que le diga **qué hizo bien y en qué falló**. Esta spec agrupa tres piezas que comparten el mismo momento —el **post-partida / game over**— en una sola experiencia de cierre:

1. **Resumen de partida** (E3): una pantalla que, al game over, presenta de forma clara qué tan lejos llegó el equipo — rondas alcanzadas, puntaje, tiempo sobrevivido, mejor racha, en qué lenguaje/tema falló más y la dificultad máxima alcanzada. Es el cierre narrativo de "sobreviví la mayor cantidad de incidentes posible".
2. **Compartir resultado** (E1): generar una **imagen/card** con el resultado (puntaje + rondas + nombre de equipo) lista para postear en redes, usando la generación de imágenes de Next (`ImageResponse` / OG image) — self-contained, sin servicios externos de imagen.
3. **Feedback por correo** (idea propia): al game over, **opcionalmente** el jugador ingresa su email y recibe un correo con su resultado y un **feedback generado por IA** (Bedrock) — qué hizo bien, en qué falló y sugerencias concretas. El envío usa **AWS SES** (Simple Email Service), otro servicio AWS para el relato del jurado.

**Decisión de arquitectura clave:** el resumen se **arma a partir de los datos de la partida** que ya viven en la sesión persistida (Valkey) y los que aporta `endless-mode` al game over (rondas resueltas, segundos sobrevividos, puntaje). El **armado del resumen** y la **validación del email** son **lógica pura testeable** (TDD); el feedback IA reutiliza el patrón **Bedrock Converse** ya usado para generar challenges (`runtime-generator.ts`) con un prompt distinto (analizar la partida); el envío de correo se hace con el SDK de **AWS SES**, autenticado por el **task role** de ECS (igual que Bedrock — sin claves en env vars), agregando el permiso `ses:SendEmail`.

**Relato de hackathon:** el cierre de partida cuenta una historia completa — la IA no solo *genera* el reto (Bedrock al crear challenges) sino que también *analiza tu desempeño* (Bedrock al armar el feedback), y AWS aparece una vez más con SES entregando ese análisis a tu correo. La card compartible convierte cada game over en difusión orgánica del juego.

### Contexto verificado

- `GameSession` (game-types.ts) ya persiste `startedAt`, `remainingTime`, `currentStep`, `status`, `language` y los tokens por jugador (`coderToken`/`helperToken`). Los merges recientes agregan `round`/`mode`/`playedRounds` (endless-mode), `streak`/`bestStreak`/`comboScore` (scoring-and-combos), `coderLives`/`helperLives`/`defeatReason` (lives-system). `gameDurationSeconds(session, now)` (game-engine.ts) ya calcula los segundos transcurridos.
- **El score YA incluye combos (verificado).** El puntaje real del game over es `endlessScore = (playedRounds × 1000 + segundos) + comboScore`, calculado por `finalScore` en `game-engine.ts` y expuesto por `buildEndlessGameOverMeta(session, durationSeconds)` → `{ playedRounds, endlessScore, bestStreak }`. Esta spec **CONSUME `endlessScore` tal cual** (no lo reconstruye con la fórmula vieja `playedRounds × 1000 + segundos`, que ya no representa el score real).
- **Las métricas del game over YA viajan al cliente:** `withEndMeta` (`game-service.ts`, ~316-333) inyecta `durationSeconds`, `playedRounds`, `endlessScore`, `bestStreak` en `CoderStepView`/`HelperSyncView` cuando `mode==='endless' && status==='defeat'`. `bestStreak` YA existe (no hay que agregarlo). La racha viva se llama `streak` (no `correctStreak`).
- **`Difficulty` ahora incluye `'expert'`** (adaptive-difficulty): `type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'`. El orden para "dificultad máxima" es `easy < medium < hard < expert`. La ronda 13+ escala a `'expert'`.
- **Lo que FALTA acumular en la sesión para el resumen completo:** `failuresByLanguage` (para "lenguaje/tema con más fallos") y `maxDifficulty` — NO existen hoy. `bestStreak`, `playedRounds`, `endlessScore`, `durationSeconds` ya están.
- **DEPENDENCIA BLOQUEANTE — `leaderboard` aún NO está implementado.** No hay `sanitizeTeamName`, ni captura de nombre de equipo, ni endpoint/store de leaderboard en el repo (verificado: 0 coincidencias). La v1 de esta spec asumía en presente que "leaderboard ya pide el nombre y lo sanitiza"; eso NO es cierto todavía. R3 (card) y R5 (email) que usan el nombre y `sanitizeTeamName` DEPENDEN de que `leaderboard` se implemente primero (ver Out of scope y R2.4).
- `defeat-messages.ts` ya mapea los 3 `DefeatReason` (`timeout`/`coder_lives`/`helper_lives`) a copy en español por rol — reutilizable en el resumen para "razón de derrota". Hoy el cierre es un banner inline (`GameResultBanner.tsx`) dentro del board, NO una pantalla dedicada; esta spec construye esa pantalla.
- La generación por Bedrock usa `ConverseCommand` con un `system` prompt y `inferenceConfig` (ver `runtime-generator.ts`), autenticada por el **task role** (`infra/main.tf` → `aws_iam_role.task` con la policy `bedrock`). El feedback IA calca ese patrón con otro prompt y devuelve texto, no JSON de challenge.
- Los endpoints siguen el patrón `app/api/game/*/route.ts` (handlers finos que validan el cuerpo, llaman al servicio y traducen a `NextResponse`; ver `answer/route.ts`).
- **AWS SES en sandbox** (estado inicial de toda cuenta): solo se puede enviar **a direcciones verificadas** y desde un remitente verificado. Para enviar a cualquier destinatario hay que **salir del sandbox** (solicitud a AWS). El dominio `hackaton.dvloper.com.co` está en Hostinger; se pueden agregar registros DNS (TXT/CNAME de verificación, DKIM) para verificar el remitente en SES.
- El proyecto mantiene **cero `any`**, **sin `as` casts** (salvo `as const`/`satisfies`), **TDD en la lógica pura** y la **UI en español neutro** (sin voseo).

## Glossary

- **Game over**: fin de una partida del modo infinito (`status: 'defeat'`). Es el único disparador de esta spec.
- **Resumen de partida (run summary)**: objeto derivado con las métricas de cierre — rondas alcanzadas (`playedRounds`), puntaje (`endlessScore`, con combos), tiempo sobrevivido, mejor racha (`bestStreak`), lenguaje/tema con más fallos (`topFailure`, derivado de `failuresByLanguage`), dificultad máxima alcanzada (`maxDifficulty`, incluye `'expert'`), y razón de derrota (`defeatReason`).
- **Mejor racha (`bestStreak`)**: la mayor cantidad de respuestas correctas consecutivas sin errar durante la partida. YA existe en `GameSession` (la mantiene `scoring-and-combos`); esta spec la CONSUME, no la agrega. La racha VIVA se llama `streak` (no `correctStreak`, nombre que usaba la v1).
- **Card compartible (share card)**: imagen generada por el servidor (Next `ImageResponse`/OG image) con puntaje + rondas + nombre de equipo, lista para descargar o compartir en redes.
- **Feedback IA**: texto generado por Bedrock que analiza la partida (qué hizo bien, en qué falló, sugerencias), incluido en el correo.
- **AWS SES (Simple Email Service)**: servicio de AWS para enviar correo. El envío se autentica por el task role (permiso `ses:SendEmail`).
- **Sandbox de SES**: modo inicial de SES donde solo se envía a direcciones verificadas; salir del sandbox habilita destinatarios arbitrarios.

---

## Requirement 1 — Armado del resumen de partida (lógica pura)

**User Story:** Como jugador, quiero ver al terminar un resumen claro de cómo me fue, para tener un cierre de la partida y saber qué tan lejos llegué.

### Acceptance Criteria

1. WHEN una partida del modo infinito termina (game over) THE SYSTEM SHALL armar un **resumen de partida** con: rondas alcanzadas (`playedRounds`), puntaje (`endlessScore`), tiempo sobrevivido (segundos), mejor racha (`bestStreak`), lenguaje/tema con más fallos (`topFailure`), dificultad máxima alcanzada (`maxDifficulty`) y razón de derrota (`defeatReason`).
2. THE SYSTEM SHALL LEER el puntaje del `endlessScore` que el juego ya calculó (con `comboScore` incluido, vía `buildEndlessGameOverMeta`), NUNCA reconstruirlo con `playedRounds × 1000 + segundos` (esa fórmula ya no representa el score real y produciría un número distinto al que el jugador vio). Igual para `playedRounds` y `bestStreak`: se leen, no se recalculan.
3. THE SYSTEM SHALL implementar el armado del resumen (`buildRunSummary`) como una **función pura**, sin dependencias de Redis, Bedrock ni red, para testearla en aislamiento (TDD).
4. WHERE un dato del resumen no esté disponible para una partida (p. ej. no hubo fallos, así que no hay "lenguaje con más fallos") THE SYSTEM SHALL representarlo de forma explícita (ausencia = `null`, no un valor inventado) y la vista lo mostrará como "—" o equivalente.
5. THE SYSTEM SHALL tratar el tiempo sobrevivido como segundos enteros no negativos, y `bestStreak`/`playedRounds` como enteros no negativos.
6. THE SYSTEM SHALL representar `maxDifficulty` sobre el conjunto completo `'easy' | 'medium' | 'hard' | 'expert'` (orden `easy < medium < hard < expert`), incluyendo el nivel `'expert'` que agregó adaptive-difficulty.

## Requirement 1b — Acumulación de las métricas que faltan (topFailure, maxDifficulty)

**User Story:** Como jugador, quiero que el resumen me diga en qué lenguaje fallé más y hasta qué dificultad llegué, para saber dónde flojeo — datos que hoy la sesión no guarda.

### Acceptance Criteria

1. THE SYSTEM SHALL acumular en `GameSession` los fallos por lenguaje (`failuresByLanguage: Partial<Record<ChallengeLanguage, number>>`), incrementando el contador del lenguaje del challenge cuando el Coder responde incorrectamente. `topFailure` del resumen se deriva como el lenguaje con el máximo (o `null` si no hubo fallos).
2. THE SYSTEM SHALL acumular en `GameSession` la dificultad máxima alcanzada (`maxDifficulty: Difficulty`), actualizándola con la dificultad de cada ronda generada (via `roundToDifficulty`), de modo que refleje el nivel más alto que el equipo enfrentó.
3. THE SYSTEM SHALL mantener estas acumulaciones como parte del estado persistido (Valkey), sin romper el contrato existente (campos opcionales; ausencia → resumen con `topFailure: null` y `maxDifficulty` derivada de la ronda alcanzada).
4. THE SYSTEM SHALL NO reintroducir `correctStreak`/`bestStreak` como campos nuevos: `bestStreak` ya existe (scoring-and-combos) y `streak` es la racha viva; el resumen los consume tal cual.

## Requirement 2 — Pantalla de resumen al game over

**User Story:** Como jugador, quiero una pantalla de resumen al perder, para entender de un vistazo mi desempeño y decidir si comparto o pido feedback.

### Acceptance Criteria

1. WHEN la partida llega a game over THE SYSTEM SHALL mostrar una pantalla de resumen con las métricas de R1 presentadas de forma legible (rondas, puntaje, tiempo, mejor racha, lenguaje/tema con más fallos, dificultad máxima).
2. THE SYSTEM SHALL presentar el resumen en **español neutro** (sin voseo), consistente con el resto del juego.
3. THE SYSTEM SHALL ofrecer desde el resumen las acciones de **compartir** (R3) y **pedir feedback por correo** (R4), sin obligar a ninguna de las dos para cerrar la partida.
4. THE SYSTEM SHALL coexistir con el flujo de `leaderboard` (también post-game-over): el resumen reutiliza el **nombre de equipo** capturado por `leaderboard` y no lo vuelve a pedir. NOTA: `leaderboard` es **dependencia bloqueante** para las piezas que usan el nombre (R3 card, R5 email); mientras no exista, el resumen (R1/R2) puede mostrarse SIN nombre de equipo (las métricas no lo necesitan). El resumen NO debe implementar la captura ni la sanitización del nombre: eso pertenece a `leaderboard`.
5. THE SYSTEM SHALL renderizar cualquier texto provisto por el usuario (nombre de equipo) como texto plano, nunca como HTML interpretado.

## Requirement 3 — Card compartible del resultado

**User Story:** Como jugador, quiero generar una imagen con mi resultado para postearla en redes, para presumir cuán lejos llegó mi equipo y atraer a otros al juego.

### Acceptance Criteria

1. WHEN el jugador pide compartir THE SYSTEM SHALL generar una **imagen** (card) que contenga al menos el puntaje, las rondas alcanzadas y el nombre de equipo.
2. THE SYSTEM SHALL generar la imagen en el servidor con la generación de imágenes de Next (`ImageResponse` / OG image), **self-contained**, sin depender de servicios externos de generación de imágenes.
3. THE SYSTEM SHALL exponer la card vía un endpoint del patrón `app/api/game/*` que reciba las métricas a renderizar y devuelva la imagen con el `Content-Type` correcto.
4. THE SYSTEM SHALL sanitizar/escapar el nombre de equipo antes de renderizarlo en la imagen, reutilizando `sanitizeTeamName` de `leaderboard` (nunca el texto crudo). Como `sanitizeTeamName` aún no existe, esta pieza queda BLOQUEADA hasta que `leaderboard` se implemente; hasta entonces la card puede generarse solo con puntaje + rondas (sin nombre).
5. THE SYSTEM SHALL permitir al jugador descargar o copiar la imagen para compartirla; el sistema NO publica automáticamente en ninguna red.
6. WHERE la generación de la imagen falle THE SYSTEM SHALL degradar a un resultado en texto compartible (puntaje + rondas + nombre) sin romper la pantalla de resumen.

## Requirement 4 — Feedback por correo (opcional)

**User Story:** Como jugador que quiere mejorar, quiero ingresar mi email y recibir un correo con mi resultado y un análisis de qué hice bien y en qué fallé, para aprender de la partida.

### Acceptance Criteria

1. THE SYSTEM SHALL ofrecer en el resumen un campo **opcional** de email; el jugador puede cerrar la partida sin ingresarlo.
2. WHEN el jugador envía un email THE SYSTEM SHALL **validar y sanitizar** el email como lógica pura antes de cualquier I/O, rechazando formatos inválidos con un mensaje en español neutro y sin enviar correo.
3. WHEN el email es válido THE SYSTEM SHALL exponer `POST /api/game/feedback` que reciba el email y la referencia a la partida, genere el feedback IA y envíe el correo vía AWS SES.
4. THE SYSTEM SHALL generar el **feedback** con Bedrock (`ConverseCommand`, mismo patrón que `runtime-generator.ts`) a partir de los datos del resumen (rondas, racha, lenguaje/tema con más fallos, dificultad), con un prompt que produzca: qué hizo bien, en qué falló y sugerencias concretas, en español neutro.
5. THE SYSTEM SHALL enviar el correo con el SDK de AWS SES (`SendEmailCommand`), autenticado por el **task role** de ECS (sin claves en env vars), con remitente verificado.
6. WHEN la generación del feedback IA falla (timeout, error, abort) THE SYSTEM SHALL degradar a un feedback de fallback basado solo en el resumen (sin frase de IA), de modo que el correo igual se envíe con el resultado.
7. THE SYSTEM SHALL responder al cliente con un acuse de envío (o de error) sin filtrar detalles internos de SES/Bedrock en el mensaje al usuario.

## Requirement 5 — Seguridad y abuso del envío de correo

**User Story:** Como responsable del servicio, quiero que el envío de correo no se pueda abusar para spamear ni inyectar contenido, para no quemar la reputación de envío de SES ni exponer a terceros.

### Acceptance Criteria

1. THE SYSTEM SHALL validar y sanitizar el email en el servidor (lógica pura) antes de tocar Bedrock o SES; un email inválido → `400`, sin generar feedback ni enviar correo.
2. THE SYSTEM SHALL aplicar un **rate limit** al envío de correo (por sesión y/o por email y/o por IP) para no spamear SES; superar el límite → `429` con mensaje en español, sin enviar.
3. THE SYSTEM SHALL atar el envío a una **partida real terminada**, verificando el token de sesión (`isAuthorizedFor(sessionId, 'coder', token)`) y derivando las métricas del feedback del **estado de sesión persistido** del game over, en vez de confiar en métricas crudas del cliente.
4. THE SYSTEM SHALL escapar/neutralizar cualquier texto del usuario (nombre de equipo, email) incluido en el cuerpo del correo, para evitar inyección de encabezados (CRLF) o contenido en el correo.
5. THE SYSTEM SHALL documentar que SES arranca en **sandbox** (solo destinatarios verificados); en producción, para enviar a emails arbitrarios, hay que **salir del sandbox** y verificar el dominio remitente (`hackaton.dvloper.com.co`) con los registros DNS correspondientes en Hostinger.
6. THE SYSTEM SHALL mantener cero `any` y sin `as` casts (salvo `as const`/`satisfies`) en el código nuevo.

## Requirement 6 — Infraestructura para SES (task role + verificación)

**User Story:** Como mantenedor de la infra, quiero otorgarle a la app el permiso mínimo para enviar correo y verificar el remitente, para que SES funcione en producción sin claves embebidas.

### Acceptance Criteria

1. THE SYSTEM SHALL agregar al **task role** de ECS (`aws_iam_role.task`, `infra/main.tf`) un permiso `ses:SendEmail` (y `ses:SendRawEmail` si se usa correo con encabezados crudos), acotado al recurso de identidad verificada, de forma análoga a como se agregó la policy de `bedrock`.
2. THE SYSTEM SHALL exponer como configuración (env var del task definition, sin secretos) el remitente verificado (p. ej. `SES_FROM_ADDRESS`) y la región de SES, sin hardcodearlos en el código de dominio.
3. THE SYSTEM SHALL documentar (no necesariamente automatizar en esta spec) los **registros DNS** de verificación del dominio remitente en Hostinger (verificación de dominio + DKIM) requeridos para SES.
4. THE SYSTEM SHALL funcionar en **dev local sin SES**: sin la configuración de SES, el endpoint de feedback degrada (no envía, responde un estado claro) sin romper, igual que el fallback de Bedrock degrada al curado.

## Out of scope

- La **mecánica del modo infinito** (rondas, game over, puntaje con combos) → specs `endless-mode` + `scoring-and-combos`, de las que esta spec **depende** para las métricas. El puntaje se CONSUME (`endlessScore`, con combos), no se recalcula.
- El **ranking global**, la **captura del nombre de equipo** y **`sanitizeTeamName`** → spec `leaderboard`, **dependencia bloqueante** para R3/R5. Esta spec **reutiliza** el nombre y la sanitización, NO los implementa. Implementar `leaderboard` primero.
- Cuentas de usuario, verificación de propiedad del email (doble opt-in), historial de correos enviados o desuscripción gestionada.
- Salir del sandbox de SES y la automatización Terraform del alta de registros DNS en Hostinger (se documentan como pasos operativos, no se implementan acá).
- Plantillas de correo enriquecidas (HTML elaborado, multi-idioma) más allá de un correo claro en español con el resumen y el feedback.
- Programar/encolar envíos diferidos o reintentos asíncronos de SES más allá del manejo de error inmediato.
