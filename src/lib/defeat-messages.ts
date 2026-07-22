import type { DefeatReason, PlayerRole } from '@/src/features/game/game-types';

interface DefeatCopy {
  title: string;
  message?: string;
}

const DEFEAT_COPY: Record<PlayerRole, Record<DefeatReason, DefeatCopy>> = {
  coder: {
    timeout: {
      title: 'Se acabó el tiempo',
      message: 'El jefe no está contento…',
    },
    coder_lives: {
      title: 'Sin vidas',
      message: 'Agotaste tus intentos. La partida terminó.',
    },
    helper_lives: {
      title: 'El Helper se quedó sin vidas',
      message: 'No pudo responder al cliente a tiempo.',
    },
  },
  helper: {
    timeout: {
      title: 'Tiempo agotado',
      message: 'La guía sigue disponible para revisión.',
    },
    coder_lives: {
      title: 'El Coder se quedó sin vidas',
      message: 'Agotó sus intentos en producción.',
    },
    helper_lives: {
      title: 'Sin vidas',
      message: 'No pudiste responder al cliente. La partida terminó.',
    },
  },
};

export function getDefeatCopy(role: PlayerRole, reason?: DefeatReason): DefeatCopy {
  return DEFEAT_COPY[role][reason ?? 'timeout'];
}