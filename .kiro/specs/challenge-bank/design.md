# Design — Banco de challenges validados (challenge-bank)

## Visión general

Tres piezas, de adentro hacia afuera, respetando la arquitectura del proyecto (lógica pura separada del I/O):

```
┌──────────────────────────────────────────────────────────────┐
│  challenge-quality.ts  (PURO + tests)                          │  isQualityChallenge()
│  Valida SENTIDO: sin conteos, sin N/A, sin vacíos, sin spoiler │
└───────────────────────────┬──────────────────────────────────┘
                            │ usado por
┌───────────────────────────▼──────────────────────────────────┐
│  challenge-bank.ts  (I/O Valkey)                               │  saveToBank, getRandomFromBank,
│  Storage por lenguaje + índice. Degrada limpio sin Redis.      │  bankCount
└───────────────────────────┬──────────────────────────────────┘
                            │ usado por
┌───────────────────────────▼──────────────────────────────────┐
│  game-service.ts  (selección en runtime)                       │  ensureChallengeGenerated reescrito:
│  bank-first / generate-first / bank-only / generate-only       │  banco → generar → curado
└──────────────────────────────────────────────────────────────┘
       +  scripts/seed-bank.ts  (poblar offline)
```

## Decisión 1 — Validación de calidad como función pura

`src/features/game/challenge-quality.ts`:

```ts
export interface QualityResult {
  ok: boolean;
  reasons: string[];
}

export function isQualityChallenge(challenge: Challenge): QualityResult;
```

Reglas (heurísticas de texto, sin IA — baratas y deterministas):
- **Conteo de texto** (R1.1): regex sobre cada rule/knowledge, ej. `/aparece\s+\d+\s+ve/i`, `/si\s+(la\s+)?palabra/i`, `/\b\d+\s+vec(es|s)\b/i`. Si matchea → reason "regla de conteo de texto".
- **Placeholders** (R1.2): normalizar (trim, lowercase) y rechazar si ∈ {"n/a","na","ninguna","none",""} o longitud < 8 (una "regla" de 3 letras no es teoría).
- **Listas vacías** (R1.3): `rules.length === 0 || knowledge.length === 0` por step.
- **Spoiler** (R1.4): el texto de `options[correct_answer]` (normalizado) no debe estar contenido en ninguna `rule` del mismo step.

Por qué heurística y no un segundo LLM-judge: en la demo no querés latencia ni costo extra por validar. Las heurísticas matan el 95% de la basura que vimos (conteos, N/A) a costo cero. Un LLM-judge se puede agregar después si hiciera falta (no en esta spec).

`isStrongValidChallenge(x): x is Challenge` = `isValidChallenge(x) && isQualityChallenge(x).ok` — el gate único que usan banco, runtime y seed.

## Decisión 2 — Storage en Valkey, persistente, por lenguaje

`src/features/game/challenge-bank.ts`. Reusa `getRedis()` de game-service (NO abrir otra conexión — exportarlo o pasar el cliente).

Claves:
- `bank:challenge:<lang>:<id>` → JSON del Challenge (sin TTL).
- `bank:index:<lang>` → Redis SET de ids (`SADD` / `SRANDMEMBER` / `SCARD`).

API:
```ts
saveToBank(challenge: Challenge, language: ConcreteLanguage): Promise<void>
getRandomFromBank(language: ChallengeLanguage): Promise<Challenge | null>
bankCount(language: ConcreteLanguage): Promise<number>
```

- `getRandomFromBank`: `SRANDMEMBER bank:index:<lang>` → `GET bank:challenge:<lang>:<id>`. Para `random`: listar lenguajes con `SCARD > 0`, elegir uno, recursión. Si ninguno tiene stock → `null`.
- `saveToBank`: idempotente (`SADD` no duplica; `SET` pisa el mismo id). Respeta `BANK_MAX_PER_LANGUAGE` (si `SCARD >= max`, no-op salvo que sea seed forzado).
- **Sin Redis** (dev): `getRedis()` devuelve null → `getRandomFromBank` → `null`, `saveToBank` → no-op. El juego cae al flujo actual. NUNCA tira.

