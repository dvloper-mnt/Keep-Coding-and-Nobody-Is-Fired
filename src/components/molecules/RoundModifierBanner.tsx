'use client';

import { BOSS_EVENTS } from '@/src/lib/constants';
import type { RoundModifier } from '@/src/features/game/game-types';

interface RoundModifierBannerProps {
  modifier: RoundModifier | undefined;
}

// Announces a special round: a boss encounter or a surprise event. Shown to both
// Coder and Helper so they share the same context. Renders nothing on a normal
// round ('none' / undefined).
export function RoundModifierBanner({ modifier }: RoundModifierBannerProps) {
  if (modifier === undefined || modifier === 'none') return null;

  if (modifier === 'boss') {
    return (
      <div className="mb-4 rounded-lg border border-fuchsia-500/50 bg-fuchsia-950/30 p-4 text-center">
        <p className="text-lg font-bold uppercase tracking-wide text-fuchsia-300">
          ⚔ Jefe final
        </p>
        <p className="mt-1 text-sm text-fuchsia-200/80">
          Un incidente encadenado más largo. Recuerden juntos lo que ya resolvieron.
        </p>
      </div>
    );
  }

  const notice = BOSS_EVENTS[modifier].notice;
  return (
    <div className="mb-4 rounded-lg border border-amber-500/50 bg-amber-950/30 p-4 text-center">
      <p className="text-sm font-semibold text-amber-200">⚠ {notice}</p>
    </div>
  );
}
