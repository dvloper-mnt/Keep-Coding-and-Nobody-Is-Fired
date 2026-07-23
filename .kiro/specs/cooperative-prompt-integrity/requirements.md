# Requirements — Cooperative Prompt Integrity (información partida obligatoria)

## Introduction

El juego es cooperativo por diseño: el **Coder** ve el código con un bug y el error, pero no la teoría; el **Helper** ve `rules` (teoría del lenguaje) y `knowledge` (hechos del dominio), pero NO ve el código ni el error. La gracia — y lo que el jurado tiene que VER en la demo en vivo — es que **ninguno de los dos puede resolver solo**: tienen que hablar. Esa es la tesis, tomada de *Keep Talking and Nobody Explodes*: la información está **partida a la fuerza**.

Hoy el `SYSTEM_PROMPT` de Bedrock (`runtime-generator.ts`) **describe** esa separación pero no la **garantiza**. En la práctica, el modelo (y hasta los challenges curados de fallback) filtra la respuesta dentro de las `rules` del Helper. Ejemplo real, verificado en `src/data/challenges/login-chaos.json` (step 1):

- `rules[1]`: `"LoginController solo tiene métodos: login, logout"` → le dice al Coder cuál es el método correcto.
- `rules[2]`: `"La demo en vivo está probando POST /login"` → señala la ruta exacta del fallo.

Con esas dos líneas, el Helper **dicta** la solución y no hay deducción ni conversación: el Coder solo obedece. Esto es exactamente lo que reportó Moisés sobre la generación con Bedrock ("el coder resuelve solo o el helper no tiene pistas sino directamente la respuesta, ej: 'si aparece el error X la respuesta es Y', no se genera conversación").

Esta spec hace dos cosas, ambas del lado del contenido (NO cambia el contrato de datos ni la UI):

1. **Reescribe la técnica del prompt** para que Bedrock genere el challenge partiendo el secreto en dos mitades que se necesiten mutuamente ("genera un secreto y pártelo", en vez de "genera un bug y explica cómo se arregla"), con un paso de **auto-verificación** dentro del propio prompt.
2. **Agrega un validador determinista de integridad cooperativa** (`cooperative-integrity.ts`, análogo a la lógica pura ya existente `challenge-difficulty.ts` / `challenge-language.ts`) que detecta el patrón "la pista ES la respuesta" — la mitad del Helper que filtra el símbolo concreto del código — y hace que un challenge así **no valide**, cayendo al fallback. El mismo validador se usa para **arreglar los challenges curados** que hoy filtran la respuesta.

**Decisión de arquitectura clave:** la integridad cooperativa se verifica con **lógica pura y determinista** sobre el objeto `Challenge` ya parseado, como un chequeo adicional dentro (o inmediatamente después) de `isValidChallenge`. NO se le pide a Bedrock "que confíe": si el challenge generado filtra la respuesta, se rechaza igual que hoy se rechaza un JSON inválido, y se cae al **mismo fallback curado** (que a su vez debe pasar el nuevo validador).

**Relato de hackathon:** el jurado juega la demo y VE que los dos jugadores TIENEN que hablar — el Helper pregunta, el Coder describe, entre los dos deducen. No es un quiz con dos pantallas: es la mecánica de *Keep Talking* aplicada a debugging. Ese es el "wow" del core loop.

### Contexto verificado

