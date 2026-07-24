'use client';

interface OnboardingProgressProps {
  readonly current: number;
  readonly total: number;
}

export function OnboardingProgress({ current, total }: OnboardingProgressProps) {
  return (
    <span className="text-sm text-zinc-400 font-mono" aria-label={`Paso ${current} de ${total}`}>
      {current}/{total}
    </span>
  );
}
