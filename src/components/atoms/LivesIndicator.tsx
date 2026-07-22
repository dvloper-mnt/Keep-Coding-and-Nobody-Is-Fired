'use client';

interface LivesIndicatorProps {
  lives: number;
  maxLives: number;
  variant: 'coder' | 'helper';
  pulse?: boolean;
}

const VARIANT_STYLES = {
  coder: {
    container: 'border-zinc-700 bg-zinc-900',
    filled: 'text-red-400',
    empty: 'text-zinc-700',
  },
  helper: {
    container: 'border-amber-600/40 bg-amber-950/60',
    filled: 'text-amber-400',
    empty: 'text-amber-900/60',
  },
} as const;

export function LivesIndicator({ lives, maxLives, variant, pulse = false }: LivesIndicatorProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <div
      className={`flex items-center gap-1 rounded-lg border px-3 py-2 ${styles.container} ${
        pulse ? 'animate-pulse' : ''
      }`}
      aria-label={`${lives} de ${maxLives} vidas`}
    >
      {Array.from({ length: maxLives }, (_, index) => {
        const filled = index < lives;
        return (
          <span
            key={index}
            className={`text-lg leading-none transition-all duration-300 ${
              filled ? styles.filled : styles.empty
            } ${filled ? 'scale-100' : 'scale-90 opacity-60'}`}
            aria-hidden="true"
          >
            {filled ? '♥' : '♡'}
          </span>
        );
      })}
    </div>
  );
}