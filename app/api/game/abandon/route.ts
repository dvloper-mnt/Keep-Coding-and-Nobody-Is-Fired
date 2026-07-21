import { processAbandon } from '@/src/features/game/game-service';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { sessionId, role } = body;

  if (!sessionId || (role !== 'coder' && role !== 'helper')) {
    return NextResponse.json(
      { error: 'sessionId and role (coder|helper) required' },
      { status: 400 },
    );
  }

  const result = await processAbandon(sessionId, role);
  if (!result) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json(result);
}
