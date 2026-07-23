# Design — Modo infinito (endless-mode)

## Overview

El cambio es de **dominio primero, presentación después**. El núcleo está en `game-engine.ts` (`submitAnswer` y el modelo de sesión) y en `game-service.ts` (cargar la siguiente ronda con Bedrock). La UI in-game ya refleja endless (ronda, game over con score, streaming entre rondas). Pendiente: **selector de modo** en el modal pre-partida del Coder (D7).

Principio rector: **el `Challenge` no cambia de forma.** El modo infinito es una capa de orquestación sobre los mismos challenges de 3 steps que ya genera Bedrock.

### Estado de implementación (2026-06-30)

| Área | Estado |
|---|---|
| Dominio + servicio + sync | ✅ Implementado |
| UI in-game (ronda, defeat score, streaming) | ✅ Implementado |
| API `/start` con `mode` | ✅ Implementado |
| Selector de modo en modal Coder | ✅ Implementado (§7) |
| Tests selector (`game-mode`, client, service) | ✅ Implementado (§7.6) |

## Decisiones de arquitectura

### D1 — Modelo de sesión: agregar `round` y `playedRounds`

`GameSession` gana dos campos:
- `round: number` — ronda en curso (1, 2, 3…). Persistido en Valkey.
- `mode?: 'classic' | 'endless'` — para R5 (coexistencia). Default `endless`.

El `remainingTime` ya existe y se reutiliza como el reloj acumulativo (no se reinicia entre rondas).

### D2 — `submitAnswer`: en vez de `victory`, cargar ronda

Hoy (game-engine.ts):
```ts
const isLastStep = session.currentStep >= challenge.steps.length;
status: isLastStep ? 'victory' : 'playing'
```
En modo endless, "último step resuelto" NO es fin: es señal de **ronda completada**. La transición de ronda (generar el próximo challenge) es asíncrona (Bedrock), así que NO vive en `submitAnswer` (que es puro y síncrono). En cambio:

- `submitAnswer` marca un flag `roundComplete: true` cuando se resuelve el último step en modo endless (y suma el bono de tiempo).
- El servicio (`game-service.ts`, `processAnswer`) detecta `roundComplete`, genera el siguiente challenge (con la dificultad de `adaptive-difficulty` según `round + 1`), incrementa `round`, resetea `currentStep`/`currentCode`, y persiste. Fallback al curado si Bedrock falla.

Esto mantiene `game-engine.ts` puro/testeable y deja el I/O (Bedrock, Valkey) en el servicio, como ya está la arquitectura.

### D3 — Reloj acumulativo (funciones puras)

- `applyTimeDelta` ya existe para restar (penalización) y para el tick.
- Nuevo: el bono de tiempo al completar ronda se aplica con `applyTimeDelta(session, +ENDLESS_REWARD_SECONDS)`.
- El tick del reloj (1s) ya corre vía el polling/`processTimerTick`; cuando `remainingTime <= 0` → `defeat`. Esa lógica de "0 → defeat" ya existe para el modo clásico, se reutiliza.

Constantes nuevas en `constants.ts`: `ENDLESS_BASE_SECONDS = 120`, `ENDLESS_REWARD_SECONDS = 30` (o env vars con esos defaults).

### D4 — Puntaje (función pura, testeada)

```ts
export function endlessScore(playedRounds: number, secondsSurvived: number): number {
  return playedRounds * 1000 + secondsSurvived;
}
```
`secondsSurvived` se deriva de `gameDurationSeconds(session, now)` que ya existe. Se calcula al game over y se expone para `leaderboard`.

### D5 — Generación de la siguiente ronda

Reutiliza el flujo de Bedrock existente. Dado que generar tarda ~13-16s, hay una **decisión de UX a resolver en implementación**:
- (a) Mostrar un breve "preparando siguiente incidente…" entre rondas (consistente con el estado `idle` actual + el streaming de `bedrock-streaming`), o
- (b) Pre-generar la ronda siguiente en background mientras el jugador resuelve la actual (más fluido, más complejo).

Recomendación: empezar con (a) reutilizando el streaming ya hecho (el jugador ve el próximo incidente generándose en vivo — encaja con el "wow"). (b) queda como optimización futura.

### D6 — Coexistencia (R5)

`mode` en la sesión decide el comportamiento de `submitAnswer` al completar un challenge:
- `classic` → `victory` (comportamiento actual, tests intactos).
- `endless` → cargar ronda.

