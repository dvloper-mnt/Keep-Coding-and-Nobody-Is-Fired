'use client';

import type { PlayerRole } from '@/src/features/game/game-types';

// Per-room, per-role token kept in localStorage so a reload keeps the seat.
// Knowing the room code lets you read the game; this token lets you mutate it.
function key(sessionId: string, role: PlayerRole): string {
  return `kc:token:${role}:${sessionId}`;
}

export function saveToken(sessionId: string, role: PlayerRole, token: string): void {
  try {
    localStorage.setItem(key(sessionId, role), token);
  } catch {
    // localStorage unavailable (private mode etc.) — the player just can't
    // resume after a reload; the game still works for the active tab.
  }
}

export function readToken(sessionId: string, role: PlayerRole): string | undefined {
  try {
    return localStorage.getItem(key(sessionId, role)) ?? undefined;
  } catch {
    return undefined;
  }
}
