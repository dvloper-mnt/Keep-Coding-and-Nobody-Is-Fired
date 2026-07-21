'use client';

import { CoderBoard } from '@/src/components/organisms/CoderBoard';
import { useCoderGame } from '@/src/features/game/hooks/useCoderGame';
import type { CoderStepView } from '@/src/features/game/game-types';

interface CoderScreenProps {
  initialSessionId: string;
  initialView: CoderStepView;
}

export function CoderScreen({ initialSessionId, initialView }: CoderScreenProps) {
  const { view, sessionId, submitting, shake, feedback, handleAnswer } = useCoderGame(
    initialSessionId,
    initialView,
  );

  return (
    <CoderBoard
      view={view}
      sessionId={sessionId}
      submitting={submitting}
      shake={shake}
      feedback={feedback}
      onAnswer={handleAnswer}
    />
  );
}
