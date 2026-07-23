'use client';

import { shareTargets, type ShareStats } from '@/src/features/game/share-score';

interface ShareScoreButtonsProps {
  stats: ShareStats;
}

// Canonical game URL for the share link. Configurable via env (public) so it is
// not buried in a component; defaults to the production domain.
const GAME_URL =
  process.env.NEXT_PUBLIC_GAME_URL ?? 'https://hackaton.dvloper.com.co';

// Per-network share buttons shown at endless game over. Each opens the network's
// native share dialog (no backend, no SES) with the score text + game link
// prefilled. The player confirms and posts.
export function ShareScoreButtons({ stats }: ShareScoreButtonsProps) {
  const targets = shareTargets(stats, GAME_URL);

  return (
    <div className="mt-4">
      <p className="text-sm text-zinc-400">Comparte tu resultado</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {targets.map((target) => (
          <a
            key={target.id}
            href={target.href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800"
          >
            {target.label}
          </a>
        ))}
      </div>
    </div>
  );
}
