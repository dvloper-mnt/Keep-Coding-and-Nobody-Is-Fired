# Design — Pulido de UI (ui-polish)

> Spec retroactiva — describe la implementación existente (PRs #40/#41, 2026-06-27).

## Revelado del código (typewriter)

Separación lógica pura / UI, como el resto del proyecto:

- **`code-reveal.ts` (puro):**
  - `getCodeRevealSegments(prev, next)`: compara línea por línea, encuentra la primera línea que difiere, y parte el código en `{ stable, animated }`. Lo estable no se reanima (evita re-escribir todo el bloque); solo se revela lo nuevo.
  - `getRevealCharIntervalMs(len)`: `min(24, max(2, round(2000/len)))` → ~2s de duración, acotado para legibilidad.
- **`useCodeStepReveal.ts` (hook):** orquesta la animación con un timer sobre el segmento animado, expone progreso y un flag `isRevealing`.
- **`TypewriterCodePanel.tsx`:** renderiza estable + animado; vía `onRevealingChange(true|false)` le avisa al `CoderBoard` para deshabilitar los botones de diagnóstico mientras revela (R1.3).

Por qué solo animar el diff: al avanzar de step, gran parte del código se repite. Reanimar todo sería lento y molesto; revelar solo lo que cambió hace foco en el fix.

## Diálogo de confirmación

- **`ConfirmDialog.tsx`:** componente reusable (overlay + título + mensaje + confirmar/cancelar). Accesible (foco, escape).
- **`ExitButton.tsx`:** envuelve la acción de abandono en `ConfirmDialog` — abandonar es destructivo (termina la partida del otro jugador), así que se confirma.

## Mensajes de derrota

`defeat-messages.ts`: tabla (rol × `DefeatReason`) → `{ title, message }`. Compartido con `lives-system` (la pantalla de derrota es la misma; cambia el copy según cómo y quién perdió).

## Qué NO cubre

- Sonido del typewriter (hay `useClockTickSound` para el reloj, no para el código).
- Animación de victoria (fuera de scope).
