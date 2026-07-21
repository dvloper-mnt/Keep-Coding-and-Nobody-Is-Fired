'use client';

import { CoderScreen } from '@/src/components/containers/CoderScreen';
import { GameLoadingScreen } from '@/src/components/molecules/GameLoadingScreen';
import { getCoderState, startGame } from '@/src/features/game/api/game-client';
import { useGameSessionBootstrap } from '@/src/features/game/hooks/useGameSessionBootstrap';
import type { CoderStepView } from '@/src/features/game/game-types';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback } from 'react';

interface CoderBootstrap {
  sessionId: string;
  view: CoderStepView;
}

const GENERATING_VIEW: CoderStepView = {
  code: '',
  error: '',
  options: [],
  currentStep: 0,
  totalSteps: 0,
  remainingTime: 0,
  status: 'idle',
};

function CoderPageContent() {
  const searchParams = useSearchParams();
  const existingSession = searchParams.get('session');
  const requestedLanguage = searchParams.get('lang') ?? undefined;

  const loader = useCallback(async (): Promise<CoderBootstrap> => {
    if (existingSession) {
      const view = await getCoderState(existingSession);
      return { sessionId: existingSession, view };
    }

    // New game: create the room (idle) and enter the board immediately so the
    // code is visible right away; the board's polling drives idle → playing
    // while Bedrock generates.
    const started = await startGame(requestedLanguage);
    window.history.replaceState(null, '', `/coder?session=${started.sessionId}`);
    return { sessionId: started.sessionId, view: GENERATING_VIEW };
  }, [existingSession, requestedLanguage]);

  const { data, loading, error } = useGameSessionBootstrap(
    loader,
    existingSession ? 'Sesión no encontrada' : 'No se pudo iniciar la partida',
    existingSession ?? '__start__',
  );

  if (loading) {
    return (
      <GameLoadingScreen
        title="Estamos preparando tu incidente…"
        subtitle="Dame un momento mientras armo la partida."
      />
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 text-red-400">
        <p>{error ?? 'Error desconocido'}</p>
        <Link href="/" className="text-zinc-400 underline">
          Volver al inicio
        </Link>
      </div>
    );
  }

  return <CoderScreen initialSessionId={data.sessionId} initialView={data.view} />;
}

export default function CoderPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
          Cargando…
        </div>
      }
    >
      <CoderPageContent />
    </Suspense>
  );
}