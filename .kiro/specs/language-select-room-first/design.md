# Design — Selección de lenguaje + flujo sala-primero

## Overview

Documento de diseño RETROACTIVO de una feature ya implementada. Refleja el código en `main`, no propone cambios.

Dos piezas que se diseñaron juntas:

1. **Selección de lenguaje:** un `<select>` en el modal de inicio cuyo valor viaja como `?lang=` → query param de `/coder` → campo `language` del POST a `/start` → `session.language` → instrucción del prompt de Bedrock. El backend valida contra una whitelist para que un query param manipulado no inyecte basura.

2. **Sala-primero (idle → playing):** `/start` ya no espera a Bedrock. Crea la sala en `idle` y devuelve el código al instante. La generación se difiere al primer poll de `/state`, donde `ensureChallengeGenerated` la dispara una sola vez (claim idempotente con TTL). El Coder ve "preparando incidente"; el Helper que llega antes ve "esperando al Coder". Cuando el desafío está listo, el polling los promueve a la partida real.

## Flujo

```
[Modal de inicio]  StartGameButton.tsx
  select language (default 'random')
  confirmStart → router.push('/coder?lang=<language>')
        │
        ▼
[Coder] app/coder/page.tsx
  lee ?lang= (useSearchParams) → startGame(requestedLanguage)
        │ POST /api/game/start { language }
        ▼
[/start] app/api/game/start/route.ts
  rate limit → parseLanguage(body.language)  // whitelist → 'random' si inválido
  startGame(language):
     createPendingSession(sessionId, language, now, coderToken)   // status: 'idle'
     setSessionToStore
     return { sessionId, coderToken }   ← INSTANTÁNEO (<1s, sin Bedrock)
        │
        ├─ Coder: saveToken, history.replaceState → /coder?session=<id>
        │         entra al tablero con GENERATING_VIEW (status 'idle')
        │         pantalla "Estamos preparando tu incidente…"
        │
        ▼
[Polling /state]  app/api/game/state/route.ts → getCoderState
  if status === 'idle':
     ensureChallengeGenerated(session):
        if generating && (now - generatingStartedAt < 30s) → sigue 'idle'   (claim vigente)
        else:
           claim: { generating: true, generatingStartedAt: now } → store
           generated = generateChallenge(session.language)      // Bedrock (resolveLanguage + languageInstruction)
           challenge = generated ?? pickRandomChallenge()       // fallback curado
           playing = createSession(challenge, id, startedAt)    // status 'playing', reloj 180s
           carry coderToken/helperToken → store
     if sigue 'idle' → pendingCoderView()   (Coder espera otro tick)
  challenge listo → getCoderStepView → tablero real
        │
        ▼ (en paralelo, otra pestaña)
[Helper] app/helper/page.tsx → getHelperGuide (loop cada 1.5s)
  /api/game/guide → getHelperGuide:
     if status === 'idle' → { pending: true }     → "Esperando a que el Coder inicie…"
     else (playing) → claim seat (helperToken) → HelperStaticGuide
```

## Archivos

```
src/components/molecules/
  StartGameButton.tsx            ← select de lenguaje + navegación a /coder?lang=
src/features/game/
  challenge-language.ts          ← SELECTABLE_LANGUAGES, resolveLanguage, languageInstruction
  game-types.ts                  ← ChallengeLanguage; campos idle en GameSession; HelperGuidePending/Occupied
  game-engine.ts                 ← createPendingSession (sala 'idle'), createSession (promoción 'playing')
  game-service.ts                ← startGame, ensureChallengeGenerated, getCoderState, getHelperGuide
  runtime-generator.ts           ← consume resolveLanguage + languageInstruction en el prompt
  api/game-client.ts             ← startGame(language) → POST /start { language }
app/coder/page.tsx               ← lee ?lang=, GENERATING_VIEW, pantalla "preparando incidente"
app/helper/page.tsx              ← loop sobre pending, pantalla "esperando al Coder"
app/api/game/start/route.ts      ← parseLanguage (whitelist), startGame
app/api/game/state/route.ts      ← getCoderState (dispara generación en el primer poll)
app/api/game/guide/route.ts      ← getHelperGuide (pending / occupied / guía)
```

## Decisiones técnicas

### El lenguaje viaja como query param, no como estado de cliente compartido

`StartGameButton` y `CoderPage` son componentes/rutas distintos. En vez de un store global, la elección viaja por la URL (`/coder?lang=php`). Ventaja: la URL es compartible y sobrevive a un refresh; `CoderPage` la lee con `useSearchParams`. El precio es que el query param es manipulable — por eso se valida en el backend (ver siguiente decisión).

### Validación en el borde: whitelist en `/start`

```ts
function parseLanguage(value: unknown): ChallengeLanguage {
  return SELECTABLE_LANGUAGES.includes(value as ChallengeLanguage)
    ? (value as ChallengeLanguage)
    : 'random';
}
```

Cualquier `language` que no esté en `SELECTABLE_LANGUAGES` cae a `'random'`. El frontend nunca es la fuente de verdad de la validación; el endpoint la impone. Sin `any`: parte de `unknown` y estrecha con la whitelist `as const`.

### `random` se resuelve TARDE, en la generación

`resolveLanguage('random')` elige un lenguaje concreto al azar — pero recién dentro de `generateChallenge`, no en el inicio. Así la sesión guarda `'random'` como intención y la resolución ocurre cuando de verdad se necesita armar el prompt. Para un lenguaje concreto, `resolveLanguage` es identidad. `languageInstruction(resuelto)` produce la frase que se inyecta en el mensaje de usuario de Bedrock.

