import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

// No I/O/0/1 — avoids ambiguous glyphs when a player reads the code aloud.
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 4;

// The room code is shared socially (the Helper types it), so it stays short.
// It is NOT a credential — mutations require an opaque token instead. randomInt
// is cryptographic, removing the predictability of Math.random().
export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

// Per-player secret. Knowing the room code lets you read the game; only the
// matching token lets you mutate it (answer, abandon). 32 bytes = 256 bits.
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

// Constant-time comparison so a mismatch doesn't leak how many chars matched.
export function tokensMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
