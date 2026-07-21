'use client';

import { useEffect, useState } from 'react';

interface BootstrapState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Runs an async loader keyed by `trigger` and tracks loading/data/error.
 * Each page supplies its own loader, so the shared mechanics are reused without
 * forcing the Coder and Helper flows into one shape. Pass a stable `loader`
 * (defined inline is fine — it only runs when `trigger` changes).
 */
export function useGameSessionBootstrap<T>(
  loader: () => Promise<T>,
  errorMessage: string,
  trigger: string | null,
  enabled: boolean = true,
): BootstrapState<T> {
  const [state, setState] = useState<BootstrapState<T>>({
    data: null,
    loading: enabled,
    error: null,
  });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    loader()
      .then((result) => {
        if (!cancelled) setState({ data: result, loading: false, error: null });
      })
      .catch(() => {
        if (!cancelled) setState({ data: null, loading: false, error: errorMessage });
      });

    return () => {
      cancelled = true;
    };
  }, [trigger, enabled, errorMessage, loader]);

  return state;
}
