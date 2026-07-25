# Implementation Plan: Onboarding Tutorial

## Overview

Este plan implementa el sistema de tutorial interactivo modal que presenta las mecánicas asimétricas del juego a nuevos jugadores. La implementación sigue el enfoque TDD (Test-Driven Development) para lógica pura, con arquitectura atomic design y zero dependencias externas.

**Stack técnico:**
- Next.js 16 + React 19 (App Router, Server/Client Components)
- TypeScript strict mode (cero `any`)
- Tailwind CSS 4
- Vitest 4 para testing
- localStorage nativo para persistencia

**Estrategia de implementación:**
1. **Bottom-up con TDD**: Lógica pura (storage, types) → hook → componentes atómicos → moleculares → organismo
2. **Tests primero**: Unit tests para storage y hook antes de implementación
3. **Accessibility integrado**: ARIA, keyboard nav, focus trap se implementan durante desarrollo, no como afterthought
4. **Incremental**: Cada task es funcional e integrable de forma independiente

## Tasks

- [x] 1. Setup de estructura y tipos base
  - Crear estructura de directorios en `src/features/onboarding/`
  - Definir interfaces TypeScript en `onboarding-types.ts`
  - Crear constantes (`ONBOARDING_VERSION = 1`, `TOTAL_SLIDES = 5`)
  - Exportar tipos: `OnboardingSlide`, `OnboardingState`, `OnboardingHookState`, `UseOnboardingReturn`
  - _Requirements: 18.1, 18.2, 20.1, 20.2, 20.3, 20.4, 20.5_

- [x] 2. Implementar storage layer con TDD
  - [x] 2.1 Escribir tests para onboarding-storage.ts
    - Test: `readOnboardingState()` retorna `null` si key no existe
    - Test: `readOnboardingState()` retorna `null` si JSON corrupto
    - Test: `readOnboardingState()` retorna estado válido
    - Test: `hasSeenOnboarding()` retorna `false` si versión antigua
    - Test: `hasSeenOnboarding()` retorna `true` si versión actual completada
    - Test: `markOnboardingAsSeen()` escribe estructura correcta
    - Test: `resetOnboarding()` limpia localStorage
    - Verificar SSR safety (`typeof window === 'undefined'`)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 2.2 Implementar onboarding-storage.ts
    - Implementar `readOnboardingState()` con validación de estructura
    - Implementar `hasSeenOnboarding()` con check de versión
    - Implementar `markOnboardingAsSeen()` con manejo de errores (try/catch)
    - Implementar `resetOnboarding()` para testing
    - Manejar edge cases: localStorage full, disabled, corrupted JSON
    - Todos los tests deben pasar
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 22.1, 22.2_

- [x] 3. Implementar useOnboarding hook con TDD
  - [x]* 3.1 Escribir tests para useOnboarding.ts
    - Test: auto-abre en primera visita
    - Test: NO auto-abre si tutorial completado
    - Test: `canSkip` es `false` en slide 1
    - Test: `canSkip` es `true` en slides 2-5
    - Test: `nextSlide()` avanza hasta máximo 5 (clamping)
    - Test: `prevSlide()` no baja de 1 (clamping)
    - Test: `closeTutorial()` escribe localStorage y cierra modal
    - Test: `openTutorial()` resetea a slide 1
    - Usar `@testing-library/react` con `renderHook`
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 19.1, 19.2, 19.3, 19.4, 19.5, 19.6_

  - [x] 3.2 Implementar useOnboarding.ts
    - Estado interno: `isOpen`, `currentSlide`
    - `useEffect` para check de primera visita en mount
    - `openTutorial`, `closeTutorial`, `nextSlide`, `prevSlide` con `useCallback`
    - Computed property: `canSkip = currentSlide > 1`
    - Math.min/max para slide bounds
    - Retornar `UseOnboardingReturn` interface
    - Todos los tests deben pasar
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 19.1, 19.2, 19.3, 19.4, 19.5, 19.6_

- [x] 4. Checkpoint — Verificar capa de lógica pura
  - Ejecutar `pnpm run test` — storage y hook tests deben pasar
  - Verificar coverage de edge cases (localStorage disabled, corrupted, versión antigua)
  - Revisar tipos TypeScript — cero `any`, strict mode
  - Confirmar que toda la lógica de estado está encapsulada en el hook

