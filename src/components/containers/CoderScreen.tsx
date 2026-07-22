'use client';

import { CoderBoard } from '@/src/components/organisms/CoderBoard';
import { useCoderGame } from '@/src/features/game/hooks/useCoderGame';
import { useChallengeStream } from '@/src/features/game/hooks/useChallengeStream';
import type { CoderStepView } from '@/src/features/game/game-types';

interface CoderScreenProps {
  initialSessionId: string;
  initialView: CoderStepView;
}

export function CoderScreen({ initialSessionId, initialView }: CoderScreenProps) {
  const { view, sessionId, submitting, shake, feedback, handleAnswer, handleAbandoned } =
    useCoderGame(initialSessionId, initialView);

  // Open the SSE stream only while the room is idle so Bedrock's output appears
  // token-by-token. Once the room transitions to playing the hook becomes a
  // no-op; the board assembles from the validated Challenge via getCoderState.
  const { partialText } = useChallengeStream(sessionId, view.status === 'idle');

  return (
    <CoderBoard
      view={view}
      sessionId={sessionId}
      submitting={submitting}
      shake={shake}
      feedback={feedback}
      onAnswer={handleAnswer}
      onAbandoned={handleAbandoned}
      streamingPartialText={partialText}
    />
  );
}
