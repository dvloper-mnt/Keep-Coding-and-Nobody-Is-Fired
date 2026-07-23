# Requirements — Encuentros con el jefe (boss-encounters)

## Introduction

El modo infinito (spec hermana **endless-mode**) ya da un loop de rondas que nunca termina hasta que el reloj llega a cero. Pero todas las rondas pesan igual: ronda 7 se siente como ronda 8. Esta spec mete **variación y picos de tensión** en ese loop, agrupando dos mecánicas que son la misma idea — **el "jefe" interviene en el juego** — bajo un solo concepto.

**Cambio de enfoque respecto a la versión anterior de esta spec (importante):** la primera versión (24-jun) definía la ronda de jefe como *"un challenge más difícil y más largo, pedido a Bedrock a nivel `'expert'`"*. Esa premisa quedó **obsoleta** al mergearse **adaptive-difficulty** (PR #55): esa spec ya vuelve `'expert'` **toda** ronda a partir de la 13. Un "boss experto cada 10 rondas" ya no es un pico — desde la ronda 13 el jefe se sentiría igual que una ronda normal. Como observó el PO: *"los niveles de experto empiezan desde 13, ya el jefe no tendría mucho valor porque todos los niveles a partir del 13 son de nivel experto"*.

**Por eso el jefe deja de ser DIFICULTAD y pasa a ser FORMATO.** El jefe no es "más experto": es una **mecánica distinta** que cambia las reglas del challenge, igual que los módulos "Exigentes" de *Keep Talking and Nobody Explodes* no son "cables más difíciles" sino un tipo de módulo con reglas propias. Concretamente: el jefe es un challenge **multi-etapa con memoria** — más de 3 pasos, donde cada paso exige **recordar decisiones de pasos anteriores**. Eso escala lo único que importa en este juego: la **conversación** entre Coder y Helper (tienen que llevar registro juntos), no un número de dificultad.

**Dos caras del mismo jefe:**

1. **Jefe final cada 10 rondas (boss round):** cada ronda múltiplo de 10 (ronda 10, 20, 30…) es un **encuentro con el jefe**: un challenge de **formato distinto** — multi-etapa con memoria (más de 3 pasos, con dependencia explícita entre pasos: la respuesta correcta de un paso depende de lo decidido en uno anterior). NO es "más experto"; es "otra mecánica". Recompensa **mayor**: más segundos de bono y más puntos. La UI cambia: el jugador SABE que está peleando contra el jefe, no resolviendo un ticket más.

2. **Eventos sorpresa del jefe (boss event):** aleatoriamente, una **ronda normal** (no-boss) puede convertirse en un **evento sorpresa** que tuerce las reglas de esa ronda: p. ej. **"auditoría sorpresa"** (el bono de tiempo al completar viene a la MITAD) o **"el jefe está mirando"** (la penalización por error se duplica). Variedad y caos controlado, anunciado al empezar la ronda con un aviso visible.

**Por qué juntas:** ambas son intervenciones del jefe sobre el loop de **endless-mode** — una determinista y periódica (cada 10), la otra aleatoria y puntual. Comparten el modelo de "esta ronda es especial", la UI de aviso, y la presión visual del jefe que YA existe. Separarlas duplicaría conceptos.

**Decisión central — lógica pura sobre el número de ronda:** `isBossRound(round)` (`round % 10 === 0`) y la selección/efecto del evento sorpresa son **funciones puras y deterministas dado su input** (la aleatoriedad se inyecta, no se lee adentro), testeables sin tocar Bedrock ni Valkey. La parte de I/O (pedirle a Bedrock un challenge de jefe con el formato multi-etapa, persistir el modificador de ronda) vive en el servicio, como ya está la arquitectura.

**Relato de hackathon:** el modo infinito ya no es un goteo plano de tickets. Cada diez rondas hay un **jefe** que cambia la mecánica — un incidente encadenado donde Coder y Helper tienen que recordar juntos lo que ya decidieron —, y en el medio el jefe puede aparecer de sorpresa a apretar las tuercas. El jurado ve un loop con ritmo — calma, tensión, pico — y una mecánica cooperativa que se **profundiza** en el jefe, no un simple "sube el número".

### Contexto verificado

- **Depende de endless-mode**, que aporta el concepto de **ronda** (`round`, 1-based, persistido en sesión) y el **reloj acumulativo** (`remainingTime` que sube `ENDLESS_REWARD_SECONDS` al completar y baja la penalización al errar). Esta spec NO define cómo se cuenta ni se persiste la ronda: la consume.
- **El contrato del `Challenge` YA soporta más de 3 pasos.** Verificado: `challenge-schema.ts` (línea ~82) exige `steps.length >= 1`, NO exactamente 3. `game-engine.ts` calcula el fin del challenge con `session.currentStep >= challenge.<numSteps>` de forma **dinámica**, no hardcodea 3. El único lugar que fija "EXACTAMENTE 3 steps" es el `SYSTEM_PROMPT` de Bedrock (una instrucción, no una restricción de datos). El jefe multi-etapa NO requiere cambiar el contrato ni el engine: requiere pedirle a Bedrock un challenge con más pasos y con dependencia entre ellos.
- **Se relaciona con adaptive-difficulty, pero NO la usa para el jefe.** La ronda de jefe ya NO fuerza `'expert'`: usa la dificultad natural de su ronda (`roundToDifficulty(round)`) y cambia el **formato**, no el nivel. adaptive-difficulty sigue rigiendo la dificultad de todas las rondas (incluida la de jefe) por su rango.
- **Se relaciona con cooperative-prompt-integrity** (spec hermana): el challenge de jefe, al pedirse a Bedrock, debe pasar el MISMO validador de integridad cooperativa (no filtrar la respuesta al Helper). La mecánica de memoria del jefe REFUERZA la conversación, no la evita.
- El "jefe" YA existe como **mecánica de presión visual**: `src/components/organisms/BossOverlay.tsx` (toasts que se asoman en las columnas laterales), `src/lib/boss-position.ts` (`createBossToast`, `generateBossPlacement`, `pickBossMessage`) y `BOSS_PRESSURE_CONFIG` / `BOSS_MESSAGES` en `src/lib/constants.ts` (`spawnIntervalMs: 15_000`, `maxVisibleMessages: 7`). Los encuentros pueden **intensificar** esa presión (más frecuente, más visible) reusando lo que ya está.
- La generación de challenges por ronda usa Bedrock (`runtime-generator.ts`: `generateChallenge` / `generateChallengeStreaming`) con fallback al curado (`pickRandomChallenge`). El challenge de jefe se pide por el mismo flujo; el fallback de jefe debe ser un curado multi-etapa (ver R5.5).
- El bono al completar (`ENDLESS_REWARD_SECONDS`) y la penalización se aplican con `applyTimeDelta` (game-engine.ts), que ya hace clamp a 0 → `defeat`.
- `submitAnswer` (game-engine.ts) es puro y síncrono; la transición de ronda (I/O Bedrock) vive en `game-service.ts` (`processAnswer`), igual que en endless-mode.

## Glossary

- **Ronda de jefe (boss round):** una ronda cuyo número es múltiplo de 10 (10, 20, 30…). El challenge es de **formato distinto** (multi-etapa con memoria) y la recompensa es mayor. Determinista: depende solo del número de ronda.
- **Formato multi-etapa con memoria:** un challenge con **más de 3 pasos** en el que al menos un paso tiene su respuesta correcta **condicionada por una decisión de un paso anterior** — Coder y Helper deben recordar juntos qué se resolvió antes para acertar. Es la mecánica que reemplaza "más experto".
- **Evento sorpresa (boss event):** un modificador aplicado a una ronda **normal** (no-boss) que cambia sus reglas por esa ronda. Aleatorio al cargar la ronda. Ejemplos: `audit` (bono de tiempo a la mitad), `watching` (penalización duplicada).
- **Modificador de ronda (round modifier):** el efecto activo de una ronda: o bien `boss` (ronda de jefe), o bien uno de los eventos sorpresa, o bien `none` (ronda normal sin modificador). Una ronda tiene a lo sumo un modificador.
- **`isBossRound(round)`:** función pura que devuelve `true` si la ronda es de jefe (`round % 10 === 0`, con `round >= 1`).
- **Presión visual del jefe:** los toasts de `BossOverlay` ya existentes. Esta spec puede intensificarlos durante un encuentro, no los inventa.

---

## Requirement 1 — Ronda de jefe cada 10 rondas, con formato distinto (lógica pura)

**User Story:** Como jugador, quiero que cada diez rondas me enfrente a un jefe con una mecánica DISTINTA (no solo más difícil), para que el loop tenga picos que se sientan diferentes, no un número más alto.

### Acceptance Criteria

1. THE SYSTEM SHALL exponer una función pura `isBossRound(round: number): boolean` sin estado ni efectos secundarios.
2. WHEN la ronda es un múltiplo de 10 mayor o igual a 10 (10, 20, 30…) THE SYSTEM SHALL devolver `true`.
3. WHEN la ronda NO es múltiplo de 10, o es menor que 1, o no es un entero válido THE SYSTEM SHALL devolver `false`.
4. WHEN una ronda es de jefe THE SYSTEM SHALL pedir a Bedrock un challenge de **formato multi-etapa con memoria** (más de 3 pasos, con al menos un paso cuya respuesta correcta dependa de una decisión de un paso anterior), en lugar del formato estándar de 3 pasos. La dificultad de la ronda de jefe sigue siendo la natural de su ronda (`roundToDifficulty(round)`); el jefe cambia el FORMATO, NO el nivel.
5. THE SYSTEM SHALL marcar la ronda de jefe en el estado de sesión, de modo que Coder, Helper y UI sepan que es un encuentro con el jefe.
6. THE SYSTEM SHALL mantener el challenge de jefe dentro del contrato `Challenge` existente (más pasos en `steps[]`, sin cambiar la forma de `ChallengeStep`), aprovechando que el validador ya acepta `steps.length >= 1` y el engine calcula el fin de forma dinámica.

## Requirement 2 — El formato del jefe fuerza memoria entre pasos (prompt + validación)

**User Story:** Como jugador, quiero que el jefe me obligue a recordar lo que decidí antes junto a mi compañero, para que la pelea contra el jefe sea una conversación más profunda, no solo más pasos.

### Acceptance Criteria

1. THE SYSTEM SHALL instruir a Bedrock, cuando la ronda es de jefe, a generar un challenge con **más de 3 pasos** (rango objetivo 4–6) que forme un incidente encadenado coherente.
2. THE SYSTEM SHALL instruir a Bedrock a que al menos un paso del jefe tenga su respuesta correcta **condicionada por una decisión tomada en un paso anterior** (dependencia de memoria), de modo que el par no pueda resolverlo sin recordar el paso previo.
3. THE SYSTEM SHALL exigir que el challenge de jefe, como cualquier otro, respete la **integridad cooperativa** (spec cooperative-prompt-integrity): las `rules`/`knowledge` del Helper NO filtran la respuesta; la dependencia de memoria se resuelve conversando, no leyendo la respuesta en las pistas.
4. THE SYSTEM SHALL validar que un challenge de jefe generado tenga efectivamente más de 3 pasos; si no los tiene (o falla la validación estándar/de integridad), THE SYSTEM SHALL caer al fallback curado de jefe (R5.5), igual que cualquier otra falla de generación.
5. THE SYSTEM SHALL mantener explícito que la mecánica de memoria NO significa un contrato nuevo: la "dependencia entre pasos" se expresa en el CONTENIDO generado (el enunciado y las opciones de un paso aluden a lo decidido antes), no en un campo nuevo del `Challenge`.

## Requirement 3 — Recompensa aumentada de la ronda de jefe

**User Story:** Como jugador, quiero que vencer al jefe valga más que una ronda normal, para que el riesgo y el esfuerzo extra tengan sentido.

### Acceptance Criteria

1. WHEN el Coder completa una ronda de jefe THE SYSTEM SHALL sumar al reloj un bono de tiempo mayor que el bono normal (`BOSS_REWARD_SECONDS`, default 60, vs el `ENDLESS_REWARD_SECONDS` normal), aplicado con `applyTimeDelta`.
2. WHEN el Coder completa una ronda de jefe THE SYSTEM SHALL otorgar un bono de puntaje mayor que el de una ronda normal, expuesto al cálculo de puntaje del modo infinito (spec endless-mode / leaderboard).
3. THE SYSTEM SHALL calcular tanto el bono de tiempo como el bono de puntaje de la ronda de jefe con **funciones puras y unit-testeadas** (entrada: el modificador de ronda; salida: el bono).
4. THE SYSTEM SHALL mantener el comportamiento normal de recompensa para las rondas que NO son de jefe (sin cambios respecto a endless-mode).

## Requirement 4 — Eventos sorpresa del jefe (selección y efecto, lógica pura)

**User Story:** Como jugador, quiero que de vez en cuando una ronda normal se vuelva impredecible por una intervención del jefe, para que el caos controlado mantenga la tensión.

### Acceptance Criteria

1. THE SYSTEM SHALL definir un catálogo de eventos sorpresa como datos (al menos `audit` — "auditoría sorpresa" — y `watching` — "el jefe está mirando"), cada uno con su identificador, su mensaje de aviso en español y su efecto.
2. THE SYSTEM SHALL exponer una función pura `pickBossEvent(round, roll)` que, dado el número de ronda y un valor aleatorio inyectado (`roll`, p. ej. en `[0, 1)`), devuelva el evento elegido o `none`, **sin leer `Math.random` adentro** (la aleatoriedad se inyecta para ser testeable).
3. WHEN la ronda es de jefe (R1) THE SYSTEM SHALL NO aplicar ningún evento sorpresa (la ronda de jefe y el evento sorpresa son mutuamente excluyentes; el jefe ya es el modificador).
4. WHEN el `roll` cae por debajo de la probabilidad configurada (`BOSS_EVENT_CHANCE`, default 0.2) en una ronda normal THE SYSTEM SHALL seleccionar un evento del catálogo; en caso contrario THE SYSTEM SHALL devolver `none`.
5. THE SYSTEM SHALL exponer el efecto de cada evento como **función pura** sobre el cálculo de la ronda: `audit` reduce el bono de tiempo al completar a la mitad; `watching` duplica la penalización por error. Las funciones de efecto NO mutan estado: reciben el valor base y devuelven el valor modificado.
6. THE SYSTEM SHALL persistir el evento activo de la ronda en el estado de sesión, para que su efecto aplique de forma consistente durante toda la ronda (no se re-sortea por respuesta).

## Requirement 5 — Aviso del modificador y fallback de jefe

**User Story:** Como jugador, quiero ver claramente cuándo una ronda es especial y qué cambia; y como presentador, quiero que el jefe nunca rompa la demo aunque Bedrock falle.

### Acceptance Criteria

1. WHEN empieza una ronda de jefe THE SYSTEM SHALL mostrar un aviso visible ("Jefe final" / encuentro con el jefe) distinto del de una ronda normal, antes o al comienzo de la ronda.
2. WHEN empieza una ronda con evento sorpresa THE SYSTEM SHALL mostrar el mensaje de aviso del evento (p. ej. "Auditoría sorpresa: el bono de tiempo viene reducido", "El jefe está mirando: los errores cuestan el doble") en español neutro.
3. THE SYSTEM SHALL exponer el modificador de la ronda (`boss` / evento / `none`) tanto al Coder como al Helper, para que ambos vean el mismo contexto.
4. WHEN una ronda es de jefe o tiene evento sorpresa THE SYSTEM SHALL intensificar la presión visual del jefe ya existente (`BossOverlay` / `BOSS_PRESSURE_CONFIG`) durante esa ronda, reutilizando los toasts actuales en lugar de inventar una mecánica nueva.
5. THE SYSTEM SHALL proveer al menos un **challenge de jefe curado** (multi-etapa con memoria, >3 pasos, que pase integridad cooperativa) como fallback, de modo que si Bedrock falla o devuelve un challenge que no cumple el formato de jefe, la ronda de jefe siga siendo un encuentro multi-etapa y no una ronda normal de 3 pasos.

## Requirement 6 — Integración con el loop de endless-mode (sin romperlo)

**User Story:** Como mantenedor, quiero que los encuentros con el jefe se monten sobre el loop infinito sin romper ni el modo clásico ni el endless base.

### Acceptance Criteria

1. THE SYSTEM SHALL aplicar los encuentros con el jefe SOLO en modo `endless`; el modo `classic` (3 steps → `victory`) no cambia.
2. WHEN se carga una ronda nueva en `endless` THE SYSTEM SHALL determinar su modificador derivándolo del número de ronda (`isBossRound`) y, si no es de jefe, de `pickBossEvent(round, roll)`, y persistirlo en la sesión junto a la ronda.
3. WHEN se completa una ronda THE SYSTEM SHALL aplicar el bono de tiempo correcto según el modificador activo (bono de jefe, bono normal, o bono normal reducido por `audit`), reutilizando `applyTimeDelta`.
4. WHEN el Coder responde incorrectamente THE SYSTEM SHALL aplicar la penalización correcta según el modificador activo (penalización normal, o duplicada por `watching`), respetando el clamp a 0 → `defeat` que ya existe.
5. THE SYSTEM SHALL mantener verde la suite existente (endless-mode, game-engine, runtime-generator) y respetar el contrato del `Challenge` (la forma de `ChallengeStep` no cambia; solo varía la cantidad de pasos del jefe).

## Requirement 7 — Calidad y consistencia

**User Story:** Como mantenedor, quiero que el cambio respete las reglas del proyecto.

### Acceptance Criteria

1. THE SYSTEM SHALL mantener cero `any` y sin `as` casts (salvo `as const`/`satisfies`).
2. THE SYSTEM SHALL usar español neutro en la UI y en los mensajes de aviso (sin voseo).
3. THE SYSTEM SHALL cubrir con tests unitarios la lógica pura nueva: `isBossRound` (múltiplos de 10, no-múltiplos, bordes 0/1/9/10/11/20, no-enteros), `pickBossEvent` (excluido en ronda de jefe, umbral de probabilidad con `roll` inyectado, selección del catálogo), y las funciones de efecto/recompensa (bono de jefe, bono reducido por `audit`, penalización duplicada por `watching`), sin llamar a Bedrock real.
4. THE SYSTEM SHALL mantener `game-engine.ts` puro: la generación del challenge de jefe (I/O Bedrock) y la persistencia del modificador viven en el servicio, no en el engine.
5. THE SYSTEM SHALL mantener verdes lint, tsc y la suite de tests existente.

## Out of scope

- Cómo se cuenta, incrementa o persiste la **ronda** del modo infinito (lo aporta endless-mode).
- El **escalado por niveles** ronda → dificultad y el nivel `'expert'` en sí (lo aporta adaptive-difficulty). Esta spec NO usa `'expert'` para el jefe: el jefe cambia formato, no nivel.
- La **técnica del prompt cooperativo** y el validador de integridad (spec cooperative-prompt-integrity); esta spec solo EXIGE que el challenge de jefe también lo cumpla, no la reimplementa.
- El **cálculo base del puntaje** y la vista del **leaderboard** (specs hermanas); esta spec solo aporta el bono extra de puntaje de la ronda de jefe.
- Nuevos modelos de Bedrock o cambios al mecanismo de streaming (se reutiliza bedrock-streaming).
- Jefes con "vida"/multi-fase persistente ENTRE rondas, o jefes nombrados con narrativa propia (posible spec futura `boss-narrative`). La memoria de esta spec es DENTRO de un challenge de jefe (entre pasos), no entre rondas.
- Eventos sorpresa que toquen las client-questions (esta spec es solo sobre el challenge de la ronda y su reloj/penalización).
