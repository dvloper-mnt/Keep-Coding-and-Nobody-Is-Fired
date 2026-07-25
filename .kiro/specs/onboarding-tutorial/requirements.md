# Requirements Document

## Introduction

El **Onboarding Tutorial** es un sistema de introducción interactiva que educa a nuevos jugadores sobre las mecánicas asimétricas y reglas de cooperación de "Keep Coding and Nobody Is Fired". El tutorial presenta la Golden Rule (información partida, cooperación obligatoria), los roles diferenciados (Coder y Helper con vistas distintas), las condiciones de victoria/derrota y la dinámica de coordinación verbal. Aparece automáticamente en la primera visita a la landing page y permanece accesible vía un botón persistente para referencia posterior.

## Glossary

- **Onboarding_System**: El componente que gestiona la presentación, navegación y persistencia del tutorial interactivo
- **Tutorial_Modal**: La interfaz visual que contiene los slides del tutorial
- **Landing_Page**: La ruta raíz (`/`) donde los jugadores eligen su rol inicial
- **Golden_Rule**: La regla fundamental del juego — ningún jugador puede ganar solo por diseño de información asimétrica
- **Tutorial_Slide**: Una pantalla individual dentro del tutorial con contenido específico (texto, imágenes, controles)
- **First_Visit**: La primera vez que un usuario accede a la Landing_Page en su navegador actual
- **Tutorial_Trigger_Button**: El botón "📖 Cómo Jugar" visible en la Landing_Page que permite reabrir el tutorial
- **LocalStorage_Key**: La clave `kcnif:onboarding-v1` usada para persistir el estado de completitud del tutorial
- **Keyboard_Navigation**: La capacidad de controlar el tutorial usando teclado (Escape, flechas, Enter)
- **Focus_Trap**: Patrón de accesibilidad que mantiene el foco del teclado dentro del modal abierto
- **Backdrop**: El overlay oscuro detrás del modal que indica contexto modal
- **Screenshot**: Imagen estática del juego ubicada en `public/onboarding/` que ilustra las pantallas de Coder o Helper

## Requirements

### Requirement 1: Auto-presentación en Primera Visita

**User Story:** Como un nuevo jugador, quiero que el tutorial aparezca automáticamente la primera vez que visito el juego, para aprender las reglas sin tener que buscar la documentación.

#### Acceptance Criteria

1. WHEN a user loads the Landing_Page, THE Onboarding_System SHALL check the LocalStorage_Key for tutorial completion status
2. IF the LocalStorage_Key does not exist, THEN THE Onboarding_System SHALL display the Tutorial_Modal automatically
3. WHEN the Tutorial_Modal is displayed on First_Visit, THE Onboarding_System SHALL render Slide 1 (Golden Rule) as the initial slide
4. THE Onboarding_System SHALL block interaction with the Landing_Page content while the Tutorial_Modal is open
5. WHEN the user completes or skips the tutorial, THE Onboarding_System SHALL store `{"completed": true, "version": 1}` in the LocalStorage_Key

### Requirement 2: Acceso Manual Persistente

**User Story:** Como un jugador que ya completó el tutorial, quiero poder reabrir la guía en cualquier momento, para refrescar las reglas del juego.

#### Acceptance Criteria

1. THE Onboarding_System SHALL render the Tutorial_Trigger_Button on the Landing_Page at all times
2. WHEN a user clicks the Tutorial_Trigger_Button, THE Onboarding_System SHALL display the Tutorial_Modal starting from Slide 1
3. THE Tutorial_Trigger_Button SHALL display the text "📖 Cómo Jugar" with consistent styling across visits
4. WHEN the tutorial is reopened manually, THE Onboarding_System SHALL allow full navigation including skipping from any slide

### Requirement 3: Navegación Secuencial de Slides

**User Story:** Como un jugador en el tutorial, quiero navegar entre slides de forma intuitiva, para controlar mi ritmo de aprendizaje.

#### Acceptance Criteria

1. THE Tutorial_Modal SHALL display exactly one Tutorial_Slide at a time
2. WHEN a user is viewing Slide N (where N > 1), THE Tutorial_Modal SHALL render a "← Anterior" button
3. WHEN a user is viewing Slide N (where N < 5), THE Tutorial_Modal SHALL render a "Siguiente →" button
4. WHEN a user clicks "Siguiente →", THE Onboarding_System SHALL advance to Slide N+1
5. WHEN a user clicks "← Anterior", THE Onboarding_System SHALL return to Slide N−1
6. WHEN a user is viewing Slide 5, THE Tutorial_Modal SHALL render a "¡Entendido!" button instead of "Siguiente →"
7. WHEN a user clicks "¡Entendido!" on Slide 5, THE Onboarding_System SHALL close the Tutorial_Modal and mark the tutorial as completed