- [x] 5. Crear contenido estático de los slides
  - [x] 5.1 Implementar onboarding-content.ts con los 5 slides
    - Slide 1: "💥 Regla de Oro" (Golden Rule, no omitible)
    - Slide 2: "👨‍💻 Rol: Coder" (con screenshot `/onboarding/coder_screen.png`)
    - Slide 3: "🗣️ Rol: Helper" (con screenshot `/onboarding/helper_screen.png` y `helper_blocking_question.png`)
    - Slide 4: "⏱️ Coordinación" (comunicación verbal obligatoria)
    - Slide 5: "🎯 Victoria y Derrota" (con screenshot `/onboarding/screen_failure_endgame.png`)
    - Usar JSX con clases Tailwind (`text-red-500`, `text-emerald-400`, `text-amber-400`, `text-zinc-300`)
    - Exportar como `readonly OnboardingSlide[]` con `as const`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1-7.5, 8.1-8.6, 9.1-9.5, 10.1-10.6, 11.1-11.5, 12.1-12.5, 21.1-21.5_

- [x] 6. Implementar componentes atómicos (atoms)
  - [x] 6.1 Crear NavigationButton.tsx
    - Props: `variant` ("primary" | "secondary" | "ghost"), `onClick`, `children`, `aria-label`
    - Usar `forwardRef` para focus management
    - Estilos Tailwind según variant (primary: bg-red-500, secondary: bg-zinc-800, ghost: text-zinc-400)
    - Accesibilidad: `aria-label` opcional
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 12.1-12.5_

  - [x] 6.2 Crear TutorialTriggerButton.tsx
    - Texto: "📖 Cómo Jugar"
    - Props: `onClick`
    - Posicionamiento: NO incluir `fixed` (se maneja en Landing)
    - Estilos: botón secundario con hover, `aria-label="Abrir tutorial del juego"`
    - _Requirements: 2.1, 2.2, 2.3, 16.4_

- [x] 7. Implementar componentes moleculares (molecules)
  - [x] 7.1 Crear OnboardingProgress.tsx
    - Props: `current`, `total`
    - Renderizar indicador "N/5" (e.g., "1/5", "2/5")
    - Estilos: text-zinc-400, text-sm
    - _Requirements: 3.1_

  - [x] 7.2 Crear OnboardingSlide.tsx
    - Props: `slide` (tipo `OnboardingSlide`)
    - Renderizar heading con `id="onboarding-heading"`
    - Renderizar content con `id="onboarding-content"`
    - Renderizar screenshot si existe usando `next/image`
    - `priority={slide.id <= 2}` para preload de slides 1-2
    - Handler `onError` para fallback a placeholder SVG
    - Alt text desde `slide.screenshotAlt` o default
    - _Requirements: 17.1-17.7_

