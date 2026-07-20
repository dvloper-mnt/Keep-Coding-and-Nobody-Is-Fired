# Design — Bedrock Client-Question Generation (build-time)

## Overview

Un script Node de build-time que llama a Bedrock, valida el resultado contra el contrato `ClientQuestion`, y escribe `questions.json`. Si algo falla en cualquier punto, cae al JSON curado preexistente. El build nunca se rompe; el juego nunca se queda sin preguntas.

## Flujo

```
npm run build
  → prebuild: node --import tsx scripts/generate-questions.ts   (o .mjs)
      │
      ├─ 1. Leer config del entorno (región, model id, cantidad, umbral)
      ├─ 2. Para cada categoría: invocar Bedrock Converse (con timeout)
      ├─ 3. Limpiar fences markdown → JSON.parse
      ├─ 4. Validar cada pregunta contra ClientQuestion → descartar inválidas
      ├─ 5. Deduplicar por id
      │
      ├─ ¿válidas >= MIN_QUESTIONS (8)?
      │     SÍ  → escribir questions.json con las frescas   → log "GENERATED (n)"
      │     NO  → escribir questions.json desde fallback     → log "FALLBACK (pocas válidas)"
      │
      └─ catch (cualquier error de Bedrock/red/credenciales)
            → escribir questions.json desde fallback         → log "FALLBACK (motivo)"
            → exit 0  (NUNCA rompe el build)
  → next build  (lee el questions.json ya escrito)
```

## Archivos

```
scripts/
  generate-questions.ts          ← nuevo: el generador (build-time)
src/data/client-questions/
  questions.json                 ← OUTPUT (lo escribe el script; lo lee el juego)
  questions.fallback.json        ← nuevo: copia versionada del JSON curado actual (la red)
  index.ts                       ← SIN CAMBIOS (sigue importando questions.json)
src/features/game/
  client-question-schema.ts      ← nuevo (opcional): validador/guard de ClientQuestion reutilizable
```

## Decisiones técnicas

### Lenguaje del script: TS ejecutado con `tsx`

Para mantener la regla de cero `any` y reusar los tipos de `game-types.ts`, el script se escribe en TypeScript y se ejecuta con `tsx` (dependencia de dev). Alternativa: `.mjs` plano si se prefiere evitar `tsx`, pero se pierde el chequeo de tipos. **Recomendado: `tsx`.**

> Nota de versión: verificar la forma de ejecutar TS en Node contra la versión instalada (Node 20+). `node --import tsx` o `tsx scripts/...`. No asumir flags viejos.

### Cliente Bedrock: AWS SDK v3

```ts
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
```

Credenciales: el SDK las resuelve de la cadena estándar (perfil/env/role). El equipo usa el perfil `default` (con acceso verificado) o `AWS_PROFILE`. **Nunca hardcodear llaves.**

### Prompt por categoría (no un megaprompt)

Una llamada Converse **por categoría** pidiendo ~5 preguntas, en vez de una sola pidiendo 20. Ventajas: balance garantizado por categoría, prompts más enfocados, y si una categoría falla las otras sobreviven (degradación parcial). El system prompt fija el formato exacto y da ejemplos del estilo narrativo del JSON existente.

El prompt DEBE pedir: array JSON puro, sin markdown, 4 opciones exactas, `correct_answer` 0-3, `id` con patrón `cq_<cat>_<descriptor>`, `client_prompt` narrativo.

### Validación: un type guard explícito

```ts
const VALID_CATEGORIES = ['sql', 'design-patterns', 'architecture', 'programming'] as const;

function isValidQuestion(x: unknown): x is ClientQuestion {
  // narrowing sobre unknown: id string no vacío, category en VALID_CATEGORIES,
  // client_prompt string no vacío, options array de exactamente 4 strings no vacíos,
  // correct_answer entero 0..3
}
```

Sin `any`, sin `as` (parte de `unknown` y estrecha). Esto es la barrera entre "lo que la IA dijo" y "lo que el juego acepta".

### Config (constantes / env)

| Parámetro | Env | Default |
|-----------|-----|---------|
| Región | `AWS_REGION` | `us-east-1` |
| Model id | `BEDROCK_MODEL_ID` | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| Por categoría | `QUESTIONS_PER_CATEGORY` | `5` (→ ~20 total, 4 categorías) |
| Mínimo aceptable | `MIN_QUESTIONS` | `8` (bajo esto → fallback) |
| Timeout batch | `BEDROCK_TIMEOUT_MS` | `30000` |

## Manejo de errores (el corazón del fallback)

Tres niveles de degradación, todos terminan en `exit 0`:

1. **Falla total de Bedrock** (credenciales, red, región sin modelo) → `catch` global → fallback.
2. **Falla parcial** (una categoría falla, otras OK) → se acumulan las válidas; si el total `>= MIN_QUESTIONS`, se usan; si no, fallback.
3. **Output malformado** (JSON roto, preguntas inválidas) → se descartan una a una; mismo chequeo de umbral.

**Invariante:** al terminar el script, `questions.json` SIEMPRE existe y es un array válido de `ClientQuestion`. Verificado leyendo y validando lo que se acaba de escribir.

## Riesgos y mitigaciones

- **Riesgo:** el `prebuild` rompe el build de tu compañero si Bedrock no está disponible en su pipeline. **Mitigación:** el script atrapa todo y sale 0; el peor caso es "se usó el fallback", nunca "build roto". Documentarlo para que él lo sepa.
- **Riesgo:** credenciales no disponibles en el entorno de CI/deploy. **Mitigación:** fallback automático + log claro. Si quiere preguntas frescas en deploy, configura `AWS_PROFILE`/keys en el pipeline; si no, usa el fallback curado.
- **Riesgo:** la IA genera preguntas con respuesta incorrecta marcada (`correct_answer` apunta a un distractor). **Mitigación:** la validación verifica forma, NO corrección semántica. Para una hackathon es aceptable; documentar que el fallback curado es la versión "garantizada correcta". Revisar el output al menos una vez.

## Out of scope

Generación en runtime, generación de challenges, caché en Redis. Solo el script de build-time + fallback.
