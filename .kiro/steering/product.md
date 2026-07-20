# Product Overview

## What this is

**Keep Coding and Nobody Is Fired** (internamente: *Debug Simulator — Bomb Code: Production Failure*) es un juego cooperativo de debugging para una demo de hackathon. Dos desarrolladores arreglan bugs de producción encadenados bajo presión de tiempo, simulando una crisis durante una presentación en vivo a un cliente.

## Players & roles

| Rol | Ruta | Ve | Hace |
|-----|------|-----|------|
| **Coder** | `/coder` | Código, error, 4 opciones de diagnóstico, timer | Elige respuestas, maneja el timer |
| **Helper** | `/helper` | Guía estática completa (todos los ejercicios), timer, progreso | Guía al Coder verbalmente — NO puede responder |

## Golden rule (no negociable)

**Ningún jugador puede ganar solo.** El Coder ve los síntomas (código roto, error) pero NO las reglas de dominio. El Helper ve la teoría pero NO el error en vivo ni las opciones. La solución emerge de la **coordinación verbal**. Cualquier feature nueva debe respetar esta asimetría: si un jugador pudiera resolver todo solo, rompe el juego.

## Objective

Arreglar todos los pasos de una cadena de bugs antes de que el timer llegue a cero (default 180s). Respuesta incorrecta = −10s. Cada fix revela el siguiente bug (una incidencia que evoluciona, no un quiz de preguntas sueltas).

## Why it matters (contexto de decisiones)

- Es un **entregable que se juega su credibilidad en una demo EN VIVO frente a un jurado**. La robustez en producción pesa más que features nuevas: un bug visible on-stage cuesta la competencia.
- Es un **MVP de hackathon**: simplicidad sobre completitud. Challenges en JSON estático, no base de datos. Pocos niveles.
- La tensión (mensajes del jefe, consultas del cliente) es parte del producto: mantiene la presión alta. No la quites al optimizar.

## Out of scope (por ahora)

Base de datos, WebSockets, leaderboard, sistema de tokens de hint, autenticación de usuarios. Está en el roadmap post-MVP, no se construye ahora salvo pedido explícito.
