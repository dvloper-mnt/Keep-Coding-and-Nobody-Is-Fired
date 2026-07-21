import { CodePanel } from '@/src/components/atoms/CodePanel';
import { ErrorBanner } from '@/src/components/atoms/ErrorBanner';
import { GameTimer } from '@/src/components/atoms/GameTimer';
import { ExitButton } from '@/src/components/molecules/ExitButton';
import { formatDuration, GameResultBanner } from '@/src/components/molecules/GameResultBanner';
import { BossOverlay } from '@/src/components/organisms/BossOverlay';
import type { CoderStepView, GameStatus } from '@/src/features/game/game-types';

interface CoderBoardProps {
  view: CoderStepView;
  sessionId: string;
  submitting: boolean;
  shake: boolean;
  feedback: string | null;
  onAnswer: (answerIndex: number) => void;
  onAbandoned: (status: GameStatus) => void;
}

export function CoderBoard({
  view,
  sessionId,
  submitting,
  shake,
  feedback,
  onAnswer,
  onAbandoned,
}: CoderBoardProps) {
  return (
    <div
      className={`min-h-screen bg-zinc-950 text-zinc-100 ${shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}
    >
      <BossOverlay active={view.status === 'playing'} />

      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold tracking-widest text-red-500 uppercase">
              Coder — Producción en vivo
            </p>
            <p className="text-sm text-zinc-500">
              Ejercicio {view.currentStep}/{view.totalSteps}
            </p>
            <p className="mt-1 font-mono text-lg font-bold tracking-widest text-zinc-300">
              Sala: {sessionId}
            </p>
            <p className="text-xs text-zinc-600">Comparte este código con el Helper</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <GameTimer remainingTime={view.remainingTime} />
            {view.status === 'playing' && (
              <ExitButton sessionId={sessionId} role="coder" onAbandoned={onAbandoned} />
            )}
          </div>
        </div>

        {view.status === 'victory' && (
          <GameResultBanner
            containerClassName="mb-6 rounded-lg border border-green-500/50 bg-green-950/30 p-6 text-center"
            title="Nivel completado"
            titleClassName="text-2xl font-bold text-green-400"
            message="Sistema funcionando. El cliente sigue viendo la demo."
            messageClassName="mt-2 text-green-300/70"
            homeButtonClassName="mt-4 inline-block rounded-lg bg-green-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-green-500"
          />
        )}

        {view.status === 'defeat' && (
          <GameResultBanner
            containerClassName="mb-6 rounded-lg border border-red-500/50 bg-red-950/30 p-6 text-center"
            title="Se acabó el tiempo"
            titleClassName="text-2xl font-bold text-red-400"
            message="El jefe no está contento…"
            messageClassName="mt-2 text-red-300/70"
            homeButtonClassName="mt-4 inline-block rounded-lg border border-zinc-600 px-6 py-2 font-semibold text-zinc-300 transition-colors hover:bg-zinc-800"
          />
        )}

        {view.status === 'abandoned' && (
          <GameResultBanner
            containerClassName="mb-6 rounded-lg border border-zinc-600 bg-zinc-900/60 p-6 text-center"
            title="Partida abandonada"
            titleClassName="text-2xl font-bold text-zinc-300"
            message={`Finalizada por ${view.abandonedBy === 'coder' ? 'el Coder' : 'el Helper'} · Duró ${formatDuration(view.durationSeconds ?? 0)}`}
            messageClassName="mt-2 text-zinc-400"
            homeButtonClassName="mt-4 inline-block rounded-lg border border-zinc-600 px-6 py-2 font-semibold text-zinc-300 transition-colors hover:bg-zinc-800"
          />
        )}

        {view.status === 'idle' ? (
          <div className="mt-6 rounded-lg border border-red-500/30 bg-red-950/10 p-10 text-center">
            <p className="font-mono text-sm tracking-wider text-red-400">
              Estamos preparando tu incidente
              <span className="animate-pulse">…</span>
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              Comparte el código de sala con el Helper mientras tanto.
            </p>
          </div>
        ) : (
          <>
            <CodePanel code={view.code} />
            <div className="mt-4">
              <ErrorBanner error={view.error} />
            </div>
          </>
        )}

        {feedback && (
          <p
            className={`mt-4 text-center text-sm font-semibold ${
              view.lastResult === 'correct' ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {feedback}
          </p>
        )}

        {view.status === 'playing' && (
          <div className="mt-6 space-y-2">
            <p className="text-xs font-bold tracking-wider text-zinc-500 uppercase">
              Diagnóstico
            </p>
            {view.options.map((option, index) => (
              <button
                key={option}
                type="button"
                disabled={submitting}
                onClick={() => onAnswer(index)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-left text-sm transition-colors hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-50"
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
