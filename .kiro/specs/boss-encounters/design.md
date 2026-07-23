# Design — Encuentros con el jefe (boss-encounters)

## Overview

El cambio es **dominio primero, presentación después**, y se monta sobre el loop que aporta **endless-mode**. El núcleo es lógica pura nueva (un archivo `boss-encounters.ts` espejo de `challenge-difficulty.ts`): decidir el **modificador** de una ronda (`boss`, un evento sorpresa, o `none`) y calcular sus **efectos** (bono de tiempo, bono de puntaje, penalización) como funciones puras. El I/O —pedirle a Bedrock un challenge de jefe con **formato multi-etapa** y persistir el modificador— vive en `game-service.ts`, donde ya vive la transición de ronda de endless-mode. La UI casi no se inventa: **reutiliza** el `BossOverlay` que ya existe, intensificándolo, y agrega un aviso de modificador al empezar la ronda.

Principio rector: **el jefe es FORMATO, no dificultad.** La primera versión de esta spec pedía el jefe a `'expert'`; tras adaptive-difficulty (que ya vuelve todo experto desde la ronda 13) eso quedó redundante. Ahora un encuentro con el jefe es una capa de orquestación que pide a Bedrock un challenge con **más de 3 pasos y dependencia de memoria entre pasos** — cambia la mecánica, no el nivel. Segundo principio: **el `Challenge` no cambia de forma** (solo varía la cantidad de elementos en `steps[]`). Tercero: **toda la aleatoriedad se inyecta** (el `roll` entra como parámetro), nunca se lee `Math.random` dentro de la lógica pura.

## Dependencias

- **endless-mode** — aporta `round` (1-based, persistido), el reloj acumulativo (`remainingTime`), `ENDLESS_REWARD_SECONDS`, y el punto exacto donde se carga la siguiente ronda (`processAnswer` → generar challenge → incrementar `round`). Esta spec se engancha ahí.
- **adaptive-difficulty** — aporta `roundToDifficulty(round)` y `difficultyInstruction`. La ronda de jefe usa la dificultad NATURAL de su ronda (`roundToDifficulty(round)`), NO fuerza `'expert'`. adaptive-difficulty sigue rigiendo el nivel de todas las rondas por su rango.
- **cooperative-prompt-integrity** — aporta el `SYSTEM_PROMPT` reescrito y `hasCooperativeIntegrity`. El challenge de jefe se genera por el MISMO flujo y debe pasar el MISMO validador de integridad: la memoria del jefe refuerza la conversación, no la reemplaza por "leer la respuesta".
- **leaderboard** (consumidor) — recibe el bono de puntaje extra de la ronda de jefe vía el cálculo de puntaje de endless-mode.

Si endless-mode aún no expone la ronda/loop, esta spec no aplica (no hay rondas que modificar): el modo clásico queda intacto (R6.1).

## Verificación de terreno (por qué el formato multi-etapa NO rompe nada)

- `challenge-schema.ts` valida `steps.length >= 1` (línea ~82), NO exactamente 3. Un challenge de jefe con 4–6 pasos pasa `isValidChallenge` sin cambios.
- `game-engine.ts` calcula el fin del challenge de forma dinámica con `session.currentStep >= <numSteps>` — no hardcodea 3. Un challenge con más pasos avanza y termina correctamente sin tocar el engine.
- El único lugar que fija "EXACTAMENTE 3 steps" es el `SYSTEM_PROMPT` de Bedrock: una instrucción de generación, no una restricción del contrato de datos. La ronda de jefe usa una instrucción de prompt distinta (D2), sin cambiar el tipo `Challenge` ni `ChallengeStep`.

## Decisiones de arquitectura

### D1 — Modelo del modificador de ronda

Un único tipo discriminado para el modificador activo de la ronda, persistido en sesión:

```ts
export type BossEventId = 'audit' | 'watching';
export type RoundModifier = 'none' | 'boss' | BossEventId;
```

`GameSession` (game-types.ts) gana un campo:
- `roundModifier?: RoundModifier` — el modificador de la ronda en curso. Ausente → `none` (ronda normal). Persistido en Valkey junto a `round`.

Una ronda tiene **a lo sumo un** modificador: o es de jefe, o tiene un evento, o nada. La exclusión jefe↔evento se decide en la selección (D3), no se representa con dos campos.

### D2 — Ronda de jefe: formato multi-etapa, no dificultad (lógica pura + prompt)

Archivo nuevo `src/features/game/boss-encounters.ts`. Primera función, sin azar:

```ts
export function isBossRound(round: number): boolean {
  // entero, >= 1 y múltiplo de 10 → true; cualquier otra cosa → false (R1.2, R1.3)
}
```

