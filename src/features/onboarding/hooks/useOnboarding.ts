'use client';

import { useState, useCallback, useSyncExternalStore } from 'react';
import { hasSeenOnboarding, markOnboardingAsSeen } from '../logic/onboarding-storage';
import { ONBOARDING_VERSION, TOTAL_SLIDES } from '../onboarding-types';
import type { UseOnboardingReturn } from '../onboarding-types';

/**
 * Reads localStorage to determine if the onboarding should auto-open.
 * Uses useSyncExternalStore so the server always renders `false` (no modal)
 * and the client picks up the real value without hydration mismatch.
 */
function subscribe(): () => void {
  return () => {};
}

function getClientSnapshot(): boolean {
  return !hasSeenOnboarding(ONBOARDING_VERSION);
}

function getServerSnapshot(): boolean {
  return false;
}

export function useOnboarding(): UseOnboardingReturn {
  const shouldAutoOpen = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  const [manuallyOpened, setManuallyOpened] = useState(false);
  const [manuallyClosed, setManuallyClosed] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(1);

  const isOpen = manuallyClosed ? false : (manuallyOpened || shouldAutoOpen);

  const openTutorial = useCallback(() => {
    setManuallyOpened(true);
    setManuallyClosed(false);
    setCurrentSlide(1);
  }, []);

  const closeTutorial = useCallback(() => {
    markOnboardingAsSeen(ONBOARDING_VERSION);
    setManuallyClosed(true);
    setManuallyOpened(false);
  }, []);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => Math.min(prev + 1, TOTAL_SLIDES));
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => Math.max(prev - 1, 1));
  }, []);

  const canSkip = currentSlide > 2;

  return {
    isOpen,
    currentSlide,
    canSkip,
    openTutorial,
    closeTutorial,
    nextSlide,
    prevSlide,
    totalSlides: TOTAL_SLIDES,
  };
}
