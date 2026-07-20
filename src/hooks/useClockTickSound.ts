'use client';

import { playClockTick, preloadSounds } from '@/src/lib/game-audio';
import { useEffect } from 'react';

export function useClockTickSound(active: boolean): void {
  useEffect(() => {
    preloadSounds();
  }, []);

  useEffect(() => {
    if (!active) return;

    const interval = setInterval(() => {
      playClockTick();
    }, 1000);

    return () => clearInterval(interval);
  }, [active]);
}