- Determinista: depende SOLO del número de ronda. Bordes cubiertos por test: 0, 1, 9, 10, 11, 20, 100, negativos, no-enteros.
- **La ronda de jefe NO fuerza `'expert'`** (cambio clave respecto a la v1). Usa `roundToDifficulty(round)` como cualquier ronda. Lo que cambia es la **instrucción de formato** que se le pasa a Bedrock:

```ts
// instrucción de prompt adicional para el challenge de jefe (español),
// concatenada al mensaje de usuario junto a languageInstruction / difficultyInstruction
export function bossFormatInstruction(): string {
  // "Este es un ENCUENTRO CON EL JEFE. Genera un incidente encadenado de 4 a 6 pasos
  //  (no 3). Al menos un paso debe tener su respuesta correcta CONDICIONADA por una
  //  decisión de un paso anterior: el enunciado/opciones de ese paso deben aludir a lo
  //  resuelto antes, de modo que el par deba RECORDAR juntos qué decidió. Mantén la
  //  integridad cooperativa: las rules/knowledge del Helper NO revelan la respuesta."
}
```

- El servicio, cuando `isBossRound(round)`, agrega `bossFormatInstruction()` al mensaje de usuario de la generación. `generateChallenge`/`generateChallengeStreaming` no cambian de firma para esto: la instrucción se concatena al texto de usuario, igual que `difficultyInstruction`.
- **Validación de formato de jefe:** tras `isValidChallenge` + `hasCooperativeIntegrity`, el servicio verifica que el challenge de jefe tenga `steps.length > 3`. Si no, se trata como generación fallida de jefe → fallback al curado de jefe (D7). Esta verificación es una función pura testeable: `isBossFormat(challenge): boolean` (más de 3 pasos).

### D3 — Selección del evento sorpresa (azar inyectado)

Catálogo de eventos como **datos** en `constants.ts`, no lógica:

```ts
export const BOSS_EVENTS = {
  audit: {
    id: 'audit',
    notice: 'Auditoría sorpresa: el bono de tiempo de esta ronda viene reducido.',
    timeBonusFactor: 0.5,   // mitad del bono al completar
    penaltyFactor: 1,
  },
  watching: {
    id: 'watching',
    notice: 'El jefe está mirando: los errores de esta ronda cuestan el doble.',
    timeBonusFactor: 1,
    penaltyFactor: 2,       // penalización duplicada al errar
  },
} as const;

export const BOSS_EVENT_CHANCE = 0.2;   // prob. de evento en una ronda normal
export const BOSS_REWARD_SECONDS = 60;  // bono de tiempo de la ronda de jefe (vs normal)
export const BOSS_SCORE_BONUS = 2000;   // bono de puntaje extra de la ronda de jefe
```

Función pura de selección, con `roll` inyectado:

```ts
export function pickBossEvent(round: number, roll: number): RoundModifier {
  if (isBossRound(round)) return 'boss';            // R4.3 — exclusión jefe↔evento
  if (roll < BOSS_EVENT_CHANCE) return /* un id del catálogo según roll */;
  return 'none';                                     // R4.4
}
```

- `roll` entra como parámetro (p. ej. `Math.random()` calculado en el servicio y pasado adentro). La lógica pura NUNCA lee `Math.random` — así el test fija `roll` y verifica el umbral (R4.2).
- La elección del id concreto del catálogo (cuando hay evento) puede derivarse del mismo `roll` reescalado o de un segundo `roll` inyectado; el test cubre ambos ids.
- En ronda de jefe, `pickBossEvent` devuelve `'boss'` y nunca un evento (R4.3).

### D4 — Efectos del modificador (funciones puras sobre valores base)

Las funciones de efecto reciben el valor base y devuelven el modificado — no mutan sesión:

```ts
// bono de tiempo al completar la ronda, según modificador
export function rewardSecondsFor(modifier: RoundModifier): number {
  // 'boss' → BOSS_REWARD_SECONDS; 'audit' → ENDLESS_REWARD_SECONDS * 0.5;
  // otros → ENDLESS_REWARD_SECONDS  (R3.1, R4.5)
}

// penalización al errar, según modificador
export function penaltyFor(modifier: RoundModifier): number {
  // 'watching' → PENALTY base * 2; otros → PENALTY base  (R4.5, R6.4)
}

// bono de puntaje extra (sobre el puntaje base de endless-mode)
export function scoreBonusFor(modifier: RoundModifier): number {
  // 'boss' → BOSS_SCORE_BONUS; otros → 0  (R3.2)
}
```

Todas deterministas, sin estado, sin azar — tabla de entrada→salida en el test. El redondeo del bono reducido (`audit`) se define con `Math.round`/`Math.floor` en implementación; el test fija el caso.

