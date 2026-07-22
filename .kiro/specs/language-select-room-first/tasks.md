# Tasks — Selección de lenguaje + flujo sala-primero

> Spec RETROACTIVA: la feature ya está implementada. Todas las tareas se documentan como completadas (`- [x]`) reflejando el código en `main`.

- [x] 1. Tipar el lenguaje y la lista seleccionable
  - [x] 1.1 Definir `ChallengeLanguage` en `src/features/game/game-types.ts` como unión `'random' | 'php' | 'sql' | 'typescript' | 'javascript' | 'python' | 'go' | 'java' | 'ruby'`
    - _Requirements: 1.4, 2.3_
  - [x] 1.2 Crear `src/features/game/challenge-language.ts` con `SELECTABLE_LANGUAGES` (`as const`), `CONCRETE_LANGUAGES` (excluye `random`), `LANGUAGE_LABEL`, `resolveLanguage` (resuelve `random` a uno concreto al azar; identidad para concretos) y `languageInstruction` (frase `El bug y el código deben ser de <Lenguaje>.`). Cero `any`, sin `as` salvo el narrowing del filtro
    - _Requirements: 1.4, 2.5, 2.6_

- [x] 2. Select de lenguaje en el modal de inicio
  - [x] 2.1 En `src/components/molecules/StartGameButton.tsx` agregar `LANGUAGE_OPTIONS` (value/label) y un `<select>` controlado por estado `language` (default `random`) dentro del modal de "Confirmar inicio"
    - _Requirements: 1.1, 1.2_
  - [x] 2.2 En `confirmStart` navegar con `router.push('/coder?lang=<language>')`, marcando `starting` para deshabilitar el select y los botones mientras inicia
    - _Requirements: 1.3, 1.5_

- [x] 3. Propagar el lenguaje del frontend al backend
  - [x] 3.1 En `app/coder/page.tsx` leer `lang` con `useSearchParams` y pasarlo a `startGame(requestedLanguage)` del cliente
    - _Requirements: 2.1_
  - [x] 3.2 En `src/features/game/api/game-client.ts` exponer `startGame(language?)` que hace `POST /api/game/start` con cuerpo `{ language }`
    - _Requirements: 2.2_
  - [x] 3.3 En `app/api/game/start/route.ts` validar `language` con `parseLanguage` contra `SELECTABLE_LANGUAGES`, cayendo a `random` si no está en la whitelist, y llamar a `startGame(language)`
    - _Requirements: 2.3_

- [x] 4. Crear la sala en estado `idle` (sala-primero)
  - [x] 4.1 Agregar a `GameSession` (`game-types.ts`) los campos del flujo idle: `language?`, `generating?`, `generatingStartedAt?`, `coderToken?`, `helperToken?`, y documentar el estado `idle` en `GameStatus`
    - _Requirements: 3.1, 3.2, 4.6_
  - [x] 4.2 Crear `createPendingSession(sessionId, language, startedAt, coderToken?)` en `game-engine.ts`: status `idle`, `challengeId` vacío, `currentCode` vacío, `remainingTime` 0, `generating: false`, `language ?? 'random'`
    - _Requirements: 3.1, 3.2_
  - [x] 4.3 En `startGame(language)` (`game-service.ts`) generar `sessionId` (room code) y `coderToken`, crear la sesión con `createPendingSession`, guardarla y devolver `{ sessionId, coderToken }` SIN invocar Bedrock (inicio instantáneo)
    - _Requirements: 3.1, 3.3, 3.4_

- [x] 5. Generación diferida e idempotente en el primer poll
  - [x] 5.1 Implementar `ensureChallengeGenerated(session)` en `game-service.ts`: solo actúa si `status === 'idle'`; respeta un claim `generating` vigente (antigüedad < `GENERATION_CLAIM_TTL_MS` = 30s) y reintenta si el claim expiró
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 5.2 Reclamar la generación (`generating: true` + `generatingStartedAt: Date.now()`) y persistir ANTES de llamar a Bedrock, para que un poll concurrente no dispare una segunda generación
    - _Requirements: 4.2_
  - [x] 5.3 Generar con `generateChallenge(session.language)`; si devuelve `null` usar `pickRandomChallenge()` (fallback curado); promover con `createSession` (status `playing`, reloj 180s) y adjuntar `generatedChallenge` si aplica
    - _Requirements: 4.4, 4.5_
  - [x] 5.4 Re-adjuntar `coderToken` y `helperToken` tras `createSession` para no perder credenciales en la promoción `idle → playing`
    - _Requirements: 4.6_
  - [x] 5.5 En `getCoderState` (consumido por `/api/game/state`): si la sala está `idle`, llamar a `ensureChallengeGenerated`; si sigue `idle`, devolver `pendingCoderView()`
    - _Requirements: 4.1, 5.2_

