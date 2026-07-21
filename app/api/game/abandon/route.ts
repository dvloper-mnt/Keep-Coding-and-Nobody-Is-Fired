import { isAuthorizedFor, processAbandon } from '@/src/features/game/game-service';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { sessionId, role, token } = body;

  if (!sessionId || (role !== 'coder' && role !== 'helper')) {
    return NextResponse.json(
      { error: 'sessionId and role (coder|helper) required' },
      { status: 400 },
    );
  }

  // You can only abandon as the role you actually hold the token for.
  if (!(await isAuthorizedFor(sessionId, role, token))) {
    return NextResponse.json({ error: 'No autorizado para esta partida.' }, { status: 403 });
  }

  const result = await processAbandon(sessionId, role);
  if (!result) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json(result);
}
