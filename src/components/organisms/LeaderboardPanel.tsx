'use client';

import { readToken } from '@/src/features/game/api/session-token-store';
import type { LeaderboardEntry } from '@/src/features/game/game-types';
import { useState } from 'react';

interface LeaderboardPanelProps {
  sessionId: string;
}

type Phase =
  | { step: 'form' }
  | { step: 'submitting' }
  | { step: 'done'; entries: LeaderboardEntry[]; rank: number }
  | { step: 'error'; message: string };

const MAX_TEAM_NAME = 24;

// Shown at endless game over: the Coder names the team and registers the run in
// the global leaderboard, then sees the top 10 with their own position marked.
// The score is derived server-side from the session — the client never sends it.
export function LeaderboardPanel({ sessionId }: LeaderboardPanelProps) {
  const [teamName, setTeamName] = useState('');
  const [phase, setPhase] = useState<Phase>({ step: 'form' });

  async function submit() {
    const trimmed = teamName.trim();
    if (trimmed === '') {
      setPhase({ step: 'error', message: 'Ingresa un nombre de equipo válido.' });
      return;
    }
    setPhase({ step: 'submitting' });
    try {
      const res = await fetch('/api/game/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          token: readToken(sessionId, 'coder'),
          teamName: trimmed,
        }),
      });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => ({}));
        const message =
          typeof body === 'object' && body !== null && 'error' in body
            ? String((body as { error: unknown }).error)
            : 'No se pudo registrar el puntaje.';
        setPhase({ step: 'error', message });
        return;
      }
      const data = (await res.json()) as { rank: number; entries: LeaderboardEntry[] };
      setPhase({ step: 'done', entries: data.entries, rank: data.rank });
    } catch {
      setPhase({ step: 'error', message: 'Error de red al registrar el puntaje.' });
    }
  }

  if (phase.step === 'done') {
    return <LeaderboardTable entries={phase.entries} playerRank={phase.rank} />;
  }

  const submitting = phase.step === 'submitting';

  return (
    <div className="mt-6 rounded-lg border border-amber-500/40 bg-amber-950/20 p-6">
      <p className="text-lg font-semibold text-amber-300">Entra al ranking global</p>
      <p className="mt-1 text-sm text-amber-200/70">
        Ponle un nombre a tu equipo y compara qué tan lejos llegaste.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={teamName}
          maxLength={MAX_TEAM_NAME}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="Nombre de equipo"
          disabled={submitting}
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-zinc-100 placeholder-zinc-500 focus:border-amber-500 focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="rounded-lg bg-amber-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
        >
          {submitting ? 'Registrando…' : 'Registrar'}
        </button>
      </div>
      {phase.step === 'error' ? (
        <p className="mt-3 text-sm text-red-400">{phase.message}</p>
      ) : null}
    </div>
  );
}

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  // The player's global rank; undefined for a read-only view (e.g. the Helper
  // spectating the same top 10). When absent → no highlight, no player-position
  // label, no outside-top-10 message.
  playerRank?: number;
}

// Standalone table — also usable on its own (e.g. a public leaderboard view or
// the Helper's spectator view at endless game over).
export function LeaderboardTable({ entries, playerRank }: LeaderboardTableProps) {
  const hasRank = playerRank !== undefined && playerRank > 0;
  const playerInTop = hasRank && entries.some((e) => e.rank === playerRank);

  return (
    <div className="mt-6 rounded-lg border border-zinc-700 bg-zinc-900/60 p-6">
      <div className="flex items-baseline justify-between">
        <p className="text-lg font-semibold text-zinc-100">Ranking global</p>
        {hasRank ? (
          <p className="text-sm text-amber-300">Tu posición: #{playerRank}</p>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-400">Aún no hay puntajes. ¡Sé el primero!</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400">
                <th className="py-2 pr-4 font-medium">#</th>
                <th className="py-2 pr-4 font-medium">Equipo</th>
                <th className="py-2 pr-4 text-right font-medium tabular-nums">Puntaje</th>
                <th className="py-2 text-right font-medium tabular-nums">Rondas</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isPlayer = hasRank && entry.rank === playerRank;
                return (
                  <tr
                    key={entry.rank}
                    className={
                      isPlayer
                        ? 'bg-amber-500/15 font-semibold text-amber-200'
                        : 'text-zinc-200'
                    }
                  >
                    <td className="py-2 pr-4 tabular-nums">{entry.rank}</td>
                    {/* Rendered as text (JSX escapes it) — never as HTML. */}
                    <td className="py-2 pr-4">{entry.teamName}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {entry.score.toLocaleString()}
                    </td>
                    <td className="py-2 text-right tabular-nums">{entry.playedRounds}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasRank && !playerInTop ? (
        <p className="mt-3 text-sm text-zinc-400">
          Tu equipo quedó en la posición #{playerRank}, fuera del top 10.
        </p>
      ) : null}
    </div>
  );
}
