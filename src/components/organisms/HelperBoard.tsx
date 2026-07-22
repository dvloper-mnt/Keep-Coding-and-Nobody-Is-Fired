import { GameTimer } from '@/src/components/atoms/GameTimer';
import { LivesIndicator } from '@/src/components/atoms/LivesIndicator';
import { ExitButton } from '@/src/components/molecules/ExitButton';
import { formatDuration, GameResultBanner } from '@/src/components/molecules/GameResultBanner';
import { ManualPanel } from '@/src/components/molecules/ManualPanel';
import { BossOverlay } from '@/src/components/organisms/BossOverlay';
import { ClientQuestionModal } from '@/src/components/organisms/ClientQuestionModal';
import type { GameStatus, HelperStaticGuide, HelperSyncView } from '@/src/features/game/game-types';
import { getDefeatCopy } from '@/src/lib/defeat-messages';
import { MAX_LIVES } from '@/src/lib/constants';

interface HelperBoardProps {
  sessionId: string;
  guide: HelperStaticGuide;
  sync: HelperSyncView;
  submittingQuestion: boolean;
  questionFeedback: string | null;
  questionResult: 'correct' | 'incorrect' | null;
  livesPulse: boolean;
  onClientQuestionAnswer: (answerIndex: number) => void;
  onAbandoned: (status: GameStatus) => void;
}

export function HelperBoard({
  sessionId,
  guide,
  sync,
  submittingQuestion,
  questionFeedback,
  questionResult,
  livesPulse,
  onClientQuestionAnswer,
  onAbandoned,
}: HelperBoardProps) {
  const defeatCopy = getDefeatCopy('helper', sync.defeatReason);

  return (
    <div className="min-h-screen bg-amber-950 text-amber-100">
      <BossOverlay active={sync.status === 'playing'} />

      {sync.activeClientQuestion && sync.status === 'playing' && (
        <ClientQuestionModal
          question={sync.activeClientQuestion}
          submitting={submittingQuestion}
          feedback={questionFeedback}
          lastResult={questionResult}
          onAnswer={onClientQuestionAnswer}
        />
      )}

      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold tracking-widest text-amber-500 uppercase">
              Helper — Soporte
            </p>
            <p className="text-sm text-amber-400/60">
              Progreso Coder: ejercicio {sync.currentStep}/{sync.totalSteps} · Sala {sessionId}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <LivesIndicator
                lives={sync.helperLives}
                maxLives={MAX_LIVES}
                variant="helper"
                pulse={livesPulse}
              />
              <GameTimer remainingTime={sync.remainingTime} />
            </div>
            {sync.status === 'playing' && (
              <ExitButton sessionId={sessionId} role="helper" onAbandoned={onAbandoned} />
            )}
          </div>
        </div>

        {sync.status === 'victory' && (
          <GameResultBanner
            containerClassName="mb-6 rounded-lg border border-green-500/30 bg-green-950/20 p-4 text-center"
            title="Crisis resuelta. Buen trabajo en equipo."
            titleClassName="text-green-400"
            homeButtonClassName="mt-4 inline-block rounded-lg bg-green-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-green-500"
          />
        )}

        {sync.status === 'defeat' && (
          <GameResultBanner
            containerClassName="mb-6 rounded-lg border border-red-500/30 bg-red-950/20 p-4 text-center"
            title={defeatCopy.title}
            titleClassName="text-red-400"
            message={defeatCopy.message}
            messageClassName="mt-2 text-red-300/70"
            homeButtonClassName="mt-4 inline-block rounded-lg border border-amber-600 px-6 py-2 font-semibold text-amber-200 transition-colors hover:bg-amber-900"
          />
        )}

        {sync.status === 'abandoned' && (
          <GameResultBanner
            containerClassName="mb-6 rounded-lg border border-amber-700/40 bg-amber-900/30 p-4 text-center"
            title="Partida abandonada"
            titleClassName="font-bold text-amber-300"
            message={`Finalizada por ${sync.abandonedBy === 'coder' ? 'el Coder' : 'el Helper'} · Duró ${formatDuration(sync.durationSeconds ?? 0)}`}
            messageClassName="mt-2 text-amber-400/70"
            homeButtonClassName="mt-4 inline-block rounded-lg border border-amber-600 px-6 py-2 font-semibold text-amber-200 transition-colors hover:bg-amber-900"
          />
        )}

        <ManualPanel
          title={guide.title}
          storyContext={guide.storyContext}
          sections={guide.sections}
        />
      </div>
    </div>
  );
}
