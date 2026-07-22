# Requirements — Encuentros con el jefe (boss-encounters)

## Introduction

El modo infinito (spec hermana **endless-mode**) ya da un loop de rondas que nunca termina hasta que el reloj llega a cero. Pero todas las rondas pesan igual: ronda 7 se siente como ronda 8. Esta spec mete **variación y picos de tensión** en ese loop, agrupando dos mecánicas que son la misma idea — **el "jefe" interviene en el juego** — bajo un solo concepto.

**Dos caras del mismo jefe:**

1. **Jefe final cada 10 rondas (boss round):** cada ronda múltiplo de 10 (ronda 10, 20, 30…) no es un incidente cualquiera: es un **encuentro con el jefe**. Un challenge especial, **más difícil y más largo**, pedido a Bedrock con dificultad alta (engancha con **adaptive-difficulty**: el nivel `'expert'`), bugs más sutiles y encadenados. Recompensa **mayor**: más segundos de bono y más puntos. La UI cambia: el jugador SABE que está peleando contra el jefe, no resolviendo un ticket más.

2. **Eventos sorpresa del jefe (boss event):** aleatoriamente, una **ronda normal** (no-boss) puede convertirse en un **evento sorpresa** que tuerce las reglas de esa ronda: p. ej. **"auditoría sorpresa"** (el bono de tiempo al completar viene a la MITAD) o **"el jefe está mirando"** (la penalización por error se duplica). Variedad y caos controlado, anunciado al empezar la ronda con un aviso visible.

**Por qué juntas:** ambas son intervenciones del jefe sobre el loop de **endless-mode** — una determinista y periódica (cada 10), la otra aleatoria y puntual. Comparten el modelo de "esta ronda es especial", la UI de aviso, y la presión visual del jefe que YA existe. Separarlas duplicaría conceptos.

**Decisión central — lógica pura sobre el número de ronda:** `isBossRound(round)` (`round % 10 === 0`) y la selección/efecto del evento sorpresa son **funciones puras y deterministas dado su input** (la aleatoriedad se inyecta, no se lee adentro), testeables sin tocar Bedrock ni Valkey. La parte de I/O (pedirle a Bedrock un challenge de jefe, persistir el modificador de ronda) vive en el servicio, como ya está la arquitectura.

**Relato de hackathon:** el modo infinito ya no es un goteo plano de tickets. Cada diez rondas hay un **jefe final** con su propio dramatismo, y en el medio el jefe puede aparecer de sorpresa a apretar las tuercas. El jurado ve un loop con ritmo — calma, tensión, pico — y MÁS uso de Bedrock (el challenge de jefe se pide a nivel experto).

### Contexto verificado

- **Depende de endless-mode**, que aporta el concepto de **ronda** (`round`, 1-based, persistido en sesión) y el **reloj acumulativo** (`remainingTime` que sube `ENDLESS_REWARD_SECONDS` al completar y baja `PENALTY_SECONDS` al errar). Esta spec NO define cómo se cuenta ni se persiste la ronda: la consume.
- **Engancha con adaptive-difficulty**, que aporta `roundToDifficulty(round)` y el nivel `'expert'`. El challenge de jefe se pide a dificultad alta (`'expert'`), reutilizando `difficultyInstruction` y la inyección de prompt ya diseñada ahí.
- El "jefe" YA existe como **mecánica de presión visual**: `src/components/organisms/BossOverlay.tsx` (toasts que se asoman en las columnas laterales), `src/lib/boss-position.ts` (`createBossToast`, `generateBossPlacement`, `pickBossMessage`) y `BOSS_PRESSURE_CONFIG` / `BOSS_MESSAGES` en `src/lib/constants.ts` (`spawnIntervalMs: 15_000`, `maxVisibleMessages: 7`). Los encuentros pueden **intensificar** esa presión (más frecuente, más visible) reusando lo que ya está.
- La generación de challenges por ronda usa Bedrock (`runtime-generator.ts`: `generateChallenge` / `generateChallengeStreaming`) con fallback al curado (`pickRandomChallenge`). El challenge de jefe se pide por el mismo flujo, a nivel `'expert'`.
- El bono al completar (`ENDLESS_REWARD_SECONDS`) y la penalización (`PENALTY_SECONDS`) se aplican con `applyTimeDelta` (game-engine.ts), que ya hace clamp a 0 → `defeat`.
- `submitAnswer` (game-engine.ts) es puro y síncrono; la transición de ronda (I/O Bedrock) vive en `game-service.ts` (`processAnswer`), igual que en endless-mode.

## Glossary

