# Design — Bedrock Streaming Challenge Generation

## Overview

El cambio toca tres capas, de adentro hacia afuera:

1. **Generador** (`runtime-generator.ts`): nueva función que usa `ConverseStreamCommand` y expone los fragmentos de texto a medida que llegan, además del `Challenge` final validado.
2. **Servicio + endpoint** (`game-service.ts` + un route handler de streaming): un endpoint que abre el stream hacia el cliente del Coder (Server-Sent Events) y, al terminar, promueve la sala `idle → playing` con el challenge validado (o el fallback).
3. **Cliente del Coder** (`app/coder/page.tsx` + hook): consume el stream, muestra el texto parcial apareciendo en vivo y entra al tablero cuando el challenge está listo.

El principio rector: **el streaming es presentación; el contrato de datos es el mismo de hoy.** El `Challenge` final se valida idéntico a `generateChallenge` actual.

## Decisiones de arquitectura

### D1 — `ConverseStreamCommand` con callback de progreso

`generateChallenge` se mantiene (compatibilidad/fallback) y se agrega `generateChallengeStreaming(language, onDelta)`:

```ts
export async function generateChallengeStreaming(
  language: ChallengeLanguage,
  onDelta: (partialText: string) => void,
): Promise<Challenge | null> {
  // ConverseStreamCommand → iterar response.stream
  //   contentBlockDelta.delta.text → acumular en buffer + onDelta(buffer)
  // al cerrar el stream: stripMarkdownFences + JSON.parse + isValidChallenge
  // mismos catch/console.error y mismo AbortController/timeout que hoy
}
```

- El buffer acumula `contentBlockDelta.delta.text`. `onDelta` recibe el texto acumulado (no el delta suelto) para que el cliente solo renderice.
- Reutiliza `stripMarkdownFences`, `isValidChallenge`, `resolveLanguage`, `languageInstruction`, el `AbortController` y `RUNTIME_TIMEOUT_MS` que ya existen.
- Mismos `console.error('[bedrock] ...')` por rama de error que el flujo actual.

### D2 — Transporte al cliente: Server-Sent Events (SSE)

Endpoint nuevo `app/api/game/generate-stream/route.ts` (GET con `sessionId`) que devuelve un `ReadableStream` con `Content-Type: text/event-stream`:

- Emite eventos `delta` con el texto parcial mientras Bedrock genera.
- Al terminar: persiste la sala como `playing` (vía la lógica de `ensureChallengeGenerated`, adaptada para recibir el challenge ya generado por el stream) y emite un evento `done`.
- Si falla: emite `done` igual, con el challenge de fallback ya persistido.

**Por qué SSE y no polling:** el progreso token-por-token necesita push del servidor; SSE es nativo en la plataforma (un `ReadableStream` en el route handler) y no requiere WebSocket ni infraestructura extra. El polling de 1 s seguiría siendo demasiado lento y a saltos.

**Idempotencia:** el endpoint respeta el mismo flag `generating` + `generatingStartedAt` (TTL 30 s) de `ensureChallengeGenerated`, para que dos pestañas no disparen dos generaciones. Si la sala ya está `playing`, el endpoint cierra de inmediato con `done`.

### D3 — El Coder consume el stream

`app/coder/page.tsx` (o un hook `useChallengeStream`): cuando entra una sala `idle`, abre un `EventSource`/`fetch` al endpoint de stream:

- Por cada evento `delta`: muestra el texto parcial en el área "Estamos preparando tu incidente…" con efecto de aparición incremental.
- En `done`: cierra el stream y deja que el polling normal de `getCoderState` traiga el tablero `playing` (sin cambiar ese flujo).
- El texto parcial es **decorativo**: nunca se intenta parsear ni se arma el tablero con él.

### D4 — Fallback sin regresión

La cadena de fallback es la misma de hoy, solo que disparada desde el endpoint de stream:

```
stream falla / texto inválido / no valida
        → pickRandomChallenge() (curado)
        → persistir sala playing con el curado
        → emitir done
```

El Coder no nota la diferencia: ve el texto parcial (si llegó algo) o directamente el tablero curado.

## Componentes afectados

| Archivo | Cambio |
|---|---|
| `src/features/game/runtime-generator.ts` | + `generateChallengeStreaming(language, onDelta)` |
| `src/features/game/game-service.ts` | helper para promover sala con un challenge ya resuelto por el stream |
| `app/api/game/generate-stream/route.ts` | NUEVO — route handler SSE |
| `app/coder/page.tsx` / hook nuevo | consume el stream, muestra texto en vivo |
| `src/components/organisms/CoderBoard.tsx` | el bloque `idle` muestra el texto parcial en vez de solo el spinner |

## Testing

- **Unitario (sin Bedrock real):** simular un async iterable de fragmentos y verificar que (a) `onDelta` recibe el texto acumulado en orden, (b) al cerrar se parsea/valida igual, (c) un stream que arroja → `null` (fallback). Igual que los tests actuales de `generateChallenge` pero con un stream mockeado.
- **Sin regresión:** los 107 tests existentes siguen verdes; el contrato `Challenge` no cambia.
- tsc 0 errores, lint 0 warnings.

## Riesgos y mitigaciones

- **SSE detrás del ALB:** el ALB soporta respuestas largas; configurar el route handler como dinámico (no cacheado) y desactivar buffering (`no-store`). Si el ALB cortara el stream, el Coder cae al polling normal (la sala se promueve igual en el servidor).
- **Doble generación:** mitigada por el flag `generating` existente.
- **Demo en vivo:** si el streaming diera algún problema imprevisto, el fallback curado garantiza que la partida arranca igual — cero riesgo de pantalla rota.
