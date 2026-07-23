# Requirements — Modo infinito (endless-mode)

## Introduction

Hoy una partida es finita: un `Challenge` con **3 steps fijos**; cuando el Coder resuelve el último, la sesión pasa a `victory` y termina. Esta spec transforma el juego en un **modo infinito tipo arcade**: el jugador resuelve challenges **ilimitados**, uno tras otro, cada uno generado por Bedrock, mientras un **reloj acumulativo** corre. El juego termina cuando el reloj llega a cero (`defeat`/game over), no cuando se "completa" un challenge.

**Cambio de naturaleza del juego:** de "resolvé este incidente" a **"sobreviví la mayor cantidad de incidentes posible"**. Esto le da sentido real al leaderboard (cuántas rondas llegaste) y a la dificultad adaptativa (cada ronda más difícil).

**Decisión central — reloj acumulativo:** un solo reloj global, no uno por challenge.
- Arranca en un tiempo base (default ~120s).
- Resolver un challenge **suma** tiempo (default +30s) → premia la velocidad, te deja seguir vivo.
- Errar **resta** tiempo (−10s, vía `PENALTY_SECONDS` que ya existe).
- Reloj a cero → `defeat` (game over).

**Relato de hackathon:** un loop de juego que nunca repite contenido (Bedrock genera cada ronda) y que se pone más difícil solo (ver spec hermana `adaptive-difficulty`). Más uso de AWS, más rejugabilidad.

### Contexto verificado

- `submitAnswer` (game-engine.ts) hoy marca `status: 'victory'` cuando `currentStep >= challenge.steps.length`. Acá es donde, en vez de terminar, se carga la siguiente ronda.
- `PENALTY_SECONDS = 10` ya existe (penalización por error).
- El reloj vive en `session.remainingTime`; `applyTimeDelta` ya ajusta el tiempo.
- La generación de challenges por ronda usa el flujo de Bedrock ya existente (`generateChallenge` / `generateChallengeStreaming`) con fallback al curado.
- El estado de sesión persiste en Valkey; el sync Coder/Helper ya funciona.

## Glossary

- **Ronda**: un challenge completo dentro de la partida infinita. La ronda 1 es el primer challenge; cada challenge resuelto incrementa el número de ronda.
- **Reloj acumulativo**: un único `remainingTime` que persiste entre rondas, sube al acertar y baja al errar / con el tick del tiempo.
- **Game over**: la partida pasa a `status: 'defeat'` por CUALQUIERA de dos condiciones — el reloj acumulativo llega a 0 (`defeatReason: 'timeout'`) O un jugador se queda sin vidas (`coder_lives`/`helper_lives`, ver spec `lives-system`). Lo que ocurra primero. Ya no hay `victory` de "completaste el juego".
- **Doble presión (decisión de producto, 2026-06-27):** en endless conviven el reloj acumulativo Y las vidas. Errar cuesta tiempo Y una vida. Se pierde por lo que llegue primero a 0. Ver R2 y `lives-system`.
- **Modo de juego**: `endless` (esta spec) vs el modo clásico de 3 steps. Ver R5 sobre coexistencia.

---

## Requirement 1 — Challenges ilimitados, ronda tras ronda

**User Story:** Como jugador, quiero seguir recibiendo incidentes nuevos mientras me alcance el tiempo, para que el juego no termine al resolver tres.

### Acceptance Criteria

1. WHEN el Coder resuelve el último step de un challenge en modo `endless` THE SYSTEM SHALL incrementar el número de ronda y cargar un challenge nuevo (generado por Bedrock, fallback al curado) en lugar de pasar a `victory`.
1b. WHEN se completa una ronda en modo `endless` THE SYSTEM SHALL NO mostrar la pantalla de "Nivel completado" (la UI de `victory`): pasa directo a la transición de la ronda siguiente. La pantalla de `victory` queda SOLO para el modo `classic`.
1c. THE SYSTEM SHALL mantener `status: 'victory'` y su pantalla intactos en modo `classic` (el comportamiento actual no cambia).
2. THE SYSTEM SHALL mantener el `status` en `playing` al pasar de una ronda a la siguiente, sin interrupción del juego.
3. THE SYSTEM SHALL conservar el número de ronda en la sesión (`round`, empezando en 1) y persistirlo en Valkey.
4. WHEN se carga la siguiente ronda THE SYSTEM SHALL reiniciar `currentStep` a 1 y `currentCode` al código del primer step del nuevo challenge.
5. THE SYSTEM SHALL generar el challenge de cada ronda con la dificultad que indique la spec `adaptive-difficulty` (este spec no define el escalado, solo expone el número de ronda).

## Requirement 2 — Reloj acumulativo

