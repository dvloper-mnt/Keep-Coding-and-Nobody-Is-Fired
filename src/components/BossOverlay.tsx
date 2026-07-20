'use client';

import { BOSS_MESSAGES } from '@/src/lib/constants';
import { useEffect, useState } from 'react';

interface BossOverlayProps {
  active: boolean;
}

export function BossOverlay({ active }: BossOverlayProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % BOSS_MESSAGES.length);
    }, 15000);
    return () => clearInterval(interval);
  }, [active]);

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed top-4 left-1/2 z-50 -translate-x-1/2">
      <div className="rounded-md border border-red-500/50 bg-red-950/80 px-6 py-2 text-sm font-bold tracking-wider text-red-300 uppercase backdrop-blur-sm">
        {BOSS_MESSAGES[index]}
      </div>
    </div>
  );
}