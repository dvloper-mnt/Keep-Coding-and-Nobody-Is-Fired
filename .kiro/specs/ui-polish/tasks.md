# Tasks — Pulido de UI (ui-polish)

> **Spec retroactiva.** Todo IMPLEMENTADO por Moises (PRs #40/#41, 2026-06-27) y en producción. Marcado terminado para reflejar el código real.

## 1. Revelado del código (typewriter)

- [x] 1.1 `code-reveal.ts` (puro): `getCodeRevealSegments(prev, next)` separa estable/animado por diff de líneas. (R1.1, R1.4)
- [x] 1.2 `getRevealCharIntervalMs(len)`: intervalo por carácter ~2s, clamp 2–24ms. (R1.2)
- [x] 1.3 `useCodeStepReveal.ts`: hook que anima el segmento nuevo. (R1.1)
- [x] 1.4 `TypewriterCodePanel.tsx`: render estable + animado. (R1.1)
- [x] 1.5 `onRevealingChange` deshabilita los botones de diagnóstico mientras revela (CoderBoard). (R1.3)
- [x] 1.6 Tests de `code-reveal` (`code-reveal.test.ts`). (R4.1)

## 2. Diálogo de confirmación

- [x] 2.1 `ConfirmDialog.tsx` reusable. (R2.2)
- [x] 2.2 `ExitButton.tsx` confirma el abandono con `ConfirmDialog`. (R2.1)

## 3. Mensajes de derrota

- [x] 3.1 `defeat-messages.ts`: copy por rol × `DefeatReason`. (R3.1)

## 4. Calidad

- [x] 4.1 Tests verdes, tsc 0, lint 0 (verificado en los PRs #40/#41). (R4.2)

## Notas

- Feature de UI completa y en producción. `defeat-messages.ts` se comparte con `lives-system`.
