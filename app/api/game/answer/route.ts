import { isAuthorizedFor, processAnswer } from '@/src/features/game/game-service';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { sessionId, answerIndex, token } = body;

  if (!sessionId || typeof answerIndex !== 'number') {
    return NextResponse.json(
      { error: 'sessionId and answerIndex required' },
      { status: 400 },
    );
  }

  // Only the Coder who started the room may answer.
  if (!(await isAuthorizedFor(sessionId, 'coder', token))) {
    return NextResponse.json({ error: 'No autorizado para esta partida.' }, { status: 403 });
  }

  const result = await processAnswer(sessionId, answerIndex);
  if (!result) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json(result);
}