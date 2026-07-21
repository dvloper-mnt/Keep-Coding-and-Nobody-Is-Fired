import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBossToast } from './boss-position';
import { BOSS_PRESSURE_CONFIG } from './constants';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createBossToast id generation', () => {
  it('uses crypto.randomUUID when available (secure context)', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-from-crypto' });
    const toast = createBossToast(BOSS_PRESSURE_CONFIG, [], []);
    expect(toast.id).toBe('uuid-from-crypto');
  });

  it('falls back to a generated id when crypto.randomUUID is missing (plain HTTP)', () => {
    vi.stubGlobal('crypto', {});
    const toast = createBossToast(BOSS_PRESSURE_CONFIG, [], []);
    expect(typeof toast.id).toBe('string');
    expect(toast.id.length).toBeGreaterThan(0);
    expect(toast.id).toMatch(/^id-/);
  });

  it('falls back when crypto itself is undefined', () => {
    vi.stubGlobal('crypto', undefined);
    const toast = createBossToast(BOSS_PRESSURE_CONFIG, [], []);
    expect(typeof toast.id).toBe('string');
    expect(toast.id.length).toBeGreaterThan(0);
  });

  it('still fills message and placement', () => {
    const toast = createBossToast(BOSS_PRESSURE_CONFIG, [], []);
    expect(typeof toast.message).toBe('string');
    expect(toast.placement).toHaveProperty('topPercent');
    expect(toast.placement).toHaveProperty('leftPercent');
  });
});