### D5 — Cableado en el servicio (game-service.ts)

Reutiliza el punto de transición de ronda de endless-mode (`processAnswer` → cargar siguiente ronda). Allí:

1. **Al cargar la ronda nueva:** calcular el modificador. `const roll = Math.random();` (el único punto con azar, en el servicio) → `pickBossEvent(round, roll)`. Persistir en `session.roundModifier`.
2. **Formato de generación:** si la ronda es de jefe → agregar `bossFormatInstruction()` al mensaje de usuario y usar la dificultad natural `roundToDifficulty(round)`; si no → generación estándar de 3 pasos. Mismo flujo de Bedrock + validación (isValidChallenge + hasCooperativeIntegrity) + fallback. Para jefe, además `isBossFormat` (>3 pasos); si no cumple → fallback de jefe (D7).
3. **Al completar la ronda:** el bono de tiempo aplicado es `rewardSecondsFor(session.roundModifier)` vía `applyTimeDelta(session, +bono)`, en vez del `ENDLESS_REWARD_SECONDS` fijo.
4. **Bono de puntaje:** acumular `scoreBonusFor(modifier)` al puntaje del modo infinito, expuesto al game over para leaderboard.

La penalización por error (R6.4) requiere que el cálculo de la respuesta conozca el modificador: `submitAnswer` (engine) ya calcula la penalización con la constante base. Para no romper su pureza, la penalización efectiva se parametriza — `submitAnswer` recibe el modificador (o la penalización ya resuelta) y usa `penaltyFor(modifier)`. Se elige en implementación entre pasar el modificador o pasar el número; ambas mantienen el engine puro y testeable.

### D6 — UI: reutilizar la presión del jefe + aviso de modificador

- **Aviso de modificador (R5.1, R5.2):** al empezar la ronda, un banner/toast en español neutro: "Jefe final" para la ronda de jefe, o el `notice` del evento (`BOSS_EVENTS[id].notice`). Se muestra al Coder y al Helper (R5.3) leyendo `roundModifier` del estado sincronizado.
- **Presión visual intensificada (R5.4):** durante una ronda de jefe o con evento, montar `BossOverlay` con `active` y, si se quiere más caos, una variante de `BOSS_PRESSURE_CONFIG` con `spawnIntervalMs` menor y/o `maxVisibleMessages` mayor — SIN reescribir el overlay, solo pasándole otra config. El overlay, `createBossToast`, `generateBossPlacement` y `pickBossMessage` se reutilizan tal cual.
- **UI de "jefe final" distinta (R1.5):** el tablero del Coder/Helper marca visualmente la ronda de jefe (color/título) y, dado que el jefe tiene más pasos, el indicador de progreso (paso X de N) ya refleja los pasos extra porque es dinámico.

### D7 — Fallback curado de jefe (R5.5)

El fallback de una ronda normal es un curado de 3 pasos. Para la ronda de jefe eso rompería el formato (sería un "jefe" de 3 pasos sin memoria). Por eso:

- Agregar al catálogo curado al menos un **challenge de jefe** (multi-etapa, >3 pasos, con una dependencia de memoria explícita entre pasos, que pase `isValidChallenge` + `hasCooperativeIntegrity` + `isBossFormat`).
- El selector de fallback distingue: si la ronda es de jefe y la generación falla o no cumple `isBossFormat`, elegir el curado de jefe; si es normal, el curado normal como hoy (`pickRandomChallenge`).
- Esto garantiza que un encuentro con el jefe SIEMPRE sea multi-etapa, aun sin Bedrock — clave para no romper la demo (R5.5).

## Componentes afectados

| Archivo | Cambio |
|---|---|
| `src/features/game/boss-encounters.ts` | NUEVO — `isBossRound`, `pickBossEvent`, `rewardSecondsFor`, `penaltyFor`, `scoreBonusFor`, `isBossFormat`, `bossFormatInstruction`; tipos `BossEventId`, `RoundModifier` |
| `src/features/game/game-types.ts` | `GameSession`: `roundModifier?: RoundModifier`; exponer el modificador en las vistas Coder/Helper |
| `src/lib/constants.ts` | NUEVO — `BOSS_EVENTS`, `BOSS_EVENT_CHANCE`, `BOSS_REWARD_SECONDS`, `BOSS_SCORE_BONUS`; opcional config intensificada para el overlay |
| `src/features/game/game-engine.ts` | `submitAnswer`: penalización y bono parametrizados por modificador (vía `penaltyFor`/`rewardSecondsFor`), manteniendo pureza |
| `src/features/game/game-service.ts` | al cargar ronda: `roll` + `pickBossEvent`, persistir `roundModifier`; si jefe → `bossFormatInstruction` + `isBossFormat` + fallback de jefe; al completar: bono/score según modificador |
| `src/features/game/runtime-generator.ts` | aceptar la instrucción de formato de jefe en el mensaje de usuario (concatenada, sin cambiar el contrato) |
| `src/data/challenges/*.json` + `index.ts` | NUEVO — un challenge de jefe curado (multi-etapa) como fallback |
| Coder/Helper views | aviso del modificador (banner/toast en español neutro); UI de jefe final; intensificar `BossOverlay` |
| `src/components/organisms/BossOverlay.tsx` / `boss-position.ts` | reusados sin reescribir (a lo sumo aceptan otra config de presión) |

