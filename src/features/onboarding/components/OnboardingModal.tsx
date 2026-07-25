'use client';

import { useEffect, useRef, useCallback } from 'react';
import { OnboardingSlide } from './OnboardingSlide';
import { OnboardingProgress } from './OnboardingProgress';
import { NavigationButton } from './NavigationButton';
import { ONBOARDING_SLIDES } from '../logic/onboarding-content';
import type { UseOnboardingReturn } from '../onboarding-types';

interface OnboardingModalProps {
  readonly hookState: UseOnboardingReturn;
}

export function OnboardingModal({ hookState }: OnboardingModalProps) {
  const {
    isOpen,
    currentSlide,
    canSkip,
    closeTutorial,
    nextSlide,
    prevSlide,
    totalSlides,
  } = hookState;

  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Save and restore focus
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
    } else if (previousFocusRef.current instanceof HTMLElement) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  // Focus first interactive element when modal opens or slide changes
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const focusable = modalRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  }, [isOpen, currentSlide]);

  // Body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Focus trap: Tab/Shift+Tab cycling
  const handleTabKey = useCallback((e: KeyboardEvent) => {
    if (!modalRef.current) return;

    const focusable = modalRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const firstElement = focusable[0];
    const lastElement = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }, []);

  // Keyboard event handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          if (canSkip) closeTutorial();
          break;
        case 'ArrowRight':
          if (currentSlide < totalSlides) nextSlide();
          break;
        case 'ArrowLeft':
          if (currentSlide > 1) prevSlide();
          break;
        case 'Tab':
          handleTabKey(e);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, canSkip, currentSlide, totalSlides, closeTutorial, nextSlide, prevSlide, handleTabKey]);

  if (!isOpen) return null;

  const slide = ONBOARDING_SLIDES[currentSlide - 1];
  const isLastSlide = currentSlide === totalSlides;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 animate-backdrop-fade-in"
        onClick={canSkip ? closeTutorial : undefined}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-heading"
        aria-describedby="onboarding-content"
        className="relative z-10 w-full max-w-3xl bg-[#0a0a0b] border border-zinc-800 rounded-lg shadow-2xl overflow-hidden animate-modal-fade-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <OnboardingProgress current={currentSlide} total={totalSlides} />
          {canSkip && (
            <button
              onClick={closeTutorial}
              className="text-zinc-400 hover:text-zinc-200 transition-colors p-1 rounded focus:outline-none focus:ring-2 focus:ring-zinc-500"
              aria-label="Cerrar tutorial"
            >
              ✕
            </button>
          )}
        </div>

        {/* Slide Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto scrollbar-onboarding">
          <OnboardingSlide slide={slide} />
        </div>

        {/* Navigation Footer */}
        <div className="flex items-center justify-between p-4 border-t border-zinc-800">
          <div>
            {currentSlide > 1 && (
              <NavigationButton
                onClick={prevSlide}
                variant="secondary"
                aria-label="Slide anterior"
              >
                ← Anterior
              </NavigationButton>
            )}
          </div>

          <div className="flex gap-3">
            {canSkip && (
              <NavigationButton
                onClick={closeTutorial}
                variant="ghost"
                aria-label="Saltar el tutorial y cerrar"
              >
                Saltar Tutorial
              </NavigationButton>
            )}

            {isLastSlide ? (
              <NavigationButton
                onClick={closeTutorial}
                variant="primary"
              >
                ¡Entendido!
              </NavigationButton>
            ) : (
              <NavigationButton
                onClick={nextSlide}
                variant="primary"
                aria-label="Siguiente slide"
              >
                Siguiente →
              </NavigationButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
