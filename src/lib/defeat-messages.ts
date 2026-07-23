import type { DefeatReason, PlayerRole } from '@/src/features/game/game-types';

interface DefeatCopy {
  title: string;
  message?: string;
}

// Themed defeat copy — the tone is a live demo blowing up: the boss is watching
// the Slack, the client is watching the screen, and neither is happy. Each (role
// × reason) pair carries the same tension but from that role's point of view.
// Spanish neutro, tuteo, humor mordaz sin caer en burla.
const DEFEAT_COPY: Record<PlayerRole, Record<DefeatReason, DefeatCopy>> = {
  coder: {
    timeout: {
      title: 'Se acabó la ventana',
      message:
        'El cliente se fue frustrado. Mañana el jefe agenda una reunión que nadie quiere tener.',
    },
    coder_lives: {
      title: 'Producción te ganó',
      message:
        'Cada intento dejó el código peor. El cliente lo vio todo y el jefe pidió un post-mortem urgente.',
    },
    helper_lives: {
      title: 'El Helper cayó primero',
      message:
        'Perdió los estribos frente al cliente. La demo se cayó con él y a ustedes los arrastró.',
    },
  },
  helper: {
    timeout: {
      title: 'Se acabó la ventana',
      message:
        'El cliente cerró la reunión sin ver la demo terminada. El jefe ya te está buscando en el Slack.',
    },
    coder_lives: {
      title: 'El Coder colapsó',
      message:
        'Se quedó sin ideas frente al teclado. El jefe apunta a todos con el mismo dedo.',
    },
    helper_lives: {
      title: 'Perdiste la calma con el cliente',
      message:
        'Cada respuesta te costó tiempo y credibilidad. El jefe ya lo notó y ni siquiera vio la demo.',
    },
  },
};

export function getDefeatCopy(role: PlayerRole, reason?: DefeatReason): DefeatCopy {
  return DEFEAT_COPY[role][reason ?? 'timeout'];
}
