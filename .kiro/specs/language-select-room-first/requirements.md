# Requirements — Selección de lenguaje + flujo sala-primero

## Introduction

Esta spec documenta RETROACTIVAMENTE una feature ya implementada. Describe lo construido, no propone nada nuevo.

La feature cubre dos cambios que viajan juntos:

1. **Selección de lenguaje en el inicio.** El modal de "Confirmar inicio" deja al Coder elegir el lenguaje del incidente (PHP, SQL, TypeScript, JavaScript, Python, Go, Java, Ruby) o `Aleatorio (sorpresa)`. La elección viaja como query param `?lang=` a `/coder` y termina como `language` en el cuerpo del POST a `/start`. El generador de Bedrock arma su instrucción de prompt con ese lenguaje.

2. **Flujo sala-primero (idle → playing).** Antes `/start` esperaba a Bedrock (~14s) antes de devolver el código de sala — el Coder miraba un spinner mientras el modelo generaba. Ahora `/start` crea la sala en estado `idle` y devuelve el `sessionId` AL INSTANTE (<1s). El primer poll de `/state` es el que dispara la generación de Bedrock (idempotente), y el polling promueve la sala de `idle` a `playing` en cuanto el desafío está listo. Un Helper que entra antes recibe `{ pending: true }` y ve una pantalla de espera en lugar de un error de "sala no encontrada".

**Por qué juntas:** el sala-primero solo tiene sentido si la generación conoce el lenguaje pedido; el lenguaje solo importa porque hay una generación diferida que lo consume. Son dos caras de la misma decisión: sacar a Bedrock del camino crítico del inicio.

### Contexto verificado (código real)

- El select vive en `src/components/molecules/StartGameButton.tsx` (componente cliente). `confirmStart` hace `router.push('/coder?lang=<valor>')`.
- El tipo `ChallengeLanguage` está en `src/features/game/game-types.ts`: `'random' | 'php' | 'sql' | 'typescript' | 'javascript' | 'python' | 'go' | 'java' | 'ruby'`.
- La lógica de lenguaje vive en `src/features/game/challenge-language.ts`: `SELECTABLE_LANGUAGES`, `resolveLanguage` (resuelve `'random'` a uno concreto), `languageInstruction` (arma la frase para el prompt).
- `app/api/game/start/route.ts` valida el `language` recibido contra `SELECTABLE_LANGUAGES`; cualquier valor no permitido cae a `'random'`.
- `startGame(language)` (`game-service.ts`) crea la sesión con `createPendingSession` (`game-engine.ts`) y devuelve `{ sessionId, coderToken }` sin invocar Bedrock.
- `getCoderState` → `ensureChallengeGenerated` es donde se dispara la generación, protegida por el flag `generating` + `generatingStartedAt` con un TTL de claim de 30s (`GENERATION_CLAIM_TTL_MS`).

## Glossary

- **Sala `idle`**: sesión recién creada por `/start` que aún no tiene desafío. El reloj NO corre. Existe para que el Coder comparta el código mientras Bedrock genera en segundo plano.
- **Sala `playing`**: sesión ya promovida, con desafío resuelto y reloj en marcha (180s).
- **Sala-primero**: patrón en el que la sala (y su código) existen ANTES que el desafío. La generación ocurre después, disparada por el primer poll.
- **Claim de generación**: marca (`generating: true` + `generatingStartedAt`) que un poll pone para reclamar la generación y evitar que otro poll concurrente la dispare en paralelo.
- **TTL de claim**: ventana (30s) tras la cual un claim se considera muerto — si el request que reclamó murió a mitad de camino, el siguiente poll reintenta en vez de congelar la sala.
- **`resolveLanguage`**: función que convierte `'random'` en un lenguaje concreto elegido al azar; para un lenguaje ya concreto lo devuelve tal cual.
- **`languageInstruction`**: función que produce la frase `El bug y el código deben ser de <Lenguaje>.` que se inyecta en el mensaje de usuario del prompt de Bedrock.

---

## Requirement 1 — Selección de lenguaje en el modal de inicio

