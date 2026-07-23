# Requirements — Pulido de UI (ui-polish)

> **Spec retroactiva.** Documenta mejoras de UI implementadas por Moises (PRs #40/#41, 2026-06-27), ya en producción.

## Introduction

Conjunto de mejoras de experiencia que acompañan al sistema de vidas: el código corregido se **revela con efecto máquina de escribir** (refuerza el "esto está pasando en vivo"), un **diálogo de confirmación** para acciones destructivas (abandonar), y mensajes de derrota específicos. Pulido de la sensación del juego, sin cambiar reglas.

### Contexto verificado (código real al 2026-06-27)

- `code-reveal.ts` (puro + test): `getCodeRevealSegments(prev, next)` separa el código en parte estable + parte a animar (diff por línea); `getRevealCharIntervalMs(len)` calcula el intervalo por carácter (target ~2s, clamp 2–24ms).
- `useCodeStepReveal.ts`: hook que maneja la animación de revelado.
- `TypewriterCodePanel.tsx`: panel que renderiza el código revelándose; expone `onRevealingChange` (mientras revela, deshabilita los botones de respuesta para que no se conteste antes de ver el código).
- `ConfirmDialog.tsx`: diálogo de confirmación reusable.
- `ExitButton.tsx`: usa `ConfirmDialog` para confirmar el abandono.
- `defeat-messages.ts`: copys de derrota por rol × razón (compartido con lives-system).

## Glossary

- **Revelado (reveal)**: animación que muestra el código nuevo carácter por carácter desde la primera línea que cambió respecto al código anterior.
- **Segmento estable / animado**: el código que ya estaba (no se reanima) vs el que cambió (se revela).

## Requirements

### R1 — Revelado del código (typewriter)

- R1.1 WHEN el código de un step cambia (al avanzar de step o al corregir), THE SYSTEM SHALL revelar SOLO la parte que cambió, manteniendo estable lo que ya estaba. (`getCodeRevealSegments`)
- R1.2 THE SYSTEM SHALL ajustar la velocidad para un revelado de ~2s, con un intervalo por carácter acotado (2–24ms) para que patches largos sigan legibles. (`getRevealCharIntervalMs`)
- R1.3 WHILE el código se está revelando, THE SYSTEM SHALL deshabilitar los botones de diagnóstico (no responder antes de ver el código completo). (`onRevealingChange`)
- R1.4 La lógica del diff/velocidad vive en `code-reveal.ts` como funciones PURAS (testeable sin render).

### R2 — Diálogo de confirmación

- R2.1 WHEN el jugador intenta abandonar la partida, THE SYSTEM SHALL pedir confirmación con un `ConfirmDialog` antes de ejecutar. (`ExitButton`)
- R2.2 THE `ConfirmDialog` SHALL ser reusable (título, mensaje, confirmar/cancelar).

### R3 — Mensajes de derrota

- R3.1 THE SYSTEM SHALL mostrar un mensaje de derrota específico según rol × `DefeatReason` (`defeat-messages.ts`). (Compartido con `lives-system`.)

### R4 — Calidad

- R4.1 La lógica pura (`code-reveal.ts`) tiene tests (`code-reveal.test.ts`).
- R4.2 `pnpm run test` verde, `tsc --noEmit` 0, `pnpm run lint` 0.
