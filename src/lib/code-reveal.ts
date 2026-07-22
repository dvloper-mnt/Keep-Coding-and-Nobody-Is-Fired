export interface CodeRevealSegments {
  stable: string;
  animated: string;
}

export function getCodeRevealSegments(previousCode: string, nextCode: string): CodeRevealSegments {
  if (previousCode === nextCode) {
    return { stable: nextCode, animated: '' };
  }

  const prevLines = previousCode.split('\n');
  const nextLines = nextCode.split('\n');
  const minLength = Math.min(prevLines.length, nextLines.length);

  let firstDiffLine = 0;
  while (firstDiffLine < minLength && prevLines[firstDiffLine] === nextLines[firstDiffLine]) {
    firstDiffLine++;
  }

  if (firstDiffLine === prevLines.length && firstDiffLine === nextLines.length) {
    return { stable: nextCode, animated: '' };
  }

  const stableLines = nextLines.slice(0, firstDiffLine);
  const animatedLines = nextLines.slice(firstDiffLine);

  const stable =
    stableLines.length > 0 && animatedLines.length > 0 ? `${stableLines.join('\n')}\n` : stableLines.join('\n');
  const animated = animatedLines.join('\n');

  return { stable, animated };
}

/** Target ~2s reveal; clamp per-char delay so long patches stay readable. */
export function getRevealCharIntervalMs(animatedLength: number): number {
  if (animatedLength <= 0) return 0;

  const targetDurationMs = 2000;
  const minIntervalMs = 2;
  const maxIntervalMs = 24;

  return Math.min(maxIntervalMs, Math.max(minIntervalMs, Math.round(targetDurationMs / animatedLength)));
}