### Sala-primero: separar "crear sala" de "generar desafío"

El cambio de fondo es partir un `/start` que hacía dos cosas (crear sala + esperar Bedrock) en dos momentos:

- `createPendingSession` → sala `idle`, instantánea, con el código de sala listo para compartir. Reloj en 0, sin desafío.
- `ensureChallengeGenerated` (en el primer poll) → genera, hace fallback si hace falta, y promueve a `playing` con `createSession` (reloj 180s).

Esto saca a Bedrock del camino crítico del inicio: el Coder no espera ~14s antes de tener un código que pasarle al Helper.

### Idempotencia con claim + TTL (el detalle que evita el doble cobro y el cuelgue)

```ts
const GENERATION_CLAIM_TTL_MS = 30_000;

if (session.generating) {
  const claimedAt = session.generatingStartedAt ?? 0;
  if (Date.now() - claimedAt < GENERATION_CLAIM_TTL_MS) return session; // claim vigente → no regenerar
}
const claimed = { ...session, generating: true, generatingStartedAt: Date.now() };
await setSessionToStore(claimed.id, claimed); // reclamo antes de llamar a Bedrock
```

Dos polls concurrentes (el Coder consulta `/state` en bucle) podrían disparar dos generaciones — dos llamadas facturables a Bedrock. El flag `generating` reclama la generación para el primer poll. Pero un flag pegajoso tiene su propio riesgo: si el request que reclamó muere a mitad de la llamada a Bedrock, el flag quedaría en `true` para siempre y la sala se congelaría en `idle`. Por eso el claim lleva timestamp (`generatingStartedAt`) y un TTL de 30s: pasado ese plazo, el siguiente poll asume el claim muerto y reintenta. 30s da margen sobre el timeout de Bedrock en runtime (`BEDROCK_RUNTIME_TIMEOUT_MS`, default 10s).

### Promoción que conserva credenciales

`createSession` arma un objeto de sesión fresco (no hace spread del anterior), así que los tokens se re-adjuntan a mano tras promover:

```ts
const playing = createSession(challenge, session.id, session.startedAt);
if (generated) playing.generatedChallenge = generated;
playing.coderToken = session.coderToken;
playing.helperToken = session.helperToken;
```

Olvidar esto rompería la autorización (el Coder perdería su token al pasar de `idle` a `playing`).

### Estados de espera explícitos en los tipos

`game-types.ts` modela las dos esperas como tipos, no como `null`/error genérico:

- `HelperGuidePending { pending: true }` — sala aún `idle`.
- `HelperGuideOccupied { occupied: true }` — asiento de Helper ya tomado.
- `HelperGuideResult = HelperStaticGuide | HelperGuidePending | HelperGuideOccupied`.

El cliente discrimina con `in` (`'occupied' in result`, `'pending' in result`), sin casts. El Coder usa `pendingCoderView()` / `GENERATING_VIEW` (`status: 'idle'`) para el equivalente.

### Config (constantes / env)

| Parámetro | Dónde | Default |
|-----------|-------|---------|
| Lenguajes seleccionables | `SELECTABLE_LANGUAGES` (`challenge-language.ts`) | random, php, sql, typescript, javascript, python, go, java, ruby |
| Lenguaje por defecto | `StartGameButton` / `parseLanguage` / `startGame` | `random` |
| TTL de claim de generación | `GENERATION_CLAIM_TTL_MS` (`game-service.ts`) | `30_000` (30s) |
| Reloj de partida | `challenge.time_limit` | `180` (s) |
| Intervalo de poll del Helper (pending) | loop en `app/helper/page.tsx` | `1500` (ms) |

## Manejo de errores / casos borde

- **Bedrock falla o devuelve algo inválido** → `generateChallenge` retorna `null` → `ensureChallengeGenerated` usa `pickRandomChallenge()`. La sala SIEMPRE termina en `playing`, nunca atascada en `idle`.
- **Request de generación muere a mitad** → el claim expira a los 30s y el siguiente poll reintenta (no se congela).
- **Helper entra antes que el Coder genere** → `{ pending: true }` + loop de reintento; nunca "sala no encontrada".
- **Query param `lang` manipulado** → `parseLanguage` lo normaliza a `random`; entrada inválida nunca llega a Bedrock.
- **Segundo Helper** → `{ occupied: true }` (409); el primer Helper que recarga con su token vuelve a entrar.
- **Doble poll concurrente** → solo uno reclama la generación; el otro ve la sala `idle` y espera.

## Riesgos y mitigaciones

- **Riesgo:** el Coder cierra la pestaña justo después de `/start` y nadie hace el primer poll → la sala queda `idle` sin generar. **Mitigación:** la sesión tiene TTL en el store (1h); una sala `idle` huérfana simplemente expira. No hay costo de Bedrock porque la generación nunca se disparó.
- **Riesgo:** dos generaciones concurrentes (doble llamada facturable). **Mitigación:** claim `generating` + TTL de 30s.
- **Riesgo:** el query param `lang` lo edita el usuario a mano. **Mitigación:** whitelist en `/start`.
- **Riesgo:** pérdida de tokens al promover `idle → playing`. **Mitigación:** se re-adjuntan explícitamente tras `createSession`.

## Out of scope

Motor de generación de Bedrock (`bedrock-question-gen`), streaming (`bedrock-streaming`), persistencia/tokens (`security-hardening`). Esta spec solo documenta la selección de lenguaje y el patrón sala-primero que los orquesta.