- [x] 6. Consumir el lenguaje en el generador de Bedrock
  - [x] 6.1 En `src/features/game/runtime-generator.ts`, `generateChallenge(language)` resuelve con `resolveLanguage(language)` e inyecta `languageInstruction(resuelto)` en el mensaje de usuario del `ConverseCommand`
    - _Requirements: 2.5, 2.6_

- [x] 7. Experiencia del Coder mientras la sala está `idle`
  - [x] 7.1 En `app/coder/page.tsx`, para una partida nueva (sin `?session=`): crear la sala con `startGame`, `saveToken`, `history.replaceState` a `/coder?session=<id>`, y entrar al tablero con `GENERATING_VIEW` (`status: 'idle'`)
    - _Requirements: 5.1, 5.2_
  - [x] 7.2 Exponer `pendingCoderView()` en `game-service.ts` (código/error/opciones vacíos, `status: 'idle'`) para la sala `idle`
    - _Requirements: 5.2_
  - [x] 7.3 Mostrar `GameLoadingScreen` con título "Estamos preparando tu incidente…" y subtítulo "Espera un momento mientras preparo la partida." mientras se prepara; promover a `CoderScreen` cuando el polling detecta `playing`
    - _Requirements: 5.3, 5.4_

- [x] 8. Experiencia del Helper que entra antes de tiempo
  - [x] 8.1 Modelar `HelperGuidePending { pending: true }` y `HelperGuideOccupied { occupied: true }` en `game-types.ts`, y la unión `HelperGuideResult`
    - _Requirements: 6.1, 6.5_
  - [x] 8.2 En `getHelperGuide` (`game-service.ts`): si la sala está `idle`, devolver `{ pending: true }`; si el asiento ya está tomado por otro token, `{ occupied: true }`; en caso normal, mintar/guardar `helperToken` y devolver la `HelperStaticGuide`
    - _Requirements: 6.1, 6.4, 6.5_
  - [x] 8.3 En `app/api/game/guide/route.ts` mapear `occupied` a HTTP 409 y devolver la guía u objeto `pending` según corresponda
    - _Requirements: 6.1, 6.5_
  - [x] 8.4 En `app/helper/page.tsx` hacer loop sobre `getHelperGuide` (reintento cada ~1.5s) mientras la respuesta sea `pending`; lanzar error claro ante `occupied`; guardar `helperToken` y renderizar `HelperScreen` cuando llega la guía
    - _Requirements: 6.2, 6.4, 6.5_
  - [x] 8.5 Mostrar `GameLoadingScreen` con título "Esperando a que el Coder inicie…" y subtítulo "En cuanto el incidente esté listo, vas a ver tu manual de debugging." mientras la sala está `pending`
    - _Requirements: 6.3_

- [x] 9. Verificación (manual / observada en el código en `main`)
  - [x] 9.1 Confirmar que `/start` responde al instante (sin esperar a Bedrock) y que el Coder ve el código de sala de inmediato — la generación se dispara recién en el primer `/state`
    - _Requirements: 3.1, 3.3, 4.1_
  - [x] 9.2 Confirmar que elegir un lenguaje concreto (p. ej. `python`) lo propaga hasta el prompt de Bedrock vía `languageInstruction`, y que `random` se resuelve en la generación
    - _Requirements: 2.5, 2.6_
  - [x] 9.3 Confirmar que un `lang` inválido en la URL cae a `random` (whitelist en `parseLanguage`)
    - _Requirements: 2.3_
  - [x] 9.4 Confirmar que un Helper que entra antes ve "Esperando a que el Coder inicie…" y que entra a la partida en cuanto el desafío está listo, y que un fallo de Bedrock cae al desafío curado sin congelar la sala
    - _Requirements: 4.5, 6.1, 6.2, 6.4_
