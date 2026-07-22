# Technology Stack

## Stack (verificado contra package.json + infra — NO asumir)

| Tecnología | Versión | Notas |
|------------|---------|-------|
| Node.js | **>=22** (`.nvmrc` = 22) | LTS. El proyecto migró de Node 20 → 22. |
| Gestor de paquetes | **pnpm@9.15.0** | `packageManager` en package.json. **NO usar `npm` ni `yarn`.** vía corepack. |
| Next.js | **16.2.9** | App Router, API routes. ⚠️ Esta versión puede diferir de tu training data — leé `node_modules/next/dist/docs/` antes de escribir código de framework. Heedeá los avisos de deprecación. |
| React | 19.2.4 | Server + Client Components |
| TypeScript | 5.x | strict mode, **cero `any`** |
| Tailwind CSS | 4.x | vía `@tailwindcss/postcss` |
| ESLint | 9.x | `eslint-config-next`. CI corre con `--max-warnings 0`. |
| Vitest | 4.x | **Runner de tests ACTIVO** (`vitest` + `@vitest/coverage-v8` + `vite-tsconfig-paths`). 96 casos en 10 archivos. |
| ioredis | 5.x | Cliente Redis para AWS ElastiCache **Valkey 8.0**. Persistencia de sesiones. |
| @aws-sdk/client-bedrock-runtime | 3.x | Generación de challenges con **Claude Haiku 4.5** en Bedrock. |
| Husky | 9.x | git hooks (`prepare`). |
| tsx | 4.x | runner TS para scripts (`scripts/generate-questions.ts`). |

## Reglas de código (estrictas)

- **Cero `any`.** Usar `unknown` + narrowing, tipos derivados, fixtures tipadas. El ESLint `@typescript-eslint/no-explicit-any` se mantiene en `error`, nunca `warn`.
- **Sin `as` casts** salvo `as const` y `satisfies`.
- **TDD obligatorio.** Test primero, siempre. La lógica pura nueva nace con su test al lado.
- **Sin comentarios innecesarios.** El código se explica solo; comentar solo el porqué no-obvio.
- **La lógica del juego vive en funciones puras** (`src/features/game/game-engine.ts`, `client-question-engine.ts`): reciben estado, devuelven estado nuevo, sin I/O. Mantener esta pureza — es lo que las hace testeables y es el patrón del proyecto. La generación con Bedrock (I/O) vive en `game-service.ts` / `runtime-generator.ts`, NUNCA en el engine.
- **`correct_answer` NUNCA sale al cliente.** El cliente manda solo un `answerIndex`; el server valida. Cualquier respuesta de API debe filtrar las respuestas correctas. Es una invariante de seguridad del juego.
- **Validación server-side.** No confiar en el cliente para nada que afecte el resultado.
- **Español neutro** en prompts, copy de UI y contenido del juego (no voseo en producto). El voseo es solo conversacional.
- Import alias: `@/*` mapea a la raíz del proyecto.

## Comandos (pnpm — NO npm)

```bash
pnpm install         # instalar dependencias
pnpm run dev         # servidor de desarrollo
pnpm run build       # build de producción
pnpm run start       # servidor de producción
pnpm run lint        # ESLint (CI usa --max-warnings 0)
pnpm run test        # Vitest (vitest run)
pnpm run test:watch  # Vitest en watch
pnpm run test:coverage
pnpm run generate:questions  # genera challenges con tsx
```

Local con Docker: `compose.yaml` levanta Valkey 8-alpine (host **6380** → contenedor 6379, para no chocar con otros Redis locales). Bedrock local requiere credenciales AWS del usuario IAM dedicado.

## Persistencia de sesiones (AWS ElastiCache Valkey)

- Producción: **AWS ElastiCache Valkey 8.0** vía `ioredis`. El cliente lee `REDIS_HOST` + `REDIS_PORT` (default 6379).
- **Fail-fast en producción:** si `NODE_ENV === 'production'` y falta `REDIS_HOST`, `game-service.ts` LANZA error en vez de caer a memoria. (Esto cierra el CRITICAL del fallback silencioso — ver historial.)
- Local dev: fallback a `Map` en memoria solo si no hay `REDIS_HOST`.
- **YA NO se usa `@vercel/kv` ni Upstash.** Migrado a ElastiCache (PR #10). Si ves `KV_REST_API_*` en algún lado, es legacy — eliminar.

## IA — Bedrock (el corazón del juego)

- **Claude Haiku 4.5** vía inference profile `us.anthropic.claude-haiku-4-5-20251001-v1:0` (`BEDROCK_MODEL_ID`).
- Generación de challenges en `src/features/game/runtime-generator.ts`:
  - `generateChallenge()` — `ConverseCommand` (sincrónico).
  - `generateChallengeStreaming()` — `ConverseStreamCommand`, emite deltas token por token (el "wow" en vivo para el jurado).
- **Bedrock Guardrails** activo: filtra contenido (`BEDROCK_GUARDRAIL_ID` / `BEDROCK_GUARDRAIL_VERSION`). Si las env vars faltan (local), corre sin guardrail.
- **Permisos IAM distintos por API:** `InvokeModel`, `InvokeModelWithResponseStream`, `Converse`, `ConverseStream`, `ApplyGuardrail` — cada uno se concede aparte en el task role (`infra/main.tf`).
- **Timeout:** `BEDROCK_RUNTIME_TIMEOUT_MS` (default prod 20000ms; la generación real mide 13-16s). Si falla/timeoutea → **fallback al challenge curado** (el loop nunca se rompe en demo).

## Deploy (AWS, IaC con Terraform)

- **ECS Fargate** (256 CPU / 512 MB) detrás de un **ALB** con **HTTPS** (ACM, TLS 1.3) en `hackaton.dvloper.com.co` (DNS en Hostinger). Listener 80 → 301 a 443.
- **ECR** para la imagen (build amd64).
- **CI/CD automático:** push a `develop` dispara `.github/workflows/deploy.yml` → pnpm install + lint + test (aborta si fallan) → build amd64 → push ECR → `ecs update-service --force-new-deployment` (~1m30s). Autenticación OIDC, sin keys.
- **CloudWatch dashboard** `keep-coding-game`: invocaciones/latencia/tokens de Bedrock + **costo estimado en USD**, métricas de ALB y Fargate.
- Infra en `infra/*.tf` (provider `hashicorp/aws >= 6.23` para guardrails).

---

## Estado de los KNOWN ISSUES (auditoría adversarial original)

La auditoría original encontró 31 hallazgos. El CRITICAL y los HIGH principales **ya están resueltos** (PRs de seguridad + migración a ElastiCache + suite de tests). Para referencia histórica:

- ✅ **Fallback silencioso a memoria** — RESUELTO: fail-fast en producción (`game-service.ts`).
- ✅ **Ausencia de tests** — RESUELTO: Vitest con 96 casos.
- ✅ **Sin auth entre Coder/Helper** — RESUELTO: tokens opacos por sesión (`session-credentials.ts`, `session-token-store.ts`).
- ✅ **Sin rate limiting** — RESUELTO: `rate-limit.ts` (fixed-window, fail-open).
- ✅ **Headers de seguridad** — RESUELTO: `proxy.ts` (HSTS, CSP, X-Frame-Options DENY, etc.).
- ⚠️ Revisar al tocar lógica: atomicidad read-modify-write en endpoints concurrentes, validación de rango de `answerIndex`, magic numbers (usar `constants.ts`).
