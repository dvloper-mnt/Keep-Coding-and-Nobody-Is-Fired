import { ONBOARDING_STORAGE_KEY } from '../onboarding-types';
import type { OnboardingState } from '../onboarding-types';

function isSSR(): boolean {
  return typeof window === 'undefined';
}

function isValidOnboardingState(value: unknown): value is OnboardingState {
  if (typeof value !== 'object' || value === null) return false;
  if (!('completed' in value) || !('version' in value)) return false;

  return typeof value.completed === 'boolean' && typeof value.version === 'number';
}

export function readOnboardingState(): OnboardingState | null {
  if (isSSR()) return null;

  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isValidOnboardingState(parsed)) return null;

    return { completed: parsed.completed, version: parsed.version };
  } catch {
    return null;
  }
}

export function hasSeenOnboarding(currentVersion: number): boolean {
  if (isSSR()) return false;

  const state = readOnboardingState();
  if (state === null) return false;
  if (!state.completed) return false;

  return state.version >= currentVersion;
}

export function markOnboardingAsSeen(version: number): void {
  if (isSSR()) return;

  try {
    const state: OnboardingState = { completed: true, version };
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage can be full or disabled — fail silently
  }
}

export function resetOnboarding(): void {
  if (isSSR()) return;

  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  } catch {
    // localStorage can be disabled — fail silently
  }
}