El `/start` puede recibir el modo (default `endless`). Esto evita romper los tests existentes: el modo clásico sigue disponible y testeado, y los tests nuevos cubren endless.

### D7 — Selector de modo en modal del Coder (decisión UX 2026-06-30)

**Dónde:** `StartGameButton.tsx` — modal de confirmación que ya pide idioma del incidente.

**Orden en el modal (de arriba a abajo):**
1. Selector de **modo de juego** (`classic` | `endless`)
2. Selector de **idioma del incidente**

**Por qué ahí y no en la home:**
- El modo es decisión de *setup* del Coder, no del Helper (el Helper entra a una sala con modo ya fijado).
- El usuario ya está en intención de jugar; no agrega un paso extra fuera del flujo existente.
- Evita mezclar "elegir rol" con "elegir modo" en la landing.

**Flujo de datos:**
```
StartGameButton (elige mode + lang)
  → router.push(`/coder?lang=…&mode=…`)
  → coder/page.tsx lee query params
  → startGame(language, mode)
  → POST /api/game/start { language, mode }
  → createPendingSession(…, mode)
```

**Copy sugerido (español neutro):**

| Valor | Etiqueta | Descripción |
|---|---|---|
| `classic` | Partida normal | Un incidente. Lo resolvés y ganás. |
| `endless` | Modo infinito | Rondas seguidas. Sobrevivís lo más que puedas. |

**Default en UI:** `endless` (alineado con default del API). Opcional: persistir última elección en `localStorage`.

**Archivos a tocar (solo UI + bootstrap):**

| Archivo | Cambio |
|---|---|
| `StartGameButton.tsx` | Control de modo + copy; propagar `mode` en URL |
| `app/coder/page.tsx` | Leer `mode` de searchParams; pasar a `startGame` |

No requiere cambios en `game-engine`, `game-service` ni pantallas del Helper.

## Componentes afectados

| Archivo | Cambio |
|---|---|
| `game-types.ts` | `GameSession`: `round`, `mode`, `roundComplete?`; tipo de respuesta con `round` |
| `game-engine.ts` | `submitAnswer`: rama endless (flag roundComplete + bono de tiempo); `endlessScore` |
| `game-service.ts` | `processAnswer`: al `roundComplete`, generar siguiente ronda (Bedrock + fallback), incrementar round |
| `constants.ts` | `ENDLESS_BASE_SECONDS`, `ENDLESS_REWARD_SECONDS` |
| Coder/Helper views | mostrar `round`; transición entre rondas (reusar estado idle/streaming) |
| `/start` | aceptar `mode` (default endless) — ✅ hecho |
| `game-mode.ts` | parsing puro + `buildCoderStartPath` — ✅ hecho |
| `StartGameButton.tsx` | selector de modo en modal — ✅ hecho |
| `app/coder/page.tsx` | `resolveCoderStartParams` + `startGame` — ✅ hecho |

## Testing

- **Puro (sin I/O):** `endlessScore` (tabla de casos), `submitAnswer` en modo endless (marca roundComplete + suma tiempo en último step; no marca victory), reloj a 0 → defeat.
- **Servicio:** `processAnswer` al completar ronda incrementa round y carga challenge (con Bedrock mockeado); fallback al curado.
- **Sin regresión:** modo `classic` sigue marcando `victory`; tests existentes verdes.
- **Puro (`game-mode.test.ts`):** `parseGameMode`, `resolveCoderStartParams`, `buildCoderStartPath`.
- **Cliente (`game-client.test.ts`):** body del POST incluye `language` y `mode`.
- **Servicio (`game-service.start.test.ts`):** `startGame` persiste el `mode` en la sesión.
- **Selector (D7) — smoke manual (7.7):** classic → victoria; endless → loop + score en defeat.

## Riesgos y mitigaciones

- **Latencia entre rondas (Bedrock ~14s):** mitigada reutilizando el streaming de `bedrock-streaming` (se ve generar en vivo) y, a futuro, pre-generación en background.
- **Costo de Bedrock:** el modo infinito multiplica las invocaciones. El rate-limit de `/start` (ya existe) limita el inicio de partidas; considerar un límite suave de generaciones por sesión si fuera necesario (no en el alcance inicial).
- **No romper el modo clásico:** el campo `mode` aísla el comportamiento; los tests del modo clásico permanecen.

## Dependencias

- `adaptive-difficulty` — aporta la dificultad por `round`.
- `leaderboard` — consume `endlessScore` y `playedRounds` al game over.
