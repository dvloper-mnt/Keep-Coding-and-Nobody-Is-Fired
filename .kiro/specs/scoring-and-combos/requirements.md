# Requirements — Combos por racha (scoring-and-combos)

## Introduction

El modo infinito (`endless-mode`) ya define un puntaje base: `(rondas resueltas × 1000) + segundos sobrevividos`, calculado por la función pura `endlessScore`. Hoy ese puntaje trata todos los aciertos por igual: da lo mismo resolver con precisión quirúrgica que ir a los tropezones. No hay recompensa por **mantener la concentración**.

Esta spec agrega una capa de **combos por racha**: los aciertos **consecutivos sin errores** generan un **multiplicador de puntos creciente**. Cuanto más larga la racha, mayor el multiplicador, hasta un tope. Un **error rompe la racha** y devuelve el multiplicador a ×1. El multiplicador se aplica sobre el puntaje que ya calcula `endless-mode`, no lo reemplaza.

**Cambio de naturaleza del puntaje:** de "sumá puntos" a **"sumá puntos SIN equivocarte"**. Esto premia la pericia (no solo la velocidad y la supervivencia que ya premia `endless-mode`) y crea momentos de tensión: cada respuesta arriesga una racha cara.

**Relato de hackathon:** un indicador de combo en vivo ("Racha ×2 🔥") que sube mientras el Coder enhebra aciertos y se cae de golpe al primer error — feedback inmediato, lectura competitiva clara, más enganche.

### Contexto verificado

- El puntaje base lo define la spec hermana `endless-mode`: `endlessScore(playedRounds, secondsSurvived) = playedRounds * 1000 + secondsSurvived` (función pura, ver `endless-mode/design.md` D4). Esta spec **extiende** ese cálculo aplicándole el multiplicador de combo. **Depende de `endless-mode`.**
- `submitAnswer` (game-engine.ts) resuelve aciertos y errores: en acierto setea `lastResult: 'correct'`; en error aplica la penalización de tiempo y setea `lastResult: 'incorrect'`. Ahí mismo se trackea la racha.
- `session.lastResult` (`'correct' | 'incorrect'`) ya existe en `GameSession` (game-types.ts) — sirve de señal de continuidad/quiebre de racha.
- `applyTimeDelta` y la lógica de tiempo no se tocan: el combo afecta **puntaje**, no el reloj.

## Glossary

- **Racha (streak)**: cantidad de aciertos consecutivos sin un error de por medio. Empieza en 0; cada acierto la incrementa en 1; un error la resetea a 0.
- **Multiplicador de combo**: factor (`×1`, `×1.5`, `×2`, `×3`) que depende del tamaño de la racha actual, según la tabla de R1. Aplica al puntaje base de `endless-mode`.
- **Romper la racha**: efecto de un error — la racha vuelve a 0 y el multiplicador a ×1.
- **Mejor racha (best streak)**: la racha más larta alcanzada durante la partida; se conserva aunque la racha actual se rompa. Métrica de game over.
- **Acierto**: resolución correcta de un step (`lastResult: 'correct'`). El combo cuenta por step resuelto, no por challenge/ronda completa.

---

## Requirement 1 — Tabla de multiplicadores por racha

**User Story:** Como jugador, quiero que enhebrar aciertos me dé un multiplicador de puntos creciente, para que mantener la concentración valga la pena.

### Acceptance Criteria

1. THE SYSTEM SHALL definir el multiplicador en función del tamaño de la racha según esta tabla:

   | Racha (aciertos consecutivos) | Multiplicador |
   |---|---|
   | 0–2 | ×1 |
   | 3–4 | ×1.5 |
   | 5–6 | ×2 |
   | 7 o más | ×3 |

2. THE SYSTEM SHALL implementar el mapeo racha → multiplicador como una función pura `streakMultiplier(streak: number): number`, unit-testeada con una tabla de casos que cubra cada banda y sus límites (2/3, 4/5, 6/7).
3. WHEN la racha es 0 (inicio de partida o justo después de un error) THE SYSTEM SHALL devolver multiplicador ×1.
4. THE SYSTEM SHALL tratar la tabla de bandas como configurable en un único lugar (constante), de modo que ajustar los umbrales o factores no requiera tocar la lógica de `submitAnswer`.
5. THE SYSTEM SHALL devolver siempre un multiplicador ≥ 1 (nunca penaliza por debajo del puntaje base).

## Requirement 2 — Actualización de la racha en cada respuesta

**User Story:** Como jugador, quiero que cada acierto sume a mi racha y cada error la rompa, para que el riesgo de equivocarme sea tangible.

### Acceptance Criteria

