'use client';

import { useMemo } from 'react';
import { useLogStream } from '@/src/features/game/hooks/useLogStream';
import { productionLogScript, type LogLevel } from '@/src/features/game/production-log-lines';
import type { ChallengeLanguage } from '@/src/features/game/game-types';
import type { StreamingPreview } from '@/src/features/game/streaming-preview';

interface ProductionLogTailProps {
  language: ChallengeLanguage;
  streamingPreview: StreamingPreview;
}

const LEVEL_LABEL: Record<LogLevel, string> = {
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR',
};

const LEVEL_CLASS: Record<LogLevel, string> = {
  info: 'text-zinc-500',
  warn: 'text-amber-400/80',
  error: 'text-red-400',
};

const TEXT_CLASS: Record<LogLevel, string> = {
  info: 'text-zinc-400',
  warn: 'text-amber-200/80',
  error: 'text-red-300',
};

export function ProductionLogTail({ language, streamingPreview }: ProductionLogTailProps) {
  const script = useMemo(() => productionLogScript(language), [language]);
  const visible = useLogStream(script);

  return (
    <div className="mt-6 overflow-hidden rounded-lg border border-red-500/30 bg-black/60 font-mono text-sm">
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/80 px-4 py-2 text-xs text-zinc-500">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
        <span className="text-zinc-400">$ tail -f -n 100 /var/log/production.log</span>
      </div>

      <div className="space-y-1 px-4 py-4" aria-live="polite">
        {visible.map((line, index) => (
          <p key={`${line.time}-${index}`} className="flex gap-3 leading-relaxed">
            <span className="shrink-0 text-zinc-600 tabular-nums">{line.time}</span>
            <span className={`shrink-0 ${LEVEL_CLASS[line.level]}`}>{LEVEL_LABEL[line.level]}</span>
            <span className={`break-all ${TEXT_CLASS[line.level]}`}>{line.text}</span>
          </p>
        ))}

        {streamingPreview.title ? (
          <div className="mt-4 border-t border-zinc-800 pt-4">
            <p className="text-xs tracking-wider text-zinc-600">{'>'} incidente identificado</p>
            <p className="mt-1 text-lg font-bold text-red-200">
              {streamingPreview.title}
              <span className="animate-pulse text-red-500">▍</span>
            </p>
            {streamingPreview.storyContext && (
              <p className="mt-1 text-zinc-400">{streamingPreview.storyContext}</p>
            )}
          </div>
        ) : (
          <p className="text-red-400">
            <span className="text-zinc-600">{'>'}</span> esperando próximo evento
            <span className="animate-pulse">▍</span>
          </p>
        )}
      </div>

      <p className="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-600">
        <span className="text-zinc-700">{'//'}</span> pasa el código de sala al Helper
      </p>
    </div>
  );
}
