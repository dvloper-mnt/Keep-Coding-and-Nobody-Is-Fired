# Requirements — Bedrock Streaming Challenge Generation (runtime, en vivo)

## Introduction

Hoy el challenge de cada partida se genera al iniciar (`startGame` → estado `idle` → primer poll dispara `generateChallenge`), usando la API **Bedrock Converse** (`ConverseCommand`). El jugador espera ~13-16 s mirando un spinner ("Estamos preparando tu incidente…") y el challenge aparece **de golpe** cuando termina.

Esta spec cambia esa generación a **streaming**: usar **`ConverseStreamCommand`** (`bedrock:ConverseStream`, permiso ya aplicado en el task role) para que el texto del challenge llegue **token por token** y se muestre apareciendo en vivo en la pantalla del Coder mientras Bedrock genera.

**Decisión de arquitectura clave:** el streaming es **solo de presentación**. El contrato de datos NO cambia: el resultado final sigue siendo un `Challenge` validado por `isValidChallenge`. Si el streaming falla, se cae al **mismo fallback curado** que ya existe. El streaming nunca puede dejar al juego sin challenge.

**Relato de hackathon:** convertir la espera de 14 s en el momento "wow" de la demo — el jurado **ve** a la IA de AWS Bedrock trabajando en vivo, no un spinner opaco. Demuestra que la generación con IA es real y en tiempo real.

### Contexto verificado

- El task role de ECS ya tiene `bedrock:ConverseStream` (aplicado en `infra/main.tf`, política `keep-coding-game-bedrock-invoke`).
- Modelo: inference profile `us.anthropic.claude-haiku-4-5-20251001-v1:0`.
- La generación completa mide 13-16 s y produce ~2100-2300 tokens de salida (3 steps, código, 4 opciones c/u).
- Gotcha confirmado: Haiku puede envolver el JSON en fences markdown — hay que limpiarlos antes de parsear (ya manejado en `stripMarkdownFences`).
- El timeout actual es `BEDROCK_RUNTIME_TIMEOUT_MS` (default 20000), env var de la task.

## Glossary

- **Streaming**: recibir la respuesta de Bedrock en fragmentos incrementales (`ConverseStreamCommand`), en vez de una respuesta única (`ConverseCommand`).
- **Texto parcial**: el JSON del challenge a medio generar; sirve para mostrar progreso, NO para parsear hasta que esté completo.
- **Challenge final**: el objeto `Challenge` completo, validado con `isValidChallenge`, igual que hoy.
- **Fallback**: el challenge curado (`pickRandomChallenge`), igual que hoy.

---

## Requirement 1 — Generación por streaming con Bedrock

**User Story:** Como equipo, quiero que el challenge se genere por streaming, para que el contenido aparezca en vivo y la demo muestre la IA de AWS trabajando en tiempo real.

### Acceptance Criteria

1. THE SYSTEM SHALL invocar Bedrock con `ConverseStreamCommand` (`@aws-sdk/client-bedrock-runtime`) en lugar de `ConverseCommand` para la generación de challenges en runtime.
2. THE SYSTEM SHALL acumular los fragmentos de texto (`contentBlockDelta`) en un buffer hasta recibir el fin del stream.
3. WHEN el stream termina THE SYSTEM SHALL limpiar fences markdown, parsear el JSON y validar el resultado con `isValidChallenge`, igual que el flujo actual.
4. THE SYSTEM SHALL leer región y model id del entorno (`AWS_REGION`, `BEDROCK_MODEL_ID`), sin credenciales hardcodeadas.
5. THE SYSTEM SHALL aplicar el mismo timeout configurable (`BEDROCK_RUNTIME_TIMEOUT_MS`) sobre el stream completo vía `AbortController`.

## Requirement 2 — Texto parcial visible para el Coder

**User Story:** Como Coder, quiero ver el incidente apareciendo en vivo mientras se genera, para sentir que la IA está trabajando y no quedarme frente a un spinner opaco.

### Acceptance Criteria

1. THE SYSTEM SHALL exponer el texto parcial acumulado del stream al cliente del Coder mientras la sala está en estado `idle` (generando).
2. THE SYSTEM SHALL transmitir el texto parcial al frontend mediante un endpoint de streaming (Server-Sent Events o un `ReadableStream` de la respuesta), sin requerir polling de 1 s para el progreso.
3. THE SYSTEM SHALL mostrar el texto parcial en la pantalla del Coder de forma legible (efecto de aparición incremental), reemplazándolo por el tablero real cuando el challenge esté listo (`playing`).
4. THE SYSTEM SHALL nunca mostrar al Coder JSON crudo malformado como si fuera contenido jugable: el texto parcial es decorativo; el tablero solo se arma con el `Challenge` validado.

## Requirement 3 — El contrato de datos NO cambia

**User Story:** Como mantenedor, quiero que el streaming sea solo presentación, para no arriesgar la lógica del juego ni la sincronización Coder/Helper.

### Acceptance Criteria

1. THE SYSTEM SHALL producir el mismo objeto `Challenge` validado que produce hoy `generateChallenge`; el resto del juego (estado de sesión, Helper guide, sync, answer) consume el challenge sin cambios.
2. THE SYSTEM SHALL mantener el flujo de promoción de sala `idle → playing` y la persistencia en Valkey sin cambios de contrato.
3. THE SYSTEM SHALL NO cambiar la forma del `Challenge`, ni el `challenge-schema`, ni los route handlers de `state`/`sync`/`answer`.

## Requirement 4 — Fallback robusto (sin regresión)

**User Story:** Como presentador en la hackathon, quiero que el juego nunca se quede sin challenge, porque una falla del stream no puede romper la demo.

### Acceptance Criteria

1. WHEN el stream falla (error de red, abort/timeout, throttling, AccessDenied) THE SYSTEM SHALL caer al challenge curado (`pickRandomChallenge`), igual que hoy.
2. WHEN el texto acumulado no es JSON válido o no pasa `isValidChallenge` THE SYSTEM SHALL caer al curado y registrar el motivo con `console.error` (`[bedrock] ...`), consistente con el logging actual.
3. THE SYSTEM SHALL garantizar que toda partida termina con un challenge jugable, generado o curado.

## Requirement 5 — Calidad y consistencia

**User Story:** Como mantenedor, quiero que el cambio respete las reglas del proyecto.

### Acceptance Criteria

1. THE SYSTEM SHALL mantener cero `any` y sin `as` casts (salvo `as const`/`satisfies`).
2. THE SYSTEM SHALL cubrir con tests unitarios la lógica nueva pura (acumulación de fragmentos, parseo del texto final, decisión de fallback), simulando el stream sin llamar a Bedrock real.
3. THE SYSTEM SHALL mantener verdes lint, tsc y la suite de tests existente.

## Out of scope

- Cambiar el modelo o el prompt de generación (se reutiliza el actual).
- Streaming de las client-questions (esta spec es solo para el challenge de la partida).
- Mostrar el progreso del stream al Helper (el Helper sigue viendo "esperando al Coder" hasta `playing`).
- Persistir el texto parcial en Valkey (es efímero, solo presentación).
