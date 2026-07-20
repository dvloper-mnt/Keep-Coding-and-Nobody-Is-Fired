interface ErrorBannerProps {
  error: string;
}

export function ErrorBanner({ error }: ErrorBannerProps) {
  if (!error) return null;

  return (
    <div className="rounded-md border border-red-500/50 bg-red-950/40 px-4 py-3">
      <span className="font-mono text-xs font-bold text-red-500 uppercase">Error</span>
      <p className="mt-1 font-mono text-sm text-red-300">{error}</p>
    </div>
  );
}