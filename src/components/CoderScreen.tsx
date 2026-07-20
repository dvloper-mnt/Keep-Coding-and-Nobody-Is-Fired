'use client';

import type { CoderStepView } from '@/src/features/game/game-types';
import { useCallback, useEffect, useState } from 'react';
import { BossOverlay } from './BossOverlay';
import { CodePanel } from './CodePanel';
import { ErrorBanner } from './ErrorBanner';
import { GameTimer } from './GameTimer';

interface CoderScreenProps {
  initialSessionId: string;
  initialView: CoderStepView;
}

export function CoderScreen({ initialSessionId, initialView }: CoderScreenProps) {
  const [sessionId] = useState(initialSessionId);
  const [view, setView] = useState<CoderStepView>(initialView);
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    const res = await fetch(`/api/game/state?sessionId=${sessionId}`);
    if (res.ok) {
      const data: CoderStepView = await res.json();
      setView(data);
    }
  }, [sessionId]);

  useEffect(() => {
    if (view.status !== 'playing') return;

    const interval = setInterval(async () => {
      await fetch(`/api/game/tick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      await fetchState();
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionId, view.status, fetchState]);

  async function handleAnswer(answerIndex: number) {
    if (submitting || view.status !== 'playing') return;
    setSubmitting(true);
    setFeedback(null);

    const res = await fetch('/api/game/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, answerIndex }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (data.success) {
      setFeedback('Fix applied');
      if (data.coderView) setView(data.coderView);
    } else {
      setShake(true);
      setFeedback(data.message ?? 'El sistema sigue fallando…');
      setTimeout(() => setShake(false), 500);
      if (data.coderView) setView(data.coderView);
      else await fetchState();
    }
  }

  return (
    <div
      className={`min-h-screen bg-zinc-950 text-zinc-100 ${shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}
    >
      <BossOverlay active={view.status === 'playing'} />

      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold tracking-widest text-red-500 uppercase">
              Coder — Producción en vivo
            </p>
            <p className="text-sm text-zinc-500">
              Ejercicio {view.currentStep}/{view.totalSteps}
            </p>
            <p className="mt-1 font-mono text-lg font-bold tracking-widest text-zinc-300">
              Sala: {sessionId}
            </p>
            <p className="text-xs text-zinc-600">Compartí este código con el Helper</p>
          </div>
          <GameTimer remainingTime={view.remainingTime} />
        </div>

        {view.status === 'victory' && (
          <div className="mb-6 rounded-lg border border-green-500/50 bg-green-950/30 p-6 text-center">
            <p className="text-2xl font-bold text-green-400">Nivel completado</p>
            <p className="mt-2 text-green-300/70">Sistema funcionando. El cliente sigue viendo la demo.</p>
          </div>
        )}

        {view.status === 'defeat' && (
          <div className="mb-6 rounded-lg border border-red-500/50 bg-red-950/30 p-6 text-center">
            <p className="text-2xl font-bold text-red-400">Se acabó el tiempo</p>
            <p className="mt-2 text-red-300/70">El jefe no está contento…</p>
          </div>
        )}

        <CodePanel code={view.code} />
        <div className="mt-4">
          <ErrorBanner error={view.error} />
        </div>

        {feedback && (
          <p
            className={`mt-4 text-center text-sm font-semibold ${
              view.lastResult === 'correct' ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {feedback}
          </p>
        )}

        {view.status === 'playing' && (
          <div className="mt-6 space-y-2">
            <p className="text-xs font-bold tracking-wider text-zinc-500 uppercase">
              Diagnóstico
            </p>
            {view.options.map((option, index) => (
              <button
                key={option}
                type="button"
                disabled={submitting}
                onClick={() => handleAnswer(index)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-left text-sm transition-colors hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-50"
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}