## Testing

- **Unitario puro (sin Bedrock, sin Valkey):** `boss-encounters.test.ts`:
  - `isBossRound`: tabla con 0, 1, 9, 10, 11, 19, 20, 100, negativos, no-enteros (R1.2, R1.3).
  - `pickBossEvent`: en ronda de jefe → `'boss'` sin importar el `roll` (R4.3); en ronda normal con `roll < BOSS_EVENT_CHANCE` → un id del catálogo; con `roll >= BOSS_EVENT_CHANCE` → `'none'`; cubrir ambos ids (R4.2, R4.4).
  - `rewardSecondsFor`: `'boss'` → `BOSS_REWARD_SECONDS`; `'audit'` → mitad del normal; `'none'`/`'watching'` → normal (R3.1, R4.5).
  - `penaltyFor`: `'watching'` → doble; resto → base (R4.5, R6.4).
  - `scoreBonusFor`: `'boss'` → `BOSS_SCORE_BONUS`; resto → 0 (R3.2).
  - `isBossFormat`: challenge con >3 pasos → true; con ≤3 → false (R2.4).
  - `bossFormatInstruction`: devuelve texto no vacío que menciona >3 pasos y dependencia entre pasos (R2.1, R2.2).
- **Engine:** `submitAnswer` con modificador `'watching'` resta el doble; con `'boss'`/`'audit'` aplica el bono correcto al completar; sin modificador se comporta como endless-mode base (R6.3, R6.4). Con un challenge de jefe de N>3 pasos, avanza y termina en el paso N (fin dinámico).
- **Servicio (Bedrock/Valkey mockeados):** ronda 10 agrega `bossFormatInstruction`, usa `roundToDifficulty(10)` (NO fuerza expert), marca `roundModifier: 'boss'`; un challenge de jefe generado con ≤3 pasos → fallback al curado de jefe; ronda normal con `roll` bajo el umbral persiste el evento; fallback normal si Bedrock falla en ronda normal.
- **Catálogo:** el challenge de jefe curado pasa `isValidChallenge` + `hasCooperativeIntegrity` + `isBossFormat` (guardrail de build).
- **Sin regresión:** modo `classic` intacto; suite de endless-mode, game-engine y runtime-generator verde; contrato `Challenge` sin cambios de forma.
- tsc 0 errores, lint 0 warnings.

## Riesgos y mitigaciones

- **Bedrock no genera bien la dependencia de memoria (paso condicionado por otro):** el riesgo más alto del formato. Mitigado por (a) `bossFormatInstruction` explícita con ejemplo de la dependencia, (b) `isBossFormat` que al menos garantiza >3 pasos, y (c) el fallback curado de jefe que SIEMPRE cumple el formato. Afinar el wording del prompt es iterativo y barato.
- **La dependencia de memoria degenera en un leak** (un paso dice "como elegiste X antes, ahora Y"): mitigado porque el challenge de jefe pasa `hasCooperativeIntegrity` igual que cualquiera; la memoria se resuelve conversando, no leyendo la respuesta en las pistas del Helper.
- **Doblar el reloj/penalización por error de cableado:** mitigado aislando el cálculo en funciones puras (`rewardSecondsFor`, `penaltyFor`) testeadas por tabla; el engine solo las consume.
- **Más pasos = ronda de jefe demasiado larga para el reloj:** mitigado por `BOSS_REWARD_SECONDS` mayor (compensa el tiempo extra) y por acotar el rango a 4–6 pasos en el prompt; el fallback curado usa un número de pasos ya calibrado.
- **Caos visual excesivo (overlay intensificado tapa el panel):** mitigado porque `boss-position.ts` ya mantiene los toasts en las columnas laterales (`sideZoneMaxPercent`), nunca sobre el código central; intensificar solo cambia frecuencia/cantidad, no la zona.
- **Aleatoriedad no testeable:** mitigado por D3 — el `roll` se inyecta; `Math.random` vive solo en el servicio, fuera de la lógica pura.
- **endless-mode aún no integrado:** mitigado porque sin loop infinito no hay rondas que modificar; el modo clásico no se toca (R6.1).
