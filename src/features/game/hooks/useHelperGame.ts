'use client';

import { getHelperGuide, getHelperSync, submitClientQuestionAnswer } from '@/src/features/game/api/game-client';
import type { GameStatus, HelperStaticGuide, HelperSyncView } from '@/src/features/game/game-types';
import { useClockTickSound } from '@/src/hooks/useClockTickSound';
import { playCorrect, playWrong, unlockAudio } from '@/src/lib/game-audio';
import { LIFE_LOST_MESSAGE, MAX_LIVES } from '@/src/lib/constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePolling } from './usePolling';

interface UseHelperGameResult {
  sync: HelperSyncView;
  guide: HelperStaticGuide;
  submittingQuestion: boolean;
  questionFeedback: string | null;
  questionResult: 'correct' | 'incorrect' | null;
  livesPulse: boolean;
  guideLoading: boolean;
  handleClientQuestionAnswer: (answerIndex: number) => Promise<void>;
  handleAbandoned: (status: GameStatus) => void;
}

export function useHelperGame(
  sessionId: string,
  initialGuide: HelperStaticGuide,
): UseHelperGameResult {
  const [guide, setGuide] = useState<HelperStaticGuide>(initialGuide);
  const [sync, setSync] = useState<HelperSyncView>({
    remainingTime: 180,
    currentStep: 1,
    totalSteps: initialGuide.totalExercises,
    status: 'playing',
    activeClientQuestion: null,
    helperLives: MAX_LIVES,
    round: 1,
    mode: 'endless',
  });
  const [submittingQuestion, setSubmittingQuestion] = useState(false);
  const [livesPulse, setLivesPulse] = useState(false);
  const [questionFeedback, setQuestionFeedback] = useState<string | null>(null);
  const [questionResult, setQuestionResult] = useState<'correct' | 'incorrect' | null>(null);
  const [guideLoading, setGuideLoading] = useState(false);
  const lastSyncedRound = useRef<number | undefined>(undefined);

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

  const refreshGuide = useCallback(async () => {
    setGuideLoading(true);
    try {
      for (;;) {
        const result = await getHelperGuide(sessionId);
        if ('occupied' in result) break;
        if (!('pending' in result)) {
          setGuide(result);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    } catch {
      // Keep the previous guide on transient failure; sync poll will retry.
    } finally {
      setGuideLoading(false);
    }
  }, [sessionId]);

  const fetchSync = useCallback(async () => {
    try {
      const next = await getHelperSync(sessionId);
      setSync(next);

      const roundChanged =
        lastSyncedRound.current !== undefined && next.round !== lastSyncedRound.current;
      lastSyncedRound.current = next.round;

      if (roundChanged && next.status === 'playing') {
        void refreshGuide();
      }
    } catch {
      // Transient poll failure: keep the last known sync, retry next tick.
    }
  }, [sessionId, refreshGuide]);

  usePolling(
    () => void fetchSync(),
    1000,
    sync.status === 'playing' || sync.status === 'idle',
  );

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
        setQuestionFeedback('Error de conexión. Reintenta.');
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
    guide,
    submittingQuestion,
    questionFeedback,
    questionResult,
    livesPulse,
    guideLoading,
    handleClientQuestionAnswer,
    handleAbandoned,
  };
}