# Requirements — Sistema de vidas (lives-system)

> **Spec retroactiva.** Documenta lo implementado por Moises en los PRs #40/#41 (2026-06-27). El código ya existe y está en producción; esta spec describe lo que hay, no lo que falta.

## Introduction

Hasta ahora la única forma de perder era que el reloj llegara a cero (`defeat` por timeout). Esta feature agrega **vidas**: cada jugador tiene un número de intentos; errar consume una vida; al quedarse sin vidas, la partida termina (`defeat`). Le suma tensión y consecuencia a cada respuesta, más allá del reloj.

Es parte del reenfoque del juego que impulsó Moises (el PO): que las acciones tengan peso real, no solo "metan código".

### Contexto verificado (código real al 2026-06-27)

- `MAX_LIVES = 3` (constants.ts).
- `lives-engine.ts`: lógica pura — `createInitialLives()`, `normalizeSessionLives()`, `loseLife(session, role)`, `getLivesForRole()`.
- `GameSession` lleva `coderLives: number`, `helperLives: number`, `defeatReason?: DefeatReason`.
- `DefeatReason = 'timeout' | 'coder_lives' | 'helper_lives'` (game-types.ts).
- El Coder pierde vida al errar un diagnóstico (game-engine.ts:197, dentro de `submitAnswer`).
- El Helper pierde vida al fallar una consulta del cliente (client-question-engine.ts:171).
- `defeat-messages.ts`: mensajes de derrota distintos por rol y por razón.
- `LivesIndicator.tsx`: componente visual de las vidas (con `pulse` al perder una).
- `AnswerResponse` / `ClientQuestionAnswerResponse` exponen `livesRemaining?` y `lifeLost?`.

## Glossary

- **Vida**: un intento. Cada jugador arranca con `MAX_LIVES` (3).
- **Pérdida de vida**: errar consume una vida del jugador que erró.
- **Razón de derrota (`DefeatReason`)**: por qué terminó la partida — `timeout` (reloj a 0), `coder_lives` (Coder sin vidas), `helper_lives` (Helper sin vidas).

## Requirements

### R1 — Modelo de vidas

- R1.1 THE SYSTEM SHALL inicializar cada sesión con `coderLives = helperLives = MAX_LIVES`.
- R1.2 THE SYSTEM SHALL persistir las vidas en la sesión (Valkey) junto al resto del estado.
- R1.3 WHEN una sesión vieja no tiene campos de vidas, THE SYSTEM SHALL normalizarla a `MAX_LIVES` al leerla (`normalizeSessionLives`), sin romper sesiones previas.

### R2 — Pérdida de vida del Coder

- R2.1 WHEN el Coder envía un diagnóstico incorrecto y la sesión está `playing`, THE SYSTEM SHALL restar 1 vida al Coder.
- R2.2 WHEN las vidas del Coder llegan a 0, THE SYSTEM SHALL marcar `status: 'defeat'` con `defeatReason: 'coder_lives'`.
- R2.3 THE SYSTEM SHALL exponer `livesRemaining` y `lifeLost` en `AnswerResponse` para que la UI reaccione.

### R3 — Pérdida de vida del Helper

- R3.1 WHEN el Helper falla una consulta del cliente y la sesión está `playing`, THE SYSTEM SHALL restar 1 vida al Helper.
- R3.2 WHEN las vidas del Helper llegan a 0, THE SYSTEM SHALL marcar `status: 'defeat'` con `defeatReason: 'helper_lives'`.
- R3.3 THE SYSTEM SHALL exponer `livesRemaining` y `lifeLost` en `ClientQuestionAnswerResponse`.

### R4 — Reglas de la mecánica

- R4.1 THE SYSTEM SHALL aplicar la pérdida de vida SOLO en estado `playing` (no en idle/victory/defeat/abandoned).
- R4.2 THE SYSTEM SHALL conservar la primera `defeatReason` si ya estaba marcada (no pisarla).
- R4.3 La lógica de vidas vive en `lives-engine.ts` como funciones PURAS; el I/O/persistencia queda en el servicio.

### R5 — UI

- R5.1 THE SYSTEM SHALL mostrar las vidas de cada jugador (`LivesIndicator`) en el tablero del Coder y del Helper.
- R5.2 WHEN un jugador pierde una vida, THE SYSTEM SHALL dar feedback visual (pulse).
- R5.3 THE SYSTEM SHALL mostrar en la pantalla de derrota el mensaje correspondiente a la `defeatReason` y al rol (`defeat-messages.ts`).

### R6 — Coexistencia con el reloj

- R6.1 THE SYSTEM SHALL mantener el `defeat` por `timeout` (reloj a 0) funcionando en paralelo a la derrota por vidas.
- R6.2 **NOTA DE DISEÑO (pendiente de decisión con `endless-mode`):** hoy conviven dos condiciones de game over — reloj a 0 y vidas a 0. Cuando se implemente `endless-mode` (reloj acumulativo), hay que decidir cómo interactúan vidas + reloj. Ver `endless-mode` R2.
