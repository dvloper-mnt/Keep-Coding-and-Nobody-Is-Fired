'use client';

import type { HelperStaticGuide, HelperSyncView } from '@/src/features/game/game-types';
import { useClockTickSound } from '@/src/hooks/useClockTickSound';
import { playCorrect, playWrong, unlockAudio } from '@/src/lib/game-audio';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { BossOverlay } from './BossOverlay';
import { ClientQuestionModal } from './ClientQuestionModal';
import { GameTimer } from './GameTimer';
import { ManualPanel } from './ManualPanel';

interface HelperScreenProps {
  sessionId: string;
  guide: HelperStaticGuide;
}

export function HelperScreen({ sessionId, guide }: HelperScreenProps) {
  const [sync, setSync] = useState<HelperSyncView>({
    remainingTime: 180,
    currentStep: 1,
    totalSteps: guide.totalExercises,
    status: 'playing',
    activeClientQuestion: null,
  });
  const [submittingQuestion, setSubmittingQuestion] = useState(false);
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
    const res = await fetch(`/api/game/sync?sessionId=${sessionId}`);
    if (res.ok) {
      const data: HelperSyncView = await res.json();
      setSync(data);
    }
  }, [sessionId]);

  useEffect(() => {
    if (sync.status !== 'playing') return;

    const interval = setInterval(fetchSync, 1000);
    return () => clearInterval(interval);
  }, [sessionId, sync.status, fetchSync]);

  async function handleClientQuestionAnswer(answerIndex: number) {
    if (submittingQuestion || !sync.activeClientQuestion) return;

    void unlockAudio();
    setSubmittingQuestion(true);
    setQuestionFeedback(null);
    setQuestionResult(null);

    const res = await fetch('/api/game/client-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, answerIndex }),
    });

    const data = await res.json();
    setSubmittingQuestion(false);

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
    setQuestionFeedback(data.message ?? 'Respuesta incorrecta.');
    setSync((prev) => ({
      ...prev,
      remainingTime: data.remainingTime,
      status: data.status,
      activeClientQuestion: data.activeClientQuestion ?? prev.activeClientQuestion,
    }));
  }

  return (
    <div className="min-h-screen bg-amber-950 text-amber-100">
      <BossOverlay active={sync.status === 'playing'} />

      {sync.activeClientQuestion && (
        <ClientQuestionModal
          question={sync.activeClientQuestion}
          submitting={submittingQuestion}
          feedback={questionFeedback}
          lastResult={questionResult}
          onAnswer={handleClientQuestionAnswer}
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
          <div className="mb-6 rounded-lg border border-green-500/30 bg-green-950/20 p-4 text-center">
            <p className="text-green-400">Crisis resuelta. Buen trabajo en equipo.</p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-lg bg-green-600 px-6 py-2 font-semibold text-white transition-colors hover:bg-green-500"
            >
              Volver al inicio
            </Link>
          </div>
        )}

        {sync.status === 'defeat' && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-950/20 p-4 text-center">
            <p className="text-red-400">Tiempo agotado. La guía sigue disponible para revisión.</p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-lg border border-amber-600 px-6 py-2 font-semibold text-amber-200 transition-colors hover:bg-amber-900"
            >
              Volver al inicio
            </Link>
          </div>
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