**User Story:** Como Coder, quiero elegir el lenguaje del incidente antes de iniciar, para enfrentar un bug del stack que quiero practicar (o dejar que sea sorpresa).

### Acceptance Criteria

1. THE SYSTEM SHALL presentar en el modal de "Confirmar inicio" un `<select>` con las opciones: `Aleatorio (sorpresa)` (`random`), `PHP / Laravel` (`php`), `SQL` (`sql`), `TypeScript` (`typescript`), `JavaScript` (`javascript`), `Python` (`python`), `Go` (`go`), `Java` (`java`), `Ruby` (`ruby`).
2. THE SYSTEM SHALL usar `random` como valor por defecto del select.
3. WHEN el Coder confirma el inicio THE SYSTEM SHALL navegar a `/coder?lang=<valor seleccionado>` con el lenguaje elegido como query param.
4. THE SYSTEM SHALL tipar el valor seleccionado como `ChallengeLanguage`, manteniendo la lista del select alineada con `SELECTABLE_LANGUAGES`.
5. WHILE el inicio está en curso (`starting`) THE SYSTEM SHALL deshabilitar el select y los botones del modal para evitar dobles envíos.

## Requirement 2 — Propagación y validación del lenguaje hacia el backend

**User Story:** Como responsable de la integridad del juego, quiero que el lenguaje viaje del modal al generador sin que un valor arbitrario pueda inyectarse, porque el query param es manipulable por el usuario.

### Acceptance Criteria

1. THE SYSTEM SHALL leer `lang` desde los search params en `/coder` (`useSearchParams`) y pasarlo a `startGame(requestedLanguage)` del cliente.
2. THE SYSTEM SHALL enviar el lenguaje al endpoint `/api/game/start` dentro del cuerpo JSON como campo `language`.
3. WHEN `/api/game/start` recibe un `language` THE SYSTEM SHALL validarlo contra `SELECTABLE_LANGUAGES`; si el valor no está en la whitelist THE SYSTEM SHALL usar `random`.
4. THE SYSTEM SHALL persistir el lenguaje resuelto en la sesión (`session.language`) para que la generación diferida lo consuma más tarde.
5. WHEN el lenguaje es `random` THE SYSTEM SHALL resolverlo a un lenguaje concreto al azar (`resolveLanguage`) recién en el momento de generar el desafío, no antes.
6. THE SYSTEM SHALL inyectar la instrucción de lenguaje en el prompt de Bedrock vía `languageInstruction(<lenguaje concreto>)`, produciendo la frase `El bug y el código deben ser de <Lenguaje>.`.

## Requirement 3 — Inicio instantáneo (sala-primero)

**User Story:** Como Coder, quiero recibir el código de sala al instante al iniciar, para poder compartirlo con el Helper sin esperar a que la IA termine de generar el incidente.

### Acceptance Criteria

1. WHEN el Coder inicia una partida THE SYSTEM SHALL crear la sesión en estado `idle` mediante `createPendingSession` y devolver `{ sessionId, coderToken }` SIN invocar Bedrock.
2. THE SYSTEM SHALL crear la sesión `idle` con `challengeId` vacío, `currentCode` vacío, `remainingTime` en 0 y `generating: false`, dejando el reloj sin correr hasta la promoción a `playing`.
3. THE SYSTEM SHALL responder al inicio en tiempo de operación de almacenamiento (sin latencia de modelo), de modo que el código de sala esté disponible de inmediato.
4. THE SYSTEM SHALL mintar el `coderToken` en el inicio y conservarlo a través de la promoción `idle → playing`.

## Requirement 4 — Generación diferida e idempotente en el primer poll

**User Story:** Como sistema, quiero generar el desafío recién cuando el Coder empieza a observar la sala, una sola vez, para no pagar dos llamadas a Bedrock ni quedar congelado si una falla.

### Acceptance Criteria

