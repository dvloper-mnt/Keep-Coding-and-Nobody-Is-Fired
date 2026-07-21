'use client';

import { HelperScreen } from '@/src/components/containers/HelperScreen';
import { GameLoadingScreen } from '@/src/components/molecules/GameLoadingScreen';
import { getHelperGuide } from '@/src/features/game/api/game-client';
import { saveToken } from '@/src/features/game/api/session-token-store';
import type { HelperStaticGuide } from '@/src/features/game/game-types';
import { useGameSessionBootstrap } from '@/src/features/game/hooks/useGameSessionBootstrap';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

function HelperPageContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');
  const [inputCode, setInputCode] = useState('');

  // If the browser restores this page from bfcache (back/forward), its in-memory
  // game state is stale — it could show a dead room. Force a fresh load.
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) window.location.reload();
    }
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  // Poll the guide until the Coder's challenge is ready. While the room is idle
  // the backend returns { pending: true } instead of erroring, so the Helper
  // waits for the Coder rather than seeing "room not found".
  const loader = useCallback(async (): Promise<HelperStaticGuide> => {
    for (;;) {
      const result = await getHelperGuide(sessionId ?? '');
      if ('occupied' in result) {
        throw new Error('Esta sala ya tiene un Helper. Pídele al Coder un código nuevo.');
      }
      if (!('pending' in result)) {
        saveToken(sessionId ?? '', 'helper', result.helperToken);
        return result;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }, [sessionId]);
  const { data: guide, loading, error } = useGameSessionBootstrap(
    loader,
    'No se encontró la sala. Verifica el código e intenta de nuevo.',
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
      <main className="flex min-h-screen items-center justify-center bg-[#0a0a0b] px-4">
        <div className="w-full max-w-md">
          <p className="font-mono text-xs tracking-widest text-amber-400 uppercase">
            <span className="text-zinc-600">[</span>Rol B<span className="text-zinc-600">]</span> · soporte
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-amber-100">
            Unirse como Helper
          </h1>
          <p className="mt-3 text-sm text-zinc-400">
            Tienes el manual de debugging. El Coder ya inició la partida y te pasó un
            código de sala — ingrésalo para entrar.
          </p>

          <form onSubmit={handleJoin} className="mt-8">
            <label
              htmlFor="room-code"
              className="font-mono text-xs tracking-wider text-zinc-500 uppercase"
            >
              Código de sala
            </label>
            <input
              id="room-code"
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              placeholder="X7K2"
              maxLength={4}
              autoFocus
              autoComplete="off"
              className="mt-2 block w-full rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-4 text-center font-mono text-3xl tracking-[0.4em] text-amber-100 uppercase outline-none transition-colors placeholder:text-amber-500/25 focus:border-amber-500 focus:bg-amber-950/40"
            />
            <button
              type="submit"
              disabled={inputCode.trim().length < 4}
              className="mt-4 w-full rounded-lg bg-amber-600 px-6 py-3 font-semibold text-amber-950 transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Entrar a la partida
            </button>
          </form>

          <Link
            href="/"
            className="mt-8 inline-block font-mono text-xs text-zinc-600 transition-colors hover:text-zinc-400"
          >
            ← Volver al inicio
          </Link>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <GameLoadingScreen
        title="Esperando a que el Coder inicie…"
        subtitle="En cuanto el incidente esté listo, vas a ver tu manual de debugging."
      />
    );
  }

  if (error || !guide) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0a0b] px-4">
        <div className="w-full max-w-md text-center">
          <p className="font-mono text-xs tracking-widest text-amber-400 uppercase">
            <span className="text-zinc-600">[</span>Rol B<span className="text-zinc-600">]</span> · soporte
          </p>
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-950/20 p-6">
            <p className="text-sm text-red-300">{error ?? 'No se pudo cargar la sala.'}</p>
          </div>
          <Link
            href="/helper"
            className="mt-6 inline-block rounded-lg bg-amber-600 px-6 py-2 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-500"
          >
            Intentar de nuevo
          </Link>
        </div>
      </main>
    );
  }

  return <HelperScreen sessionId={sessionId} guide={guide} />;
}

export default function HelperPage() {
  return (
    <Suspense fallback={<GameLoadingScreen title="Cargando…" />}>
      <HelperPageContent />
    </Suspense>
  );
}