'use client';

interface GameTimerProps {
  remainingTime: number;
}

export function GameTimer({ remainingTime }: GameTimerProps) {
  const minutes = Math.floor(remainingTime / 60);
  const seconds = remainingTime % 60;
  const urgent = remainingTime <= 30;
  const critical = remainingTime <= 10;

  return (
    <div
      className={`rounded-lg border px-4 py-2 font-mono text-2xl font-bold tabular-nums transition-colors ${
        critical
          ? 'border-red-500 bg-red-950/50 text-red-400 animate-pulse'
          : urgent
            ? 'border-orange-500 bg-orange-950/30 text-orange-400'
            : 'border-zinc-700 bg-zinc-900 text-zinc-100'
      }`}
    >
      {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
    </div>
  );
}