'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function StartGameButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);

  function confirmStart() {
    setStarting(true);
    router.push('/coder');
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-4 font-mono text-xs text-red-400/80 transition-colors hover:text-red-300"
      >
        Iniciar partida →
      </button>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="start-modal-title"
        >
          <div className="w-full max-w-md rounded-lg border border-red-500/40 bg-[#0a0a0b] p-6">
            <p className="font-mono text-xs tracking-widest text-red-500 uppercase">
              Confirmar inicio
            </p>
            <h2 id="start-modal-title" className="mt-2 text-xl font-bold text-zinc-100">
              ¿Listo para iniciar la partida?
            </h2>
            <p className="mt-3 text-sm text-zinc-400">
              Vamos a generar un incidente único con IA para esta partida. Al iniciar recibís un
              código de sala para compartir con el Helper. El reloj arranca en 180 segundos.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={starting}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmStart}
                disabled={starting}
                className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {starting ? 'Iniciando…' : 'Sí, iniciar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
