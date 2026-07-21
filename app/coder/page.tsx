'use client';

import { CoderScreen } from '@/src/components/containers/CoderScreen';
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

function CoderPageContent() {
  const searchParams = useSearchParams();
  const existingSession = searchParams.get('session');

  const loader = useCallback(async (): Promise<CoderBootstrap> => {
    if (existingSession) {
      const view = await getCoderState(existingSession);
      return { sessionId: existingSession, view };
    }

    const started = await startGame();
    window.history.replaceState(null, '', `/coder?session=${started.sessionId}`);
    return { sessionId: started.sessionId, view: started.coderView };
  }, [existingSession]);

  const { data, loading, error } = useGameSessionBootstrap(
    loader,
    existingSession ? 'Sesión no encontrada' : 'No se pudo iniciar la partida',
    existingSession ?? '__start__',
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Iniciando crisis en producción…
      </div>
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