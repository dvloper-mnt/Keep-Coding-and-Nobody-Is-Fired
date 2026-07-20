import { processClientQuestionAnswer } from '@/src/features/game/game-service';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { sessionId, answerIndex } = body;

  if (!sessionId || typeof answerIndex !== 'number') {
    return NextResponse.json(
      { error: 'sessionId and answerIndex required' },
      { status: 400 },
    );
  }

  const result = processClientQuestionAnswer(sessionId, answerIndex);
  if (!result) {
    return NextResponse.json({ error: 'Session or active question not found' }, { status: 404 });
  }

  return NextResponse.json(result);
}