- `src/features/game/runtime-generator.ts`: el `SYSTEM_PROMPT` (líneas ~70-135) ya tiene few-shot (PR #42) con un bloque "FORBIDDEN" que prohíbe reglas de conteo de texto, placeholders y repetir el código en las rules. NO tiene una regla explícita contra **filtrar el símbolo concreto de la solución** en las rules/knowledge (nombre del método, ruta literal, verbo correcto). El ejemplo "PERFECTO" del propio prompt (líneas ~89-115) YA filtra parcialmente: `knowledge` dice `"El frontend de la demo está enviando POST a /login en este momento"` — pista de dominio legítima — pero `rules` dice `"El método index no existe en LoginController"` como opción correcta, muy cerca de servir la respuesta.
- `src/data/challenges/login-chaos.json`: fallback curado que Moisés puso como referencia de calidad. Steps 1 y 3 filtran la respuesta en `rules` (ver Introduction). ESTE archivo hay que arreglarlo con la misma técnica.
- `src/data/challenges/laravel-routes.json`, `src/data/challenges/catalog-controller.json`: otros curados a auditar con el nuevo validador.
- `src/features/game/challenge-schema.ts`: ya existe `isValidChallenge` + `isMeaningfulStringArray` + `PLACEHOLDER_ENTRIES` (PR #49). El nuevo validador de integridad cooperativa vive en el MISMO estilo (lógica pura sobre el objeto parseado) y se compone con `isValidChallenge`, sin reescribirlo.
- `src/features/game/challenge-difficulty.ts`: patrón a calcar para la lógica pura nueva — `Record<Difficulty, string>`, funciones puras sin estado, sin `Math.random`. NOTA: cada entrada de `DIFFICULTY_INSTRUCTION` ya repite "las rules y knowledge deben seguir siendo completas y útiles (nunca vacías ni placeholders)": la integridad cooperativa es la extensión natural de esa regla (no solo "no vacías", sino "no filtran la respuesta").
- `src/features/game/game-types.ts`: define `Challenge`, `ChallengeStep`, `helper_view: { rules: string[]; knowledge: string[] }`, `coder_view: { code: string; error: string }`, `options: string[]`, `correct_answer: number`. El contrato NO cambia en esta spec.

## Glossary

- **Información partida**: propiedad de diseño por la cual la información necesaria para diagnosticar está repartida entre Coder (síntoma: código + error) y Helper (teoría + dominio), de modo que ninguna mitad basta sola.
- **Filtrado (leak)**: cuando una `rule` o un `knowledge` del Helper contiene el **símbolo concreto** de la solución (el nombre del método correcto, la ruta/verbo literal, el identificador exacto) de forma que el Helper puede dictar la respuesta sin que el Coder aporte el síntoma. Es lo que hay que detectar y prohibir.
- **Teoría (rules)**: enunciados sobre CÓMO funciona el lenguaje/framework en abstracto (p.ej. "un GET a una ruta registrada como POST devuelve 405"). No nombran el símbolo concreto del código de ESTE challenge.
- **Conocimiento (knowledge)**: hechos del dominio que el Coder NO puede deducir mirando su código (p.ej. "el front de la demo siempre manda POST a /logout"). Son el gancho para que el Helper tenga algo que preguntar/confrontar; legítimos aunque mencionen rutas del dominio, siempre que no revelen el diagnóstico correcto por sí solos.
- **Test de la mitad sola**: criterio de diseño — si el Helper resuelve leyendo solo sus rules/knowledge (sin una pregunta al Coder), o el Coder acierta sin escuchar al Helper, el challenge está mal.
- **`cooperative-integrity.ts`**: archivo nuevo con la lógica pura que verifica integridad cooperativa sobre un `Challenge` parseado.
- **Fallback**: el challenge curado (`pickRandomChallenge`), igual que hoy — que a su vez debe pasar el nuevo validador.

---

## Requirement 1 — Regla explícita de "no filtrar la respuesta" en el prompt

**User Story:** Como equipo, quiero que el `SYSTEM_PROMPT` obligue a partir la información entre Coder y Helper, para que Bedrock deje de servir la respuesta en las rules y se genere conversación.

### Acceptance Criteria

1. THE SYSTEM SHALL agregar al `SYSTEM_PROMPT` una regla explícita, en el bloque de reglas prohibidas, que prohíba que `rules` o `knowledge` contengan el **símbolo concreto de la solución** (el nombre del método/identificador correcto, la ruta o verbo HTTP literal que hay que corregir, o cualquier texto que permita al Helper nombrar el diagnóstico sin el síntoma del Coder).
2. THE SYSTEM SHALL reformular la técnica del prompt de "genera un bug y explica cómo se arregla" a "**genera un secreto y pártelo en dos mitades que se necesiten mutuamente**": las `rules` son teoría abstracta del lenguaje, el `knowledge` son hechos de dominio no deducibles del código, y el diagnóstico correcto SOLO emerge al cruzar el síntoma del Coder con la teoría del Helper.
3. THE SYSTEM SHALL mantener las restricciones ya existentes del prompt (nada de reglas de conteo de texto, nada de placeholders/N/A, no repetir el código en rules), sin degradar el few-shot del PR #42.
4. THE SYSTEM SHALL actualizar el ejemplo "PERFECTO" del prompt para que sus `rules` sean teoría pura (sin nombrar el símbolo concreto de la solución), sirviendo de modelo de la técnica correcta, no del defecto.

## Requirement 2 — Auto-verificación dentro del prompt

**User Story:** Como equipo, quiero que el modelo se autocontrole antes de emitir, para bajar la tasa de challenges que filtran la respuesta sin depender solo del validador.

### Acceptance Criteria

1. THE SYSTEM SHALL instruir al modelo, como paso final del `SYSTEM_PROMPT`, a **simular mentalmente la conversación** entre Coder y Helper y confirmar que hubo al menos un ida-y-vuelta necesario (el Helper pregunta por el síntoma, el Coder lo describe, el diagnóstico emerge del cruce).
2. THE SYSTEM SHALL instruir al modelo a **descartar y regenerar** internamente si, con solo las rules/knowledge, el Helper podría dictar la respuesta sin la descripción del Coder (equivalente al "test de la mitad sola").
3. THE SYSTEM SHALL mantener el formato de salida como un ÚNICO objeto JSON válido del `Challenge` (sin texto extra, sin exponer el razonamiento de auto-verificación en la salida).

## Requirement 3 — Validador determinista de integridad cooperativa (lógica pura)

**User Story:** Como mantenedor, quiero una función pura que detecte cuándo un challenge filtra la respuesta en el lado del Helper, para rechazarlo sin depender de que el modelo obedezca el prompt.

### Acceptance Criteria

1. THE SYSTEM SHALL exponer una función pura `hasCooperativeIntegrity(challenge: Challenge): boolean` (o `checkCooperativeIntegrity` que devuelva el motivo del fallo) en `src/features/game/cooperative-integrity.ts`, sin estado ni efectos secundarios, análoga en estilo a `challenge-difficulty.ts`.
2. WHEN una `rule` o `knowledge` de un step contiene, de forma literal o casi-literal, el **texto de la opción correcta** de ese step (`options[correct_answer]`) THE SYSTEM SHALL considerar el step SIN integridad (la pista es la respuesta).
3. WHEN una `rule` o `knowledge` nombra el **símbolo corregido** que distingue el `code` del `success_state.code_patch` de ese step (p.ej. el identificador o verbo que cambia entre el código roto y el arreglado) THE SYSTEM SHALL considerar el step SIN integridad. La detección debe basarse en el diff concreto código→patch, no en heurísticas frágiles de lenguaje natural.
4. THE SYSTEM SHALL considerar el challenge completo CON integridad solo si TODOS sus steps la tienen; en caso contrario, SIN integridad.
5. THE SYSTEM SHALL definir la comparación de forma robusta a mayúsculas/acentos/espacios (normalización), evitando tanto falsos negativos obvios (mismo símbolo con otra capitalización) como una agresividad que rechace teoría legítima que solo mencione el nombre del framework o del error.
6. THE SYSTEM SHALL tratar el `knowledge` de dominio (rutas/hechos del sistema) como legítimo mientras no revele por sí solo el diagnóstico correcto: la regla apunta al **símbolo de la solución**, no a cualquier mención de una ruta.

## Requirement 4 — Integrar el validador en la generación (rechazo + fallback)

**User Story:** Como presentador en la hackathon, quiero que un challenge que filtra la respuesta nunca llegue a los jugadores, cayendo al curado, para que la demo siempre muestre conversación real.

### Acceptance Criteria

1. THE SYSTEM SHALL invocar el validador de integridad cooperativa en `generateChallenge` y `generateChallengeStreaming` **después** de que `isValidChallenge` pase, antes de devolver el challenge generado.
2. WHEN el challenge generado NO tiene integridad cooperativa THE SYSTEM SHALL tratarlo como generación fallida: registrar el motivo con `console.error('[bedrock] ...')` (consistente con el logging actual, p.ej. `cooperative-integrity-failed`), volcar la respuesta con `logBedrockResponse`, y devolver `null` para caer al fallback curado.
3. THE SYSTEM SHALL preservar toda la cadena de fallback y logging existente sin regresión: un fallo de integridad se comporta como cualquier otro fallo de validación.

## Requirement 5 — Arreglar los challenges curados (fallback confiable)

**User Story:** Como equipo, quiero que los challenges curados de fallback pasen el mismo validador, porque si el fallback filtra la respuesta la demo se rompe igual aunque Bedrock esté bien.

### Acceptance Criteria

1. THE SYSTEM SHALL reescribir `src/data/challenges/login-chaos.json` para que las `rules` de cada step sean teoría abstracta (sin nombrar el método/ruta/verbo correcto) y el `knowledge` sea dominio no revelador, de modo que pase `hasCooperativeIntegrity`. El ejemplo del artifact de diseño (step 1: "un 500 en runtime suele ser un método invocado que no existe" en vez de "LoginController solo tiene métodos: login, logout") es la referencia.
2. THE SYSTEM SHALL auditar `laravel-routes.json` y `catalog-controller.json` con el validador y reescribir los que fallen, sin cambiar la naturaleza del bug ni el `correct_answer` (solo se reescribe el lado del Helper para no filtrar).
3. THE SYSTEM SHALL agregar un test que cargue TODOS los challenges curados del catálogo y afirme que cada uno pasa `isValidChallenge` Y `hasCooperativeIntegrity`, de modo que un futuro curado que filtre la respuesta rompa el build.

## Requirement 6 — Calidad y consistencia

**User Story:** Como mantenedor, quiero que el cambio respete las reglas del proyecto.

### Acceptance Criteria

1. THE SYSTEM SHALL mantener cero `any` y sin `as` casts (salvo `as const`/`satisfies`).
2. THE SYSTEM SHALL cubrir con tests unitarios la lógica nueva pura (`hasCooperativeIntegrity`): casos que filtran la opción correcta, que nombran el símbolo del diff, teoría legítima que NO debe rechazarse, y bordes de normalización (acentos, mayúsculas, espacios).
3. THE SYSTEM SHALL mantener verdes lint, tsc y la suite de tests existente, sin cambiar el contrato del `Challenge` ni la UI.

## Out of scope

- Cambiar el contrato de datos `Challenge` / `ChallengeStep` o la UI de Coder/Helper (esta spec es solo contenido: prompt + validador + curados).
- El escalado de dificultad por ronda (spec **adaptive-difficulty**, ya mergeada) — la integridad cooperativa aplica a todos los niveles, pero no redefine la dificultad.
- Un LLM-juez externo que puntúe la "calidad conversacional" (posible mejora futura; esta spec usa un validador determinista barato, no otra llamada a Bedrock).
- El diseño del boss (spec **boss-encounters**), el leaderboard y game-results.
- Las client-questions (`questions.json` / fallback) — esta spec es solo para el challenge de la ronda; auditar client-questions con la misma técnica es trabajo futuro.
