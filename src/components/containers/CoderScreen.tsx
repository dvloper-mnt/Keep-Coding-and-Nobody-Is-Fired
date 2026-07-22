'use client';

import { CoderBoard } from '@/src/components/organisms/CoderBoard';
import { useCoderGame } from '@/src/features/game/hooks/useCoderGame';
import { useChallengeStream } from '@/src/features/game/hooks/useChallengeStream';
import { extractStreamingPreview } from '@/src/features/game/streaming-preview';
import type { CoderStepView } from '@/src/features/game/game-types';

interface CoderScreenProps {
  initialSessionId: string;
  initialView: CoderStepView;
}

export function CoderScreen({ initialSessionId, initialView }: CoderScreenProps) {
  const { view, sessionId, submitting, shake, livesPulse, feedback, handleAnswer, handleAbandoned } =
    useCoderGame(initialSessionId, initialView);

  // Open the SSE stream only while the room is idle so Bedrock's output appears
  // token-by-token. Once the room transitions to playing the hook becomes a
  // no-op; the board assembles from the validated Challenge via getCoderState.
  const { partialText } = useChallengeStream(sessionId, view.status === 'idle');

  // Extract a friendly preview (title + context) from the raw streaming JSON.
  const streamingPreview = extractStreamingPreview(partialText);

  return (
    <CoderBoard
      view={view}
      sessionId={sessionId}
      submitting={submitting}
      shake={shake}
      livesPulse={livesPulse}
      feedback={feedback}
      onAnswer={handleAnswer}
      onAbandoned={handleAbandoned}
      streamingPreview={streamingPreview}
    />
  );
}
