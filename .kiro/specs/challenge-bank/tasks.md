# Tasks — Banco de challenges validados (challenge-bank)

Implementación de adentro hacia afuera (lógica pura → storage → runtime → seed). TDD en la lógica pura. NADA implementado aún.

> Entorno: correr tests/scripts con `corepack pnpm@9.15.0 ...` (en esta Mac el `pnpm` del PATH es v11 de brew y miente; el CI usa 9.15). Ver gotcha de entorno en memoria.

## 1. Validación de calidad (lógica PURA, primero)

- [ ] 1.1 Test primero: `src/features/game/challenge-quality.test.ts`. Casos de tabla — rechazar conteos de texto ("SI Route aparece 4 veces..."), "N/A"/vacíos/placeholders, listas vacías de rules/knowledge, y la respuesta literal dentro de una rule. Aceptar un challenge bueno (usar un fixture basado en `login-chaos.json`). (R1.1–R1.4)
- [ ] 1.2 Implementar `isQualityChallenge(challenge): { ok: boolean; reasons: string[] }` puro, sin I/O, que no lance. (R1.5)
- [ ] 1.3 Exponer `isStrongValidChallenge(x): x is Challenge` = `isValidChallenge(x) && isQualityChallenge(x).ok`. (R1.6)
- [ ] 1.4 Verde: `corepack pnpm@9.15.0 exec vitest run src/features/game/challenge-quality.test.ts`.

## 2. Storage del banco (Valkey)

- [ ] 2.1 Hacer accesible el cliente Redis: exportar `getRedis()` desde game-service.ts (o extraerlo a un módulo `redis-client.ts` compartido) para que el banco no abra otra conexión. (D2)
- [ ] 2.2 `src/features/game/challenge-bank.ts`: `saveToBank(challenge, language)`, `getRandomFromBank(language)`, `bankCount(language)`. Claves `bank:challenge:<lang>:<id>` (SET sin TTL) + índice `bank:index:<lang>` (Redis SET con SADD/SRANDMEMBER/SCARD). (R2.1–R2.4, R2.6)
- [ ] 2.3 `getRandomFromBank('random')`: elegir un lenguaje con `SCARD > 0` y devolver uno de ahí; si ninguno tiene stock → `null`. (R2.3)
- [ ] 2.4 Degradación sin Redis: si `getRedis()` es null → `getRandomFromBank` devuelve `null`, `saveToBank` es no-op, `bankCount` 0. NUNCA lanzar. (R2.5)
- [ ] 2.5 `saveToBank` respeta `BANK_MAX_PER_LANGUAGE` (no auto-guardar pasado el tope; el seed puede forzar con un flag). (R4.2)
- [ ] 2.6 Tests del banco con un mock/fake de ioredis (o un fake in-memory del SET) — guardar/recuperar/contar, idempotencia por id, random con/ sin stock, sin-Redis. (R6.1)

## 3. Constantes y env

- [ ] 3.1 `src/lib/constants.ts`: `BANK_MAX_PER_LANGUAGE` (default 50) y `CHALLENGE_SOURCE_MODE` (default 'bank-first'). (D constantes)
- [ ] 3.2 Documentar las env nuevas en `.env.local.example` (CHALLENGE_SOURCE_MODE, BANK_MAX_PER_LANGUAGE).

## 4. Selección en runtime (game-service.ts)

- [ ] 4.1 Escribir `resolveChallengeForRound(language)` con los 4 modos (`bank-first` default, `generate-first`, `bank-only`, `generate-only`) según D3. Devuelve `{ challenge, source }`. (R3.1–R3.5)
- [ ] 4.2 Aplicar `isQualityChallenge` a lo que devuelve `generateChallenge` en runtime (doble candado prompt+validación); si no pasa calidad, NO servirlo. (R3.3)
- [ ] 4.3 Auto-guardar en el banco (best-effort, `.catch(() => {})`) cuando una generación pasa validación fuerte. (R4.1)
- [ ] 4.4 Preservar SIEMPRE el fallback al curado (`pickRandomChallenge`) como última red en todos los modos. (R3.6)
- [ ] 4.5 Reemplazar el cuerpo de `ensureChallengeGenerated` por una llamada a `resolveChallengeForRound`; loguear `source` (bank/generate/curated). (R3, observabilidad)
- [ ] 4.6 Aplicar el mismo gate de calidad + auto-guardado en el flujo de streaming (`promoteSessionWithChallenge`). (D3 streaming)

## 5. Seed script

- [ ] 5.1 `scripts/seed-bank.ts` (tsx): por lenguaje, generar N (SEED_PER_LANGUAGE, default 5), validar fuerte, guardar los que pasan (forzando sobre el tope). (R5.1, R5.3)
- [ ] 5.2 Reporte final: tabla por lenguaje (generados | aceptados | rechazados | razones top) + total en banco. (R5.2)
- [ ] 5.3 Agregar script a package.json: `"seed:bank": "tsx scripts/seed-bank.ts"`.

## 6. Verificación

- [ ] 6.1 `corepack pnpm@9.15.0 run test` verde (existentes + nuevos), `tsc --noEmit` 0, `corepack pnpm@9.15.0 run lint` 0 warnings. (R6.2)
- [ ] 6.2 Smoke local: con `CHALLENGE_SOURCE_MODE=bank-first` y banco vacío → genera y guarda; segundo `/start` del mismo lenguaje → sale del banco (sin llamar a Bedrock; verificar por logs `source: bank`). (R3.2, R3.3)
- [ ] 6.3 Smoke del seed: correr `seed-bank.ts` con SEED_PER_LANGUAGE=2, confirmar que el reporte muestra aceptados > 0 y `bankCount` sube. (R5)
- [ ] 6.4 Confirmar degradación: sin REDIS_HOST (dev), el juego sigue funcionando (cae a generar/curado), sin errores. (R2.5, R6.3)

## Notas

- Orden por dependencias: 1 (validación pura) → 2 (storage) → 4 (runtime) → 5 (seed). La 3 (constantes) se hace junto a la 4.
- La validación de calidad (tarea 1) sirve SOLA como red de seguridad aunque el banco no esté lleno — es la pieza más valiosa y la primera.
- Seguridad: `isQualityChallenge` opera sobre texto; cuidar regex sin backtracking catastrófico (anclar, evitar `.*` anidados). El banco guarda `correct_answer` server-side; la sanitización al cliente NO cambia.
- Relación con otras specs: independiente de endless-mode/adaptive-difficulty, pero las complementa (un banco con dificultad etiquetada sería una mejora futura, fuera de scope acá).
