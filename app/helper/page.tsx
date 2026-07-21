'use client';

import { HelperScreen } from '@/src/components/containers/HelperScreen';
import { getHelperGuide } from '@/src/features/game/api/game-client';
import { useGameSessionBootstrap } from '@/src/features/game/hooks/useGameSessionBootstrap';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useState } from 'react';

function HelperPageContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');
  const [inputCode, setInputCode] = useState('');

  const loader = useCallback(() => getHelperGuide(sessionId ?? ''), [sessionId]);
  const { data: guide, loading, error } = useGameSessionBootstrap(
    loader,
    'Sesión no encontrada. Pedile el código al Coder.',
    sessionId,
    !!sessionId,
  );

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (inputCode.trim()) {
      window.location.href = `/helper?session=${inputCode.trim().toUpperCase()}`;
    }
  }

  if (!sessionId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-amber-950 px-4">
        <h1 className="text-2xl font-bold text-amber-100">Unirse como Helper</h1>
        <p className="mt-2 text-sm text-amber-400/70">Ingresá el código de sala que te dio el Coder</p>
        <form onSubmit={handleJoin} className="mt-6 flex gap-2">
          <input
            type="text"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            placeholder="Ej: X7K2"
            maxLength={4}
            className="w-32 rounded-lg border border-amber-500/30 bg-amber-950 px-4 py-2 text-center font-mono text-lg uppercase text-amber-100 outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-amber-600 px-6 py-2 font-semibold text-amber-950 hover:bg-amber-500"
          >
            Entrar
          </button>
        </form>
        <Link href="/" className="mt-8 text-sm text-amber-400/50 underline">
          Volver al inicio
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-amber-950 text-amber-400">
        Cargando guía de debugging…
      </div>
    );
  }

  if (error || !guide) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-amber-950 text-red-400">
        <p>{error ?? 'Error desconocido'}</p>
        <Link href="/helper" className="text-amber-400 underline">
          Intentar de nuevo
        </Link>
      </div>
    );
  }

  return <HelperScreen sessionId={sessionId} guide={guide} />;
}

export default function HelperPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-amber-950 text-amber-400">
          Cargando…
        </div>
      }
    >
      <HelperPageContent />
    </Suspense>
  );
}