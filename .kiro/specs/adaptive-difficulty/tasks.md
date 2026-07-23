# Tasks — Adaptive Difficulty (escalado por niveles en modo infinito)

Implementación en orden de dependencias (de adentro hacia afuera). TDD donde hay lógica pura: test primero, después implementación.

## 1. Tipo y validador — el nivel `'expert'`

- [ ] 1.1 Ampliar `type Difficulty` a `'easy' | 'medium' | 'hard' | 'expert'` en `src/features/game/game-types.ts`. (R2.1)
- [ ] 1.2 Agregar `'expert'` a `VALID_DIFFICULTIES` en `src/features/game/challenge-schema.ts`, manteniendo `as const`. (R2.2)
- [ ] 1.3 Test: `isValidChallenge` acepta un challenge con `difficulty: 'expert'` y sigue rechazando un valor fuera del set; los tres niveles previos siguen válidos. (R2.2, R2.3)

## 2. Lógica pura — `challenge-difficulty.ts`

- [ ] 2.1 Test primero: tabla exhaustiva para `roundToDifficulty(round)` cubriendo todos los rangos y bordes — `1-3 → 'easy'`, `4-7 → 'medium'`, `8-12 → 'hard'`, `13+ → 'expert'`, y bordes 0, 1, 3, 4, 7, 8, 12, 13, 100, no-enteros → ronda 1 (`'easy'`). (R1.1–R1.6)
- [ ] 2.2 Implementar `roundToDifficulty(round: number): Difficulty` en `src/features/game/challenge-difficulty.ts` (archivo nuevo, espejo de `challenge-language.ts`). (R1.1–R1.6)
- [ ] 2.3 Test primero: `difficultyInstruction(difficulty)` devuelve texto no vacío y distinto para cada uno de los cuatro niveles. (R3.1)
- [ ] 2.4 Implementar `difficultyInstruction(difficulty: Difficulty): string` (en español, a mayor nivel bugs más sutiles y distractores más creíbles DENTRO de los 3 steps — NO más steps), análoga a `languageInstruction`. (R3.1, R3.5)

## 3. Generador — inyectar la dificultad en el prompt

- [ ] 3.1 Agregar el parámetro `difficulty?: Difficulty` (default `'easy'`) a `generateChallenge` y `generateChallengeStreaming` en `runtime-generator.ts`. (R3.2, R3.4)
- [ ] 3.2 Inyectar `difficultyInstruction(difficulty)` en el mensaje de usuario, junto a `languageInstruction(resolved)`, en ambas funciones. (R3.2)
- [ ] 3.3 Quitar el `"difficulty": "medium"` hardcodeado del bloque OUTPUT FORMAT del `SYSTEM_PROMPT` (sin tocar el resto del few-shot del PR #42) y pedir que el campo `"difficulty"` del JSON coincida con el nivel solicitado en el mensaje de usuario. Mantener `EXACTLY 3 chained steps`. (R3.3, R3.5)
- [ ] 3.4 Test (stream y no-stream mockeados, sin Bedrock real): el prompt enviado incluye el fragmento de `difficultyInstruction(difficulty)`; un challenge `difficulty: 'expert'` retornado pasa `isValidChallenge`; sin dificultad explícita se usa `'easy'`. (R3.2, R3.3, R3.4, R6.2)

## 4. Cableado de la ronda (depende de endless-mode)

- [ ] 4.1 En `app/api/game/generate-stream/route.ts`, derivar `roundToDifficulty(<ronda de endless-mode>)` del estado de sesión y pasarla como tercer argumento a `generateChallengeStreaming`. (R4.1, R4.2)
- [ ] 4.2 En `game-service.ts` (`ensureChallengeGenerated`), derivar la dificultad de la ronda de la sesión y pasarla a `generateChallenge`. (R4.1, R4.2)
- [ ] 4.3 Mientras endless-mode no exponga la ronda, ambos puntos usan ronda 1 → `'easy'`, idéntico al comportamiento actual (partida única). (R4.3)

## 5. Fallback y verificación

- [ ] 5.1 Confirmar que la cadena de fallback (`generated ?? pickRandomChallenge()`) y los `console.error('[bedrock] ...')` siguen intactos a cualquier nivel pedido; un test del generador con stream que arroja → `null` (fallback). (R5.1, R5.2, R5.3)
- [ ] 5.2 `corepack pnpm@9.15.0 run test` verde (suite existente + tests nuevos de `challenge-difficulty`, `challenge-schema` y generador con dificultad), `tsc --noEmit` 0 errores, `corepack pnpm@9.15.0 run lint` 0 warnings. (Usar corepack pnpm@9.15.0 en esta Mac, no el pnpm del PATH — ver gotcha de entorno.) (R6.1, R6.3)
- [ ] 5.3 Smoke test en local: simular rondas crecientes y confirmar que el `difficulty` del challenge generado escala (easy → medium → hard → expert) y que un fallo de Bedrock cae al curado sin romper. (R4, R5)

## Notas

- `roundToDifficulty` y `difficultyInstruction` son lógica pura: TDD estricto (test antes de implementación).
- El cambio de tipo (`'expert'`) y de `VALID_DIFFICULTIES` debe ir junto en el mismo paso lógico para no dejar el árbol en un estado donde un challenge experto compile pero no valide.
- La ronda la aporta **endless-mode**: si esa spec no está integrada al implementar, el cableado del paso 4 usa ronda 1 (`'easy'`) y se conecta la ronda real cuando endless-mode la exponga.
- Riesgo de demo cubierto por el fallback curado: pedir `'expert'` no cambia la red de seguridad; si Bedrock falla, la ronda arranca igual con el curado.
