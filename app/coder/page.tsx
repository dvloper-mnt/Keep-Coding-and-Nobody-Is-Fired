'use client';

import { CoderScreen } from '@/src/components/containers/CoderScreen';
import type { CoderStepView, StartGameResponse } from '@/src/features/game/game-types';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function CoderPageContent() {
  const searchParams = useSearchParams();
  const existingSession = searchParams.get('session');
  const [sessionId, setSessionId] = useState<string | null>(existingSession);
  const [coderView, setCoderView] = useState<CoderStepView | null>(null);
  // Always start in loading state when we have a session id from URL (we must validate via /state).
  // This prevents flashing the error UI ("Error desconocido" / "Sesión no encontrada")
  // while the async lookup is in flight.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existingSession) {
      fetch(`/api/game/state?sessionId=${existingSession}`)
        .then((res) => {
          if (!res.ok) throw new Error('Sesión no encontrada');
          return res.json();
        })
        .then((data: CoderStepView) => {
          setCoderView(data);
          setLoading(false);
        })
        .catch(() => {
          setError('Sesión no encontrada');
          setLoading(false);
        });
      return;
    }

    fetch('/api/game/start', { method: 'POST' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to start');
        return res.json();
      })
      .then((data: StartGameResponse) => {
        setSessionId(data.sessionId);
        setCoderView(data.coderView);
        setLoading(false);
        window.history.replaceState(null, '', `/coder?session=${data.sessionId}`);
      })
      .catch(() => {
        setError('No se pudo iniciar la partida');
        setLoading(false);
      });
  }, [existingSession]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Iniciando crisis en producción…
      </div>
    );
  }

  if (error || !sessionId || !coderView) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 text-red-400">
        <p>{error ?? 'Error desconocido'}</p>
        <Link href="/" className="text-zinc-400 underline">
          Volver al inicio
        </Link>
      </div>
    );
  }

  return <CoderScreen initialSessionId={sessionId} initialView={coderView} />;
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