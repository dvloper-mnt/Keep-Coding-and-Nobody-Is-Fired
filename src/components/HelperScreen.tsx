'use client';

import type { HelperStaticGuide, HelperSyncView } from '@/src/features/game/game-types';
import { useClockTickSound } from '@/src/hooks/useClockTickSound';
import { unlockAudio } from '@/src/lib/game-audio';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { BossOverlay } from './BossOverlay';
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
  });

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

    const interval = setInterval(fetchSync, 2000);
    return () => clearInterval(interval);
  }, [sessionId, sync.status, fetchSync]);

  return (
    <div className="min-h-screen bg-amber-950 text-amber-100">
      <BossOverlay active={sync.status === 'playing'} />

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