# Project Structure

## Arquitectura: por capas, feature-based

El proyecto grita lo que hace (Screaming Architecture). Cuatro capas con responsabilidad única, dependencias en una sola dirección (UI → API → lógica → datos).

```
┌─────────────────────────────────────────────────────────┐
│  UI          app/, src/components/                       │  CoderScreen, HelperScreen, GameTimer, ManualPanel...
└─────────────────────┬────────────────────────────────────┘
                      │ fetch
┌─────────────────────▼────────────────────────────────────┐
│  Action      app/api/game/*                               │  start, state, guide, sync, answer, tick, client-question
└─────────────────────┬────────────────────────────────────┘
                      │ calls
┌─────────────────────▼────────────────────────────────────┐
│  Game logic  src/features/game/                           │  game-engine.ts (PURO), game-service.ts (sesiones+KV)
└─────────────────────┬────────────────────────────────────┘
                      │ reads
┌─────────────────────▼────────────────────────────────────┐
│  Data        src/data/                                    │  challenges/*.json, client-questions/*.json
└───────────────────────────────────────────────────────────┘
```

## Layout

```
app/
  page.tsx                 # Landing — selección de rol
  coder/page.tsx           # Pantalla del Coder
  helper/page.tsx          # Pantalla del Helper
  api/game/
    start/route.ts         # POST — crea sesión
    state/route.ts         # GET  — vista del Coder
    guide/route.ts         # GET  — guía estática del Helper
    sync/route.ts          # GET  — timer/progreso del Helper
    answer/route.ts        # POST — enviar diagnóstico
    tick/route.ts          # POST — decrementar timer
    client-question/route.ts # POST — responder consulta del cliente

src/
  features/game/
    game-engine.ts         # Lógica PURA del juego (sin I/O — mantener así)
    game-service.ts        # Sesiones, carga de challenges, persistencia KV
    client-question-engine.ts # Lógica de consultas del cliente (mayormente pura)
    game-types.ts          # Interfaces TypeScript — fuente de verdad de tipos
  components/              # Componentes de UI (uno por archivo, PascalCase)
  data/
    challenges/            # challenge JSON + index.ts (registro)
    client-questions/      # questions JSON + index.ts
  hooks/                   # React hooks (useClockTickSound...)
  lib/                     # constants.ts, boss-position.ts, game-audio.ts

.kiro/steering/            # Steering files de Kiro (este directorio)
.grok/skills/              # Skills de agente legacy (architecture, game rules)
```

## Convenciones (dónde va cada cosa)

- **Lógica nueva de juego → `src/features/game/`, como función pura.** Si necesita I/O o persistencia, va en `game-service.ts`, NO en `game-engine.ts`. No contamines el engine con efectos.
- **Constantes → `src/lib/constants.ts`.** Nada de magic numbers en el código. (Ya hay deuda acá: `penalty: 10` hardcodeado en `game-service.ts` debería usar `PENALTY_SECONDS`.)
- **Tipos → `game-types.ts`.** No definir interfaces de dominio sueltas en otros archivos.
- **Componentes → `src/components/`,** un componente por archivo, nombre `PascalCase.tsx`.
- **Datos del juego → JSON en `src/data/`,** registrados en el `index.ts` de su carpeta. Para agregar un challenge: crear el JSON, registrarlo en `index.ts`, validar la regla de cooperación (ningún jugador resuelve solo).
- **Tests (cuando se agreguen) → junto al código que verifican** (`game-engine.test.ts` al lado de `game-engine.ts`) o en `__tests__/`. Fixtures tipadas, sin duplicar mocks entre specs.

## Flujo de una respuesta (referencia)

```
Coder elige opción
  → POST /api/game/answer { sessionId, answerIndex }
    → game-service carga sesión + challenge
      → game-engine.resolveStep(step, answerIndex)   [PURO]
        → correcto: avanza paso o victoria
        → incorrecto: penalty −10s
    → respuesta sanitizada (sin correct_answer)
  → feedback en UI + vista actualizada del Coder
```