Nota: el challenge guardado incluye `correct_answer` (es el dato completo). La sanitización al cliente NO cambia — sigue pasando por las vistas que ya filtran. El banco es server-side.

## Decisión 3 — Selección en `ensureChallengeGenerated`

Hoy (game-service.ts ~L268):
```ts
const generated = await generateChallenge(session.language ?? 'random');
const challenge = generated ?? pickRandomChallenge();
```

Nuevo (orquestado por `CHALLENGE_SOURCE_MODE`):
```ts
async function resolveChallengeForRound(language): Promise<{challenge, source}> {
  if (MODE === 'bank-first' || MODE === 'bank-only') {
    const fromBank = await getRandomFromBank(language);
    if (fromBank) return { challenge: fromBank, source: 'bank' };
    if (MODE === 'bank-only') return { challenge: pickRandomChallenge(), source: 'curated' };
  }
  const generated = await generateChallenge(language);      // Bedrock
  if (generated && isQualityChallenge(generated).ok) {
    await saveToBank(generated, resolveLanguage(language)).catch(() => {});  // R4.1 best-effort
    return { challenge: generated, source: 'generate' };
  }
  const fromBank = await getRandomFromBank(language);        // generación falló → probar banco
  if (fromBank) return { challenge: fromBank, source: 'bank' };
  return { challenge: pickRandomChallenge(), source: 'curated' };  // R3.6 última red
}
```

- `isQualityChallenge` se aplica también a lo que devuelve Bedrock en runtime (doble candado: el prompt + esta validación). Si Bedrock devuelve algo que pasa forma pero no calidad → NO se sirve, se cae al banco/curado.
- `source` se loguea (observabilidad: cuántas partidas salieron del banco vs generadas). Opcional: métrica.

**Streaming:** `promoteSessionWithChallenge` (el flujo SSE) también debe validar calidad y auto-guardar. Mismo gate. Si el challenge llegó por streaming pero no pasa calidad, se descarta y se cae al banco/curado como en el no-streaming.

## Decisión 4 — Seed script

`scripts/seed-bank.ts` (tsx, como `generate-questions.ts`):
- Args/env: `SEED_PER_LANGUAGE` (default 5), lista de lenguajes (default todos los concretos).
- Por cada lenguaje, N veces: `generateChallenge(lang)` → `isStrongValidChallenge` → `saveToBank` (forzando por encima del tope si es seed).
- Reporta tabla: lenguaje | generados | aceptados | rechazados | razones top.
- Corrida real: `NODE_ENV=production corepack pnpm@9.15.0 exec tsx --env-file=.env.local scripts/seed-bank.ts` (ver gotcha de entorno: usar corepack pnpm@9.15.0, no el binario del PATH).

## Constantes nuevas (`src/lib/constants.ts`)

```ts
export const BANK_MAX_PER_LANGUAGE = Number(process.env.BANK_MAX_PER_LANGUAGE ?? '50');
export const CHALLENGE_SOURCE_MODE = process.env.CHALLENGE_SOURCE_MODE ?? 'bank-first';
```

## Riesgos y mitigaciones

- **Banco vacío en la demo** → el seed script lo llena antes; y todos los modos caen al curado como última red (R3.6). Nunca pantalla en blanco.
- **Heurística de calidad con falso positivo** (rechaza un challenge bueno) → no es grave: se cae a otro del banco o se genera otro. El costo de un falso positivo es bajo; el de un falso negativo (basura al jurado) es alto. Calibrar la heurística conservadora.
- **Valkey persistente creciendo** → tope `BANK_MAX_PER_LANGUAGE`. El banco es chico (decenas de challenges, KB cada uno).
- **Determinismo del seed** → no aplica; se quiere variedad. La idempotencia es por id, no por contenido.

## Qué NO entra en esta spec

- LLM-judge para validar (heurística alcanza por ahora).
- UI de administración del banco (ver/borrar challenges) — se maneja por script/CLI.
- Versionado o expiración de challenges del banco.
