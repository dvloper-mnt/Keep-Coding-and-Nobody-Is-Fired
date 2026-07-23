# Design — Cooperative Prompt Integrity (información partida obligatoria)

## Overview

El cambio toca cuatro puntos, de adentro hacia afuera, y reutiliza el patrón exacto de la lógica pura ya existente (`challenge-difficulty.ts`, `challenge-language.ts`) y del validador `challenge-schema.ts`:

1. **Lógica pura nueva** (`cooperative-integrity.ts`, archivo nuevo): `hasCooperativeIntegrity(challenge)` — determinista, sin estado, testeable sin Bedrock. Detecta el patrón "la pista ES la respuesta".
2. **Prompt** (`runtime-generator.ts`): reescribir la técnica del `SYSTEM_PROMPT` de "genera un bug y explica cómo se arregla" a "genera un secreto y pártelo en dos mitades", agregar la regla explícita contra filtrar el símbolo de la solución, corregir el ejemplo few-shot y añadir el paso de auto-verificación.
3. **Integración** (`runtime-generator.ts`): tras `isValidChallenge`, llamar a `hasCooperativeIntegrity`; si falla, tratar como generación fallida (log + `null` → fallback), sin tocar la cadena de fallback existente.
4. **Curados** (`src/data/challenges/*.json`): reescribir el lado del Helper de los que filtren, y un test que afirme que TODO el catálogo pasa el validador.

El principio rector: **la integridad cooperativa es un chequeo de contenido derivado de forma pura del objeto ya parseado; el contrato de datos `Challenge` no cambia**. El validador se compone con `isValidChallenge` (no lo reescribe): primero estructura, después integridad.

## Decisiones de arquitectura

### D1 — Validador como lógica pura aislada (calca `challenge-difficulty.ts`)

Archivo nuevo `src/features/game/cooperative-integrity.ts`:

```ts
import type { Challenge, ChallengeStep } from './game-types';

/** true si NINGÚN step filtra la respuesta al lado del Helper. */
export function hasCooperativeIntegrity(challenge: Challenge): boolean {
  return challenge.steps.every(stepHasIntegrity);
}

// motivo opcional para logging/tests
export function checkCooperativeIntegrity(challenge: Challenge):
  { ok: true } | { ok: false; step: number; reason: string } { /* ... */ }
```

- Sin estado, sin `Math.random`, sin I/O. Igual de trivial de testear que `roundToDifficulty`: tabla challenge → esperado.
- Se compone con `isValidChallenge`; NO lo modifica. Orden: `isValidChallenge` (estructura) → `hasCooperativeIntegrity` (contenido cooperativo).

### D2 — Cómo se detecta el filtrado (la parte delicada, R3)

Dos señales deterministas, en orden de confianza:

**D2.a — La pista contiene la opción correcta (alta confianza).**
Para cada step: normalizar `options[correct_answer]` y cada entrada de `rules`/`knowledge`; si una entrada del Helper **contiene** (substring normalizado) el texto de la opción correcta, o comparten un solapamiento de tokens significativos por encima de un umbral, el step filtra. Esto ataca el caso "la regla dice literalmente el diagnóstico".

**D2.b — La pista nombra el símbolo del diff código→patch (alta confianza, específica).**
Para cada step, calcular el conjunto de **tokens que cambian** entre `coder_view.code` y `success_state.code_patch` (identificadores/verbos que aparecen en el patch pero no en el código roto, y viceversa — p.ej. `login` vs `index`, `post` vs `get`). Si una `rule`/`knowledge` menciona el token del **lado corregido** (el que revela QUÉ hay que poner), el step filtra. Esta señal es la más precisa porque se ancla en el cambio concreto, no en heurística de lenguaje natural.

**Normalización (R3.5):** minúsculas, sin acentos (NFD + strip diacríticos), colapsar espacios, y tokenizar por límites de palabra/símbolo. La comparación por token evita rechazar teoría legítima que solo menciona el nombre del framework ("Laravel") o el código de error ("500", "405"), que NO son el símbolo de la solución. Se mantiene una lista corta de tokens comunes ignorables (nombres de framework, códigos HTTP, palabras vacías) para no marcar teoría válida.

**D2.c — Legitimidad del knowledge de dominio (R3.6).**
El `knowledge` puede mencionar rutas/hechos del dominio ("el front manda POST a /logout") sin filtrar, porque por sí solo no nombra el DIAGNÓSTICO correcto. La detección apunta al símbolo del **lado corregido del diff** y a la opción correcta, no a cualquier ruta: un knowledge que da contexto de dominio pero no revela qué cambiar pasa.

### D3 — Reescritura de la técnica del prompt (R1, R2)

El `SYSTEM_PROMPT` actual describe la separación pero optimiza para "challenge correcto". Cambios, sin romper el few-shot del PR #42:

- **Nueva regla FORBIDDEN**: "NUNCA pongas en `rules` ni `knowledge` el nombre del método/identificador correcto, la ruta o verbo literal que hay que corregir, ni ninguna frase que nombre el diagnóstico. El Helper NO conoce el símbolo concreto: solo la teoría."
- **Reencuadre de la técnica**: bloque nuevo "CÓMO PARTIR LA INFORMACIÓN" — las `rules` explican CÓMO funciona el lenguaje en abstracto; el `knowledge` da hechos de dominio no deducibles del código; el diagnóstico correcto SOLO emerge cuando el Coder describe el síntoma y el Helper aplica la teoría. Ninguna mitad basta sola.
- **Corregir el ejemplo "PERFECTO"**: hoy su `rules` roza el diagnóstico. Reescribir a teoría pura (p.ej. "En Laravel, un 500 en runtime — no en arranque — suele ser un método invocado que no existe en el controlador" en vez de "El método index no existe en LoginController"). El ejemplo debe MODELAR la técnica, no el defecto.
- **Auto-verificación final**: paso obligatorio — "Antes de emitir, simula la conversación: el Helper pregunta por el síntoma, el Coder lo describe, el diagnóstico emerge del cruce. Si con solo las rules/knowledge el Helper ya sabría la respuesta, descarta y rehazlo. Devuelve SOLO el JSON."

