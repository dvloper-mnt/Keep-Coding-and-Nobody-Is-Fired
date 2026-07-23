import {
  getLeaderboardTop,
  registerLeaderboardScore,
} from '@/src/features/game/game-service';
import { NextRequest, NextResponse } from 'next/server';

// The ranking is live state — never serve a cached response.
export const dynamic = 'force-dynamic';

interface PostBody {
  sessionId?: unknown;
  token?: unknown;
  teamName?: unknown;
}

// POST: register the current run in the leaderboard. The client sends only the
// team name + session credentials; the score is derived server-side from the
// persisted game over, so it cannot be fabricated.
export async function POST(request: NextRequest) {
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const { sessionId, token, teamName } = body;
  if (typeof sessionId !== 'string' || typeof teamName !== 'string') {
    return NextResponse.json({ error: 'Datos incompletos.' }, { status: 400 });
  }
  const authToken = typeof token === 'string' ? token : undefined;

  const outcome = await registerLeaderboardScore(sessionId, authToken, teamName);

  switch (outcome.kind) {
    case 'ok':
      return NextResponse.json(outcome.result);
    case 'invalid-name':
      return NextResponse.json({ error: outcome.reason }, { status: 400 });
    case 'unauthorized':
      return NextResponse.json({ error: 'No autorizado para esta partida.' }, { status: 403 });
    case 'not-game-over':
      return NextResponse.json({ error: outcome.reason }, { status: 409 });
    case 'already':
      return NextResponse.json({ error: 'Esta partida ya fue registrada.' }, { status: 409 });
  }
}

// GET: the top 10, public, no token.
export async function GET() {
  const top = await getLeaderboardTop();
  return NextResponse.json(top);
}
