# Design — Encuentros con el jefe (boss-encounters)

## Overview

El cambio es **dominio primero, presentación después**, y se monta sobre el loop que aporta **endless-mode**. El núcleo es lógica pura nueva (un archivo `boss-encounters.ts` espejo de `challenge-difficulty.ts`): decidir el **modificador** de una ronda (`boss`, un evento sorpresa, o `none`) y calcular sus **efectos** (bono de tiempo, bono de puntaje, penalización) como funciones puras. El I/O —pedirle a Bedrock un challenge de jefe a nivel `'expert'` y persistir el modificador— vive en `game-service.ts`, donde ya vive la transición de ronda de endless-mode. La UI casi no se inventa: **reutiliza** el `BossOverlay` que ya existe, intensificándolo, y agrega un aviso de modificador al empezar la ronda.

Principio rector: **el `Challenge` no cambia de forma.** Un encuentro con el jefe es una capa de orquestación sobre los mismos challenges de Bedrock — solo cambia la dificultad pedida, la recompensa, y la presentación. Y: **toda la aleatoriedad se inyecta** (el `roll` entra como parámetro), nunca se lee `Math.random` dentro de la lógica pura.

## Dependencias

- **endless-mode** — aporta `round` (1-based, persistido), el reloj acumulativo (`remainingTime`), `ENDLESS_REWARD_SECONDS`, y el punto exacto donde se carga la siguiente ronda (`processAnswer` → generar challenge → incrementar `round`). Esta spec se engancha ahí.
- **adaptive-difficulty** — aporta `roundToDifficulty(round)`, el nivel `'expert'` en `type Difficulty` / `VALID_DIFFICULTIES`, y `difficultyInstruction`. La ronda de jefe pide `'expert'` reusando esa inyección de prompt.
- **leaderboard** (consumidor) — recibe el bono de puntaje extra de la ronda de jefe vía el cálculo de puntaje de endless-mode.

Si endless-mode aún no expone la ronda/loop, esta spec no aplica (no hay rondas que modificar): el modo clásico queda intacto (R5.1).

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

### D2 — Ronda de jefe (lógica pura, determinista)

Archivo nuevo `src/features/game/boss-encounters.ts`. Primera función, sin azar:

```ts
export function isBossRound(round: number): boolean {
  // entero, >= 1 y múltiplo de 10 → true; cualquier otra cosa → false (R1.2, R1.3)
}
```

- Determinista: depende SOLO del número de ronda. Bordes cubiertos por test: 0, 1, 9, 10, 11, 20, 100, negativos, no-enteros.
- La ronda de jefe fuerza dificultad `'expert'` (R1.4): en el servicio, al generar el challenge de una ronda de jefe se pasa `'expert'` en lugar de `roundToDifficulty(round)`. La firma de generación que adaptive-difficulty ya prevé (`difficulty?: Difficulty`) lo soporta sin cambios de contrato.

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
export const BOSS_REWARD_SECONDS = 60;  // bono de tiempo de la ronda de jefe (vs 30 normal)
export const BOSS_SCORE_BONUS = 2000;   // bono de puntaje extra de la ronda de jefe
```

Función pura de selección, con `roll` inyectado:

```ts
export function pickBossEvent(round: number, roll: number): RoundModifier {
  if (isBossRound(round)) return 'boss';            // R3.3 — exclusión jefe↔evento
  if (roll < BOSS_EVENT_CHANCE) return /* un id del catálogo según roll */;
  return 'none';                                     // R3.4
}
```

- `roll` entra como parámetro (p. ej. `Math.random()` calculado en el servicio y pasado adentro). La lógica pura NUNCA lee `Math.random` — así el test fija `roll` y verifica el umbral (R3.2).
- La elección del id concreto del catálogo (cuando hay evento) puede derivarse del mismo `roll` reescalado o de un segundo `roll` inyectado; el test cubre ambos ids.
- En ronda de jefe, `pickBossEvent` devuelve `'boss'` y nunca un evento (R3.3).

### D4 — Efectos del modificador (funciones puras sobre valores base)

Las funciones de efecto reciben el valor base y devuelven el modificado — no mutan sesión:

```ts
// bono de tiempo al completar la ronda, según modificador
export function rewardSecondsFor(modifier: RoundModifier): number {
  // 'boss' → BOSS_REWARD_SECONDS; 'audit' → ENDLESS_REWARD_SECONDS * 0.5;
  // otros → ENDLESS_REWARD_SECONDS  (R2.1, R3.5)
}