1. WHEN se consulta `/api/game/state` sobre una sala `idle` THE SYSTEM SHALL invocar `ensureChallengeGenerated` para disparar la generación de Bedrock.
2. WHILE existe un claim de generación vigente (`generating: true` con antigüedad menor a `GENERATION_CLAIM_TTL_MS` = 30s) THE SYSTEM SHALL no disparar una segunda generación, devolviendo la sala aún `idle`.
3. WHEN un claim de generación supera el TTL de 30s THE SYSTEM SHALL asumir que el request previo murió y permitir que un nuevo poll reintente la generación, evitando congelar la sala para siempre.
4. WHEN Bedrock devuelve un desafío válido THE SYSTEM SHALL promover la sala a `playing` con `createSession`, adjuntar el desafío generado (`generatedChallenge`) y arrancar el reloj en `time_limit` (180s).
5. WHEN Bedrock falla o no entrega un desafío válido THE SYSTEM SHALL promover la sala a `playing` usando un desafío curado del catálogo (`pickRandomChallenge`), nunca dejando la sala atascada.
6. THE SYSTEM SHALL conservar `coderToken` y `helperToken` al promover de `idle` a `playing` (la promoción crea un objeto fresco con `createSession`).

## Requirement 5 — Experiencia del Coder mientras la sala está `idle`

**User Story:** Como Coder, quiero ver una pantalla de "preparando incidente" en vez de un error mientras la IA genera, para entender que la partida está arrancando.

### Acceptance Criteria

1. WHEN el Coder entra a `/coder` sin sesión previa THE SYSTEM SHALL crear la sala, guardar el `coderToken`, reescribir la URL a `/coder?session=<sessionId>` y entrar al tablero con una vista `idle` (`GENERATING_VIEW`).
2. WHILE la sala está `idle` THE SYSTEM SHALL exponer una vista de Coder vacía (`pendingCoderView`: código y error vacíos, `status: 'idle'`) en lugar de datos de desafío.
3. WHILE se prepara el incidente THE SYSTEM SHALL mostrar la pantalla de carga con el título "Estamos preparando tu incidente…" y el subtítulo "Espera un momento mientras preparo la partida.".
4. WHEN el polling detecta que la sala pasó a `playing` THE SYSTEM SHALL promover la vista del Coder al desafío real (código, error, opciones, reloj).

## Requirement 6 — Experiencia del Helper que entra antes de tiempo

**User Story:** Como Helper, quiero esperar a que el Coder inicie en vez de ver "sala no encontrada", para no creer que el código está mal cuando el incidente solo está generándose.

### Acceptance Criteria

1. WHEN un Helper pide la guía (`/api/game/guide`) de una sala todavía `idle` THE SYSTEM SHALL responder `{ pending: true }` en lugar de un error.
2. WHILE la respuesta de la guía es `pending` THE SYSTEM SHALL hacer que el cliente reintente en bucle (cada ~1.5s) hasta que el desafío esté listo.
3. WHILE el Helper espera THE SYSTEM SHALL mostrar la pantalla de carga con el título "Esperando a que el Coder inicie…" y el subtítulo "En cuanto el incidente esté listo, vas a ver tu manual de debugging.".
4. WHEN el desafío queda listo (sala `playing`) THE SYSTEM SHALL entregar la `HelperStaticGuide` real, mintar/guardar el `helperToken` y mostrar la pantalla del Helper.
5. THE SYSTEM SHALL mantener la regla de un solo Helper por sala: si el asiento ya está tomado por otro token THE SYSTEM SHALL responder `{ occupied: true }` (409) — esta spec NO modifica ese comportamiento, solo lo respeta.

## Out of scope

- Cambiar el motor de generación de Bedrock o el contrato del desafío (cubierto por la spec `bedrock-question-gen` / generación en runtime).
- Generación en streaming del desafío (cubierto por la spec `bedrock-streaming`).
- Persistencia de sesiones / Redis y tokens de propiedad (cubierto por la spec `security-hardening`); aquí solo se documenta que el flujo sala-primero los conserva.
- Agregar lenguajes nuevos más allá de los ya soportados en `SELECTABLE_LANGUAGES`.
- Permitir que el Helper elija lenguaje: la elección es exclusiva del Coder en el inicio.
