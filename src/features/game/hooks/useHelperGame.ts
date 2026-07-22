'use client';

import { getHelperSync, submitClientQuestionAnswer } from '@/src/features/game/api/game-client';
import type { GameStatus, HelperStaticGuide, HelperSyncView } from '@/src/features/game/game-types';
import { useClockTickSound } from '@/src/hooks/useClockTickSound';
import { playCorrect, playWrong, unlockAudio } from '@/src/lib/game-audio';
import { LIFE_LOST_MESSAGE, MAX_LIVES } from '@/src/lib/constants';
import { useCallback, useEffect, useState } from 'react';
import { usePolling } from './usePolling';

interface UseHelperGameResult {
  sync: HelperSyncView;
  submittingQuestion: boolean;
  questionFeedback: string | null;
  questionResult: 'correct' | 'incorrect' | null;
  livesPulse: boolean;
  handleClientQuestionAnswer: (answerIndex: number) => Promise<void>;
  handleAbandoned: (status: GameStatus) => void;
}

export function useHelperGame(
  sessionId: string,
  guide: HelperStaticGuide,
): UseHelperGameResult {
  const [sync, setSync] = useState<HelperSyncView>({
    remainingTime: 180,
    currentStep: 1,
    totalSteps: guide.totalExercises,
    status: 'playing',
    activeClientQuestion: null,
    helperLives: MAX_LIVES,
  });
  const [submittingQuestion, setSubmittingQuestion] = useState(false);
  const [livesPulse, setLivesPulse] = useState(false);
  const [questionFeedback, setQuestionFeedback] = useState<string | null>(null);
  const [questionResult, setQuestionResult] = useState<'correct' | 'incorrect' | null>(null);

  const [lastQuestionId, setLastQuestionId] = useState<string | null>(null);
  const activeQuestionId = sync.activeClientQuestion?.id ?? null;
  if (activeQuestionId !== lastQuestionId) {
    setLastQuestionId(activeQuestionId);
    setQuestionFeedback(null);
    setQuestionResult(null);
  }

  useClockTickSound(sync.status === 'playing');

  useEffect(() => {
    function handleInteraction() {
      void unlockAudio();
    }

    document.addEventListener('click', handleInteraction, { once: true });
    document.addEventListener('touchstart', handleInteraction, { once: true });

    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('touchstart', handleInteraction);
    };
  }, []);

  const fetchSync = useCallback(async () => {
    try {
      setSync(await getHelperSync(sessionId));
    } catch {
      // Transient poll failure: keep the last known sync, retry next tick.
    }
  }, [sessionId]);

  usePolling(() => void fetchSync(), 1000, sync.status === 'playing');

  const handleClientQuestionAnswer = useCallback(
    async (answerIndex: number) => {
      if (submittingQuestion || !sync.activeClientQuestion) return;

      void unlockAudio();
      setSubmittingQuestion(true);
      setQuestionFeedback(null);
      setQuestionResult(null);

      try {
        const data = await submitClientQuestionAnswer(sessionId, answerIndex);

        if (data.success) {
          playCorrect();
          setQuestionResult('correct');
          setQuestionFeedback(data.message ?? 'Buena respuesta.');
          setSync((prev) => ({
            ...prev,
            remainingTime: data.remainingTime,
            status: data.status,
            activeClientQuestion: null,
          }));
          return;
        }

        playWrong();
        setQuestionResult('incorrect');
        setLivesPulse(true);
        const baseMessage = data.message ?? 'Respuesta incorrecta.';
        setQuestionFeedback(data.lifeLost ? `${baseMessage} ${LIFE_LOST_MESSAGE}` : baseMessage);
        setTimeout(() => setLivesPulse(false), 600);
        setSync((prev) => ({
          ...prev,
          remainingTime: data.remainingTime,
          status: data.status,
          helperLives: data.livesRemaining ?? prev.helperLives,
          activeClientQuestion: data.activeClientQuestion ?? prev.activeClientQuestion,
        }));
      } catch {
        setQuestionFeedback('Error de conexión. Reintentá.');
      } finally {
        setSubmittingQuestion(false);
      }
    },
    [submittingQuestion, sync.activeClientQuestion, sessionId],
  );

  const handleAbandoned = useCallback(
    (status: GameStatus) => {
      setSync((prev) => ({ ...prev, status }));
      void fetchSync();
    },
    [fetchSync],
  );

  return {
    sync,
    submittingQuestion,
    questionFeedback,
    questionResult,
    livesPulse,
    handleClientQuestionAnswer,
    handleAbandoned,
  };
}
