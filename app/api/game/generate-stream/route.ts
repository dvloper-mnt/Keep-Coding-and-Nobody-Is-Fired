import { difficultyForSession } from '@/src/features/game/challenge-difficulty';
import {
  claimGeneratingSlot,
  pickRandomChallenge,
  promoteSessionWithChallenge,
} from '@/src/features/game/game-service';
import { generateChallengeStreaming } from '@/src/features/game/runtime-generator';
import { NextRequest } from 'next/server';

// Never cache — each request must hit the server so the stream is live.
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

// JSON-encode the payload so newlines inside it (the streamed JSON has plenty)
// don't break the SSE framing — a raw newline in `data:` would split the event.
// The client JSON.parses it back.
function sseEvent(event: string, data: string): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ---------------------------------------------------------------------------
// GET /api/game/generate-stream?sessionId=<id>
//
// Returns a Server-Sent Events stream while Bedrock generates the challenge.
//
// Event protocol:
//   event: delta   data: <accumulated partial text so far>
//   event: done    data: ""
//
// The client treats delta text as DECORATIVE only — never parsed. The board
// is only assembled after the Coder's normal getCoderState poll returns
// status === 'playing'.
//
// Idempotency: uses claimGeneratingSlot (same flag as ensureChallengeGenerated).
// If the room is already generating or already playing, the endpoint closes
// immediately with a single `done` event so the client falls through to polling.
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest): Promise<Response> {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return new Response('sessionId required', { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // The client (EventSource) can disconnect mid-stream — on reload, navigate
      // away, or once it has what it needs. Writing to a closed controller throws
      // ("Controller is already closed"), which used to abort generation. Guard
      // every write and close once.
      let closed = false;

      function emit(event: string, data: string) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        } catch {
          // Client went away — stop trying to write to a dead stream.
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
        // Attempt to claim the generating slot. Returns null when:
        //   - session not found
        //   - room is not idle (already playing / victory / etc.)
        //   - another request holds a live generating claim
        // In all those cases we close immediately; the client falls back to
        // its normal getCoderState poll which will return the real state.
        const session = await claimGeneratingSlot(sessionId);
        if (!session) {
          emit('done', '');
          finish();
          return;
        }

        // Stream Bedrock tokens to the client as they arrive.
        const generated = await generateChallengeStreaming(
          session.language ?? 'random',
          (partialText: string) => {
            emit('delta', partialText);
          },
          difficultyForSession(session),
        );

        // Resolve final challenge: generated or curated fallback.
        const challenge = generated ?? pickRandomChallenge();
        const wasGenerated = generated !== null;

        // Persist the room as playing so subsequent getCoderState polls see it.
        // This MUST happen even if the client already disconnected, so the game
        // still starts — so it runs before any emit/close guard short-circuits.
        await promoteSessionWithChallenge(session, challenge, wasGenerated);

        emit('done', '');
        finish();
      } catch (error) {
        console.error('[generate-stream] unexpected error, falling back to polling:', error);
        try {
          const session = await claimGeneratingSlot(sessionId);
          if (session) {
            const fallback = pickRandomChallenge();
            await promoteSessionWithChallenge(session, fallback, false);
          }
        } catch {
          // Best-effort — if the session is gone or already promoted, ignore.
        }
        emit('done', '');
        finish();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      // Prevent ALB / proxy buffering so tokens reach the browser as they arrive.
      'X-Accel-Buffering': 'no',
    },
  });
}
