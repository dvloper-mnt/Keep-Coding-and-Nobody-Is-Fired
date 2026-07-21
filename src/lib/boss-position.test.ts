import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBossToast, generateBossPlacement } from './boss-position';
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

describe('generateBossPlacement keeps toasts out of the central panel', () => {
  const { sideZoneMaxPercent, edgeMarginPercent } = BOSS_PRESSURE_CONFIG;
  const rightZoneMin = 100 - sideZoneMaxPercent;

  it('always lands in a side column, never over the center', () => {
    for (let i = 0; i < 200; i++) {
      const { leftPercent, topPercent } = generateBossPlacement(BOSS_PRESSURE_CONFIG);

      const inLeftColumn = leftPercent >= edgeMarginPercent && leftPercent <= sideZoneMaxPercent;
      const inRightColumn = leftPercent >= rightZoneMin && leftPercent <= 100 - edgeMarginPercent;

      expect(inLeftColumn || inRightColumn).toBe(true);
      expect(topPercent).toBeGreaterThanOrEqual(edgeMarginPercent);
      expect(topPercent).toBeLessThanOrEqual(100 - edgeMarginPercent);
    }
  });
});
