# Tasks — Bedrock Client-Question Generation (build-time)

- [ ] 1. Preparar el fallback y las dependencias
  - [ ] 1.1 Copiar el `src/data/client-questions/questions.json` actual (las 12 preguntas curadas) a `src/data/client-questions/questions.fallback.json` y commitearlo. Esta es la red de seguridad — no se sobrescribe nunca
    - _Requirements: 4.1_
  - [ ] 1.2 Agregar `@aws-sdk/client-bedrock-runtime` y `tsx` a `devDependencies`. Verificar la forma correcta de ejecutar TS con la versión de Node instalada (Node 20+) — no asumir flags viejos
    - _Requirements: 1.3_

- [ ] 2. Crear el validador de ClientQuestion
  - [ ] 2.1 Crear `src/features/game/client-question-schema.ts` con `VALID_CATEGORIES` (as const) y un type guard `isValidQuestion(x: unknown): x is ClientQuestion` que valide: id string no vacío, category en VALID_CATEGORIES, client_prompt no vacío, options exactamente 4 strings no vacíos, correct_answer entero 0..3. Cero `any`, parte de `unknown` y estrecha
    - _Requirements: 3.2, 5.3_

- [ ] 3. Implementar el generador con Bedrock
  - [ ] 3.1 Crear `scripts/generate-questions.ts`: cliente `BedrockRuntimeClient` con región de `AWS_REGION` (default us-east-1) y model id de `BEDROCK_MODEL_ID` (default us.anthropic.claude-haiku-4-5-20251001-v1:0). Sin credenciales hardcodeadas
    - _Requirements: 1.3, 1.4_
  - [ ] 3.2 Implementar una invocación Converse por categoría (sql, design-patterns, architecture, programming) pidiendo ~5 preguntas cada una, con system prompt que fije: array JSON puro sin markdown, 4 opciones exactas, correct_answer 0-3, id patrón `cq_<cat>_<descriptor>`, client_prompt narrativo "El cliente ... pregunta: «...»"
    - _Requirements: 1.3, 2.1, 2.2, 2.3, 2.4_
  - [ ] 3.3 Aplicar timeout al batch (`BEDROCK_TIMEOUT_MS`, default 30s) para no colgar el build
    - _Requirements: 1.5_

- [ ] 4. Parsear y validar el output
  - [ ] 4.1 Limpiar fences de markdown (```` ```json ````/```` ``` ````) del texto devuelto antes de `JSON.parse`
    - _Requirements: 3.1_
  - [ ] 4.2 Validar cada pregunta con `isValidQuestion`; descartar las inválidas registrando el motivo, sin abortar. Deduplicar por `id`
    - _Requirements: 3.2, 3.3, 3.4, 3.5_

- [ ] 5. Lógica de fallback y escritura (la parte crítica)
  - [ ] 5.1 Si las preguntas válidas `>= MIN_QUESTIONS` (default 8): escribir `questions.json` con las frescas y loguear `GENERATED (n)`. Si no: usar el fallback
    - _Requirements: 4.3, 4.5_
  - [ ] 5.2 Envolver TODA la generación en try/catch global: ante cualquier error (red, credenciales, throttling, timeout) escribir `questions.json` desde `questions.fallback.json` y loguear `FALLBACK (motivo)`
    - _Requirements: 4.2, 4.5_
  - [ ] 5.3 Garantizar `exit 0` SIEMPRE (aun en fallback) — un fallo de Bedrock NUNCA rompe el build. Tras escribir, releer y validar que `questions.json` es un array válido de ClientQuestion
    - _Requirements: 4.4_

- [ ] 6. Integración con el build
  - [ ] 6.1 Agregar scripts a `package.json`: `"generate:questions": "tsx scripts/generate-questions.ts"` y `"prebuild": "npm run generate:questions"`. Verificar que `index.ts` sigue consumiendo `questions.json` sin cambios
    - _Requirements: 1.1, 1.2, 5.1, 5.2_

- [ ] 7. Verificación
  - [ ] 7.1 Correr `npm run generate:questions` con credenciales válidas (perfil default) → confirmar 15-20 preguntas frescas, balanceadas, válidas, en questions.json
    - _Requirements: 1.1, 2.1, 2.2_
  - [ ] 7.2 Probar el fallback a propósito: correr el script con `AWS_REGION=us-west-2` (sin modelo) o sin credenciales → confirmar que cae al fallback, escribe questions.json válido y sale 0 (no rompe)
    - _Requirements: 4.2, 4.4, 4.5_
  - [ ] 7.3 Revisar manualmente una muestra de las preguntas generadas: ¿el `correct_answer` apunta de verdad a la opción correcta? La validación verifica forma, no corrección semántica
    - _Requirements: 3.2_
