'use client';

import { useEffect, useState } from 'react';
import { getLeaderboardTop } from '@/src/features/game/api/game-client';
import type { LeaderboardEntry } from '@/src/features/game/game-types';

// Spectator view of the global top 10 (e.g. the Helper at endless game over)
// that reads the ranking WITHOUT registering — the Coder-side POST lives in
// `LeaderboardPanel`.
//
// Why it polls instead of fetching once: the Helper usually reaches game over
// BEFORE the Coder submits the team name, so a single fetch would resolve
// against the pre-registration top 10 and show a stale ranking forever (the
// Helper's sync polling has already stopped at the terminal state). Instead we
// refetch on a light interval so the Coder's freshly written score appears
// within a few seconds. The poll is bounded by MAX_POLLS so we never hammer the
// endpoint indefinitely once the ranking has settled.
//
// `active=false` short-circuits entirely, so the caller can mount the hook
// unconditionally while the game is still going.
//
// React 19: no synchronous setState inside the effect. The first `pending`
// comes from useState's initializer; all transitions happen asynchronously in
// the .then/.catch callbacks.

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 10; // ~30s window — well past a normal Coder registration.

export type LeaderboardTopState =
  | { phase: 'pending' }
  | { phase: 'ready'; entries: LeaderboardEntry[] }
  | { phase: 'error'; message: string };

export function useLeaderboardTop(active: boolean): LeaderboardTopState {
  const [state, setState] = useState<LeaderboardTopState>({ phase: 'pending' });

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const fetchOnce = () => {
      polls += 1;
      getLeaderboardTop()
        .then((top) => {
          if (cancelled) return;
          setState({ phase: 'ready', entries: top.entries });
          scheduleNext();
        })
        .catch(() => {
          if (cancelled) return;
          // Keep a ready ranking on screen if a later poll fails; only surface
          // an error when we never got a first result.
          setState((prev) => (prev.phase === 'ready' ? prev : { phase: 'error', message: 'No se pudo cargar el ranking.' }));
          scheduleNext();
        });
    };

    const scheduleNext = () => {
      if (cancelled || polls >= MAX_POLLS) return;
      timer = setTimeout(fetchOnce, POLL_INTERVAL_MS);
    };

    fetchOnce();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [active]);

  return state;
}
