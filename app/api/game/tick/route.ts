import { isAuthorizedFor, processTimerTick } from '@/src/features/game/game-service';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { sessionId, token } = body;

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  // Only the Coder drives the timer. Without this, anyone with the room code
  // (shown on screen during the demo) could tick the clock to zero.
  if (!(await isAuthorizedFor(sessionId, 'coder', token))) {
    return NextResponse.json({ error: 'No autorizado para esta partida.' }, { status: 403 });
  }

  const session = await processTimerTick(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json({
    remainingTime: session.remainingTime,
    status: session.status,
  });
}