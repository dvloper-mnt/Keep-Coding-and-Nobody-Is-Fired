'use client';

import { readToken } from '@/src/features/game/api/session-token-store';
import type { LeaderboardEntry, RunSummary } from '@/src/features/game/game-types';
import { useEffect, useState } from 'react';

interface LeaderboardPanelProps {
  sessionId: string;
  // Optional run summary — when present, the "done" phase adds a download link
  // to the share-card OG image (which needs score + rounds + team).
  runSummary?: RunSummary;
  // True when the server says this run is already in the leaderboard (e.g. the
  // page was reloaded after registering). We then fetch the ranking on mount
  // and show it instead of the (already-used) registration form.
  alreadyRegistered?: boolean;
}

type Phase =
  | { step: 'form' }
  | { step: 'loading' }
  | { step: 'submitting' }
  | { step: 'done'; entries: LeaderboardEntry[]; rank: number; teamName?: string }
  | { step: 'error'; message: string };

const MAX_TEAM_NAME = 24;

// Shown at endless game over: the Coder names the team and registers the run in
// the global leaderboard, then sees the top 10 with their own position marked.
// The score is derived server-side from the session — the client never sends it.
export function LeaderboardPanel({ sessionId, runSummary, alreadyRegistered }: LeaderboardPanelProps) {
  const [teamName, setTeamName] = useState('');
  const [phase, setPhase] = useState<Phase>(
    alreadyRegistered ? { step: 'loading' } : { step: 'form' },
  );

  // On a reload of an already-registered run, fetch the current ranking so we
  // can show the scoreboard instead of the form. No openedRef-style guard here:
  // each mount runs its own fetch with its own `cancelled` flag, so React's
  // StrictMode double-mount (dev) resolves cleanly — the second mount's fetch is
  // the one that lands. (A shared ref would let the first mount's cleanup cancel
  // the only in-flight request and leave the panel stuck on "loading".)
  useEffect(() => {
    if (!alreadyRegistered) return;
    let cancelled = false;
    fetch('/api/game/leaderboard')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('http'))))
      .then((data: { entries: LeaderboardEntry[] }) => {
        if (cancelled) return;
        // Read-only ranking: no own rank to highlight on a cold reload, but the
        // player still sees the global top 10 rather than a dead form.
        setPhase({ step: 'done', entries: data.entries, rank: 0 });
      })
      .catch(() => {
        if (!cancelled) setPhase({ step: 'error', message: 'No se pudo cargar el ranking.' });
      });
    return () => {
      cancelled = true;
    };
  }, [alreadyRegistered]);

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
      setPhase({
        step: 'done',
        entries: data.entries,
        rank: data.rank,
        teamName: trimmed,
      });
    } catch {
      setPhase({ step: 'error', message: 'Error de red al registrar el puntaje.' });
    }
  }

  if (phase.step === 'loading') {
    return (
      <div className="mt-6 rounded-lg border border-emerald-500/20 bg-zinc-950 px-5 py-6 font-mono text-sm text-emerald-300/70">
        <span className="text-emerald-600">$</span> cargando ranking global…
      </div>
    );
  }

  if (phase.step === 'done') {
    return (
      <div>
        <LeaderboardTable entries={phase.entries} playerRank={phase.rank} />
        {runSummary && phase.teamName ? (
          <ShareCardDownload
            teamName={phase.teamName}
            score={runSummary.score}
            rounds={runSummary.roundsReached}
          />
        ) : null}
      </div>
    );
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

// Rank badge for the podium (top 3) — a medal; everyone else gets the padded
// position number, so the column stays monospace-aligned.
function rankBadge(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return String(rank).padStart(2, '0');
}

// Standalone scoreboard — also usable on its own (a public leaderboard view or
// the Helper's spectator view at endless game over). Styled as a phosphor-green
// terminal readout to match the game's production-log / code-panel aesthetic:
// the ranking reads like it was tailed straight out of /var/log.
export function LeaderboardTable({ entries, playerRank }: LeaderboardTableProps) {
  const hasRank = playerRank !== undefined && playerRank > 0;
  const playerInTop = hasRank && entries.some((e) => e.rank === playerRank);

  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-emerald-500/30 bg-zinc-950 font-mono shadow-[0_0_40px_-12px_rgba(16,185,129,0.35)]">
      {/* Terminal title bar */}
      <div className="flex items-center justify-between border-b border-emerald-500/20 bg-emerald-500/5 px-5 py-3">
        <p className="text-sm tracking-wide text-emerald-400">
          <span className="text-emerald-600">$</span> cat /var/log/highscores
        </p>
        {hasRank ? (
          <p className="text-xs uppercase tracking-widest text-amber-400">
            tu posición · #{playerRank}
          </p>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <p className="px-5 py-6 text-sm text-emerald-300/70">
          <span className="text-emerald-600">&gt;</span> sin registros todavía. Sé el primero en dejar tu marca.
        </p>
      ) : (
        <div className="overflow-x-auto px-2 py-2">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="text-[0.7rem] uppercase tracking-widest text-emerald-600">
                <th className="px-3 py-2 font-normal">Pos</th>
                <th className="px-3 py-2 font-normal">Equipo</th>
                <th className="px-3 py-2 text-right font-normal tabular-nums">Puntaje</th>
                <th className="px-3 py-2 text-right font-normal tabular-nums">Rondas</th>
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
                        ? 'rounded bg-amber-400/10 text-amber-200 shadow-[inset_2px_0_0_0_rgb(251,191,36)]'
                        : 'text-emerald-300/90'
                    }
                  >
                    <td className="px-3 py-2.5 text-base tabular-nums">{rankBadge(entry.rank)}</td>
                    {/* Rendered as text (JSX escapes it) — never as HTML. */}
                    <td className="px-3 py-2.5 font-semibold">
                      {entry.teamName}
                      {isPlayer ? (
                        <span className="ml-2 text-[0.65rem] uppercase tracking-widest text-amber-400/80">
                          ◄ tú
                        </span>
                      ) : null}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right text-base tabular-nums ${
                        isPlayer ? 'text-amber-300' : 'text-emerald-200'
                      }`}
                    >
                      {entry.score.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-400/70">
                      {entry.playedRounds}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasRank && !playerInTop ? (
        <p className="border-t border-emerald-500/20 px-5 py-3 text-xs text-emerald-300/70">
          <span className="text-emerald-600">&gt;</span> tu equipo quedó en la posición #{playerRank}, fuera del top 10.
        </p>
      ) : null}
    </div>
  );
}

interface ShareCardDownloadProps {
  teamName: string;
  score: number;
  rounds: number;
}

// Small CTA rendered after successful registration: links to the OG share-card
// endpoint so the player can download / share a PNG of their run. The link
// opens in a new tab; the browser can download or the player can copy the URL
// into any social network. The server sanitizes the team name again, so the
// query string is safe to construct from the same input the user submitted.
function ShareCardDownload({ teamName, score, rounds }: ShareCardDownloadProps) {
  const params = new URLSearchParams({
    score: String(score),
    rounds: String(rounds),
    team: teamName,
  });
  const href = `/api/game/share-card?${params.toString()}`;

  return (
    <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-950/10 p-4 text-center">
      <p className="text-sm text-amber-200/80">
        Comparte tu resultado como imagen
      </p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block rounded-lg border border-amber-500 bg-amber-600/20 px-6 py-2 font-semibold text-amber-100 transition-colors hover:bg-amber-600/40"
      >
        Descargar tarjeta
      </a>
    </div>
  );
}
