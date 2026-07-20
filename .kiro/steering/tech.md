# Technology Stack

## Stack (verificado contra package.json — NO asumir)

| Tecnología | Versión | Notas |
|------------|---------|-------|
| Next.js | **16.2.9** | App Router, API routes. ⚠️ Esta versión puede diferir de tu training data — leé `node_modules/next/dist/docs/` antes de escribir código de framework. |
| React | 19.2.4 | Server + Client Components |
| TypeScript | 5.x | strict mode, **cero `any`** |
| Tailwind CSS | 4.x | vía `@tailwindcss/postcss` |
| ESLint | 9.x | `eslint-config-next` |
| @vercel/kv | 3.0.0 | sobre `@upstash/redis`. Persistencia de sesiones. |

**Sin runner de tests instalado todavía.** Cuando se agregue, usar **Vitest** (`vitest` + `@vitest/coverage-v8`) — encaja con el stack TS/ESM sin config pesada.

## Reglas de código (estrictas)

- **Cero `any`.** Usar `unknown` + narrowing, tipos derivados, fixtures tipadas. El ESLint `@typescript-eslint/no-explicit-any` se mantiene en `error`.
- **Sin `as` casts** salvo `as const` y `satisfies`.
- **La lógica del juego vive en funciones puras** (`src/features/game/game-engine.ts`, `client-question-engine.ts`): reciben estado, devuelven estado nuevo, sin I/O. Mantener esta pureza — es lo que las hace testeables y es el patrón del proyecto.
- **`correct_answer` NUNCA sale al cliente.** El cliente manda solo un `answerIndex`; el server valida. Cualquier respuesta de API debe filtrar las respuestas correctas. Es una invariante de seguridad del juego.
- **Validación server-side.** No confiar en el cliente para nada que afecte el resultado.
- Import alias: `@/*` mapea a la raíz del proyecto.

## Comandos

```bash
npm run dev     # servidor de desarrollo
npm run build   # build de producción
npm run start   # servidor de producción
npm run lint    # ESLint
# npm run test  # PENDIENTE — agregar con Vitest
```

## Persistencia de sesiones

- Producción: **Upstash Redis** vía `@vercel/kv`, con TTL de 1h.
- Local dev: fallback a `Map` en memoria si no hay env vars de KV.
- El cliente `kv` lee **`KV_REST_API_URL` + `KV_REST_API_TOKEN`** (NO `UPSTASH_REDIS_REST_URL`).

---

## ⚠️ KNOWN ISSUES (auditoría adversarial — 31 hallazgos confirmados)

Estos son problemas REALES verificados en el código. **No los repitas. Priorizá arreglarlos.** Documentados para que cualquier cambio los tenga en cuenta.

### 🔴 CRITICAL
1. **Fallback silencioso a memoria rompe la demo** (`game-service.ts:33-53`). Si en producción faltan las env vars de KV, el código cae a un `Map` en memoria SIN log ni error. En serverless cada request pega en otro contenedor → "Sesión no encontrada" al primer tick. **En local funciona, en prod muere** — no se reproduce ensayando. Fix: fail-fast si `NODE_ENV === 'production' && !USE_KV`; loguear el modo de persistencia al boot.

### 🟠 HIGH
2. **Colisión de room codes** (`game-service.ts:86-95`). `startGame()` hace `kv.set` sin flag `nx` → pisa sesiones existentes. El room code ES la key KV → dos parejas pueden compartir sesión. Fix: `kv.set(..., { nx: true })` + retry; `memorySessions.has()` en el fallback.
3. **Read-modify-write sin atomicidad** (`game-service.ts:142-198`). `/tick`, `/answer`, `/client-question` se pisan (last-write-wins) → timer no determinista, penalizaciones/avances perdidos. Fix: derivar `remainingTime = endsAt - now` para que `/tick` deje de escribir; penalties/bonus con `kv.incrby` atómico.
4. **Desajuste de env vars** (`game-service.ts:33-34`). `USE_KV` detecta `UPSTASH_REDIS_REST_URL` pero el cliente `kv` usa `KV_REST_API_*`. Fix: unificar detección con `KV_REST_API_URL` + `KV_REST_API_TOKEN`, validar que ambas existan juntas.
5. **Ausencia total de tests.** `game-engine.ts` y `client-question-engine.ts` son funciones puras ideales para testear y no hay ninguna. Fix: Vitest + tests de tabla. **PRIMERA PRIORIDAD — red de seguridad antes de tocar los otros fixes.**
6. **Cero `try/catch` en KV, route handlers y `request.json()`.** Un blip de red de Upstash tira 500; `handleAnswer` deja `submitting=true` para siempre → juego trabado. Fix: `try/catch` en service y handlers; `finally { setSubmitting(false) }` en cliente.

### 🟡 MEDIUM / 🟢 LOW (no bloquean la demo, atacar después)
Timer sin reloj de pared (se congela si para el polling), polling GET sin `cache: 'no-store'`, sin auth entre Coder/Helper (cualquiera con el room code controla la sesión), sin rate limiting en endpoints, `answerIndex` sin validación de rango (NaN/floats/negativos pasan el guard `typeof === 'number'`), penalty hardcodeado a `10` en vez de `PENALTY_SECONDS`, `result.patch!` non-null assertion, estado inicial del Helper hardcodeado a 180s, TTL de 1h sin renovación.