### Requirement 4: Slide 1 No Omitible (Golden Rule Obligatoria)

**User Story:** Como diseñador del juego, quiero garantizar que todos los jugadores vean la Golden Rule antes de poder omitir el tutorial, para que comprendan la mecánica central de cooperación.

#### Acceptance Criteria

1. WHEN a user is viewing Slide 1, THE Tutorial_Modal SHALL NOT render a skip button or close control
2. WHEN a user presses the Escape key on Slide 1, THE Onboarding_System SHALL ignore the key event
3. WHEN a user clicks the Backdrop on Slide 1, THE Onboarding_System SHALL ignore the click event
4. THE Tutorial_Modal SHALL display a visual indicator on Slide 1 stating "Esta regla es fundamental — continúa para poder saltar"
5. WHEN a user advances from Slide 1 to Slide 2, THE Tutorial_Modal SHALL enable skip functionality for all subsequent slides

### Requirement 5: Omisión del Tutorial desde Slide 2 en Adelante

**User Story:** Como un jugador que ya entiendo las mecánicas básicas, quiero poder saltar el tutorial después del primer slide, para no perder tiempo en contenido que ya conozco.

#### Acceptance Criteria

1. WHEN a user is viewing Slide N (where N ≥ 2), THE Tutorial_Modal SHALL render a "Saltar Tutorial" button
2. WHEN a user clicks "Saltar Tutorial", THE Onboarding_System SHALL close the Tutorial_Modal immediately
3. WHEN a user presses the Escape key on Slide N (where N ≥ 2), THE Onboarding_System SHALL close the Tutorial_Modal
4. WHEN a user clicks the Backdrop on Slide N (where N ≥ 2), THE Onboarding_System SHALL close the Tutorial_Modal
5. WHEN the tutorial is skipped, THE Onboarding_System SHALL store completion status in the LocalStorage_Key

### Requirement 6: Contenido del Slide 1 — Golden Rule

**User Story:** Como un nuevo jugador, quiero entender la regla fundamental del juego en el primer slide, para saber que debo cooperar con mi compañero.

#### Acceptance Criteria

1. THE Tutorial_Modal SHALL display the heading "💥 Regla de Oro" on Slide 1
2. THE Tutorial_Modal SHALL display the text "Ningún jugador puede ganar solo. La información está partida por diseño." on Slide 1
3. THE Tutorial_Modal SHALL display explanatory copy emphasizing asymmetric information and mandatory verbal coordination on Slide 1
4. THE Tutorial_Modal SHALL use text-red-500 or text-emerald-400 for emphasis of critical terms on Slide 1
5. THE Tutorial_Modal SHALL display a visual indicator that Slide 1 cannot be skipped

### Requirement 7: Contenido del Slide 2 — Rol del Coder

**User Story:** Como un jugador que elegirá el rol de Coder, quiero ver qué información tendré disponible y qué NO veré, para entender mis limitaciones y prepararme para comunicar síntomas.

#### Acceptance Criteria

1. THE Tutorial_Modal SHALL display the heading "👨‍💻 Rol: Coder" on Slide 2
2. THE Tutorial_Modal SHALL display a Screenshot from `public/onboarding/coder_screen.png` on Slide 2
3. THE Tutorial_Modal SHALL list what the Coder sees: "Código roto, error, 4 opciones de diagnóstico, timer, vidas"
4. THE Tutorial_Modal SHALL list what the Coder does NOT see: "Reglas del lenguaje, conocimiento de dominio"
5. THE Tutorial_Modal SHALL emphasize that the Coder describes symptoms verbally to the Helper

### Requirement 8: Contenido del Slide 3 — Rol del Helper

**User Story:** Como un jugador que elegirá el rol de Helper, quiero ver qué información tendré disponible, qué NO veré, y las interrupciones del cliente, para entender mi responsabilidad de guiar sin ver el código.

#### Acceptance Criteria

1. THE Tutorial_Modal SHALL display the heading "🗣️ Rol: Helper" on Slide 3
2. THE Tutorial_Modal SHALL display a Screenshot from `public/onboarding/helper_screen.png` on Slide 3
3. THE Tutorial_Modal SHALL list what the Helper sees: "Guía completa (reglas + conocimiento de dominio), timer, progreso"
4. THE Tutorial_Modal SHALL list what the Helper does NOT see: "El código roto, el error, las opciones de diagnóstico"
5. THE Tutorial_Modal SHALL explain that the Helper must answer blocking client questions in a modal
6. THE Tutorial_Modal SHALL display a Screenshot from `public/onboarding/helper_blocking_question.png` illustrating client interruptions

