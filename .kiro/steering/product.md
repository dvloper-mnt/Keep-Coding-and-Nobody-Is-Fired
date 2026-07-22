# Product Overview

## What this is

**Keep Coding and Nobody Is Fired** (internamente: *Debug Simulator — Bomb Code: Production Failure*) es un juego cooperativo de debugging para una demo de hackathon. Dos desarrolladores arreglan bugs de producción encadenados bajo presión de tiempo, simulando una crisis durante una presentación en vivo a un cliente.

**Fecha de la hackathon: 20 de julio de 2026.** Hay margen — la estrategia es hacer las cosas BIEN (pulido, observabilidad, testing), no apurar features.

## Players & roles

| Rol | Ruta | Ve | Hace |
|-----|------|-----|------|
| **Coder** | `/coder` | Código, error, 4 opciones de diagnóstico, timer, **3 vidas propias**, mensajes del jefe | Elige respuestas de los steps, maneja el tick del timer |
| **Helper** | `/helper` | Guía completa (reglas + conocimiento de dominio), timer, progreso del Coder, **3 vidas propias** | Guía al Coder verbalmente; responde **consultas del cliente** en un modal obligatorio — **NO** puede responder los steps del Coder |

Las vidas de cada rol son **independientes**: los errores de uno no consumen vidas del otro. La partida es compartida: si cualquier rol llega a 0 vidas, **ambos** pierden.

## Golden rule (no negociable)

**Ningún jugador puede ganar solo.** El Coder ve los síntomas (código roto, error) pero NO las reglas de dominio. El Helper ve la teoría pero NO el error en vivo ni las opciones de diagnóstico de los steps. La solución emerge de la **coordinación verbal**. Cualquier feature nueva debe respetar esta asimetría: si un jugador pudiera resolver todo solo, rompe el juego.

Excepción acotada: el Helper responde preguntas del **cliente** (modal) porque simula presión externa durante la demo — no sustituye la resolución de los steps, que sigue siendo exclusiva del Coder.

## Cómo se juega (modo clásico — implementado)

### Objetivo

Completar todos los steps de una cadena de bugs encadenados antes de que se cumpla **cualquier** condición de derrota.

- **Victoria:** el Coder acierta el último step con timer > 0 y vidas > 0 en ambos roles.
- **Derrota:** se cumple **cualquiera** de estas condiciones:
  - El timer global llega a 0 (`defeatReason: timeout`)
  - El Coder agota sus 3 vidas (`defeatReason: coder_lives`)
  - El Helper agota sus 3 vidas (`defeatReason: helper_lives`)
  - Un jugador abandona la partida (`status: abandoned`)

### Cadena de bugs

Cada fix revela el siguiente bug — es una incidencia que evoluciona, no un quiz de preguntas sueltas. Respuesta correcta en un step aplica `code_patch` y avanza; en el último step dispara victoria.

### Timer

- Default: **180 s** por misión (configurable por challenge).
- Timer **global** por partida (no por step).
- El Coder hace tick cada segundo vía polling (`POST /api/game/tick`).
- El Helper sincroniza estado vía `GET /api/game/sync`.

### Vidas (anti brute-force)

| Rol | Vidas iniciales | Cuándo pierde 1 vida | Penalización de tiempo adicional |
|-----|-----------------|----------------------|----------------------------------|
| **Coder** | 3 | Respuesta incorrecta en un step | −10 s |
| **Helper** | 3 | Respuesta incorrecta en consulta del cliente (modal) | −10 s |

- Las vidas son **por rol y por partida** (no se reinician por step).
- El Coder puede reintentar un step tras fallar, pero cada error cuesta 1 vida + 10 s.
- Tras el 3.er error de un rol, la partida termina **inmediatamente** aunque quede tiempo.
- UI: indicador de corazones (`LivesIndicator`) visible solo para el rol propio, junto al timer.

### Consultas del cliente (Helper)

Durante la partida pueden aparecer preguntas obligatorias en un modal para el Helper:

- Spawn server-side en el tick (cooldown ~40 s, probabilidad ~45 %, máx. 6 por sesión).
- El Helper **debe** responder; no se puede omitir.
- Respuesta correcta: +5 s al timer y se cierra el modal.
- Respuesta incorrecta: −1 vida del Helper, −10 s, el modal permanece hasta acertar o game over.

### Feedback y presión

- **Error:** sonido, shake (Coder) o pulse en vidas (Helper), mensaje de fallo + "Perdiste 1 vida."
- **Acierto:** sonido, animación de fix aplicado, avance de step.
- **Mensajes del jefe:** toasts cosméticos de presión — no afectan la lógica.
- **Pantallas finales:** mensajes diferenciados según `defeatReason` (tiempo, vidas del Coder, vidas del Helper).

### Flujo de sesión

1. Coder abre `/coder` → se crea sala (código de room) y se genera el challenge (Bedrock en streaming o catálogo curado como fallback).
2. Coder comparte el código de sala con el Helper.
3. Helper entra en `/helper` con el código → recibe la guía estática completa.
4. Cooperan verbalmente; el Coder responde steps; el Helper atiende consultas del cliente cuando aparecen.
5. Victoria o derrota → botón **Volver al inicio** en ambas pantallas.

### Generación de contenido

- Challenges pueden venir del **catálogo JSON** o generarse en runtime con **Bedrock** (streaming visible mientras la sala está en `idle`).
- Si Bedrock falla, fallback al challenge curado — el loop **nunca** se rompe en demo.
- Preguntas del cliente: pool estático en `src/data/client-questions/`.

## Hacia dónde va (roadmap speceado en `.kiro/specs/` — NO implementado aún)

Transformación a un **modo infinito adaptativo** — rondas ilimitadas, el reloj sube al acertar y baja al fallar, la IA escala la dificultad con el puntaje, combos, un "jefe" cada 10 rondas, leaderboard y pantalla de resultados con feedback por email.

## Roadmap activo (specs en Kiro — diseñados, pendientes de implementar)

El orden importa por dependencias. `endless-mode` es la base:

```
endless-mode  →  adaptive-difficulty + scoring-and-combos + boss-encounters  →  leaderboard + game-results
```

- **endless-mode** — rondas infinitas; reloj que sube al acertar (+bono) y baja al fallar; game over a 0. **CORE: todo lo demás se monta encima** (crea el `round`).
- **adaptive-difficulty** — la IA sube la dificultad por ronda según el puntaje.
- **scoring-and-combos** — puntaje + multiplicador por aciertos consecutivos.
- **boss-encounters** — un encuentro de "jefe" cada 10 rondas.
- **leaderboard** — tabla de puntajes (Valkey sorted sets).
- **game-results** — pantalla final + resultado/feedback enviado por **email (AWS SES)**.

## Why it matters (contexto de decisiones)

- Es un **entregable que se juega su credibilidad en una demo EN VIVO frente a un jurado**. La robustez en producción pesa más que features a medio hacer: un bug visible on-stage cuesta la competencia. Por eso el fallback al challenge curado cuando Bedrock falla — el loop NUNCA se rompe.
- La generación con IA en vivo (streaming token por token) ES el momento "wow" del pitch — el incidente se escribe frente al jurado.
- La tensión (mensajes del jefe, consultas del cliente, vidas limitadas) es parte del producto: mantiene la presión alta y evita brute-force sin cooperación. No la quites al optimizar.
- Las vidas viven en el **motor server-side** (`lives-engine.ts`) — nunca en UI ni en cliente — para que no se puedan manipular.

## Out of scope (por ahora)

WebSockets (se usa polling + SSE), base de datos relacional (Valkey/Redis alcanza para sesiones), autenticación de usuarios end-user (los tokens de sesión son por-sala y por-rol, no por-usuario), sistema de tokens de hint. **Nota:** leaderboard, modo infinito y boss YA NO están out of scope — están en el roadmap activo arriba.