'use client';

import { useEffect, useRef, useState } from 'react';

interface UseChallengeStreamResult {
  /** Accumulated partial text from the Bedrock stream. Empty string until first delta. */
  partialText: string;
  /** True once the `done` event is received or the stream errors out. */
  streamDone: boolean;
}

/**
 * Opens a Server-Sent Events connection to `/api/game/generate-stream` while
 * the room is in `idle` status and accumulates the partial text as Bedrock
 * streams the challenge JSON token by token.
 *
 * The partial text is DECORATIVE ONLY — the caller must never parse it or use
 * it to build the game board. The board is assembled only after the normal
 * `getCoderState` poll returns `status === 'playing'`.
 *
 * When `active` becomes false (room left idle, component unmounts) the
 * EventSource is closed immediately.
 */
export function useChallengeStream(
  sessionId: string,
  active: boolean,
): UseChallengeStreamResult {
  const [partialText, setPartialText] = useState('');
  const [streamDone, setStreamDone] = useState(false);
  // Track whether we've already opened a stream for this session so we don't
  // reconnect on every render while the room is still idle.
  const openedRef = useRef(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!active || openedRef.current) return;

    openedRef.current = true;
    const url = `/api/game/generate-stream?sessionId=${encodeURIComponent(sessionId)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('delta', (e: MessageEvent) => {
      // e.data is the full accumulated buffer from the server — replace, don't append.
      setPartialText(e.data as string);
    });

    es.addEventListener('done', () => {
      setStreamDone(true);
      es.close();
      esRef.current = null;
    });

    es.onerror = () => {
      // Network error or the connection was closed by the server after done.
      // Mark as done so the UI falls back to the polling-only path.
      setStreamDone(true);
      es.close();
      esRef.current = null;
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [sessionId, active]);

  // If the caller deactivates (room left idle before stream finishes), close.
  useEffect(() => {
    if (!active && esRef.current) {
      esRef.current.close();
      esRef.current = null;
      setStreamDone(true);
    }
  }, [active]);

  return { partialText, streamDone };
}
