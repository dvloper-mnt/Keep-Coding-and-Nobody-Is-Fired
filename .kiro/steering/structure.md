# Project Structure

## Arquitectura: por capas, feature-based

El proyecto grita lo que hace (Screaming Architecture). Capas con responsabilidad única, dependencias en una sola dirección (UI → API → lógica → datos/IA).

```
┌─────────────────────────────────────────────────────────┐
│  UI          app/, src/components/, hooks                 │  CoderScreen, HelperScreen, GameTimer, ManualPanel...
└─────────────────────┬────────────────────────────────────┘
                      │ fetch / SSE
┌─────────────────────▼────────────────────────────────────┐
│  Action      app/api/game/*                               │  start, state, guide, sync, answer, tick,
│                                                            │  client-question, generate-stream, abandon
└─────────────────────┬────────────────────────────────────┘
                      │ calls
┌─────────────────────▼────────────────────────────────────┐
│  Game logic  src/features/game/                           │  game-engine.ts (PURO), game-service.ts (sesiones+Valkey),
│                                                            │  runtime-generator.ts (Bedrock I/O)
└─────────────────────┬────────────────────────────────────┘
                      │ reads
┌─────────────────────▼────────────────────────────────────┐
│  Data / IA   src/data/  +  AWS Bedrock                    │  challenges/*.json (fallback curado), client-questions/*.json
└───────────────────────────────────────────────────────────┘
```

## Layout

```
app/
  page.tsx                 # Landing — selección de rol (hero con typewriter)
  coder/page.tsx           # Pantalla del Coder
  helper/page.tsx          # Pantalla del Helper
  api/game/
    start/route.ts            # POST — crea sesión (acepta lenguaje; sala primero)
    state/route.ts            # GET  — vista del Coder
    guide/route.ts            # GET  — guía del Helper
    sync/route.ts             # GET  — timer/progreso del Helper
    answer/route.ts           # POST — enviar diagnóstico
    tick/route.ts             # POST — decrementar timer
    client-question/route.ts  # POST — responder consulta del cliente
    generate-stream/route.ts  # GET  — SSE: genera el challenge con Bedrock en vivo
    abandon/route.ts          # POST — abandonar sesión

src/
  features/game/
    game-engine.ts            # Lógica PURA del juego (sin I/O — mantener así)
    game-service.ts           # Sesiones, carga de challenges, persistencia Valkey (ioredis)
    runtime-generator.ts      # Generación con Bedrock (Converse + ConverseStream) + guardrail + fallback
    client-question-engine.ts # Lógica de consultas del cliente (mayormente pura)
    game-types.ts             # Interfaces TypeScript — fuente de verdad de tipos
    challenge-schema.ts       # Validación de la forma del challenge (isValidChallenge)
    challenge-language.ts     # Resolución de lenguaje + instrucción para el prompt
    client-question-schema.ts # Validación de consultas del cliente
    rate-limit.ts             # Rate limiting fixed-window (fail-open) sobre Valkey
    session-credentials.ts    # Room codes + tokens opacos (crypto), comparación timing-safe
    streaming-preview.ts      # Extrae title/story de JSON parcial durante el stream
    api/
      game-client.ts          # Cliente fetch tipado para los endpoints
      session-token-store.ts  # Persistencia local del token de sesión (auth Coder/Helper)
    hooks/
      useCoderGame.ts             # Estado del Coder
      useHelperGame.ts            # Estado del Helper
      useGameSessionBootstrap.ts  # Arranque de sesión
      useChallengeStream.ts       # EventSource (SSE) para el streaming de Bedrock
      usePolling.ts               # Polling con fetch final en el edge
    testing/
      fixtures.ts             # Fixtures tipadas — NO duplicar mocks entre specs
  components/              # Componentes de UI (uno por archivo, PascalCase)
  hooks/                  # Hooks globales (useClockTickSound)
  data/
    challenges/            # challenge JSON (fallback curado) + index.ts (registro)
    client-questions/      # questions JSON + index.ts
  lib/                    # constants.ts, boss-position.ts, game-audio.ts

scripts/
  generate-questions.ts   # Script tsx para generar challenges

infra/                    # Terraform (IaC del deploy AWS)
  main.tf                 # ECS Fargate + ALB + IAM (Bedrock policy) + task def
  network.tf              # VPC, subnets, IGW, security groups
  elasticache.tf          # ElastiCache Valkey 8.0 (sesiones)
  https.tf                # ACM cert + listener 443 (TLS 1.3)
  guardrail.tf            # Bedrock Guardrail + version
  observability.tf        # CloudWatch dashboard (Bedrock + costo, ALB, Fargate)
  oidc.tf                 # Trust de GitHub Actions (CI/CD sin keys)
  dev-access.tf           # Usuario IAM least-privilege para Bedrock local (quitar post-hackathon)
  variables.tf / outputs.tf / versions.tf

compose.yaml              # Valkey 8-alpine local (host 6380 → 6379)
Dockerfile                # Imagen del app (Node 22, pnpm, build amd64)
proxy.ts                  # Security headers (HSTS, CSP, X-Frame-Options...) — antes middleware.ts

.kiro/specs/              # Specs spec-driven (requirements/design/tasks por feature)
.kiro/steering/           # Steering files de Kiro (este directorio)
```

## Convenciones (dónde va cada cosa)

- **Lógica nueva de juego → `src/features/game/`, como función pura** en `game-engine.ts`. Si necesita I/O, persistencia o Bedrock, va en `game-service.ts` / `runtime-generator.ts`, NO en `game-engine.ts`. No contamines el engine con efectos.
- **TDD: el test nace primero.** Test al lado del archivo (`*.test.ts`). Fixtures tipadas en `testing/fixtures.ts`, sin duplicar mocks entre specs.
- **Constantes → `src/lib/constants.ts`.** Nada de magic numbers.
- **Tipos → `game-types.ts`.** No definir interfaces de dominio sueltas en otros archivos.
- **Componentes → `src/components/`,** un componente por archivo, `PascalCase.tsx`.
- **Datos del juego (fallback) → JSON en `src/data/`,** registrados en el `index.ts` de su carpeta. Para agregar un challenge curado: crear el JSON, registrarlo, validar la regla de cooperación (ningún jugador resuelve solo).
- **Schemas/validación → `*-schema.ts`** junto a la feature. Toda entrada de Bedrock pasa por `isValidChallenge` antes de usarse.
- **Infra → `infra/*.tf`,** un archivo por dominio (red, cómputo, IA, observabilidad...). No mezclar.

## Flujo de una ronda (referencia)

```
Coder pide challenge
  → GET /api/game/generate-stream (SSE)
    → runtime-generator.generateChallengeStreaming() [Bedrock ConverseStream]
      → deltas token por token → useChallengeStream → UI lo escribe en vivo
      → si Bedrock falla/timeout → fallback al challenge curado (src/data/)
  → challenge validado (isValidChallenge) → sesión promovida en Valkey

Coder elige opción
  → POST /api/game/answer { sessionId, answerIndex }   [+ token de sesión]
    → game-service carga sesión + challenge (Valkey)
      → game-engine.resolveStep(step, answerIndex)   [PURO]
        → correcto: avanza paso / (endless) carga ronda nueva + bono de tiempo
        → incorrecto: penalización de tiempo
    → respuesta sanitizada (sin correct_answer)
  → feedback en UI + vista actualizada del Coder
```
