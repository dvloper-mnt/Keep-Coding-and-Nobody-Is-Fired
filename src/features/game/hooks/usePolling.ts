'use client';

import { useEffect, useRef } from 'react';

// The poll stops the moment the game leaves 'playing', but that decision is made
// from data the poll itself fetched — a player who didn't trigger the end (the
// other side abandoned) could miss the final state. One last fetch on the
// enabled→disabled edge guarantees the end screen always shows.
export function shouldRunFinalFetch(wasEnabled: boolean, enabled: boolean): boolean {
  return wasEnabled && !enabled;
}

export function usePolling(callback: () => void, intervalMs: number, enabled: boolean): void {
  const savedCallback = useRef(callback);
  const wasEnabled = useRef(enabled);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) {
      if (shouldRunFinalFetch(wasEnabled.current, enabled)) {
        savedCallback.current();
      }
      wasEnabled.current = false;
      return;
    }

    wasEnabled.current = true;
    const interval = setInterval(() => savedCallback.current(), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs, enabled]);
}
