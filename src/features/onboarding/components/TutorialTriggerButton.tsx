'use client';

interface TutorialTriggerButtonProps {
  readonly onClick: () => void;
}

export function TutorialTriggerButton({ onClick }: TutorialTriggerButtonProps) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-[#0a0a0b]"
      aria-label="Abrir tutorial del juego"
    >
      📖 Cómo Jugar
    </button>
  );
}
