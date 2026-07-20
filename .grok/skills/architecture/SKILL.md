---
name: architecture
description: Define and enforce the project architecture for Keep Coding and Nobody Is Fired. Use when creating features, structuring code, or making architectural decisions.
---

# Architecture Skill

## Purpose

Ensure the project remains simple, scalable, and consistent.

This project prioritizes:
- speed of development
- clarity
- low complexity
- good separation of responsibilities

---

## Core Principles

- Keep it simple
- Avoid overengineering
- Separate UI from logic
- Keep game logic isolated
- Prefer readability over cleverness

---

## Architecture Style

We use a **simple layered + feature-based approach**:

- UI (React / Next.js pages & components)
- Actions (Server Actions / API handlers)
- Game Logic (core logic, reusable)
- Data (static or DB)

---

## When To Use

Use this skill when:

- creating new features
- deciding where code should live
- refactoring
- reviewing structure

---

## Rules

- Do NOT mix UI with game logic
- Do NOT put business logic inside components
- Keep features self-contained
- Avoid global state unless necessary
- Prefer server-side logic when possible

---

## Folder Strategy

Each feature should contain:

- UI
- logic
- types

---

## Related Skills

Load these when implementing game features:

- `game-mechanics` — game loop, validation, timer, feedback
- `game-roles` — Coder/Helper asymmetric views, cooperation rule
- `game-challenges` — challenge schema, types, Laravel/PHP/SQL content

---

## References

Read:

- references/project-architecture.md
- references/folder-structure.md
- references/coding-standards.md