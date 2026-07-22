# Product Overview

## What this is

**Keep Coding and Nobody Is Fired** (internamente: *Debug Simulator — Bomb Code: Production Failure*) es un juego cooperativo de debugging para una demo de hackathon. Dos desarrolladores arreglan bugs de producción encadenados bajo presión de tiempo, simulando una crisis durante una presentación en vivo a un cliente.

**Fecha de la hackathon: 20 de julio de 2026.** Hay margen — la estrategia es hacer las cosas BIEN (pulido, observabilidad, testing), no apurar features.

## Players & roles

| Rol | Ruta | Ve | Hace |
|-----|------|-----|------|
| **Coder** | `/coder` | Código, error, 4 opciones de diagnóstico, timer | Elige respuestas, maneja el timer |
| **Helper** | `/helper` | Guía completa (reglas + conocimiento de dominio), timer, progreso | Guía al Coder verbalmente — NO puede responder |

## Golden rule (no negociable)

**Ningún jugador puede ganar solo.** El Coder ve los síntomas (código roto, error) pero NO las reglas de dominio. El Helper ve la teoría pero NO el error en vivo ni las opciones. La solución emerge de la **coordinación verbal**. Cualquier feature nueva debe respetar esta asimetría: si un jugador pudiera resolver todo solo, rompe el juego.

## Cómo se juega (modo actual + hacia dónde va)

- **Modo clásico (implementado):** una cadena de bugs encadenados (cada fix revela el siguiente). Arreglar todos antes de que el timer (default 180s) llegue a cero. Respuesta incorrecta = penalización de tiempo. Cada fix revela el siguiente bug — es una incidencia que evoluciona, no un quiz de preguntas sueltas.
- **Hacia dónde va (roadmap speceado en `.kiro/specs/`, NO implementado aún):** transformación a un **modo infinito adaptativo** — rondas ilimitadas, el reloj sube al acertar y baja al fallar, la IA escala la dificultad con el puntaje, combos, un "jefe" cada 10 rondas, leaderboard y pantalla de resultados con feedback por email.

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
- La tensión (mensajes del jefe, consultas del cliente) es parte del producto: mantiene la presión alta. No la quites al optimizar.

## Out of scope (por ahora)

WebSockets (se usa polling + SSE), base de datos relacional (Valkey alcanza), autenticación de usuarios end-user (los tokens de sesión son por-sala, no por-usuario), sistema de tokens de hint. **Nota:** leaderboard, modo infinito y boss YA NO están out of scope — están en el roadmap activo arriba.
