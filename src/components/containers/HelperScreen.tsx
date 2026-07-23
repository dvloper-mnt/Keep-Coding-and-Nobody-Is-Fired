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
    guide: liveGuide,
    submittingQuestion,
    questionFeedback,
    questionResult,
    livesPulse,
    guideLoading,
    revealing,
    handleClientQuestionAnswer,
    handleReveal,
    handleAbandoned,
  } = useHelperGame(sessionId, guide);

  return (
    <HelperBoard
      sessionId={sessionId}
      guide={liveGuide}
      guideLoading={guideLoading}
      sync={sync}
      submittingQuestion={submittingQuestion}
      questionFeedback={questionFeedback}
      questionResult={questionResult}
      livesPulse={livesPulse}
      revealing={revealing}
      onClientQuestionAnswer={handleClientQuestionAnswer}
      onReveal={handleReveal}
      onAbandoned={handleAbandoned}
    />
  );
}
