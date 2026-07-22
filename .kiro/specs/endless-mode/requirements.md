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
- **Game over**: el reloj llega a 0 → `status: 'defeat'`. Es el único fin del modo infinito (ya no hay `victory` de "completaste el juego").
- **Modo de juego**: `endless` (esta spec) vs el modo clásico de 3 steps. Ver R5 sobre coexistencia.

---

## Requirement 1 — Challenges ilimitados, ronda tras ronda

**User Story:** Como jugador, quiero seguir recibiendo incidentes nuevos mientras me alcance el tiempo, para que el juego no termine al resolver tres.

### Acceptance Criteria

1. WHEN el Coder resuelve el último step de un challenge THE SYSTEM SHALL incrementar el número de ronda y cargar un challenge nuevo (generado por Bedrock, fallback al curado) en lugar de pasar a `victory`.
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
4. WHEN el Coder responde incorrectamente THE SYSTEM SHALL restar `PENALTY_SECONDS` (10) del reloj, igual que hoy.
5. WHEN el reloj llega a 0 o menos THE SYSTEM SHALL pasar la sesión a `defeat` (game over) y detener el juego.
6. THE SYSTEM SHALL nunca permitir un `remainingTime` negativo en la vista (clamp a 0).

## Requirement 3 — Puntaje del modo infinito

**User Story:** Como jugador competitivo, quiero un puntaje que refleje qué tan lejos llegué, para compararme en el leaderboard.

### Acceptance Criteria

1. THE SYSTEM SHALL calcular el puntaje como `(rondas resueltas × 1000) + segundos totales sobrevividos`.
2. THE SYSTEM SHALL contar como "rondas resueltas" la cantidad de challenges completados (no la ronda en curso al morir).
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

1. THE SYSTEM SHALL introducir el modo infinito como el modo por defecto del juego, O como un modo seleccionable, según se decida en `design.md` — sin dejar el modo clásico en un estado roto.
2. THE SYSTEM SHALL mantener verdes los tests existentes que cubren `submitAnswer` y el flujo de partida; si cambia el comportamiento de fin de challenge, los tests se actualizan acompañando el cambio.
3. THE SYSTEM SHALL mantener intacto el contrato del `Challenge` (la forma de los datos de Bedrock no cambia).
4. THE SYSTEM SHALL respetar las reglas del proyecto: cero `any`, sin `as` casts (salvo `as const`/`satisfies`), TDD en la lógica de dominio nueva.

## Out of scope

- El escalado de dificultad por ronda → spec `adaptive-difficulty`.
- El registro y la vista del ranking → spec `leaderboard`.
- El feedback de recompensa al acertar (quitar toasts del jefe, confetti) → spec futura `victory-feedback`.
- Persistir partidas entre sesiones / historial del jugador.