- [x] 8. Implementar OnboardingModal (organism) — Primera iteración sin focus trap
  - [x] 8.1 Estructura básica del modal
    - Props: `hookState` (tipo `UseOnboardingReturn`)
    - Conditional render: retornar `null` si `!isOpen`
    - Backdrop: `fixed inset-0 bg-black/80` con handler de clic condicional (`canSkip`)
    - Container: `max-w-3xl bg-[#0a0a0b] border border-zinc-800 rounded-lg`
    - ARIA: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="onboarding-heading"`
    - _Requirements: 1.4, 4.1, 4.2, 4.3, 4.4, 5.3, 5.4, 16.1, 16.2, 16.3_

  - [x] 8.2 Integrar componentes hijos
    - Header: `OnboardingProgress` + botón de cerrar (solo si `canSkip`)
    - Body: `OnboardingSlide` con slide actual
    - Footer: navegación con `NavigationButton` (Anterior, Siguiente/¡Entendido!, Saltar)
    - Lógica de visibilidad: Anterior solo si `currentSlide > 1`, Saltar solo si `canSkip`
    - Botón "¡Entendido!" en slide 5 en lugar de "Siguiente →"
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 5.1, 5.2, 23.1, 23.2_

  - [x] 8.3 Implementar navegación por teclado
    - `useEffect` con event listener en `document` para `keydown`
    - Escape: cerrar si `canSkip` (ignorar en slide 1)
    - ArrowRight: `nextSlide()` si `currentSlide < totalSlides`
    - ArrowLeft: `prevSlide()` si `currentSlide > 1`
    - Cleanup en return del `useEffect`
    - _Requirements: 4.1, 4.2, 4.3, 14.1, 14.2, 14.3, 14.4, 14.5, 23.3_

- [x] 9. Implementar focus trap y refinamiento de accesibilidad
  - [x] 9.1 Agregar focus trap al OnboardingModal
    - Ref `modalRef` para container, `firstFocusableRef` para primer botón
    - `useEffect` para focus inicial en apertura
    - Helper `getFocusableElements()` con selector de elementos focusables
    - Handler `handleTabKey()` para ciclar foco (Tab forward, Shift+Tab backward)
    - Restore focus al `TutorialTriggerButton` al cerrar
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 9.2 Completar ARIA labels
    - Botón cerrar: `aria-label="Cerrar tutorial"`
    - Botón skip: `aria-label="Saltar el tutorial y cerrar"`
    - Botón anterior: `aria-label="Slide anterior"`
    - Botón siguiente: `aria-label="Siguiente slide"`
    - Modal: `aria-describedby="onboarding-content"`
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

- [x] 10. Integrar con Landing Page (app/page.tsx)
  - [x] 10.1 Modificar app/page.tsx
    - Importar `useOnboarding`, `OnboardingModal`, `TutorialTriggerButton`
    - Agregar 'use client' directive
    - Instanciar hook: `const onboardingState = useOnboarding()`
    - Renderizar `TutorialTriggerButton` en posición `fixed bottom-6 right-6 z-40`
    - Renderizar `OnboardingModal` con `hookState={onboardingState}`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 11. Checkpoint — Testing de integración manual
  - Verificar auto-apertura en primera visita (limpiar localStorage antes de probar)
  - Verificar que Slide 1 NO se puede saltar (Esc/backdrop/close button ausentes)
  - Verificar que Slides 2-5 permiten skip (Esc, backdrop click, botón skip)
  - Verificar navegación con teclado (flechas, Tab, Shift+Tab, Enter)
  - Verificar que completar tutorial persiste en localStorage
  - Verificar que reabrir manual funciona con `TutorialTriggerButton`

- [ ] 12. Tests de componentes React
  - [ ]* 12.1 Escribir tests para OnboardingModal.test.tsx
    - Test: no renderiza si `isOpen = false`
    - Test: renderiza heading de slide 1
    - Test: NO renderiza skip button en slide 1
    - Test: NO renderiza close button en slide 1
    - Test: ignora Escape en slide 1
    - Test: renderiza skip button en slide 2+
    - Test: llama `closeTutorial` en Escape cuando `canSkip`
    - Test: llama `nextSlide` en ArrowRight
    - Test: llama `closeTutorial` en backdrop click cuando `canSkip`
    - Usar `@testing-library/react` con `render`, `screen`, `fireEvent`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1-3.7, 4.1-4.5, 5.1-5.5, 23.1-23.5_

  - [ ]* 12.2 Escribir tests de accesibilidad con jest-axe
    - Test: no violations con `axe(container)` en slide 1
    - Test: modal tiene `role="dialog"` y `aria-modal="true"`
    - Test: modal tiene `aria-labelledby` apuntando a heading
    - Test: foco inicial en primer elemento interactivo
    - Setup: `expect.extend(toHaveNoViolations)`
    - _Requirements: 16.1, 16.2, 16.3, 16.5_

- [ ] 13. Crear assets visuales
  - [ ] 13.1 Preparar screenshots en public/onboarding/
    - Capturar `coder_screen.png` (pantalla del Coder con código y opciones)
    - Capturar `helper_screen.png` (pantalla del Helper con guía)
    - Capturar `helper_blocking_question.png` (modal de consulta del cliente)
    - Capturar `screen_failure_endgame.png` (pantalla de Game Over)
    - Optimizar imágenes: WebP/PNG, max 1200px width
    - _Requirements: 17.1, 17.2, 17.3, 17.4_

  - [x] 13.2 Crear placeholder SVG
    - Crear `public/placeholder-screenshot.svg`
    - SVG con texto "Screenshot no disponible" en zinc-400
    - Dimensiones: 1200x675 viewBox
    - _Requirements: 17.6_

- [x] 14. Refinamiento visual y animaciones
  - [x] 14.1 Agregar animación de fade-in al modal
    - Definir keyframe `fadeIn` (opacity 0→1, scale 0.95→1)
    - Aplicar animación al container: `animate-in fade-in duration-200`
    - Usar Tailwind animate utilities si disponibles, o CSS custom
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 14.2 Verificar paleta de colores consistente
    - Background modal: `bg-[#0a0a0b]`
    - Borders: `border-zinc-800`
    - Text: `text-zinc-100` (headings), `text-zinc-300` (body), `text-zinc-400` (muted)
    - Accent: `text-red-500` (alerts), `text-emerald-400` (success), `text-amber-400` (info)
    - Backdrop: `bg-black/80`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ] 15. Checkpoint — Testing final y linting
  - Ejecutar suite completa: `pnpm run test`
  - Verificar coverage: storage, hook, modal tests pasan
  - Ejecutar `pnpm run lint` — cero warnings (CI usa `--max-warnings 0`)
  - Verificar TypeScript: `pnpm run build` sin errores de tipos
  - Testing manual de accesibilidad: screen reader (NVDA/VoiceOver) en slide 1

