# Tasks — Game Engine Test Suite

- [ ] 1. Configurar la infraestructura de testing con Vitest
  - [ ] 1.1 Agregar `vitest`, `@vitest/coverage-v8` y `vite-tsconfig-paths` a `devDependencies` y los scripts `test`, `test:watch`, `test:coverage` en `package.json`
    - _Requirements: 1.1, 1.2, 1.3_
  - [ ] 1.2 Crear `vitest.config.ts` con `environment: 'node'`, `include: ['src/**/*.test.ts']`, coverage v8 limitado a los dos engines, y el plugin de tsconfig paths para resolver `@/*`
    - Leer la doc de la versión de Vitest instalada antes de escribir la config — no asumir API de versiones viejas
    - _Requirements: 1.2, 1.4, 1.5_
  - [ ] 1.3 Verificar que `npm run test` corre (aunque sea con cero tests) sin errores de config ni de resolución de alias
    - _Requirements: 1.2, 1.4_

- [ ] 2. Crear fixtures tipadas reutilizables
  - [ ] 2.1 Crear `src/features/game/testing/fixtures.ts` con `makeSession`, `makeStep`, `makeClientQuestion`, todas con `Partial<T>` overrides y defaults de una sesión `playing` válida en el paso 1
    - Cero `any`, cero `as` (salvo `as const`)
    - _Requirements: 1.5_

- [ ] 3. Tests de `game-engine.ts` (crear `src/features/game/game-engine.test.ts`)
  - [ ] 3.1 `resolveMultipleChoice`: rama correcta (`{ success: true }` limpio), rama incorrecta con defaults, y rama incorrecta con `wrongPenalty`/`wrongMessage` explícitos
    - _Requirements: 2.1, 2.2, 2.3_
  - [ ] 3.2 `resolveStep`: correcto devuelve `patch` = `success_state.code_patch`; incorrecto sin `patch`
    - _Requirements: 3.1, 3.2_
  - [ ] 3.3 `applyTimeDelta`: delta positivo suma; delta negativo hace clamp en 0; `<= 0` con status `playing` → `defeat`; tiempo 0 con status `victory` conserva `victory`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [ ] 3.4 `submitAnswer`: status no-`playing` retorna sin cambios; correcto no-último avanza paso + patch + `lastResult: correct`; correcto último → `victory` sin pasarse del total; incorrecto resta penalty + `lastResult: incorrect` sin avanzar
    - Probar explícitamente penúltimo vs último paso (el `>=` de `isLastStep`)
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [ ] 3.5 `tickTimer`: status no-`playing` no decrementa; `playing` resta 1; `<= 0` → `defeat`
    - _Requirements: 6.1, 6.2, 6.3_
  - [ ] 3.6 `clearLastResult` quita la propiedad; `isTerminalStatus` true para victory/defeat, false para playing/idle
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 4. Tests de `client-question-engine.ts` (crear `src/features/game/client-question-engine.test.ts`)
  - [ ] 4.1 `submitClientQuestionAnswer`: guarda status no-`playing` (mensaje "La partida ya terminó.", sin mutar tiempo); guarda sin consulta activa coincidente (sin mutar tiempo)
    - _Requirements: 8.1, 8.2_
  - [ ] 4.2 `submitClientQuestionAnswer`: correcto suma bonus + limpia `activeQuestionId` + agrega a `answeredQuestionIds`; incorrecto resta penalty + mantiene consulta activa
    - _Requirements: 8.3, 8.4_

- [ ] 5. Verificación final
  - [ ] 5.1 Correr `npm run test:coverage` y confirmar que los dos engines tienen cobertura alta de sus funciones puras
    - _Requirements: 1.3_
  - [ ] 5.2 Revisar cada assertion manualmente: ¿verifica el comportamiento correcto, o solo "pasa"? Un test que pasa verificando lo incorrecto es peor que no tenerlo. Si algún test revela un bug de producción (ej: penalty hardcodeado a 10 en game-service), documentarlo como hallazgo — NO arreglar producción en esta spec
    - _Requirements: todos_
