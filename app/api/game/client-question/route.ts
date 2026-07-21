import { isAuthorizedFor, processClientQuestionAnswer } from '@/src/features/game/game-service';
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

  // Client questions are the Helper's to answer.
  if (!(await isAuthorizedFor(sessionId, 'helper', token))) {
    return NextResponse.json({ error: 'No autorizado para esta partida.' }, { status: 403 });
  }

  const result = await processClientQuestionAnswer(sessionId, answerIndex);
  if (!result) {
    return NextResponse.json({ error: 'Session or active question not found' }, { status: 404 });
  }

  return NextResponse.json(result);
}