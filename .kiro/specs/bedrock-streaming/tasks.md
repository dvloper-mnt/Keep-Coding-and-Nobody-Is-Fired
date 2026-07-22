# Tasks — Bedrock Streaming Challenge Generation

Implementación en orden de dependencias (de adentro hacia afuera). TDD donde hay lógica pura.

## 1. Generador con streaming

- [x] 1.1 Agregar `generateChallengeStreaming(language, onDelta)` en `runtime-generator.ts` usando `ConverseStreamCommand`, acumulando `contentBlockDelta.delta.text` en un buffer y llamando `onDelta(buffer)` por fragmento. (R1.1, R1.2, R2.1)
- [x] 1.2 Al cerrar el stream: reutilizar `stripMarkdownFences` + `JSON.parse` + `isValidChallenge`; devolver el `Challenge` o `null`. (R1.3, R3.1)
- [x] 1.3 Aplicar `AbortController` + `RUNTIME_TIMEOUT_MS` sobre el stream completo; mismos `console.error('[bedrock] ...')` por rama de error que el flujo actual. (R1.5, R4.2)
- [x] 1.4 Test unitario: mockear un async iterable de fragmentos y verificar acumulación en orden, parseo/validación final, y `null` cuando el stream arroja. (R5.2)

## 2. Servicio + endpoint SSE

- [x] 2.1 En `game-service.ts`, extraer/añadir un helper que promueva una sala `idle → playing` a partir de un `Challenge` ya resuelto (generado o curado), preservando `coderToken`/`helperToken` (igual que `ensureChallengeGenerated` hoy). (R3.2)
- [x] 2.2 Crear `app/api/game/generate-stream/route.ts` (GET con `sessionId`) que devuelva un `ReadableStream` `text/event-stream`, respetando el flag `generating` + `generatingStartedAt` (idempotencia). (R2.2, D2)
- [x] 2.3 El endpoint emite eventos `delta` (texto parcial) durante el stream y, al terminar, persiste la sala `playing` y emite `done`. (R2.1, R2.2)
- [x] 2.4 Si el stream/parseo falla, el endpoint cae a `pickRandomChallenge`, persiste la sala `playing` con el curado y emite `done` igual. (R4.1, R4.3)
- [x] 2.5 Configurar el route como dinámico, sin cache (`no-store`), para que el stream no se buffee. (D2, riesgos)

## 3. Cliente del Coder

- [x] 3.1 Hook/cliente que abre el stream (`EventSource`/`fetch`) cuando la sala está `idle`, acumula el texto parcial y lo expone al render. (R2.1, R2.3)
- [x] 3.2 En `CoderBoard.tsx`, el bloque `idle` muestra el texto parcial apareciendo en vivo (efecto incremental) en vez de solo el spinner; al `done`, el polling normal trae el tablero `playing`. (R2.3, R2.4)
- [x] 3.3 Garantizar que el texto parcial es decorativo: nunca se parsea ni arma el tablero; el tablero solo se monta con el `Challenge` validado vía `getCoderState`. (R2.4, R3.1)

## 4. Verificación

- [x] 4.1 `npm run test` verde (115 tests: 107 existentes + 8 nuevos), `tsc --noEmit` 0 errores, `npm run lint` 0 warnings. (R5.3)
- [x] 4.2 Smoke test en local: iniciar partida y ver el texto del challenge apareciendo en vivo; forzar un fallo de Bedrock y confirmar que cae al curado sin romper. (R4) — verificado: 574 eventos delta en vivo; reveló que faltaba el permiso bedrock:InvokeModelWithResponseStream.
- [x] 4.3 Verificar en producción tras deploy: el challenge aparece en streaming y, si falla, el fallback funciona. (R4.3) — verificado en hackaton.dvloper.com.co: 655 eventos delta en vivo, sala promovida a playing con 3 steps.

## Notas

- El permiso `bedrock:ConverseStream` ya está en el task role (no requiere cambio de infra).
- `generateChallenge` (no-streaming) se conserva como camino de compatibilidad/fallback interno.
- Riesgo de demo cubierto por el fallback curado: si el streaming fallara en vivo, la partida arranca igual.