### Requirement 9: Contenido del Slide 4 — Coordinación y Comunicación

**User Story:** Como un nuevo jugador, quiero saber que la comunicación verbal es obligatoria y que no hay chat en el juego, para prepararme para usar Discord/videollamada.

#### Acceptance Criteria

1. THE Tutorial_Modal SHALL display the heading "⏱️ Coordinación" on Slide 4
2. THE Tutorial_Modal SHALL state "La comunicación verbal es obligatoria. No hay chat en el juego."
3. THE Tutorial_Modal SHALL recommend using Discord, Zoom, or another voice channel
4. THE Tutorial_Modal SHALL explain that both players share the same session via a room code
5. THE Tutorial_Modal SHALL emphasize that success depends on clear, fast communication under pressure

### Requirement 10: Contenido del Slide 5 — Condiciones de Victoria y Derrota

**User Story:** Como un nuevo jugador, quiero entender cómo ganar y perder, para saber qué métricas importan durante la partida.

#### Acceptance Criteria

1. THE Tutorial_Modal SHALL display the heading "🎯 Victoria y Derrota" on Slide 5
2. THE Tutorial_Modal SHALL explain victory condition: "Completar todos los steps antes de que el timer llegue a 0 o se agoten las vidas"
3. THE Tutorial_Modal SHALL explain defeat conditions: "Timer a 0, vidas del Coder a 0, vidas del Helper a 0, o abandono"
4. THE Tutorial_Modal SHALL list bonuses: "+60s por acierto en step del Coder, +5s por acierto en pregunta del cliente"
5. THE Tutorial_Modal SHALL list penalties: "−10s y −1 vida por error"
6. THE Tutorial_Modal SHALL display a Screenshot from `public/onboarding/screen_failure_endgame.png` showing Game Over state

### Requirement 11: Tono Dramático e Inmersivo

**User Story:** Como diseñador del juego, quiero que el tutorial mantenga el tono dramático de "crisis en producción", para inmersión narrativa consistente.

#### Acceptance Criteria

