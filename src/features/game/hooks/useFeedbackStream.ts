'use client';

import { useEffect, useRef, useState } from 'react';
import { readToken } from '@/src/features/game/api/session-token-store';

// ---------------------------------------------------------------------------
// Opens a Server-Sent Events connection to /api/game/feedback-stream while
// `active` is true and accumulates the mentor's analysis text as Bedrock
// streams tokens. Mirrors useChallengeStream (same event protocol, same
// lifecycle guards).
//
// The caller decides when to activate the stream (a button click, typically).
// `active=false` short-circuits: the hook can mount unconditionally and the
// connection only opens once the caller flips the flag on.
// ---------------------------------------------------------------------------

interface UseFeedbackStreamResult {
  /** Accumulated text so far. Empty until the first delta arrives. */
  text: string;
  /** True after `done` is received, the stream errors, or `active` flips off. */
  streamDone: boolean;
  /** Friendly error message emitted by the server (auth, empty, etc.); null when fine. */
  error: string | null;
}

export function useFeedbackStream(
  sessionId: string,
  active: boolean,
): UseFeedbackStreamResult {
  const [text, setText] = useState('');
  const [streamDone, setStreamDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track whether we've already opened a stream for this session so we don't
  // reconnect on every render while active is still true.
  const openedRef = useRef(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!active || openedRef.current) return;

    // If no coder token exists on this browser, the server will 403 and the
    // EventSource's onerror handler will surface the failure. State changes
    // happen only from async callbacks — no sync setState in the effect body
    // (React 19 set-state-in-effect rule).
    const token = readToken(sessionId, 'coder') ?? '';

    openedRef.current = true;
    const params = new URLSearchParams({ sessionId, token });
    const url = `/api/game/feedback-stream?${params.toString()}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('delta', (e: MessageEvent) => {
      try {
        setText(JSON.parse(e.data as string) as string);
      } catch {
        // Malformed frame — ignore and wait for the next full buffer.
      }
    });

    es.addEventListener('error', (e: MessageEvent) => {
      try {
        setError(JSON.parse(e.data as string) as string);
      } catch {
        setError('Error al pedir el análisis.');
      }
    });

    es.addEventListener('done', () => {
      setStreamDone(true);
      es.close();
      esRef.current = null;
    });

    es.onerror = () => {
      // Network error or the connection was closed after done. Mark done so
      // the UI stops showing "generando…".
      setStreamDone(true);
      es.close();
      esRef.current = null;
    };

    return () => {
      es.close();
      esRef.current = null;
      // Reset so a re-run of this effect (React StrictMode double-mount in dev,
      // or a real remount) can reopen the stream. Without this, openedRef stays
      // true after the first cleanup and the guard above blocks every reopen —
      // the panel then hangs on "Escribiendo…" forever because the EventSource
      // was closed on unmount and never recreated.
      openedRef.current = false;
    };
  }, [sessionId, active]);

  return { text, streamDone, error };
}
