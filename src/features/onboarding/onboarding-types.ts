import type { ReactNode } from 'react';

export interface OnboardingSlide {
  readonly id: number;
  readonly heading: string;
  readonly content: ReactNode;
  readonly screenshot?: string;
  readonly screenshotAlt?: string;
}

export interface OnboardingState {
  readonly completed: boolean;
  readonly version: number;
}

export interface OnboardingHookState {
  readonly isOpen: boolean;
  readonly currentSlide: number;
  readonly canSkip: boolean;
}

export interface UseOnboardingReturn extends OnboardingHookState {
  readonly openTutorial: () => void;
  readonly closeTutorial: () => void;
  readonly nextSlide: () => void;
  readonly prevSlide: () => void;
  readonly totalSlides: number;
}

export const ONBOARDING_VERSION = 1 as const;
export const TOTAL_SLIDES = 6 as const;
export const ONBOARDING_STORAGE_KEY = 'kcnif:onboarding-v1' as const;
