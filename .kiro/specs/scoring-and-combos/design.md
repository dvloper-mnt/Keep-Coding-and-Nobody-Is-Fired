# Design — Combos por racha (scoring-and-combos)

## Overview

El cambio es **dominio primero, presentación después**, exactamente como `endless-mode`. El núcleo vive en `game-engine.ts`: dos funciones puras nuevas (`streakMultiplier`, y la composición del puntaje con combo) y una extensión mínima de `submitAnswer` para actualizar la racha. La UI agrega un solo indicador ("Racha ×2 🔥") en el tablero del Coder.

Principio rector: **`endlessScore` no se toca.** Esta spec es una **capa de composición** sobre el puntaje de `endless-mode`. El combo afecta el **puntaje**, nunca el reloj. La racha es estado de sesión; el multiplicador es una función pura derivada de ese estado.

## Decisiones de arquitectura

### D1 — Modelo de sesión: agregar `streak` y `bestStreak`

`GameSession` (game-types.ts) gana dos campos:
- `streak: number` — aciertos consecutivos sin error. Inicia en 0. Persistido.
- `bestStreak: number` — máximo histórico de la partida. Inicia en 0. Persistido. Métrica de game over para `leaderboard`.

`lastResult` (`'correct' | 'incorrect'`) ya existe y es la señal de continuidad/quiebre — no se agrega nada nuevo para eso. La racha es la fuente de verdad del multiplicador; `lastResult` queda como antes (feedback de UI).

### D2 — `streakMultiplier`: función pura con tabla configurable

La tabla de R1 vive como constante en `constants.ts`, no inline en la lógica:

```ts
// constants.ts
export const STREAK_TIERS = [
  { minStreak: 7, multiplier: 3 },
  { minStreak: 5, multiplier: 2 },
  { minStreak: 3, multiplier: 1.5 },
] as const;
export const BASE_MULTIPLIER = 1;
```

```ts
// game-engine.ts
export function streakMultiplier(streak: number): number {
  for (const tier of STREAK_TIERS) {
    if (streak >= tier.minStreak) {
      return tier.multiplier;
    }
  }
  return BASE_MULTIPLIER;
}
```

Recorre las bandas de mayor a menor umbral y devuelve la primera que aplica; por debajo de 3 → ×1. Garantiza el invariante de R1.5 (siempre ≥ 1). El uso de `as const` respeta la regla del proyecto (sin `as` casts salvo `as const`/`satisfies`). Ajustar umbrales o factores = editar `STREAK_TIERS`, sin tocar `submitAnswer` (R1.4).

### D3 — `submitAnswer`: actualizar la racha (extensión mínima)

Hoy `submitAnswer` ya distingue acierto/error. La extensión es puntual y sigue siendo pura/síncrona (R2.6):

- **Acierto** (`result.success`): `streak + 1`, y `bestStreak = Math.max(bestStreak, streak + 1)`. El resto del retorno (currentCode, currentStep, status, `lastResult: 'correct'`) no cambia. Esto convive con la rama endless de `endless-mode` (roundComplete + bono de tiempo) sin conflicto: la racha cuenta por **step resuelto**, sea o no el último del challenge.
- **Error** (`!result.success`): `streak: 0` (romper, R2.2), `bestStreak` intacto (R2.5). La penalización de tiempo vía `applyTimeDelta` no cambia (R5.4).

Pseudo:

```ts
if (result.success) {
  const nextStreak = session.streak + 1;
  return {
    ...session,
    /* ...campos endless-mode (currentStep, status, currentCode)... */
    streak: nextStreak,
    bestStreak: Math.max(session.bestStreak, nextStreak),
    lastResult: 'correct',
  };
}

return {
  ...applyTimeDelta(session, -(result.penalty ?? PENALTY_SECONDS)),
  streak: 0,            // racha rota; bestStreak NO se toca
  lastResult: 'incorrect',
};
```

Mantener `game-engine.ts` puro: ningún I/O entra acá.

### D4 — Puntaje con combo: modelo de acumulación

La pregunta de diseño es **cómo** se compone el multiplicador con `endlessScore`. Hay dos modelos posibles:

- **(A) Multiplicador final único (snapshot):** `endlessScore(...) * streakMultiplier(bestStreak)`. Simple, pero premia un pico aislado de racha sobre toda la partida — distorsiona.
- **(B) Acumulación por acierto (recomendado):** se acumula puntaje de combo **en el momento de cada acierto**, aplicando el multiplicador vigente en ese instante. El puntaje final = puntaje base de `endless-mode` + bono de combo acumulado.

Se elige **(B)** porque refleja fielmente "puntos ganados mientras tenías combo activo" y no se rompe ante una racha tardía. Implementación pura:

```ts
// se invoca dentro de submitAnswer en cada acierto, ANTES o JUNTO al update de streak
export function comboPoints(basePerHit: number, multiplier: number): number {
  return Math.round(basePerHit * multiplier);
}
```

Donde `basePerHit` es el valor fijo por acierto (constante `COMBO_BASE_PER_HIT`, ej. 100) que se acumula en un campo de sesión `comboScore: number`. El puntaje final de la partida:

