import { useEffect, useState } from 'react';
import type { LogLine } from '../production-log-lines';

const LINE_INTERVAL_MS = 550;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Reveals `lines` one at a time on an interval to read like a live log tail.
 * When the user prefers reduced motion, all lines show at once. Once the full
 * script is revealed it loops back to the start, so the tail keeps "running"
 * for as long as Bedrock is still generating.
 */
export function useLogStream(lines: readonly LogLine[]): LogLine[] {
  const reduceMotion = prefersReducedMotion();
  const [count, setCount] = useState(() =>
    reduceMotion ? lines.length : Math.min(1, lines.length),
  );

  useEffect(() => {
    if (reduceMotion || lines.length === 0) return;

    const id = setInterval(() => {
      setCount((current) => (current >= lines.length ? 1 : current + 1));
    }, LINE_INTERVAL_MS);

    return () => clearInterval(id);
  }, [lines, reduceMotion]);

  return lines.slice(0, count);
}