// penalización al errar, según modificador
export function penaltyFor(modifier: RoundModifier): number {
  // 'watching' → PENALTY_SECONDS * 2; otros → PENALTY_SECONDS  (R3.5, R5.4)
}

// bono de puntaje extra (sobre el puntaje base de endless-mode)
export function scoreBonusFor(modifier: RoundModifier): number {
  // 'boss' → BOSS_SCORE_BONUS; otros → 0  (R2.2)
}
```

Todas deterministas, sin estado, sin azar — tabla de entrada→salida en el test. El redondeo del bono reducido (`audit`) se define con `Math.round`/`Math.floor` en implementación; el test fija el caso.

### D5 — Cableado en el servicio (game-service.ts)

Reutiliza el punto de transición de ronda de endless-mode (`processAnswer` → cargar siguiente ronda). Allí:

1. **Al cargar la ronda nueva:** calcular el modificador. `const roll = Math.random();` (el único punto con azar, en el servicio) → `pickBossEvent(round, roll)`. Persistir en `session.roundModifier`.
2. **Dificultad de generación:** si la ronda es de jefe → pedir `'expert'`; si no → `roundToDifficulty(round)` (adaptive-difficulty). Mismo flujo de Bedrock + fallback al curado (`pickRandomChallenge`).
3. **Al completar la ronda:** el bono de tiempo aplicado es `rewardSecondsFor(session.roundModifier)` vía `applyTimeDelta(session, +bono)`, en vez del `ENDLESS_REWARD_SECONDS` fijo.
4. **Bono de puntaje:** acumular `scoreBonusFor(modifier)` al puntaje del modo infinito, expuesto al game over para leaderboard.

La penalización por error (R5.4) requiere que el cálculo de la respuesta conozca el modificador: `submitAnswer` (engine) ya calcula la penalización con `PENALTY_SECONDS`. Para no romper su pureza, la penalización efectiva se parametriza — `submitAnswer` recibe el modificador (o la penalización ya resuelta) y usa `penaltyFor(modifier)`. Se elige en implementación entre pasar el modificador o pasar el número; ambas mantienen el engine puro y testeable.

### D6 — UI: reutilizar la presión del jefe + aviso de modificador

- **Aviso de modificador (R4.1, R4.2):** al empezar la ronda, un banner/toast en español neutro: "Jefe final" para la ronda de jefe, o el `notice` del evento (`BOSS_EVENTS[id].notice`). Se muestra al Coder y al Helper (R4.3) leyendo `roundModifier` del estado sincronizado.
- **Presión visual intensificada (R4.4):** durante una ronda de jefe o con evento, montar `BossOverlay` con `active` y, si se quiere más caos, una variante de `BOSS_PRESSURE_CONFIG` con `spawnIntervalMs` menor y/o `maxVisibleMessages` mayor — SIN reescribir el overlay, solo pasándole otra config. El overlay, `createBossToast`, `generateBossPlacement` y `pickBossMessage` se reutilizan tal cual.
- **UI de "jefe final" distinta (R1.5):** el tablero del Coder/Helper marca visualmente la ronda de jefe (color/título), leyendo `roundModifier === 'boss'`.

## Componentes afectados

| Archivo | Cambio |
|---|---|
| `src/features/game/boss-encounters.ts` | NUEVO — `isBossRound`, `pickBossEvent`, `rewardSecondsFor`, `penaltyFor`, `scoreBonusFor`; tipos `BossEventId`, `RoundModifier` |
| `src/features/game/game-types.ts` | `GameSession`: `roundModifier?: RoundModifier`; exponer el modificador en las vistas Coder/Helper |
| `src/lib/constants.ts` | NUEVO — `BOSS_EVENTS`, `BOSS_EVENT_CHANCE`, `BOSS_REWARD_SECONDS`, `BOSS_SCORE_BONUS`; opcional config intensificada para el overlay |
| `src/features/game/game-engine.ts` | `submitAnswer`: penalización y bono parametrizados por modificador (vía `penaltyFor`/`rewardSecondsFor`), manteniendo pureza |
| `src/features/game/game-service.ts` | al cargar ronda: calcular `roll` y `pickBossEvent`, persistir `roundModifier`, pedir `'expert'` si es jefe; al completar: bono/score según modificador |
| Coder/Helper views | aviso del modificador (banner/toast en español neutro); UI de jefe final; intensificar `BossOverlay` |
| `src/components/organisms/BossOverlay.tsx` / `boss-position.ts` | reusados sin reescribir (a lo sumo aceptan otra config de presión) |

## Testing

- **Unitario puro (sin Bedrock, sin Valkey):** `boss-encounters.test.ts`:
  - `isBossRound`: tabla con 0, 1, 9, 10, 11, 19, 20, 100, negativos, no-enteros (R1.2, R1.3).
  - `pickBossEvent`: en ronda de jefe → `'boss'` sin importar el `roll` (R3.3); en ronda normal con `roll < BOSS_EVENT_CHANCE` → un id del catálogo; con `roll >= BOSS_EVENT_CHANCE` → `'none'`; cubrir ambos ids del catálogo (R3.2, R3.4).
  - `rewardSecondsFor`: `'boss'` → `BOSS_REWARD_SECONDS`; `'audit'` → mitad del normal; `'none'`/`'watching'` → normal (R2.1, R3.5).
  - `penaltyFor`: `'watching'` → doble; resto → `PENALTY_SECONDS` (R3.5, R5.4).
  - `scoreBonusFor`: `'boss'` → `BOSS_SCORE_BONUS`; resto → 0 (R2.2).
- **Engine:** `submitAnswer` con modificador `'watching'` resta el doble; con `'boss'`/`'audit'` aplica el bono correcto al completar; sin modificador se comporta como endless-mode base (R5.3, R5.4).
- **Servicio (Bedrock/Valkey mockeados):** ronda 10 pide `'expert'` y marca `roundModifier: 'boss'`; ronda normal con `roll` mockeado bajo el umbral persiste el evento; fallback al curado si Bedrock falla.
- **Sin regresión:** modo `classic` intacto; suite de endless-mode, game-engine y runtime-generator verde; contrato `Challenge` sin cambios.
- tsc 0 errores, lint 0 warnings.

## Riesgos y mitigaciones

- **Doblar el reloj/penalización por error de cableado:** mitigado aislando el cálculo en funciones puras (`rewardSecondsFor`, `penaltyFor`) testeadas por tabla; el engine solo las consume.
- **El challenge de jefe `'expert'` es demasiado duro y frustra:** mitigado por el fallback curado (nunca rompe el loop) y porque el bono mayor (`BOSS_REWARD_SECONDS`) compensa el riesgo; el wording de `difficultyInstruction('expert')` es iterativo y barato (solo prompt).
- **Caos visual excesivo (overlay intensificado tapa el panel):** mitigado porque `boss-position.ts` ya mantiene los toasts en las columnas laterales (`sideZoneMaxPercent`), nunca sobre el código central; intensificar solo cambia frecuencia/cantidad, no la zona.
- **Aleatoriedad no testeable:** mitigado por D3 — el `roll` se inyecta; `Math.random` vive solo en el servicio, fuera de la lógica pura.
- **endless-mode aún no integrado:** mitigado porque sin loop infinito no hay rondas que modificar; el modo clásico no se toca (R5.1).
