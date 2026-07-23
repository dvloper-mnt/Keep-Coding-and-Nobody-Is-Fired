# Tasks — Cooperative Prompt Integrity (información partida obligatoria)

Implementación en orden de dependencias (de adentro hacia afuera). TDD estricto donde hay lógica pura: test primero, después implementación.

## 1. Lógica pura — `cooperative-integrity.ts`

- [ ] 1.1 Test primero: `cooperative-integrity.test.ts` con tabla exhaustiva para `hasCooperativeIntegrity(challenge)` / `checkCooperativeIntegrity(challenge)`:
  - `rule` contiene el texto de `options[correct_answer]` → SIN integridad. (R3.2)
  - `rule`/`knowledge` nombra el símbolo del lado corregido del diff `code`→`success_state.code_patch` (ej: patch cambia `index`→`login`, y una rule dice "login") → SIN integridad. (R3.3)
  - Teoría legítima que menciona el framework ("Laravel") o el código de error ("500", "405") pero NO el símbolo de la solución → CON integridad. (R3.5, R3.6)
  - `knowledge` de dominio (ruta del sistema, "el front manda POST a /logout") que no revela el diagnóstico → CON integridad. (R3.6)
  - Bordes de normalización: mayúsculas, acentos (NFD), espacios múltiples, misma palabra con otra capitalización → detectado. (R3.5)
  - Challenge con un step limpio y otro que filtra → challenge SIN integridad. (R3.4)
- [ ] 1.2 Implementar `hasCooperativeIntegrity` y `checkCooperativeIntegrity` en `src/features/game/cooperative-integrity.ts` (archivo nuevo, estilo espejo de `challenge-difficulty.ts`: funciones puras, sin estado, sin `Math.random`). Incluir la normalización (minúsculas, strip de acentos, colapso de espacios, tokenización) y el diff de tokens `code`→`code_patch`. (R3.1–R3.6)
- [ ] 1.3 Afinar el umbral/lista de tokens ignorables (nombres de framework, códigos HTTP, palabras vacías) usando los casos de "teoría legítima" del test como criterio de no-regresión de falsos positivos. (R3.5)

## 2. Prompt — reescribir la técnica en `SYSTEM_PROMPT`

- [ ] 2.1 Agregar al bloque FORBIDDEN del `SYSTEM_PROMPT` la regla anti-leak: nunca poner en `rules`/`knowledge` el nombre del método/identificador correcto, la ruta/verbo literal a corregir, ni frases que nombren el diagnóstico. El Helper solo tiene teoría. (R1.1)
- [ ] 2.2 Agregar el bloque "CÓMO PARTIR LA INFORMACIÓN" (reencuadre de la técnica): rules = teoría abstracta del lenguaje; knowledge = dominio no deducible del código; el diagnóstico emerge solo al cruzar síntoma del Coder + teoría del Helper. Ninguna mitad basta sola. (R1.2)
- [ ] 2.3 Corregir el ejemplo "PERFECTO" del prompt: reescribir sus `rules` a teoría pura (sin nombrar el símbolo concreto de la solución), sirviendo de modelo de la técnica correcta. Mantener el resto del few-shot del PR #42 intacto. (R1.4, R1.3)
- [ ] 2.4 Agregar el paso final de auto-verificación: simular la conversación, confirmar el ida-y-vuelta necesario, descartar y rehacer internamente si el Helper podría dictar la respuesta solo; devolver SOLO el JSON del challenge. (R2.1, R2.2, R2.3)

## 3. Integración — validar tras `isValidChallenge`

- [ ] 3.1 En `generateChallenge` (no-stream), tras el chequeo `isValidChallenge`, invocar `hasCooperativeIntegrity(parsed)`; si falla: `console.error('[bedrock] ... cooperative-integrity ...')`, `logBedrockResponse('cooperative-integrity-failed', rawText, { challengeId })`, `return null`. (R4.1, R4.2)
- [ ] 3.2 Mismo tratamiento en `generateChallengeStreaming` (stream), en el punto análogo tras `isValidChallenge`. (R4.1, R4.2)
- [ ] 3.3 Test (mockeado, sin Bedrock real): un challenge estructuralmente válido pero que filtra la respuesta → ambas funciones retornan `null`; la cadena de fallback y los `console.error('[bedrock] ...')` quedan intactos. (R4.2, R4.3, R6.2)

## 4. Curados — fallback confiable

- [ ] 4.1 Reescribir `helper_view` (rules/knowledge) de los steps de `src/data/challenges/login-chaos.json` que filtran, siguiendo la referencia del artifact de diseño (step 1: "un 500 en runtime suele ser un método invocado que no existe" en vez de "LoginController solo tiene métodos: login, logout"). NO tocar `code`, `error`, `options`, `correct_answer`, `success_state.code_patch`. (R5.1)
- [ ] 4.2 Auditar `laravel-routes.json` y `catalog-controller.json` con `hasCooperativeIntegrity`; reescribir el `helper_view` de los que fallen sin cambiar el bug ni la respuesta correcta. (R5.2)
- [ ] 4.3 Test `challenge-catalog.integrity.test.ts`: cargar TODOS los curados del catálogo (`src/data/challenges/index.ts`) y afirmar que cada uno pasa `isValidChallenge` Y `hasCooperativeIntegrity`. Guardrail de build contra futuros curados que filtren. (R5.3)

## 5. Verificación

- [ ] 5.1 `corepack pnpm@9.15.0 run test` verde (suite existente + `cooperative-integrity`, catálogo, generador con leak → null), `tsc --noEmit` 0 errores, `corepack pnpm@9.15.0 run lint` 0 warnings. (Usar corepack pnpm@9.15.0 en esta Mac, no el pnpm del PATH — ver gotcha de entorno.) (R6.1, R6.3)
- [ ] 5.2 Smoke test en local: generar varias rondas (con credenciales AWS) y confirmar por logs que (a) los challenges generados dejaron de filtrar la respuesta y (b) cuando alguno filtra, cae al curado (ya limpio) sin romper. Si no hay credenciales, verificar al menos que todos los curados pasan y que un challenge-leak de prueba cae a fallback. (R4, R5)
- [ ] 5.3 Validación de jugabilidad (manual, rápida): jugar un curado reescrito con dos pestañas (Coder/Helper) y confirmar el "test de la conversación" de Moisés — que la partida requiere ida-y-vuelta y el Helper no puede dictar la respuesta solo. (R1, R5)

## Notas

- `hasCooperativeIntegrity` es lógica pura: TDD estricto (test antes de implementación), como `roundToDifficulty`.
- El validador se COMPONE con `isValidChallenge`, no lo reescribe: orden estructura → integridad. No tocar el contrato `Challenge` ni la UI.
- El mayor riesgo son los FALSOS POSITIVOS (rechazar teoría legítima): los casos de "teoría legítima que NO debe rechazarse" del test 1.1 son el criterio para afinar el umbral (tarea 1.3). Preferir dejar pasar un leak sutil (lo caza el prompt) antes que rechazar teoría buena y disparar el fallback en la demo.
- Los curados se arreglan reescribiendo SOLO el lado del Helper: el bug, las opciones y el patch no cambian.
- El prompt es la primera línea (baja frecuencia de leaks); el validador es el piso duro (rechazo determinista). Los dos juntos, no uno u otro.
- Client-questions queda fuera de alcance (ver Out of scope); auditar su prompt con la misma técnica es trabajo futuro.