- [ ] 16. Testing de edge cases y robustez
  - [ ] 16.1 Probar edge cases de localStorage
    - localStorage deshabilitado (Privacy Mode)
    - localStorage full (llenar manualmente)
    - JSON corrupto en key (escribir string inválido)
    - Versión antigua (escribir version: 0, verificar re-show)
    - _Requirements: 13.3, 13.4_

  - [ ] 16.2 Probar fallos de carga de imágenes
    - Renombrar screenshot temporalmente → verificar fallback a placeholder
    - Verificar alt text en DevTools
    - Network throttling: Fast 3G → verificar lazy loading de slides 3-5
    - _Requirements: 17.6, 17.7_

  - [ ] 16.3 Probar navegación con solo teclado
    - Navegar todo el tutorial sin mouse
    - Verificar focus visible en todos los botones
    - Verificar Tab trap funciona (no escapa a Landing)
    - Verificar flechas avanzan/retroceden slides
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 15.1-15.5_

- [ ] 17. Documentación y deployment readiness
  - [ ] 17.1 Agregar comentarios JSDoc en exports públicos
    - Documentar `useOnboarding` return type
    - Documentar funciones de storage (params, returns, edge cases)
    - Documentar props de componentes principales
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7_

  - [ ] 17.2 Actualizar README o docs del proyecto
    - Agregar sección "Onboarding Tutorial" con descripción
    - Documentar cómo incrementar versión (ONBOARDING_VERSION)
    - Documentar ubicación de screenshots
    - Listar comandos para testing (`pnpm run test src/features/onboarding`)

- [ ] 18. Checkpoint final — Pre-deployment verification
  - Build de producción: `pnpm run build && pnpm run start`
  - Verificar en build que modal funciona en primera visita
  - Verificar que screenshots se optimizan correctamente (Next.js Image)
  - Verificar bundle size: `pnpm run build` → revisar output (debe ser liviano, sin deps extras)
  - Playtest con 2-3 usuarios: timing (30-45s), claridad del contenido, tone
  - Confirmar que todos los tests pasan en CI

## Notes

- **Tasks marcadas con `*`**: Subtareas opcionales (tests) que pueden saltarse para MVP rápido, pero **altamente recomendadas** para mantener calidad
- **TDD approach**: Tests se escriben ANTES de implementar storage y hook (tareas 2.1 antes de 2.2, 3.1 antes de 3.2)
- **Dependencies críticas**: Storage → Hook → Componentes. El hook depende del storage, el modal depende del hook
- **Testing incremental**: Checkpoints cada 4-6 tareas para validar que todo funciona antes de continuar
- **Accessibility no es afterthought**: ARIA y keyboard nav se implementan durante desarrollo del modal, no al final
- **Zero dependencias externas**: Proyecto usa solo React hooks + localStorage nativo, sin librerías adicionales
- **Cada task referencia requirements específicos** para trazabilidad y validación

## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": ["1"]
    },
    {
      "id": 1,
      "tasks": ["2.1"]
    },
    {
      "id": 2,
      "tasks": ["2.2"]
    },
    {
      "id": 3,
      "tasks": ["3.1"]
    },
    {
      "id": 4,
      "tasks": ["3.2"]
    },
    {
      "id": 5,
      "tasks": ["5.1", "6.1", "6.2"]
    },
    {
      "id": 6,
      "tasks": ["7.1", "7.2"]
    },
    {
      "id": 7,
      "tasks": ["8.1"]
    },
    {
      "id": 8,
      "tasks": ["8.2"]
    },
    {
      "id": 9,
      "tasks": ["8.3"]
    },
    {
      "id": 10,
      "tasks": ["9.1", "9.2"]
    },
    {
      "id": 11,
      "tasks": ["10.1"]
    },
    {
      "id": 12,
      "tasks": ["12.1", "12.2", "13.1", "13.2"]
    },
    {
      "id": 13,
      "tasks": ["14.1", "14.2"]
    },
    {
      "id": 14,
      "tasks": ["16.1", "16.2", "16.3"]
    },
    {
      "id": 15,
      "tasks": ["17.1", "17.2"]
    }
  ]
}
```
