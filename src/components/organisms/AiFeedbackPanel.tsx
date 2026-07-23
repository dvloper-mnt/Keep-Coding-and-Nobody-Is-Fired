'use client';

import { useState } from 'react';
import { useFeedbackStream } from '@/src/features/game/hooks/useFeedbackStream';

interface AiFeedbackPanelProps {
  sessionId: string;
}

// Shown at endless game over: kicks off the Bedrock feedback stream immediately
// and renders the mentor's analysis as it arrives (typewriter effect comes
// naturally from the SSE deltas). The Coder holds the coderToken, so only
// their browser can trigger this — the Helper watches the Coder's screen.
//
// Auto-starts on mount so the analysis appears without an extra click during
// the hackathon demo. Bedrock cost is bounded by the endless-game-over gate
// (no defeat → no stream).
export function AiFeedbackPanel({ sessionId }: AiFeedbackPanelProps) {
  const { text, streamDone, error } = useFeedbackStream(sessionId, true);
  const [copied, setCopied] = useState(false);

  const hasText = text.length > 0;
  const streamingEmpty = streamDone && !hasText && !error;

  async function copyToClipboard() {
    if (!hasText || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently no-op; the text is on screen and can be copied manually.
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-cyan-500/40 bg-cyan-950/20 p-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-lg font-semibold text-cyan-300">Análisis del mentor IA</p>
        {!streamDone ? (
          <span className="text-xs uppercase tracking-widest text-cyan-400/60">
            Escribiendo…
          </span>
        ) : hasText ? (
          <button
            type="button"
            onClick={copyToClipboard}
            className="rounded-md border border-cyan-500/40 bg-cyan-900/30 px-3 py-1 text-xs font-medium text-cyan-200 transition-colors hover:bg-cyan-900/60"
          >
            {copied ? 'Copiado' : 'Copiar análisis'}
          </button>
        ) : null}
      </div>

      {hasText ? (
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-cyan-100/90">
          {text}
          {!streamDone ? <span className="ml-0.5 animate-pulse text-cyan-400">▊</span> : null}
        </p>
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      {streamingEmpty ? (
        <p className="mt-4 text-sm text-cyan-200/60">
          El mentor no pudo generar el análisis esta vez.
        </p>
      ) : null}

      {!hasText && !error && !streamingEmpty ? (
        <p className="mt-4 text-sm text-cyan-200/60">
          Pidiéndole al mentor su lectura de la partida…
        </p>
      ) : null}
    </div>
  );
}
