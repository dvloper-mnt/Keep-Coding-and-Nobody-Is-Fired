import { GameTimer } from '@/src/components/atoms/GameTimer';
import { GameResultBanner } from '@/src/components/molecules/GameResultBanner';
import { ManualPanel } from '@/src/components/molecules/ManualPanel';
import { BossOverlay } from '@/src/components/organisms/BossOverlay';
import { ClientQuestionModal } from '@/src/components/organisms/ClientQuestionModal';
import type { HelperStaticGuide, HelperSyncView } from '@/src/features/game/game-types';

interface HelperBoardProps {
  sessionId: string;
  guide: HelperStaticGuide;
  sync: HelperSyncView;
  submittingQuestion: boolean;
  questionFeedback: string | null;
  questionResult: 'correct' | 'incorrect' | null;
  onClientQuestionAnswer: (answerIndex: number) => void;
}

export function HelperBoard({
  sessionId,
  guide,
  sync,
  submittingQuestion,
  questionFeedback,
  questionResult,
  onClientQuestionAnswer,
}: HelperBoardProps) {
  return (
    <div className="min-h-screen bg-amber-950 text-amber-100">
      <BossOverlay active={sync.status === 'playing'} />

      {sync.activeClientQuestion && (
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
          <GameTimer remainingTime={sync.remainingTime} />
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
            title="Tiempo agotado. La guía sigue disponible para revisión."
            titleClassName="text-red-400"
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