```ts
export function finalScore(endless: number, comboScore: number): number {
  return endless + comboScore;   // ambos ya enteros
}
```

- `endless` = `endlessScore(playedRounds, secondsSurvived)` de `endless-mode` (intacto, R5.1).
- `comboScore` = suma de `comboPoints(COMBO_BASE_PER_HIT, streakMultiplier(streakActual))` por cada acierto.
- R3.3 (sin combo → puntaje igual a `endless-mode`): si toda la partida fue ×1, `comboScore = aciertos * COMBO_BASE_PER_HIT * 1`. **Para garantizar compatibilidad estricta hacia atrás, el bono de combo solo se acumula cuando `multiplier > 1`** (los aciertos a ×1 no suman bono). Así, sin combos, `comboScore = 0` y `finalScore = endlessScore`. **Esta es la regla operativa de R3.3 y debe quedar reflejada en los tests.**
- Redondeo (R3.5): `Math.round` en `comboPoints` mantiene el puntaje entero pese a factores fraccionarios (×1.5).

`comboScore` se persiste en la sesión (acumulador), evitando recalcular la historia al game over.

### D5 — Vista del Coder: exponer racha y multiplicador

`CoderStepView` (game-types.ts) gana:
- `streak: number`
- `multiplier: number`

`getCoderStepView` los deriva de la sesión: `streak: session.streak`, `multiplier: streakMultiplier(session.streak)`. La UI no calcula nada (R4.6). El indicador se muestra solo cuando `multiplier > 1` (R4.1/R4.2). Texto en español neutro, sin voseo (R4.5): `Racha ×{multiplier} 🔥`.

`HelperSyncView` no cambia: el combo es del Coder (la pericia es de quien responde). El Helper sigue viendo tiempo/step/estado como hoy.

### D6 — Composición con `endless-mode` (orden de specs)

`endless-mode` define `round`, `playedRounds`, `mode` y `endlessScore`. Esta spec **se monta encima**:
- Reutiliza `submitAnswer` ya extendido por `endless-mode` (rama endless con roundComplete) y le añade el update de racha.
- El puntaje final lo arma `game-service.ts` al game over: `finalScore(endlessScore(playedRounds, secondsSurvived), session.comboScore)`.
- Si `endless-mode` aún no está implementado, esta spec **depende** de él (ver Dependencias). El orden de implementación es `endless-mode` → `scoring-and-combos`.

## Componentes afectados

| Archivo | Cambio |
|---|---|
| `game-types.ts` | `GameSession`: `streak`, `bestStreak`, `comboScore`; `CoderStepView`: `streak`, `multiplier` |
| `game-engine.ts` | `streakMultiplier`, `comboPoints`, `finalScore` (puras); `submitAnswer` actualiza racha + acumula combo; `getCoderStepView` expone racha/multiplicador |
| `constants.ts` | `STREAK_TIERS`, `BASE_MULTIPLIER`, `COMBO_BASE_PER_HIT` |
| `game-service.ts` | inicializar `streak/bestStreak/comboScore` en 0; al game over componer `finalScore` y exponer `bestStreak` |
| Coder view | indicador "Racha ×N 🔥" cuando `multiplier > 1` |

## Testing

- **Puro (sin I/O):**
  - `streakMultiplier`: tabla de casos cubriendo cada banda y sus límites (0→×1, 2→×1, 3→×1.5, 4→×1.5, 5→×2, 6→×2, 7→×3, 100→×3).
  - `comboPoints`: redondeo de fracciones (×1.5 → entero), invariante ≥ 0.
  - `finalScore`: `endless + comboScore`; sin combo (`comboScore = 0`) → igual a `endlessScore` (R3.3).
  - `submitAnswer`: acierto incrementa `streak` y actualiza `bestStreak`; error resetea `streak` a 0 y conserva `bestStreak`; combo solo acumula cuando `multiplier > 1`.
- **Servicio:** game over compone `finalScore` y expone `bestStreak` (con `endlessScore` mockeado/derivado de `endless-mode`).
- **Sin regresión:** tests existentes de `submitAnswer` y del flujo de partida verdes; `endlessScore` intacto.

## Riesgos y mitigaciones

- **Balance del multiplicador:** la tabla (×1/×1.5/×2/×3) y `COMBO_BASE_PER_HIT` son parámetros de ajuste; quedan en `constants.ts` para tunear sin tocar lógica (D2). Mitiga "el combo rompe el leaderboard".
- **Doble conteo con `client-question`:** se acota el combo a steps del challenge (Out of scope), evitando que respuestas de cliente inflen la racha.
- **Compatibilidad del puntaje:** la regla "bono solo si `multiplier > 1`" (D4) garantiza R3.3 y se cubre con un test explícito.
- **No romper `endless-mode`:** `endlessScore` no se modifica; la composición es aditiva en `game-service.ts`.

## Dependencias

- `endless-mode` — aporta `endlessScore`, `playedRounds`, `round`, `mode` y la rama endless de `submitAnswer`. **Debe implementarse antes.**
- `leaderboard` — consume `finalScore` y `bestStreak` al game over.
