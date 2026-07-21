'use client';

import { useEffect, useRef } from 'react';

export function usePolling(callback: () => void, intervalMs: number, enabled: boolean): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => savedCallback.current(), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs, enabled]);
}
