'use client';

import { HelperBoard } from '@/src/components/organisms/HelperBoard';
import { useHelperGame } from '@/src/features/game/hooks/useHelperGame';
import type { HelperStaticGuide } from '@/src/features/game/game-types';

interface HelperScreenProps {
  sessionId: string;
  guide: HelperStaticGuide;
}

export function HelperScreen({ sessionId, guide }: HelperScreenProps) {
  const {
    sync,
    submittingQuestion,
    questionFeedback,
    questionResult,
    handleClientQuestionAnswer,
  } = useHelperGame(sessionId, guide);

  return (
    <HelperBoard
      sessionId={sessionId}
      guide={guide}
      sync={sync}
      submittingQuestion={submittingQuestion}
      questionFeedback={questionFeedback}
      questionResult={questionResult}
      onClientQuestionAnswer={handleClientQuestionAnswer}
    />
  );
}
