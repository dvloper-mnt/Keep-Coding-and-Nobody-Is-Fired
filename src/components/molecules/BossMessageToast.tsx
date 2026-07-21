'use client';

import type { BossToast } from '@/src/lib/boss-position';

interface BossMessageToastProps {
  toast: BossToast;
  onDismiss: (id: string) => void;
}

export function BossMessageToast({ toast, onDismiss }: BossMessageToastProps) {
  const { id, message, placement } = toast;
  const onLeft = placement.emphasis === 'left';
  const placementKey = `${placement.topPercent}-${placement.leftPercent}`;

  return (
    <div
      className="pointer-events-auto fixed z-50"
      style={{
        top: `${placement.topPercent}%`,
        left: `${placement.leftPercent}%`,
      }}
    >
      <div
        key={placementKey}
        className={`animate-boss-pop relative max-w-[16rem] -translate-y-1/2 rounded-md border border-red-500/50 bg-red-950/85 px-4 py-2 pr-8 text-sm font-bold tracking-wider text-red-300 uppercase backdrop-blur-sm ${
          onLeft ? '' : '-translate-x-full'
        }`}
      >
        <button
          type="button"
          aria-label="Intentar descartar mensaje del jefe"
          onClick={() => onDismiss(id)}
          className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded text-xs text-red-400/80 transition-colors hover:bg-red-900/60 hover:text-red-200"
        >
          ×
        </button>
        {message}
      </div>
    </div>
  );
}