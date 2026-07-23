'use client';

import { useEffect, useState } from 'react';
import { getLeaderboardTop } from '@/src/features/game/api/game-client';
import type { LeaderboardEntry } from '@/src/features/game/game-types';

// One-shot fetch of the global top 10. Meant for a spectator view (e.g. the
// Helper at endless game over) that reads the ranking WITHOUT registering. The
// Coder-side registration flow lives in `LeaderboardPanel` and issues its own
// POST — this hook is read-only.
//
// `active=false` short-circuits the fetch entirely, so the caller can mount the
// hook unconditionally without hitting the API while the game is still going.
//
// The `pending` phase covers both "not started yet" (active=false) and "waiting
// for the response" (active=true, fetch in flight). We do not set a loading
// state synchronously inside the effect — that violates React 19's
// no-sync-set-state-in-effect rule. Transitions to `ready`/`error` happen
// asynchronously inside the .then/.catch callbacks, which is the safe path.

export type LeaderboardTopState =
  | { phase: 'pending' }
  | { phase: 'ready'; entries: LeaderboardEntry[] }
  | { phase: 'error'; message: string };

export function useLeaderboardTop(active: boolean): LeaderboardTopState {
  const [state, setState] = useState<LeaderboardTopState>({ phase: 'pending' });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    getLeaderboardTop()
      .then((top) => {
        if (cancelled) return;
        setState({ phase: 'ready', entries: top.entries });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ phase: 'error', message: 'No se pudo cargar el ranking.' });
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  return state;
}