### D4 — Integración en el generador (R4)

En ambas funciones de `runtime-generator.ts`, tras la validación estructural:

```ts
if (!isValidChallenge(parsed)) { /* ... log + return null (igual que hoy) ... */ }
if (!hasCooperativeIntegrity(parsed)) {
  console.error('[bedrock] response leaks the answer to the Helper, falling back');
  logBedrockResponse('cooperative-integrity-failed', rawText, { challengeId: parsed.id });
  return null;
}
```

Mismo patrón exacto que el chequeo de validación ya presente (líneas ~212-216 stream, ~281-285 no-stream). El fallo de integridad es un fallo de generación más: cae a `pickRandomChallenge()` por la cadena ya existente. Cero cambios en la red de seguridad.

### D5 — Curados sin regresión de jugabilidad (R5)

Reescribir SOLO el `helper_view` (rules/knowledge) de los curados que filtran; NO tocar `code`, `error`, `options`, `correct_answer` ni `success_state.code_patch` — el bug y su respuesta correcta no cambian, solo se deja de servirla en las pistas. Un test carga el catálogo entero (`src/data/challenges/index.ts`) y afirma `isValidChallenge && hasCooperativeIntegrity` para cada uno, convirtiendo la regla en un guardrail de build.

## Componentes afectados

| Archivo | Cambio |
|---|---|
| `src/features/game/cooperative-integrity.ts` | NUEVO — `hasCooperativeIntegrity`, `checkCooperativeIntegrity`, normalización y diff de tokens |
| `src/features/game/runtime-generator.ts` | `SYSTEM_PROMPT`: regla anti-leak, reencuadre "partir la información", ejemplo corregido, auto-verificación; e integración del validador tras `isValidChallenge` en ambas funciones |
| `src/data/challenges/login-chaos.json` | Reescribir `helper_view` de los steps que filtran (sin tocar bug/opciones/patch) |
| `src/data/challenges/laravel-routes.json` | Auditar y reescribir `helper_view` si filtra |
| `src/data/challenges/catalog-controller.json` | Auditar y reescribir `helper_view` si filtra |
| `src/features/game/cooperative-integrity.test.ts` | NUEVO — tests unitarios de la lógica pura |
| `src/features/game/challenge-catalog.integrity.test.ts` | NUEVO — todo el catálogo curado pasa `isValidChallenge && hasCooperativeIntegrity` |
| `src/features/game/runtime-generator.test.ts` | Sumar caso: challenge que filtra → `null` (fallback) |

## Testing

- **Unitario puro (sin Bedrock):** `cooperative-integrity.test.ts` con tabla exhaustiva:
  - Step cuya `rule` contiene el texto de la opción correcta → SIN integridad.
  - Step cuya `rule`/`knowledge` nombra el símbolo del lado corregido del diff (`login` cuando el patch cambia `index→login`) → SIN integridad.
  - Teoría legítima que menciona el framework/código de error pero NO el símbolo de la solución → CON integridad (no debe rechazarse).
  - `knowledge` de dominio (ruta del sistema) que no revela el diagnóstico → CON integridad.
  - Bordes de normalización: mayúsculas, acentos, espacios múltiples, mismo símbolo con otra capitalización → detectado.
  - Challenge con un step limpio y otro que filtra → challenge SIN integridad (R3.4).
- **Catálogo:** `challenge-catalog.integrity.test.ts` — cada curado pasa ambas validaciones (guardrail de build, R5.3).
- **Generador (mockeado):** un challenge devuelto que filtra → `generateChallenge`/`generateChallengeStreaming` retornan `null`; la cadena de fallback y los `console.error('[bedrock] ...')` intactos.
- **Sin regresión:** la suite existente (incluida `runtime-generator`, `challenge-schema`, `challenge-difficulty`) sigue verde; el contrato `Challenge` no cambia.
- tsc 0 errores, lint 0 warnings.

## Riesgos y mitigaciones

- **Falsos positivos del validador (rechaza teoría legítima):** el mayor riesgo. Mitigado por D2 — la comparación es por token normalizado contra (a) la opción correcta y (b) el símbolo del diff concreto, no contra cualquier substring; lista corta de tokens ignorables (framework, códigos HTTP). Los tests incluyen explícitamente casos de teoría legítima que NO debe rechazarse.
- **Falsos negativos (deja pasar un leak sutil):** aceptable como red secundaria — el prompt (R1/R2) es la primera línea; el validador ataca el patrón dominante (opción correcta y símbolo del diff servidos en la pista). Un leak parafraseado muy fino podría colarse, pero el prompt reescrito reduce su frecuencia; iterar el validador es barato (lógica pura).
- **El fallback filtraba también:** mitigado por R5 — los curados se arreglan y un test de catálogo evita reintroducir el defecto.
- **Bedrock ignora el prompt reescrito:** cubierto por D4 — si genera un leak, el validador lo rechaza y cae al curado (ya limpio). El prompt baja la frecuencia; el validador es el piso duro.
- **Rechazar demasiados generados aumenta el uso del fallback en la demo:** posible si el validador es muy agresivo; mitigado afinando el umbral con los tests de teoría legítima y midiendo en smoke local antes de la demo.
