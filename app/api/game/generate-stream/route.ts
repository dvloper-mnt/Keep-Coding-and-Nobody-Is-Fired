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

function sseEvent(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`;
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
      function emit(event: string, data: string) {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
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
          controller.close();
          return;
        }

        // Stream Bedrock tokens to the client as they arrive.
        const generated = await generateChallengeStreaming(
          session.language ?? 'random',
          (partialText: string) => {
            emit('delta', partialText);
          },
        );

        // Resolve final challenge: generated or curated fallback.
        const challenge = generated ?? pickRandomChallenge();
        const wasGenerated = generated !== null;

        // Persist the room as playing so subsequent getCoderState polls see it.
        await promoteSessionWithChallenge(session, challenge, wasGenerated);

        emit('done', '');
        controller.close();
      } catch (error) {
        // Unexpected error in the route itself — still try to emit done so the
        // client can fall through to the polling path.
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
        controller.enqueue(encoder.encode(sseEvent('done', '')));
        controller.close();
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
