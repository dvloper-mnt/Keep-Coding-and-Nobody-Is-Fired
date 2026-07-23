'use client';

import { ErrorBanner } from '@/src/components/atoms/ErrorBanner';
import { GameTimer } from '@/src/components/atoms/GameTimer';
import { LivesIndicator } from '@/src/components/atoms/LivesIndicator';
import { ExitButton } from '@/src/components/molecules/ExitButton';
import { formatDuration, GameResultBanner } from '@/src/components/molecules/GameResultBanner';
import { TypewriterCodePanel } from '@/src/components/molecules/TypewriterCodePanel';
import { BossOverlay } from '@/src/components/organisms/BossOverlay';
import { ProductionLogTail } from '@/src/components/organisms/ProductionLogTail';
import type { CoderStepView, GameStatus } from '@/src/features/game/game-types';
import type { StreamingPreview } from '@/src/features/game/streaming-preview';
import { getDefeatCopy } from '@/src/lib/defeat-messages';
import { MAX_LIVES } from '@/src/lib/constants';
import { useState } from 'react';

interface CoderBoardProps {
  view: CoderStepView;
  sessionId: string;
  submitting: boolean;
  shake: boolean;
  livesPulse: boolean;
  feedback: string | null;
  onAnswer: (answerIndex: number) => void;
  onAbandoned: (status: GameStatus) => void;
  /**
   * Live preview (title + context) extracted from Bedrock's stream while the
   * room is idle. DECORATIVE ONLY — never used to build the board. The board is
   * assembled only from the validated Challenge via getCoderState.
   */
  streamingPreview: StreamingPreview;
}

export function CoderBoard({
  view,
  sessionId,
  submitting,
  shake,
  livesPulse,
  feedback,
  onAnswer,
  onAbandoned,
  streamingPreview,
}: CoderBoardProps) {
  const [isCodeRevealing, setIsCodeRevealing] = useState(false);
  const defeatCopy = getDefeatCopy('coder', view.defeatReason);

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
              {view.mode === 'endless' && view.round != null && (
                <span className="mr-2 font-semibold text-amber-400/90">
                  Ronda {view.round}
                </span>
              )}
              Ejercicio {view.currentStep}/{view.totalSteps}
            </p>
            <p className="mt-1 font-mono text-lg font-bold tracking-widest text-zinc-300">
              Sala: {sessionId}
            </p>
            <p className="text-xs text-zinc-600">Comparte este código con el Helper</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <LivesIndicator
                lives={view.coderLives}
                maxLives={MAX_LIVES}
                variant="coder"
                pulse={livesPulse}
              />
              <GameTimer remainingTime={view.remainingTime} />
            </div>
            {view.status === 'playing' && (
              <ExitButton sessionId={sessionId} role="coder" onAbandoned={onAbandoned} />
            )}
          </div>
        </div>

        {view.status === 'victory' && view.mode !== 'endless' && (
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
            title={defeatCopy.title}
            titleClassName="text-2xl font-bold text-red-400"
            message={
              view.mode === 'endless' && view.endlessScore != null
                ? `${defeatCopy.message} Llegaste a ${view.playedRounds ?? 0} rondas · ${view.endlessScore.toLocaleString()} pts.`
                : defeatCopy.message
            }
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
          <ProductionLogTail
            language={view.language ?? 'random'}
            streamingPreview={streamingPreview}
          />
        ) : (
          <>
            <TypewriterCodePanel
              code={view.code}
              currentStep={view.currentStep}
              lastResult={view.lastResult}
              enabled={view.status === 'playing' || view.status === 'victory'}
              onRevealingChange={setIsCodeRevealing}
            />
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
                disabled={submitting || isCodeRevealing}
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
