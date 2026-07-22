'use client';

import { useCodeStepReveal } from '@/src/hooks/useCodeStepReveal';
import { useEffect } from 'react';

interface TypewriterCodePanelProps {
  code: string;
  currentStep: number;
  lastResult?: 'correct' | 'incorrect';
  enabled?: boolean;
  onRevealingChange?: (revealing: boolean) => void;
}

export function TypewriterCodePanel({
  code,
  currentStep,
  lastResult,
  enabled = true,
  onRevealingChange,
}: TypewriterCodePanelProps) {
  const { displayedCode, isRevealing, skipReveal } = useCodeStepReveal({
    code,
    currentStep,
    lastResult,
    enabled,
  });

  useEffect(() => {
    onRevealingChange?.(isRevealing);
  }, [isRevealing, onRevealingChange]);

  return (
    <pre
      className="overflow-x-auto rounded-lg border border-zinc-700 bg-zinc-950 p-4 font-mono text-sm leading-relaxed text-green-400"
      onClick={isRevealing ? skipReveal : undefined}
      role={isRevealing ? 'button' : undefined}
      tabIndex={isRevealing ? 0 : undefined}
      onKeyDown={
        isRevealing
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                skipReveal();
              }
            }
          : undefined
      }
      aria-label={isRevealing ? 'Revelando código. Clic para completar.' : undefined}
    >
      <code>
        {displayedCode}
        {isRevealing && <span className="animate-pulse text-emerald-300">▍</span>}
      </code>
    </pre>
  );
}