1. WHEN el Coder responde correctamente un step THE SYSTEM SHALL incrementar `streak` en 1.
2. WHEN el Coder responde incorrectamente un step THE SYSTEM SHALL resetear `streak` a 0 (romper la racha), además de la penalización de tiempo que ya aplica `endless-mode`.
3. THE SYSTEM SHALL actualizar `bestStreak` con el máximo entre `bestStreak` y la `streak` resultante tras cada acierto.
4. THE SYSTEM SHALL conservar `streak` y `bestStreak` en la `GameSession` y persistirlos junto al resto del estado.
5. WHEN la racha se rompe por un error THE SYSTEM SHALL conservar `bestStreak` intacto (no se resetea con la racha actual).
6. THE SYSTEM SHALL realizar la actualización de la racha dentro de `submitAnswer`, manteniéndola como lógica pura y síncrona (sin I/O).

## Requirement 3 — Puntaje con multiplicador de combo

**User Story:** Como jugador competitivo, quiero que mi puntaje refleje cuánto combo mantuve, para diferenciarme de quien jugó sin precisión.

### Acceptance Criteria

1. THE SYSTEM SHALL aplicar el multiplicador de combo sobre el puntaje base que define `endless-mode` (`endlessScore`), sin reemplazar dicho cálculo.
2. THE SYSTEM SHALL implementar el puntaje con combo como una función pura y unit-testeada que componga `endlessScore` con `streakMultiplier`, según el modelo de acumulación definido en `design.md`.
3. WHEN no hubo ningún combo durante la partida (toda la partida con multiplicador ×1) THE SYSTEM SHALL producir un puntaje igual al de `endless-mode` sin esta spec (compatibilidad hacia atrás).
4. THE SYSTEM SHALL exponer al game over, además del puntaje, la `bestStreak` alcanzada, para consumo de la spec `leaderboard`.
5. THE SYSTEM SHALL producir un puntaje entero (redondeado) cuando el multiplicador genere fracciones (ej. ×1.5).

## Requirement 4 — Indicador de combo en la UI del Coder

**User Story:** Como Coder, quiero ver mi racha actual en pantalla, para sentir la tensión de mantenerla y la recompensa de subirla.

### Acceptance Criteria

1. THE SYSTEM SHALL mostrar el combo actual en el tablero del Coder cuando el multiplicador es mayor que ×1 (ej. "Racha ×2 🔥").
2. WHEN el multiplicador es ×1 (racha de 0–2) THE SYSTEM SHALL ocultar o atenuar el indicador, para que solo destaque cuando hay combo activo.
3. WHEN la racha sube de banda (cambia el multiplicador) THE SYSTEM SHALL reflejar el nuevo multiplicador en el indicador en la siguiente actualización de estado.
4. WHEN la racha se rompe por un error THE SYSTEM SHALL reflejar la caída a ×1 en el indicador.
5. THE SYSTEM SHALL usar español neutro en el texto del indicador (sin voseo).
6. THE SYSTEM SHALL exponer la `streak` y el multiplicador actual en la vista del Coder (`CoderStepView`) para que la UI los consuma sin cálculos adicionales.

## Requirement 5 — No romper el puntaje ni el modo existentes

**User Story:** Como mantenedor, quiero introducir los combos sin alterar el comportamiento del puntaje base ni del modo clásico.

### Acceptance Criteria

1. THE SYSTEM SHALL dejar intacta la función `endlessScore` de `endless-mode` (esta spec la compone, no la modifica).
2. THE SYSTEM SHALL inicializar `streak: 0` y `bestStreak: 0` al crear la sesión, sin alterar los demás valores iniciales.
3. THE SYSTEM SHALL mantener verdes los tests existentes de `submitAnswer` y del flujo de partida; si el comportamiento de `submitAnswer` se extiende, los tests se actualizan acompañando el cambio.
4. THE SYSTEM SHALL no afectar el reloj (`remainingTime`) con la lógica de combos: el multiplicador solo toca el puntaje.
5. THE SYSTEM SHALL respetar las reglas del proyecto: cero `any`, sin `as` casts (salvo `as const`/`satisfies`), TDD en la lógica de dominio nueva.

## Out of scope

- El cálculo del puntaje base (`endlessScore`, rondas y segundos) → spec `endless-mode`.
- El escalado de dificultad por ronda → spec `adaptive-difficulty`.
- El registro y la vista del ranking → spec `leaderboard` (esta spec solo expone puntaje y `bestStreak`).
- Bonos de tiempo por combo (que la racha sume segundos al reloj) — acá el combo solo afecta puntaje.
- Animaciones/efectos avanzados del indicador de combo (partículas, sonido) → spec futura `victory-feedback`.
- Combos derivados de las preguntas del cliente (`client-question`) — esta spec cuenta solo aciertos/errores de steps del challenge.
