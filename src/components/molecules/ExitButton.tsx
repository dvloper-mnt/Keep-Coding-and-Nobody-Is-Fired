'use client';

import { abandonGame } from '@/src/features/game/api/game-client';
import type { GameStatus, PlayerRole } from '@/src/features/game/game-types';
import { useState } from 'react';

interface ExitButtonProps {
  sessionId: string;
  role: PlayerRole;
  onAbandoned: (status: GameStatus) => void;
}

export function ExitButton({ sessionId, role, onAbandoned }: ExitButtonProps) {
  const [leaving, setLeaving] = useState(false);

  async function handleExit() {
    const confirmed = window.confirm(
      '¿Seguro que querés abandonar la partida? Se terminará para los dos jugadores.',
    );
    if (!confirmed) return;

    setLeaving(true);
    try {
      const { status } = await abandonGame(sessionId, role);
      onAbandoned(status);
    } catch {
      setLeaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleExit}
      disabled={leaving}
      className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300 disabled:opacity-50"
    >
      {leaving ? 'Saliendo…' : 'Salir'}
    </button>
  );
}
