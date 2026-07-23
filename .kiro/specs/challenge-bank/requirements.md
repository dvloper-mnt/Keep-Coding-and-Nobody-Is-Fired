# Requirements — Banco de challenges validados (challenge-bank)

## Introduction

Hoy cada `/start` genera un challenge con Bedrock en vivo. Aunque el prompt ya genera con calidad (ver fix del PR #42), seguir generando en vivo en la demo frente al jurado tiene tres riesgos: (1) **calidad** — el modelo es probabilístico y puede tirar un challenge raro justo en la demo; (2) **latencia** — 13-16s esperando a Bedrock con todos mirando; (3) **costo** — cada generación quema tokens.

Esta spec crea un **banco de challenges validados**: challenges generados por IA que **pasaron una validación fuerte** (de forma Y de sentido) y se **guardan** para reusar. En la demo, el juego sirve challenges del banco (instantáneos, garantizados) y opcionalmente genera alguno nuevo para el efecto "wow". El banco se siembra con un script offline y se va llenando con cada generación buena en runtime.

Idea original de Moises (el PO): *"toda situación que se vaya generando se va almacenando, así no se necesita generar siempre; se pueden usar algunas ya generadas para ahorrar tokens"*.

### Contexto verificado (código real al 2026-06-27)

- `ensureChallengeGenerated` (game-service.ts ~L251) hoy hace: `generateChallenge(language)` → si devuelve `null`, cae a `pickRandomChallenge()` (curado de `src/data/challenges/`). Acá se inserta el banco como tercer origen, ANTES de generar.
- `generateChallenge` / `generateChallengeStreaming` (runtime-generator.ts) devuelven un `Challenge` validado por forma (`isValidChallenge`) o `null`.
- `isValidChallenge` (challenge-schema.ts) valida SOLO la forma (3 steps, 4 opciones, índices, strings no vacíos). NO valida el sentido (deja pasar "N/A", conteos de strings, etc.).
- Persistencia: Valkey vía ioredis ya conectado (`getRedis()` en game-service.ts). `redis.set/get` con TTL ya se usan para sesiones. Para el banco se usa storage SIN TTL (persistente).
- `ChallengeLanguage` es un enum cerrado (challenge-language.ts): random, php, sql, typescript, javascript, python, go, java, ruby.
- Existe `bedrock-response-log.ts` (dumpea respuestas crudas a `logs/bedrock/` en dev) — referencia para el patrón de I/O, no se reusa directo.

## Glossary

- **Banco**: colección persistente de challenges que pasaron validación fuerte, indexada por lenguaje.
- **Validación fuerte**: forma (`isValidChallenge` existente) + **calidad semántica** (nueva): sin pistas de conteo de texto, sin "N/A"/placeholders, sin listas vacías, sin la respuesta literal en las reglas.
- **Sembrar (seed)**: poblar el banco offline con un script, generando N challenges por lenguaje y guardando solo los que pasan validación fuerte.
- **Modo de servicio**: de dónde sale el challenge en `/start` — `bank` (del banco), `generate` (Bedrock en vivo), o `curated` (fallback estático). Configurable.

## Requirements

### R1 — Validación de calidad semántica (la base)

**User story:** Como diseñador del juego, quiero rechazar challenges con pistas sin sentido, para que ningún challenge basura llegue al jugador ni al banco.

- R1.1 WHEN se evalúa un `Challenge`, THE SYSTEM SHALL rechazarlo si alguna `rule` o `knowledge` contiene un patrón de conteo de texto (ej. "aparece N veces", "si la palabra X aparece").
- R1.2 THE SYSTEM SHALL rechazar el challenge si alguna `rule`, `knowledge` o `hint` es "N/A", "ninguna", "none", vacío o solo espacios.
- R1.3 THE SYSTEM SHALL rechazar el challenge si, en algún step, `helper_view.rules` o `helper_view.knowledge` es una lista vacía.
- R1.4 THE SYSTEM SHALL rechazar el challenge si el texto de la opción correcta aparece literal dentro de alguna `rule` (la respuesta no se regala).
- R1.5 THE SYSTEM SHALL exponer una función pura `isQualityChallenge(challenge): { ok: boolean; reasons: string[] }` que NO lance, devuelva las razones del rechazo, y NO dependa de I/O.
- R1.6 La validación fuerte combina forma + calidad: `isValidChallenge(x) && isQualityChallenge(x).ok`.

### R2 — Storage del banco (Valkey)

**User story:** Como sistema, quiero guardar y recuperar challenges validados por lenguaje, para servirlos sin volver a generar.

- R2.1 WHEN un challenge pasa validación fuerte, THE SYSTEM SHALL poder guardarlo en el banco bajo una clave por lenguaje (ej. `bank:challenge:<lang>:<id>`), SIN TTL (persistente).
- R2.2 THE SYSTEM SHALL mantener un índice por lenguaje (ej. un Redis SET `bank:index:<lang>`) con los IDs disponibles.
- R2.3 THE SYSTEM SHALL exponer `getRandomFromBank(language): Promise<Challenge | null>` que devuelva un challenge al azar del lenguaje pedido, o `null` si el banco está vacío para ese lenguaje. Para `random`, elige primero un lenguaje con stock.
- R2.4 THE SYSTEM SHALL exponer `saveToBank(challenge, language): Promise<void>` idempotente por `id` (guardar dos veces el mismo id no duplica el índice).
- R2.5 IF Valkey no está disponible (dev sin REDIS_HOST), THE SYSTEM SHALL degradar limpio: `getRandomFromBank` devuelve `null` y `saveToBank` es no-op (NO romper el juego).
- R2.6 THE SYSTEM SHALL exponer `bankCount(language): Promise<number>` para diagnóstico/observabilidad.

### R3 — Selección en runtime (cómo se usa)

**User story:** Como jugador en la demo, quiero que el challenge aparezca al instante y sea bueno, sin esperar a la IA cada vez.

- R3.1 THE SYSTEM SHALL leer un modo de servicio desde env: `CHALLENGE_SOURCE_MODE` ∈ {`bank-first` (default), `generate-first`, `bank-only`, `generate-only`}.
- R3.2 WHEN el modo es `bank-first` y hay stock en el banco para el lenguaje, THE SYSTEM SHALL servir del banco (sin llamar a Bedrock).
- R3.3 WHEN el modo es `bank-first` y el banco está vacío para el lenguaje, THE SYSTEM SHALL generar con Bedrock; si la generación pasa validación fuerte, la sirve Y la guarda en el banco (R4.1).
- R3.4 WHEN el modo es `generate-first`, THE SYSTEM SHALL generar nuevo siempre (el "wow") y caer al banco solo si la generación falla, y al curado solo si el banco también está vacío.
- R3.5 WHEN el modo es `bank-only` y el banco está vacío, THE SYSTEM SHALL caer al curado (`pickRandomChallenge`) — NUNCA dejar al jugador sin challenge.
- R3.6 THE SYSTEM SHALL preservar el fallback al curado como última red en TODOS los modos (la demo nunca se queda sin challenge).

### R4 — Auto-alimentación del banco

**User story:** Como sistema, quiero que el banco crezca solo a medida que se juega, para no depender solo del seed.

- R4.1 WHEN se genera un challenge en runtime y pasa validación fuerte, THE SYSTEM SHALL guardarlo en el banco (best-effort: si el guardado falla, el juego sigue igual).
- R4.2 THE SYSTEM SHALL aplicar un tope por lenguaje (`BANK_MAX_PER_LANGUAGE`, default 50) para no crecer sin límite; al alcanzarlo, deja de auto-guardar (el seed manual sigue pudiendo curar).

### R5 — Script de seed (poblar offline)

**User story:** Como desarrollador, quiero sembrar el banco antes de la demo con challenges validados, para llegar con stock garantizado.

- R5.1 THE SYSTEM SHALL proveer `scripts/seed-bank.ts` (corrido con tsx) que genere N challenges por lenguaje (N configurable por arg/env), valide fuerte cada uno, y guarde solo los que pasan.
- R5.2 THE script SHALL reportar por lenguaje: generados, aceptados, rechazados (con razones), y el total en el banco al final.
- R5.3 THE script SHALL ser idempotente y seguro de re-correr (suma stock, no duplica por id).

### R6 — Calidad y coexistencia

- R6.1 La lógica de validación (R1) y de selección debe ser **pura/testeable**; el I/O de Valkey vive en el módulo del banco, NO en el engine.
- R6.2 `pnpm run test` verde (existentes + nuevos), `tsc --noEmit` 0 errores, `pnpm run lint` 0 warnings — corrido con `corepack pnpm@9.15.0` (versión del CI; ver gotcha de entorno).
- R6.3 El flujo actual (generar → fallback curado) sigue funcionando con el modo default si el banco está vacío (degradación limpia, sin romper nada existente).
- R6.4 `correct_answer` NUNCA sale al cliente (invariante de seguridad ya existente) — el banco guarda el challenge completo pero la sanitización en las vistas no cambia.