- **Ronda de jefe (boss round):** una ronda cuyo número es múltiplo de 10 (10, 20, 30…). El challenge es especial (más difícil/largo) y la recompensa es mayor. Determinista: depende solo del número de ronda.
- **Evento sorpresa (boss event):** un modificador aplicado a una ronda **normal** (no-boss) que cambia sus reglas por esa ronda. Aleatorio al cargar la ronda. Ejemplos: `audit` (bono de tiempo a la mitad), `watching` (penalización duplicada).
- **Modificador de ronda (round modifier):** el efecto activo de una ronda: o bien `boss` (ronda de jefe), o bien uno de los eventos sorpresa, o bien `none` (ronda normal sin modificador). Una ronda tiene a lo sumo un modificador.
- **`isBossRound(round)`:** función pura que devuelve `true` si la ronda es de jefe (`round % 10 === 0`, con `round >= 1`).
- **Presión visual del jefe:** los toasts de `BossOverlay` ya existentes. Esta spec puede intensificarlos durante un encuentro, no los inventa.

---

## Requirement 1 — Ronda de jefe cada 10 rondas (lógica pura)

**User Story:** Como jugador, quiero que cada diez rondas me enfrente a un jefe distinto y más duro, para que el loop tenga picos y no se sienta plano.

### Acceptance Criteria

1. THE SYSTEM SHALL exponer una función pura `isBossRound(round: number): boolean` sin estado ni efectos secundarios.
2. WHEN la ronda es un múltiplo de 10 mayor o igual a 10 (10, 20, 30…) THE SYSTEM SHALL devolver `true`.
3. WHEN la ronda NO es múltiplo de 10, o es menor que 1, o no es un entero válido THE SYSTEM SHALL devolver `false`.
4. WHEN una ronda es de jefe THE SYSTEM SHALL pedir el challenge a dificultad alta (`'expert'`, vía adaptive-difficulty), independientemente de lo que `roundToDifficulty` devolvería para esa ronda por su rango.
5. THE SYSTEM SHALL marcar la ronda de jefe en el estado de sesión, de modo que Coder, Helper y UI sepan que es un encuentro con el jefe.

## Requirement 2 — Recompensa aumentada de la ronda de jefe

**User Story:** Como jugador, quiero que vencer al jefe valga más que una ronda normal, para que el riesgo y el esfuerzo extra tengan sentido.

### Acceptance Criteria

1. WHEN el Coder completa una ronda de jefe THE SYSTEM SHALL sumar al reloj un bono de tiempo mayor que el bono normal (`BOSS_REWARD_SECONDS`, default 60, vs el `ENDLESS_REWARD_SECONDS` normal de 30), aplicado con `applyTimeDelta`.
2. WHEN el Coder completa una ronda de jefe THE SYSTEM SHALL otorgar un bono de puntaje mayor que el de una ronda normal, expuesto al cálculo de puntaje del modo infinito (spec endless-mode / leaderboard).
3. THE SYSTEM SHALL calcular tanto el bono de tiempo como el bono de puntaje de la ronda de jefe con **funciones puras y unit-testeadas** (entrada: si es ronda de jefe; salida: el bono).
4. THE SYSTEM SHALL mantener el comportamiento normal de recompensa para las rondas que NO son de jefe (sin cambios respecto a endless-mode).

## Requirement 3 — Eventos sorpresa del jefe (selección y efecto, lógica pura)

**User Story:** Como jugador, quiero que de vez en cuando una ronda normal se vuelva impredecible por una intervención del jefe, para que el caos controlado mantenga la tensión.

### Acceptance Criteria

1. THE SYSTEM SHALL definir un catálogo de eventos sorpresa como datos (al menos `audit` — "auditoría sorpresa" — y `watching` — "el jefe está mirando"), cada uno con su identificador, su mensaje de aviso en español y su efecto.
2. THE SYSTEM SHALL exponer una función pura `pickBossEvent(round, roll)` que, dado el número de ronda y un valor aleatorio inyectado (`roll`, p. ej. en `[0, 1)`), devuelva el evento elegido o `none`, **sin leer `Math.random` adentro** (la aleatoriedad se inyecta para ser testeable).
3. WHEN la ronda es de jefe (R1) THE SYSTEM SHALL NO aplicar ningún evento sorpresa (la ronda de jefe y el evento sorpresa son mutuamente excluyentes; el jefe ya es el modificador).
4. WHEN el `roll` cae por debajo de la probabilidad configurada (`BOSS_EVENT_CHANCE`, default 0.2) en una ronda normal THE SYSTEM SHALL seleccionar un evento del catálogo; en caso contrario THE SYSTEM SHALL devolver `none`.
5. THE SYSTEM SHALL exponer el efecto de cada evento como **función pura** sobre el cálculo de la ronda: `audit` reduce el bono de tiempo al completar a la mitad; `watching` duplica la penalización por error. Las funciones de efecto NO mutan estado: reciben el valor base y devuelven el valor modificado.
6. THE SYSTEM SHALL persistir el evento activo de la ronda en el estado de sesión, para que su efecto aplique de forma consistente durante toda la ronda (no se re-sortea por respuesta).

