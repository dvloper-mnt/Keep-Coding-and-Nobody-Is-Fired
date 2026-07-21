import Link from 'next/link';

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
  return (
    <div className={containerClassName}>
      <p className={titleClassName}>{title}</p>
      {message ? <p className={messageClassName}>{message}</p> : null}
      <Link href="/" className={homeButtonClassName}>
        Volver al inicio
      </Link>
    </div>
  );
}

export type { GameOutcome };
