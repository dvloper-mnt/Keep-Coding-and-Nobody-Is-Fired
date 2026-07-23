'use client';

import { ConfirmDialog } from '@/src/components/molecules/ConfirmDialog';
import { abandonGame } from '@/src/features/game/api/game-client';
import type { GameStatus, PlayerRole } from '@/src/features/game/game-types';
import { useState } from 'react';

interface ExitButtonProps {
  sessionId: string;
  role: PlayerRole;
  onAbandoned: (status: GameStatus) => void;
}

export function ExitButton({ sessionId, role, onAbandoned }: ExitButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function handleExit() {
    setLeaving(true);
    try {
      const { status } = await abandonGame(sessionId, role);
      onAbandoned(status);
    } catch {
      setLeaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={leaving}
        className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300 disabled:opacity-50"
      >
        {leaving ? 'Saliendo…' : 'Salir'}
      </button>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={handleExit}
        eyebrow="Abandonar partida"
        title="¿Seguro que quieres salir?"
        description="La partida terminará para los dos jugadores. No se puede deshacer."
        confirmLabel="Sí, abandonar"
        loading={leaving}
        titleId="exit-dialog-title"
      />
    </>
  );
}