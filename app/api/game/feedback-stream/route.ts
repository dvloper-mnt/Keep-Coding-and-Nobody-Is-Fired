import { gameDurationSeconds } from '@/src/features/game/game-engine';
import { getSession, isAuthorizedFor } from '@/src/features/game/game-service';
import { generateFeedbackStreaming } from '@/src/features/game/feedback-generator';
import { buildRunSummary } from '@/src/features/game/run-summary';
import { NextRequest } from 'next/server';

// Never cache — the stream is live text from Bedrock.
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// SSE helpers — same protocol as /api/game/generate-stream so the client hook
// can mirror useChallengeStream almost verbatim.
//
// Event protocol:
//   event: delta   data: <accumulated partial text so far>   (JSON-encoded)
//   event: error   data: <friendly error message>            (JSON-encoded)
//   event: done    data: ""                                  (stream over)
// ---------------------------------------------------------------------------
function sseEvent(event: string, data: string): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ---------------------------------------------------------------------------
// GET /api/game/feedback-stream?sessionId=<id>&token=<coderToken>
//
// Streams a mentor-style analysis of the finished endless run. Auth: only the
// Coder holds the token — the Helper can watch the Coder's screen, but cannot
// trigger a fresh Bedrock call. This protects the Bedrock spend behind the
// same token that guards `/answer` and `/tick`.
//
// The endpoint requires the session to be an endless game over (mode+status);
// a non-terminated session cannot generate feedback (nothing to analyze) and
// would waste tokens.
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest): Promise<Response> {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  const token = request.nextUrl.searchParams.get('token');

  if (!sessionId) {
    return new Response('sessionId required', { status: 400 });
  }

  // Auth first — a valid Coder token is required. The token in the query
  // string is a hackathon trade-off (EventSource cannot set custom headers).
  // In production this would live in a signed cookie.
  if (!(await isAuthorizedFor(sessionId, 'coder', token ?? undefined))) {
    return new Response('No autorizado para esta partida.', { status: 403 });
  }

  const session = await getSession(sessionId);
  if (!session) {
    return new Response('Sesión no encontrada.', { status: 404 });
  }

  if (session.mode !== 'endless' || session.status !== 'defeat') {
    return new Response('La partida no ha terminado.', { status: 409 });
  }

  const durationSeconds = gameDurationSeconds(session, Date.now());
  const summary = buildRunSummary(session, durationSeconds);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // The client can disconnect mid-stream (reload, navigate). Writing to a
      // closed controller throws, so we guard every write and close only once.
      let closed = false;

      function emit(event: string, data: string) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        } catch {
          closed = true;
        }
      }

      function finish() {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by the runtime — nothing to do.
        }
      }

      try {
        const result = await generateFeedbackStreaming(summary, (buffer) => {
          emit('delta', buffer);
        });

        if (result === null || result === '') {
          emit('error', 'No se pudo generar el análisis. Intenta de nuevo.');
        }
        emit('done', '');
        finish();
      } catch (error) {
        console.error('[feedback-stream] unexpected error:', error);
        emit('error', 'Error inesperado durante el análisis.');
        emit('done', '');
        finish();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
