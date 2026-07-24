'use client';

import { useState, useCallback } from 'react';
import { hasSeenOnboarding, markOnboardingAsSeen } from '../logic/onboarding-storage';
import { ONBOARDING_VERSION, TOTAL_SLIDES } from '../onboarding-types';
import type { UseOnboardingReturn } from '../onboarding-types';

function getInitialOpen(): boolean {
  return !hasSeenOnboarding(ONBOARDING_VERSION);
}

export function useOnboarding(): UseOnboardingReturn {
  const [isOpen, setIsOpen] = useState(getInitialOpen);
  const [currentSlide, setCurrentSlide] = useState(1);

  const openTutorial = useCallback(() => {
    setIsOpen(true);
    setCurrentSlide(1);
  }, []);

  const closeTutorial = useCallback(() => {
    markOnboardingAsSeen(ONBOARDING_VERSION);
    setIsOpen(false);
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
