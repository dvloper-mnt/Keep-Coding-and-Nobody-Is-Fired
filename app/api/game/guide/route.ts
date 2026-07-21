import { getHelperGuide } from '@/src/features/game/game-service';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  const token = request.nextUrl.searchParams.get('token') ?? undefined;
  const guide = await getHelperGuide(sessionId, token);
  if (!guide) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if ('occupied' in guide) {
    return NextResponse.json(
      { error: 'Esta sala ya tiene un Helper. Pídele al Coder un código nuevo.' },
      { status: 409 },
    );
  }

  return NextResponse.json(guide);
}