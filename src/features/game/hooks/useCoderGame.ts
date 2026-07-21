'use client';

import { getCoderState, submitAnswer, tick } from '@/src/features/game/api/game-client';
import type { CoderStepView, GameStatus } from '@/src/features/game/game-types';
import { useClockTickSound } from '@/src/hooks/useClockTickSound';
import { playCorrect, playWrong, unlockAudio } from '@/src/lib/game-audio';
import { useCallback, useState } from 'react';
import { usePolling } from './usePolling';

interface UseCoderGameResult {
  view: CoderStepView;
  sessionId: string;
  submitting: boolean;
  shake: boolean;
  feedback: string | null;
  handleAnswer: (answerIndex: number) => Promise<void>;
  handleAbandoned: (status: GameStatus) => void;
}

export function useCoderGame(
  initialSessionId: string,
  initialView: CoderStepView,
): UseCoderGameResult {
  const [sessionId] = useState(initialSessionId);
  const [view, setView] = useState<CoderStepView>(initialView);
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useClockTickSound(view.status === 'playing');

  const fetchState = useCallback(async () => {
    try {
      setView(await getCoderState(sessionId));
    } catch {
      // Transient poll failure: keep the last known view, try again next tick.
    }
  }, [sessionId]);

  // Poll while playing (tick the clock + refresh) and also while idle (no clock
  // yet — just refresh so the room gets promoted once Bedrock finishes).
  usePolling(
    () => {
      void (async () => {
        if (view.status === 'playing') {
          try {
            await tick(sessionId);
          } catch {
            // Ignore a transient tick failure; the next poll recovers.
          }
        }
        await fetchState();
      })();
    },
    1000,
    view.status === 'playing' || view.status === 'idle',
  );

  const handleAnswer = useCallback(
    async (answerIndex: number) => {
      if (submitting || view.status !== 'playing') return;
      void unlockAudio();
      setSubmitting(true);
      setFeedback(null);

      try {
        const data = await submitAnswer(sessionId, answerIndex);

        if (data.success) {
          playCorrect();
          setFeedback('Parche aplicado');
          if (data.coderView) setView(data.coderView);
        } else {
          playWrong();
          setShake(true);
          setFeedback(data.message ?? 'El sistema sigue fallando…');
          setTimeout(() => setShake(false), 500);
          if (data.coderView) setView(data.coderView);
          else await fetchState();
        }
      } catch {
        setFeedback('Error de conexión. Reintentá.');
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, view.status, sessionId, fetchState],
  );

  const handleAbandoned = useCallback(
    (status: GameStatus) => {
      // Apply the terminal status right away so the polling (which stops once
      // status leaves 'playing') can't race and leave the screen stuck. Then
      // refresh to pull abandonedBy/durationSeconds for the end banner.
      setView((prev) => ({ ...prev, status }));
      void fetchState();
    },
    [fetchState],
  );

  return { view, sessionId, submitting, shake, feedback, handleAnswer, handleAbandoned };
}
