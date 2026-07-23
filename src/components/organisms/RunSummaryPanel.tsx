'use client';

import { formatDuration } from '@/src/components/molecules/GameResultBanner';
import type {
  ChallengeLanguage,
  Difficulty,
  RunSummary,
} from '@/src/features/game/game-types';

interface RunSummaryPanelProps {
  summary: RunSummary;
}

const LANGUAGE_LABEL: Record<ChallengeLanguage, string> = {
  random: 'Variado',
  php: 'PHP',
  sql: 'SQL',
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  python: 'Python',
  go: 'Go',
  java: 'Java',
  ruby: 'Ruby',
};

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Fácil',
  medium: 'Media',
  hard: 'Difícil',
  expert: 'Experto',
};

const EMPTY = '—';

// Results screen shown at endless game over: the closing story of "how far did
// we get". Reads the run summary the server derived (score includes combos —
// the same number the player saw), showing absent data as "—".
export function RunSummaryPanel({ summary }: RunSummaryPanelProps) {
  const stats: Array<{ label: string; value: string }> = [
    { label: 'Rondas alcanzadas', value: String(summary.roundsReached) },
    { label: 'Puntaje', value: summary.score.toLocaleString() },
    { label: 'Tiempo sobrevivido', value: formatDuration(summary.secondsSurvived) },
    { label: 'Mejor racha', value: String(summary.bestStreak) },
    {
      label: 'Dificultad máxima',
      value: summary.maxDifficulty ? DIFFICULTY_LABEL[summary.maxDifficulty] : EMPTY,
    },
    {
      label: 'Lenguaje con más fallos',
      value: summary.topFailure
        ? `${LANGUAGE_LABEL[summary.topFailure.language]} (${summary.topFailure.count})`
        : EMPTY,
    },
  ];

  return (
    <div className="mt-6 rounded-lg border border-zinc-700 bg-zinc-900/60 p-6">
      <p className="text-lg font-semibold text-zinc-100">Resumen de la partida</p>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-xs uppercase tracking-wide text-zinc-500">{stat.label}</dt>
            <dd className="mt-1 text-xl font-semibold text-zinc-100 tabular-nums">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
