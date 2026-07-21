interface GameLoadingScreenProps {
  title: string;
  subtitle?: string;
}

export function GameLoadingScreen({ title, subtitle }: GameLoadingScreenProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0b] px-4 text-center">
      <div className="flex items-center gap-3 font-mono text-sm text-emerald-400">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
        <span>{title}</span>
      </div>
      {subtitle ? <p className="max-w-sm text-xs text-zinc-500">{subtitle}</p> : null}
    </div>
  );
}
