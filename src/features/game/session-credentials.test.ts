import { describe, expect, it } from 'vitest';
import {
  ROOM_CODE_ALPHABET,
  generateOpaqueToken,
  generateRoomCode,
  tokensMatch,
} from './session-credentials';

describe('generateRoomCode', () => {
  it('produces a 4-char code from the safe alphabet', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(4);
      for (const ch of code) {
        expect(ROOM_CODE_ALPHABET).toContain(ch);
      }
    }
  });

  it('is not trivially constant across calls', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('generateOpaqueToken', () => {
  it('produces a long, unguessable hex token', () => {
    const token = generateOpaqueToken();
    expect(token).toMatch(/^[0-9a-f]+$/);
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  it('is unique across calls', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateOpaqueToken()));
    expect(tokens.size).toBe(100);
  });
});

describe('tokensMatch', () => {
  it('matches identical tokens', () => {
    const token = generateOpaqueToken();
    expect(tokensMatch(token, token)).toBe(true);
  });

  it('rejects different tokens', () => {
    expect(tokensMatch(generateOpaqueToken(), generateOpaqueToken())).toBe(false);
  });

  it('rejects when either side is missing', () => {
    expect(tokensMatch(undefined, 'abc')).toBe(false);
    expect(tokensMatch('abc', undefined)).toBe(false);
    expect(tokensMatch(undefined, undefined)).toBe(false);
  });

  it('rejects length mismatch without throwing', () => {
    expect(tokensMatch('short', 'muchlongertoken')).toBe(false);
  });
});