1. THE Tutorial_Modal SHALL use imperative, urgent copy (e.g., "💥 ¡La demo está rota!", "⏱️ El cliente espera")
2. THE Tutorial_Modal SHALL incorporate emojis (💥, 🗣️, ⏱️, 🎯) in headings for visual urgency
3. THE Tutorial_Modal SHALL avoid overly friendly or casual tone (e.g., no "¡Hola! Bienvenido 😊")
4. THE Tutorial_Modal SHALL use bg-[#0a0a0b] as background color matching the Landing_Page
5. THE Tutorial_Modal SHALL use text-red-500 for warnings and text-emerald-400 or text-amber-400 for highlights

### Requirement 12: Paleta de Colores Consistente con la Landing

**User Story:** Como diseñador de UI, quiero que el tutorial use la misma paleta que la landing, para cohesión visual.

#### Acceptance Criteria

1. THE Tutorial_Modal SHALL use bg-[#0a0a0b] for modal background
2. THE Tutorial_Modal SHALL use text-red-500 for alert text (e.g., "−1 vida", "Timer a 0")
3. THE Tutorial_Modal SHALL use text-emerald-400 for positive highlights (e.g., bonuses, success conditions)
4. THE Tutorial_Modal SHALL use text-amber-400 for neutral highlights (e.g., information emphasis)
5. THE Tutorial_Modal SHALL use opacity-80 or lower for the Backdrop

### Requirement 13: Persistencia con Versión para Invalidar Cache

**User Story:** Como desarrollador del juego, quiero poder forzar la re-presentación del tutorial cuando actualice el contenido, cambiando el número de versión.

#### Acceptance Criteria

1. THE Onboarding_System SHALL store `{"completed": true, "version": 1}` in the LocalStorage_Key when the tutorial is completed
2. WHEN the Onboarding_System reads the LocalStorage_Key, THE Onboarding_System SHALL parse the `version` field
3. IF the stored version is less than the current version (hardcoded in the component), THEN THE Onboarding_System SHALL treat the tutorial as incomplete
4. IF the LocalStorage_Key contains invalid JSON or is corrupted, THEN THE Onboarding_System SHALL treat the tutorial as incomplete
5. WHEN the version is incremented in the codebase, THE Onboarding_System SHALL automatically re-show the tutorial to users with an old version on their next visit

### Requirement 14: Navegación por Teclado

**User Story:** Como un jugador que prefiere el teclado, quiero poder navegar el tutorial sin usar el mouse, para accesibilidad y eficiencia.

#### Acceptance Criteria

1. WHEN the Tutorial_Modal is open on Slide N (where N ≥ 2), THE Onboarding_System SHALL close the modal when the user presses the Escape key
2. WHEN the Tutorial_Modal is open and the user presses the Right Arrow key, THE Onboarding_System SHALL advance to the next slide if available
3. WHEN the Tutorial_Modal is open and the user presses the Left Arrow key, THE Onboarding_System SHALL return to the previous slide if available
4. WHEN a navigation button has focus and the user presses Enter or Space, THE Onboarding_System SHALL execute the button action
5. THE Tutorial_Modal SHALL maintain visible focus indicators on interactive elements (buttons) for keyboard users

### Requirement 15: Focus Trap Dentro del Modal

**User Story:** Como un jugador usando solo teclado, quiero que el foco permanezca dentro del tutorial mientras esté abierto, para no perderme en elementos de fondo.

#### Acceptance Criteria

1. WHEN the Tutorial_Modal opens, THE Onboarding_System SHALL move keyboard focus to the first interactive element inside the modal
2. WHEN a keyboard user tabs forward from the last focusable element in the Tutorial_Modal, THE Onboarding_System SHALL cycle focus back to the first focusable element
3. WHEN a keyboard user tabs backward from the first focusable element in the Tutorial_Modal, THE Onboarding_System SHALL cycle focus to the last focusable element
4. WHEN the Tutorial_Modal closes, THE Onboarding_System SHALL restore keyboard focus to the Tutorial_Trigger_Button or the element that triggered the modal
5. THE Tutorial_Modal SHALL prevent focus from reaching Landing_Page elements while the modal is open

### Requirement 16: ARIA Labels y Accesibilidad

**User Story:** Como un jugador que usa lector de pantalla, quiero que el tutorial anuncie su contenido y controles de forma clara, para poder seguir la guía sin ayuda visual.

#### Acceptance Criteria

1. THE Tutorial_Modal SHALL have `role="dialog"` and `aria-modal="true"` attributes
2. THE Tutorial_Modal SHALL have an `aria-labelledby` attribute pointing to the slide heading
3. THE Tutorial_Modal SHALL have an `aria-describedby` attribute pointing to the slide content
4. THE Tutorial_Trigger_Button SHALL have an `aria-label="Abrir tutorial del juego"` attribute
5. WHEN the Tutorial_Modal opens, THE Onboarding_System SHALL announce the change to screen readers via live region or focus management
6. THE "Saltar Tutorial" button SHALL have an `aria-label="Saltar el tutorial y cerrar"` attribute
7. THE "← Anterior" and "Siguiente →" buttons SHALL have descriptive `aria-label` attributes indicating direction

### Requirement 17: Visualización de Screenshots del Juego

**User Story:** Como un nuevo jugador visual, quiero ver capturas de pantalla reales del juego en el tutorial, para saber exactamente qué esperar en cada rol.

#### Acceptance Criteria

1. THE Tutorial_Modal SHALL load the Screenshot from `public/onboarding/coder_screen.png` on Slide 2
2. THE Tutorial_Modal SHALL load the Screenshot from `public/onboarding/helper_screen.png` on Slide 3
3. THE Tutorial_Modal SHALL load the Screenshot from `public/onboarding/helper_blocking_question.png` on Slide 3
4. THE Tutorial_Modal SHALL load the Screenshot from `public/onboarding/screen_failure_endgame.png` on Slide 5
5. THE Tutorial_Modal SHALL display each Screenshot with alt text describing the content (e.g., "Pantalla del Coder mostrando código roto y opciones de diagnóstico")
6. IF a Screenshot fails to load, THE Tutorial_Modal SHALL display a fallback placeholder with descriptive text
7. THE Tutorial_Modal SHALL size Screenshots to fit within the modal viewport without horizontal scrolling

### Requirement 18: Arquitectura de Componentes

**User Story:** Como desarrollador del juego, quiero que el tutorial siga la arquitectura del proyecto (atoms/molecules/organisms, feature-based), para mantenibilidad y coherencia.

#### Acceptance Criteria

1. THE Onboarding_System SHALL place the main tutorial logic in `src/features/onboarding/`
2. THE Onboarding_System SHALL define TypeScript types in `src/features/onboarding/onboarding-types.ts`
3. THE Onboarding_System SHALL implement a custom hook `useOnboarding.ts` managing tutorial state (current slide, completion status)
4. THE Onboarding_System SHALL place the Tutorial_Modal component in `src/components/organisms/` or `src/features/onboarding/components/`
5. THE Onboarding_System SHALL place smaller UI elements (buttons, slide containers) in `src/components/atoms/` or `src/components/molecules/`
6. THE Onboarding_System SHALL use React hooks exclusively (no class components)
7. THE Onboarding_System SHALL avoid external dependencies beyond React hooks and localStorage

### Requirement 19: Gestión de Estado con Hook Personalizado

**User Story:** Como desarrollador del juego, quiero encapsular la lógica del tutorial en un hook reutilizable, para separar lógica de presentación.

#### Acceptance Criteria

1. THE Onboarding_System SHALL export a `useOnboarding` hook from `src/features/onboarding/useOnboarding.ts`
2. THE `useOnboarding` hook SHALL return `{ isOpen, currentSlide, openTutorial, closeTutorial, nextSlide, prevSlide, canSkip }`
3. THE `useOnboarding` hook SHALL read the LocalStorage_Key on mount to determine initial `isOpen` state
4. THE `useOnboarding` hook SHALL update the LocalStorage_Key when `closeTutorial()` is called
5. THE `useOnboarding` hook SHALL compute `canSkip` as `false` when `currentSlide === 1`, otherwise `true`
6. THE `useOnboarding` hook SHALL handle slide bounds (prevent `nextSlide` beyond Slide 5, prevent `prevSlide` before Slide 1)

### Requirement 20: Tipos TypeScript Estrictos

**User Story:** Como desarrollador del juego, quiero que todo el código del tutorial esté completamente tipado sin `any`, para detectar errores en compile-time.

#### Acceptance Criteria

1. THE Onboarding_System SHALL define an `OnboardingSlide` type representing a single slide (e.g., `{ id: number, heading: string, content: ReactNode }`)
2. THE Onboarding_System SHALL define an `OnboardingState` type representing the current tutorial state (e.g., `{ currentSlide: number, completed: boolean, version: number }`)
3. THE Onboarding_System SHALL NOT use `any` type in any file within `src/features/onboarding/`
4. THE Onboarding_System SHALL use `satisfies` or `as const` for literal types where appropriate
5. THE Onboarding_System SHALL pass TypeScript strict mode compilation with zero errors

### Requirement 21: Duración Express (30-45 segundos)

**User Story:** Como un nuevo jugador impaciente, quiero poder leer el tutorial completo en menos de un minuto, para empezar a jugar rápidamente.

#### Acceptance Criteria

1. THE Tutorial_Modal SHALL limit text content to ~50-70 words per slide maximum
2. THE Tutorial_Modal SHALL present information in bullet points or short paragraphs for rapid scanning
3. THE Tutorial_Modal SHALL prioritize critical information (Golden Rule, role asymmetry, win/lose conditions) over verbose explanations
4. THE Onboarding_System SHALL allow reading all 5 slides in 30-45 seconds for an average reader
5. THE Tutorial_Modal SHALL avoid redundant or filler text (e.g., "Welcome!", "Let's get started!")

### Requirement 22: Sin Dependencias Externas

**User Story:** Como desarrollador del juego, quiero que el tutorial no agregue dependencias npm adicionales, para mantener el bundle pequeño.

#### Acceptance Criteria

1. THE Onboarding_System SHALL implement all functionality using only React hooks from `react`
2. THE Onboarding_System SHALL use native `localStorage` API without wrapper libraries
3. THE Onboarding_System SHALL use native keyboard event handlers without libraries
4. THE Onboarding_System SHALL implement focus trap logic manually or via lightweight utility functions (no `react-focus-lock` or similar)
5. THE Onboarding_System SHALL use Tailwind CSS classes for styling without CSS-in-JS libraries

### Requirement 23: Cierre del Modal en Slides 2-5

**User Story:** Como un jugador que ya revisó el Slide 1, quiero poder cerrar el tutorial de múltiples formas (botón, Esc, clic en backdrop), para flexibilidad de interacción.

#### Acceptance Criteria

1. WHEN a user is viewing Slide N (where N ≥ 2), THE Tutorial_Modal SHALL render a close icon (❌) in the top-right corner
2. WHEN a user clicks the close icon, THE Onboarding_System SHALL close the Tutorial_Modal
3. WHEN a user presses Escape on Slide N (where N ≥ 2), THE Onboarding_System SHALL close the Tutorial_Modal
4. WHEN a user clicks the Backdrop outside the modal on Slide N (where N ≥ 2), THE Onboarding_System SHALL close the Tutorial_Modal
5. WHEN the Tutorial_Modal closes via any method, THE Onboarding_System SHALL mark the tutorial as completed in the LocalStorage_Key
