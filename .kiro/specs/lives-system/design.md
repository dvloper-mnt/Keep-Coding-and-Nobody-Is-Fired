# Design — Sistema de vidas (lives-system)

> Spec retroactiva — describe la implementación existente (PRs #40/#41, 2026-06-27).

## Visión general

Vidas como funciones puras sobre `GameSession`, enganchadas en los dos puntos donde un jugador puede errar: el diagnóstico del Coder y la consulta del cliente del Helper.

```
game-engine.submitAnswer (Coder erra) ──┐
                                         ├──> loseLife(session, role) [PURO] ──> defeat si llega a 0
client-question-engine (Helper falla) ──┘
                                              │
lives-engine.ts (PURO) ── createInitialLives / normalizeSessionLives / loseLife / getLivesForRole
                                              │
game-types: GameSession.{coderLives, helperLives, defeatReason}
                                              │
UI: LivesIndicator (Coder/Helper boards) + defeat-messages (pantalla de derrota)
```

## Decisión 1 — Lógica pura en `lives-engine.ts`

Coherente con la arquitectura del proyecto (engine puro, sin I/O):
- `createInitialLives()` → `{ coderLives: MAX_LIVES, helperLives: MAX_LIVES }`.
- `loseLife(session, role)`: solo actúa si `status === 'playing'`; resta 1 (clamp a 0); si llega a 0, marca `defeat` + `defeatReason` (conservando una razón previa si existía).
- `normalizeSessionLives(session)`: rellena vidas faltantes con `MAX_LIVES` al leer — retrocompatibilidad con sesiones creadas antes de la feature.
- `getLivesForRole(session, role)`: lectura con default.

## Decisión 2 — Enganche en los dos puntos de error

- **Coder**: en `game-engine.submitAnswer`, cuando el diagnóstico es incorrecto, se aplica `loseLife(session, 'coder')`.
- **Helper**: en `client-question-engine`, cuando falla la consulta del cliente, `loseLife(session, 'helper')`.
- Ambos devuelven la sesión nueva; la respuesta de API expone `livesRemaining` + `lifeLost`.

## Decisión 3 — `DefeatReason` para mensajes específicos

`DefeatReason = 'timeout' | 'coder_lives' | 'helper_lives'`. `defeat-messages.ts` mapea (rol × razón) → `{ title, message }`, así la pantalla de derrota dice algo específico ("Sin vidas" vs "Se acabó el tiempo") según cómo perdiste y quién sos.

## Decisión 4 — UI

- `LivesIndicator.tsx` (atom): renderiza las vidas (corazones/iconos) con prop `pulse` para animar la pérdida.
- Integrado en `CoderBoard` y `HelperBoard`.
- La vista del Coder (`CoderStepView`) y la sync del Helper (`HelperSyncView`) llevan `coderLives`/`helperLives` y `defeatReason`.

## Riesgo conocido — choque con endless-mode

Hoy hay **dos condiciones de game over** sin coordinar: reloj a 0 (`timeout`) y vidas a 0 (`coder_lives`/`helper_lives`). `endless-mode` introduce un **reloj acumulativo** como mecánica central de supervivencia. Antes de implementar endless-mode hay que decidir:
- ¿Las vidas conviven con el reloj acumulativo (perdés por lo que pase primero)?
- ¿O endless-mode usa solo reloj y las vidas quedan para el modo clásico?

Decisión de producto (Moises) pendiente. Documentado en `endless-mode` y en R6.2 de esta spec.

## Qué NO cubre esta feature

- Recuperar vidas (no hay forma de ganar vidas).
- Vidas configurables por dificultad (es fijo en `MAX_LIVES = 3`).
