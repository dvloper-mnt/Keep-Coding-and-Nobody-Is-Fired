'use client';

import { getCodeRevealSegments, getRevealCharIntervalMs } from '@/src/lib/code-reveal';
import { useCallback, useEffect, useRef, useState } from 'react';

interface SettledCodeState {
  step: number;
  code: string;
}

interface UseCodeStepRevealOptions {
  code: string;
  currentStep: number;
  lastResult?: 'correct' | 'incorrect';
  enabled?: boolean;
}

interface UseCodeStepRevealResult {
  displayedCode: string;
  isRevealing: boolean;
  skipReveal: () => void;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function shouldAnimateTransition(
  previous: SettledCodeState,
  next: SettledCodeState,
  lastResult?: 'correct' | 'incorrect',
): boolean {
  if (previous.code === next.code) return false;

  if (next.step > previous.step) return true;

  return lastResult === 'correct';
}

export function useCodeStepReveal({
  code,
  currentStep,
  lastResult,
  enabled = true,
}: UseCodeStepRevealOptions): UseCodeStepRevealResult {
  const settledRef = useRef<SettledCodeState>({ step: currentStep, code });
  const animatingTargetRef = useRef<SettledCodeState | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [displayedCode, setDisplayedCode] = useState(code);
  const [isRevealing, setIsRevealing] = useState(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const settle = useCallback(
    (next: SettledCodeState) => {
      clearTimer();
      settledRef.current = next;
      animatingTargetRef.current = null;
      setDisplayedCode(next.code);
      setIsRevealing(false);
    },
    [clearTimer],
  );

  const skipReveal = useCallback(() => {
    if (!isRevealing) return;
    settle({ step: currentStep, code });
  }, [code, currentStep, isRevealing, settle]);

  const startReveal = useCallback(
    (previous: SettledCodeState, next: SettledCodeState) => {
      const { stable, animated } = getCodeRevealSegments(previous.code, next.code);

      if (!animated || prefersReducedMotion()) {
        settle(next);
        return;
      }

      clearTimer();
      animatingTargetRef.current = next;
      setIsRevealing(true);

      let charIndex = 0;
      setDisplayedCode(stable);

      const intervalMs = getRevealCharIntervalMs(animated.length);
      timerRef.current = setInterval(() => {
        charIndex += 1;
        setDisplayedCode(stable + animated.slice(0, charIndex));

        if (charIndex >= animated.length) {
          settle(next);
        }
      }, intervalMs);
    },
    [clearTimer, settle],
  );

  useEffect(() => {
    if (!enabled) {
      settle({ step: currentStep, code });
      return;
    }

    const previous = settledRef.current;
    const next = { step: currentStep, code };

    if (previous.step === next.step && previous.code === next.code) {
      return;
    }

    const animatingTarget = animatingTargetRef.current;
    if (
      animatingTarget &&
      animatingTarget.step === next.step &&
      animatingTarget.code === next.code
    ) {
      return;
    }

    if (shouldAnimateTransition(previous, next, lastResult)) {
      startReveal(previous, next);
      return;
    }

    settle(next);
  }, [code, currentStep, enabled, lastResult, settle, startReveal]);

  useEffect(() => clearTimer, [clearTimer]);

  return { displayedCode, isRevealing, skipReveal };
}