'use client';

import { useEffect, useState } from 'react';

import { HERO_TITLE_LINE_1, HERO_TITLE_LINE_2 } from '@/src/lib/constants';

// ---------------------------------------------------------------------------
// Types out the two hero lines character by character, with a caret that rides
// the current typing position (line 1 first, then jumps to line 2 and stays
// there blinking). Replaces the previous single-block clip-path wipe so the
// intro looks like a real terminal writing the incident report.
//
// Accessibility: the visible content is aria-hidden and rendered fresh on each
// tick (screen readers would announce every character otherwise). The parent
// h1 renders a static full title in a sr-only sibling so the semantic content
// stays intact for assistive tech and search engines.
// ---------------------------------------------------------------------------

const LINE_1 = HERO_TITLE_LINE_1;
const LINE_2 = HERO_TITLE_LINE_2;
const TOTAL_CHARS = LINE_1.length + LINE_2.length;
// ~60ms per character types the 30-char title in about 1.8s — matches the pace
// of the old CSS wipe without feeling snappy.
const CHAR_INTERVAL_MS = 60;
const START_DELAY_MS = 300;

export function HeroTitleTypewriter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce) {
      // Reveal the full title immediately for users with reduced motion — no
      // typing animation. The setCount runs inside a setTimeout(…, 0) rather
      // than synchronously in the effect body to satisfy the ESLint rule
      // react-hooks/set-state-in-effect, which flags synchronous setState in an
      // effect as a cascading-render risk. Deferring it by a macrotask moves
      // the update out of the effect's synchronous body.
      const id = setTimeout(() => setCount(TOTAL_CHARS), 0);
      return () => clearTimeout(id);
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const startId = setTimeout(() => {
      intervalId = setInterval(() => {
        setCount((prev) => {
          const next = Math.min(prev + 1, TOTAL_CHARS);
          if (next >= TOTAL_CHARS && intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          return next;
        });
      }, CHAR_INTERVAL_MS);
    }, START_DELAY_MS);

    return () => {
      clearTimeout(startId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const line1Chars = Math.min(count, LINE_1.length);
  const line2Chars = Math.max(0, count - LINE_1.length);
  const caretOnLine1 = count < LINE_1.length;

  return (
    <>
      {LINE_1.slice(0, line1Chars)}
      {caretOnLine1 ? <Caret /> : null}
      <br />
      {LINE_2.slice(0, line2Chars)}
      {caretOnLine1 ? null : <Caret />}
    </>
  );
}

function Caret() {
  return (
    <span
      aria-hidden="true"
      className="ml-1 inline-block w-[0.6ch] animate-cursor-blink bg-red-500 align-baseline text-transparent"
    >
      _
    </span>
  );
}