**User Story:** Como jugador, quiero que resolver rápido me dé más tiempo de juego, para que haya tensión real y recompensa por la velocidad.

### Acceptance Criteria

1. THE SYSTEM SHALL usar un único reloj (`remainingTime`) que persiste a través de todas las rondas de la partida.
2. THE SYSTEM SHALL inicializar el reloj en un tiempo base configurable (`ENDLESS_BASE_SECONDS`, default 120).
3. WHEN el Coder resuelve un challenge (todos sus steps) THE SYSTEM SHALL sumar al reloj un bono configurable (`ENDLESS_REWARD_SECONDS`, default 30).
4. WHEN el Coder responde incorrectamente THE SYSTEM SHALL restar `PENALTY_SECONDS` (10) del reloj **Y** quitar una vida al Coder (vía `loseLife`, spec `lives-system`), igual que en el modo clásico.
5. WHEN el reloj llega a 0 o menos THE SYSTEM SHALL pasar la sesión a `defeat` con `defeatReason: 'timeout'`.
6. WHEN un jugador se queda sin vidas THE SYSTEM SHALL pasar la sesión a `defeat` con `defeatReason: 'coder_lives'`/`'helper_lives'`, aunque el reloj no haya llegado a 0.
7. THE SYSTEM SHALL terminar la partida por la PRIMERA condición que se cumpla (reloj a 0 o vidas a 0). El `defeatReason` refleja la causa real.
8. THE SYSTEM SHALL nunca permitir un `remainingTime` negativo en la vista (clamp a 0).

## Requirement 3 — Puntaje del modo infinito

**User Story:** Como jugador competitivo, quiero un puntaje que refleje qué tan lejos llegué, para compararme en el leaderboard.

### Acceptance Criteria

1. THE SYSTEM SHALL calcular el puntaje como `(playedRounds × 1000) + segundos totales sobrevividos`.
2. THE SYSTEM SHALL incrementar `playedRounds` SOLO cuando se completa una ronda (todos sus steps resueltos), NO al cargar la ronda nueva. La ronda en curso al morir NO cuenta. (Distinto de `round`, que es el número de la ronda actual e incluye la que estás jugando.)
3. THE SYSTEM SHALL medir "segundos sobrevividos" como el tiempo real transcurrido desde el inicio de la partida hasta el game over.
4. THE SYSTEM SHALL exponer el puntaje y las rondas resueltas al game over, para consumo de la spec `leaderboard`.
5. THE SYSTEM SHALL implementar el cálculo del puntaje como una función pura y unit-testeada.

## Requirement 4 — Sincronización Coder/Helper en el loop

**User Story:** Como Helper, quiero seguir guiando al Coder ronda tras ronda, para que la cooperación no se rompa al cambiar de challenge.

### Acceptance Criteria

1. WHEN se carga una ronda nueva THE SYSTEM SHALL actualizar la guía del Helper (`getHelperGuide` / sync) al challenge nuevo, sin que el Helper tenga que recargar.
2. THE SYSTEM SHALL exponer el número de ronda actual tanto al Coder como al Helper.
3. THE SYSTEM SHALL mantener el contrato de sincronización vía Valkey sin romper el flujo actual de polling/SSE.

## Requirement 5 — Coexistencia con el modo clásico (no romper lo que anda)

**User Story:** Como mantenedor, quiero introducir el modo infinito sin romper el juego que ya funciona en producción.

### Acceptance Criteria

1. THE SYSTEM SHALL usar `endless` como modo por defecto (`mode` default `'endless'` en la sesión), dejando `classic` como modo seleccionable que NO queda roto.
2. THE SYSTEM SHALL conservar las vidas (spec `lives-system`) en AMBOS modos: en `classic` siguen como hoy; en `endless` operan junto al reloj acumulativo (ver R2). Implementar endless NO debe quitar las vidas del modo clásico.
3. THE SYSTEM SHALL mantener verdes los tests existentes que cubren `submitAnswer` y el flujo de partida; si cambia el comportamiento de fin de challenge, los tests se actualizan acompañando el cambio.
4. THE SYSTEM SHALL mantener intacto el contrato del `Challenge` (la forma de los datos de Bedrock no cambia).
5. THE SYSTEM SHALL respetar las reglas del proyecto: cero `any`, sin `as` casts (salvo `as const`/`satisfies`), TDD en la lógica de dominio nueva.

## Out of scope

- El escalado de dificultad por ronda → spec `adaptive-difficulty`.
- El registro y la vista del ranking → spec `leaderboard`.
- El feedback de recompensa al acertar (quitar toasts del jefe, confetti) → spec futura `victory-feedback`.
- Persistir partidas entre sesiones / historial del jugador.
