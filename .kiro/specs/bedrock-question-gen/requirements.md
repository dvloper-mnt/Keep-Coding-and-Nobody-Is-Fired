# Requirements — Bedrock Client-Question Generation (build-time)

## Introduction

Las consultas del cliente (`client-questions`) hoy son un JSON estático curado a mano (`src/data/client-questions/questions.json`, 12 preguntas). Esta spec agrega un **script de build-time** que usa **AWS Bedrock** (Claude Haiku 4.5 vía inference profile) para generar un pool fresco de 15-20 preguntas en cada build/deploy, de modo que no sean siempre las mismas.

**Decisión de arquitectura clave:** la generación corre en **build-time** (hook `prebuild` / deploy), NUNCA en runtime durante una partida. El juego sigue leyendo un JSON estático, instantáneo y sin riesgo en vivo. Bedrock corre en el pipeline, no frente al jurado.

**Relato de hackathon:** usar la infraestructura de AWS de punta a punta (Kiro para el desarrollo, Bedrock para el contenido).

### Contexto verificado (PoC)

- Perfil AWS `default` tiene acceso a Bedrock en `us-east-1`. (El perfil `claude-bedrock` tiene credenciales vencidas — no usar.)
- Modelo: inference profile `us.anthropic.claude-haiku-4-5-20251001-v1:0` (los modelos nuevos NO se invocan por modelId on-demand directo).
- API: Bedrock Converse.
- Gotcha confirmado: Haiku puede envolver el JSON en fences markdown (```` ```json ````) — hay que limpiarlo antes de parsear.

## Glossary

- **Build-time**: durante `npm run build` / deploy, antes de servir tráfico. NO durante una partida.
- **Fallback**: el JSON curado preexistente, usado cuando Bedrock no entrega contenido válido suficiente.
- **Pregunta válida**: objeto que cumple el contrato `ClientQuestion` (ver R3).

---

## Requirement 1 — Generación en build-time con Bedrock

**User Story:** Como equipo, quiero que las client-questions se regeneren con Bedrock en cada deploy, para que el contenido sea fresco sin agregar latencia ni riesgo durante la demo en vivo.

### Acceptance Criteria

1. THE SYSTEM SHALL exponer un script ejecutable vía `npm run generate:questions` que genere el pool y escriba `src/data/client-questions/questions.json`.
2. THE SYSTEM SHALL ejecutar ese script automáticamente en el hook `prebuild` de `package.json`, de modo que `npm run build` regenere las preguntas.
3. THE SYSTEM SHALL invocar Bedrock usando el AWS SDK for JavaScript v3 (`@aws-sdk/client-bedrock-runtime`), Converse API.
4. THE SYSTEM SHALL leer la región (`AWS_REGION`, default `us-east-1`) y el model id (`BEDROCK_MODEL_ID`, default `us.anthropic.claude-haiku-4-5-20251001-v1:0`) del entorno, sin credenciales hardcodeadas.
5. WHEN se invoca Bedrock THE SYSTEM SHALL aplicar un timeout (default 30s para el batch completo) para no colgar el build indefinidamente.

## Requirement 2 — Cantidad y balance de categorías

**User Story:** Como diseñador del juego, quiero un pool variado y balanceado, para que la experiencia no se sesgue a una sola categoría.

### Acceptance Criteria

1. THE SYSTEM SHALL apuntar a generar entre 15 y 20 preguntas válidas en total.
2. THE SYSTEM SHALL distribuir las preguntas de forma balanceada entre las cuatro categorías: `sql`, `design-patterns`, `architecture`, `programming`.
3. THE SYSTEM SHALL generar `id` únicos con el patrón `cq_<categoria>_<descriptor>` (consistente con el JSON existente, NO numérico secuencial).
4. THE SYSTEM SHALL producir `client_prompt` en estilo narrativo ("El cliente [acción] y pregunta: «...»"), consistente con el tono del JSON existente.

## Requirement 3 — Validación estricta del output de la IA

**User Story:** Como responsable de la calidad, quiero que toda pregunta generada se valide antes de aceptarse, porque una IA puede devolver datos malformados que romperían el juego.

### Acceptance Criteria

1. WHEN Bedrock devuelve texto THE SYSTEM SHALL limpiar fences de markdown (```` ```json ````/```` ``` ````) antes de parsear JSON.
2. WHEN una pregunta se parsea THE SYSTEM SHALL validar que cumple el contrato `ClientQuestion`: `id` (string no vacío), `category` (una de las 4 válidas), `client_prompt` (string no vacío), `options` (exactamente 4 strings no vacíos), `correct_answer` (entero entre 0 y 3 inclusive).
3. WHEN una pregunta NO cumple el contrato THE SYSTEM SHALL descartarla y registrar el motivo, sin abortar el proceso.
4. THE SYSTEM SHALL deduplicar por `id` y descartar preguntas con `id` repetido.
5. WHEN la validación termina THE SYSTEM SHALL aceptar solo el conjunto de preguntas válidas.

## Requirement 4 — Fallback robusto (la red de seguridad)

**User Story:** Como presentador en la hackathon, quiero que el juego NUNCA se quede sin preguntas, porque una falla de Bedrock o de credenciales no puede romper la demo ni el build.

### Acceptance Criteria

1. THE SYSTEM SHALL conservar el JSON curado preexistente como fallback versionado en `src/data/client-questions/questions.fallback.json` (commiteado, no se sobrescribe).
2. WHEN Bedrock falla (error de red, credenciales inválidas, throttling, timeout) THE SYSTEM SHALL usar el fallback y escribir `questions.json` con su contenido.
3. WHEN el número de preguntas válidas generadas es MENOR a un umbral mínimo (default 8) THE SYSTEM SHALL usar el fallback en lugar del output parcial.
4. THE SYSTEM SHALL terminar SIEMPRE con un `questions.json` válido y con código de salida 0 (éxito), aun cuando haya usado el fallback — un fallo de Bedrock NUNCA debe romper el build.
5. THE SYSTEM SHALL loguear claramente qué fuente se usó: `GENERATED (n preguntas frescas de Bedrock)` o `FALLBACK (motivo)`.

## Requirement 5 — Consistencia con el juego existente

**User Story:** Como mantenedor, quiero que el contenido generado encaje sin cambios en el resto del juego.

### Acceptance Criteria

1. THE SYSTEM SHALL escribir `questions.json` en el formato exacto que `src/data/client-questions/index.ts` ya consume (array de `ClientQuestion`).
2. THE SYSTEM SHALL NO modificar la lógica del juego (`client-question-engine.ts`, `game-service.ts`, los route handlers): esta spec solo cambia el ORIGEN de los datos, no su forma ni su consumo.
3. THE SYSTEM SHALL mantener cero `any` y sin `as` casts (salvo `as const`/`satisfies`) en el código del script, consistente con las reglas del proyecto.

## Out of scope

- Generación en runtime / por partida (descartada por riesgo en demo en vivo).
- Generar los `challenges` (los bugs de Laravel) con IA — esta spec es solo para client-questions.
- Cachear en Redis o regenerar entre deploys.
