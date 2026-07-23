# Tasks — Sistema de vidas (lives-system)

> **Spec retroactiva.** Todo IMPLEMENTADO por Moises (PRs #40/#41, 2026-06-27) y en producción. Marcado como terminado para reflejar la realidad del código.

## 1. Modelo y lógica pura

- [x] 1.1 `MAX_LIVES = 3` en `constants.ts`. (R1.1)
- [x] 1.2 `lives-engine.ts`: `createInitialLives`, `normalizeSessionLives`, `loseLife`, `getLivesForRole` (puras). (R4.3)
- [x] 1.3 `GameSession`: `coderLives`, `helperLives`, `defeatReason?` + `DefeatReason` en game-types.ts. (R1.1, R1.2)
- [x] 1.4 `normalizeSessionLives` al leer la sesión en game-service.ts (retrocompat). (R1.3)
- [x] 1.5 Tests de `lives-engine` (`lives-engine.test.ts`). (R4)

## 2. Mecánica del Coder

- [x] 2.1 `loseLife(session, 'coder')` al errar diagnóstico en `submitAnswer` (game-engine.ts). (R2.1)
- [x] 2.2 A 0 vidas → `defeat` con `defeatReason: 'coder_lives'`. (R2.2)
- [x] 2.3 `AnswerResponse` expone `livesRemaining` + `lifeLost`. (R2.3)

## 3. Mecánica del Helper

- [x] 3.1 `loseLife(session, 'helper')` al fallar consulta del cliente (client-question-engine.ts). (R3.1)
- [x] 3.2 A 0 vidas → `defeat` con `defeatReason: 'helper_lives'`. (R3.2)
- [x] 3.3 `ClientQuestionAnswerResponse` expone `livesRemaining` + `lifeLost`. (R3.3)

## 4. Reglas de la mecánica

- [x] 4.1 Pérdida de vida solo en `playing`. (R4.1)
- [x] 4.2 No pisar una `defeatReason` previa. (R4.2)

## 5. UI

- [x] 5.1 `LivesIndicator.tsx` en los tableros del Coder y del Helper. (R5.1)
- [x] 5.2 Pulse al perder una vida. (R5.2)
- [x] 5.3 `defeat-messages.ts`: mensaje por (rol × razón) en la pantalla de derrota. (R5.3)

## 6. Coexistencia

- [x] 6.1 `defeat` por `timeout` sigue funcionando junto a la derrota por vidas. (R6.1)

## Decisión de producto (RESUELTA)

- [x] Interacción vidas + reloj en `endless-mode`: **DECIDIDO (2026-06-27)** — conviven. En endless, errar resta tiempo Y una vida; la partida termina por lo que llegue primero a 0 (reloj → `timeout`, vidas → `coder_lives`/`helper_lives`). Implementación: en la spec `endless-mode` (R2.4/R2.6/R2.7, tasks 2.2b/2.4).

## Notas

- Feature completa y en producción. La decisión de coexistencia con endless-mode quedó resuelta y trasladada a esa spec.
