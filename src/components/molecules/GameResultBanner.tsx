'use client';

type GameOutcome = 'victory' | 'defeat';

interface GameResultBannerProps {
  containerClassName: string;
  title: string;
  titleClassName: string;
  message?: string;
  messageClassName?: string;
  homeButtonClassName: string;
}

export function GameResultBanner({
  containerClassName,
  title,
  titleClassName,
  message,
  messageClassName,
  homeButtonClassName,
}: GameResultBannerProps) {
  // Hard navigation (not a soft <Link>): the game is over, so we want a clean
  // document load that drops all in-memory session state and bfcache, otherwise
  // the player can bounce back into the dead room.
  function goHome() {
    window.location.assign('/');
  }

  return (
    <div className={containerClassName}>
      <p className={titleClassName}>{title}</p>
      {message ? <p className={messageClassName}>{message}</p> : null}
      <button type="button" onClick={goHome} className={homeButtonClassName}>
        Volver al inicio
      </button>
    </div>
  );
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export type { GameOutcome };
