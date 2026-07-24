import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ONBOARDING_STORAGE_KEY, ONBOARDING_VERSION } from '../onboarding-types';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });
Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true, configurable: true });

describe('onboarding-storage', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.resetModules();
  });

  describe('readOnboardingState', () => {
    it('returns null if key does not exist', async () => {
      const { readOnboardingState } = await import('./onboarding-storage');
      expect(readOnboardingState()).toBeNull();
    });

    it('returns null if JSON is corrupted', async () => {
      const { readOnboardingState } = await import('./onboarding-storage');
      localStorageMock.setItem(ONBOARDING_STORAGE_KEY, '{not valid json!!!');
      expect(readOnboardingState()).toBeNull();
    });

    it('returns null if structure is invalid (missing fields)', async () => {
      const { readOnboardingState } = await import('./onboarding-storage');
      localStorageMock.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ completed: true }));
      expect(readOnboardingState()).toBeNull();
    });

    it('returns null if types are wrong', async () => {
      const { readOnboardingState } = await import('./onboarding-storage');
      localStorageMock.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ completed: 'yes', version: '1' }));
      expect(readOnboardingState()).toBeNull();
    });

    it('returns valid state when data is correct', async () => {
      const { readOnboardingState } = await import('./onboarding-storage');
      const validState = { completed: true, version: 1 };
      localStorageMock.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(validState));
      expect(readOnboardingState()).toEqual(validState);
    });
  });

  describe('hasSeenOnboarding', () => {
    it('returns false if state does not exist', async () => {
      const { hasSeenOnboarding } = await import('./onboarding-storage');
      expect(hasSeenOnboarding(ONBOARDING_VERSION)).toBe(false);
    });

    it('returns false if version is older than current', async () => {
      const { hasSeenOnboarding } = await import('./onboarding-storage');
      localStorageMock.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ completed: true, version: 1 }));
      expect(hasSeenOnboarding(2)).toBe(false);
    });

    it('returns false if completed is false even with correct version', async () => {
      const { hasSeenOnboarding } = await import('./onboarding-storage');
      localStorageMock.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ completed: false, version: 1 }));
      expect(hasSeenOnboarding(1)).toBe(false);
    });

    it('returns true if version matches and completed', async () => {
      const { hasSeenOnboarding } = await import('./onboarding-storage');
      localStorageMock.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ completed: true, version: 1 }));
      expect(hasSeenOnboarding(1)).toBe(true);
    });

    it('returns true if stored version is HIGHER than current', async () => {
      const { hasSeenOnboarding } = await import('./onboarding-storage');
      localStorageMock.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ completed: true, version: 3 }));
      expect(hasSeenOnboarding(2)).toBe(true);
    });
  });

  describe('markOnboardingAsSeen', () => {
    it('writes correct structure to localStorage', async () => {
      const { markOnboardingAsSeen } = await import('./onboarding-storage');
      markOnboardingAsSeen(ONBOARDING_VERSION);
      const stored = localStorageMock.getItem(ONBOARDING_STORAGE_KEY);
      expect(stored).not.toBeNull();
      const parsed: unknown = JSON.parse(stored!);
      expect(parsed).toEqual({ completed: true, version: ONBOARDING_VERSION });
    });

    it('does not throw if localStorage is full', async () => {
      const { markOnboardingAsSeen } = await import('./onboarding-storage');
      const spy = vi.spyOn(localStorageMock, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() => markOnboardingAsSeen(ONBOARDING_VERSION)).not.toThrow();
      spy.mockRestore();
    });
  });

  describe('resetOnboarding', () => {
    it('removes the key from localStorage', async () => {
      const { resetOnboarding, markOnboardingAsSeen } = await import('./onboarding-storage');
      markOnboardingAsSeen(ONBOARDING_VERSION);
      expect(localStorageMock.getItem(ONBOARDING_STORAGE_KEY)).not.toBeNull();
      resetOnboarding();
      expect(localStorageMock.getItem(ONBOARDING_STORAGE_KEY)).toBeNull();
    });

    it('does not throw if localStorage throws', async () => {
      const { resetOnboarding } = await import('./onboarding-storage');
      const spy = vi.spyOn(localStorageMock, 'removeItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      expect(() => resetOnboarding()).not.toThrow();
      spy.mockRestore();
    });
  });

  describe('SSR safety', () => {
    it('all functions return safe defaults when window is undefined', async () => {
      // Remove window to simulate SSR
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
      // @ts-expect-error — intentionally removing window for SSR test
      delete globalThis.window;

      vi.resetModules();
      const { readOnboardingState, hasSeenOnboarding, markOnboardingAsSeen, resetOnboarding } =
        await import('./onboarding-storage');

      // These should not throw and return safe defaults
      expect(readOnboardingState()).toBeNull();
      expect(hasSeenOnboarding(ONBOARDING_VERSION)).toBe(false);
      expect(() => markOnboardingAsSeen(ONBOARDING_VERSION)).not.toThrow();
      expect(() => resetOnboarding()).not.toThrow();

      // Restore window
      if (descriptor) {
        Object.defineProperty(globalThis, 'window', descriptor);
      } else {
        Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true, configurable: true });
      }
    });
  });
});