## Requirement 4 — Aviso del modificador al empezar la ronda

**User Story:** Como jugador, quiero ver claramente cuándo una ronda es especial y qué cambia, para reaccionar y no perder tiempo confundido.

### Acceptance Criteria

1. WHEN empieza una ronda de jefe THE SYSTEM SHALL mostrar un aviso visible ("Jefe final" / encuentro con el jefe) distinto del de una ronda normal, antes o al comienzo de la ronda.
2. WHEN empieza una ronda con evento sorpresa THE SYSTEM SHALL mostrar el mensaje de aviso del evento (p. ej. "Auditoría sorpresa: el bono de tiempo viene reducido", "El jefe está mirando: los errores cuestan el doble") en español neutro.
3. THE SYSTEM SHALL exponer el modificador de la ronda (`boss` / evento / `none`) tanto al Coder como al Helper, para que ambos vean el mismo contexto.
4. WHEN una ronda es de jefe o tiene evento sorpresa THE SYSTEM SHALL intensificar la presión visual del jefe ya existente (`BossOverlay` / `BOSS_PRESSURE_CONFIG`) durante esa ronda, reutilizando los toasts actuales en lugar de inventar una mecánica nueva.

## Requirement 5 — Integración con el loop de endless-mode (sin romperlo)

**User Story:** Como mantenedor, quiero que los encuentros con el jefe se monten sobre el loop infinito sin romper ni el modo clásico ni el endless base.

### Acceptance Criteria

1. THE SYSTEM SHALL aplicar los encuentros con el jefe SOLO en modo `endless`; el modo `classic` (3 steps → `victory`) no cambia.
2. WHEN se carga una ronda nueva en `endless` THE SYSTEM SHALL determinar su modificador derivándolo del número de ronda (`isBossRound`) y, si no es de jefe, de `pickBossEvent(round, roll)`, y persistirlo en la sesión junto a la ronda.
3. WHEN se completa una ronda THE SYSTEM SHALL aplicar el bono de tiempo correcto según el modificador activo (bono de jefe, bono normal, o bono normal reducido por `audit`), reutilizando `applyTimeDelta`.
4. WHEN el Coder responde incorrectamente THE SYSTEM SHALL aplicar la penalización correcta según el modificador activo (penalización normal, o duplicada por `watching`), respetando el clamp a 0 → `defeat` que ya existe.
5. THE SYSTEM SHALL mantener verde la suite existente (endless-mode, game-engine, runtime-generator) y respetar el contrato del `Challenge` (la forma de los datos de Bedrock no cambia).

## Requirement 6 — Calidad y consistencia

**User Story:** Como mantenedor, quiero que el cambio respete las reglas del proyecto.

### Acceptance Criteria

1. THE SYSTEM SHALL mantener cero `any` y sin `as` casts (salvo `as const`/`satisfies`).
2. THE SYSTEM SHALL usar español neutro en la UI y en los mensajes de aviso (sin voseo).
3. THE SYSTEM SHALL cubrir con tests unitarios la lógica pura nueva: `isBossRound` (múltiplos de 10, no-múltiplos, bordes 0/1/9/10/11/20, no-enteros), `pickBossEvent` (excluido en ronda de jefe, umbral de probabilidad con `roll` inyectado, selección del catálogo), y las funciones de efecto/recompensa (bono de jefe, bono reducido por `audit`, penalización duplicada por `watching`), sin llamar a Bedrock real.
4. THE SYSTEM SHALL mantener `game-engine.ts` puro: la generación del challenge de jefe (I/O Bedrock) y la persistencia del modificador viven en el servicio, no en el engine.
5. THE SYSTEM SHALL mantener verdes lint, tsc y la suite de tests existente.

## Out of scope

- Cómo se cuenta, incrementa o persiste la **ronda** del modo infinito (lo aporta endless-mode).
- El **escalado por niveles** ronda → dificultad y el nivel `'expert'` en sí (lo aporta adaptive-difficulty; esta spec solo pide `'expert'` para la ronda de jefe).
- El **cálculo base del puntaje** y la vista del **leaderboard** (specs hermanas); esta spec solo aporta el bono extra de puntaje de la ronda de jefe.
- Nuevos modelos de Bedrock o cambios al mecanismo de streaming (se reutiliza bedrock-streaming).
- Jefes con "vida"/multi-fase persistente entre rondas, o jefes nombrados con narrativa propia (posible spec futura `boss-narrative`).
- Eventos sorpresa que toquen las client-questions (esta spec es solo sobre el challenge de la ronda y su reloj/penalización).
