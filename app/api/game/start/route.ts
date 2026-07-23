import { parseChallengeLanguageParam, parseGameMode } from '@/src/features/game/game-mode';
import { isStartAllowed, startGame } from '@/src/features/game/game-service';
import { NextRequest, NextResponse } from 'next/server';

// Behind the ALB the real client IP is the first entry of x-forwarded-for.
function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'unknown';
}

export async function POST(request: NextRequest) {
  // Each start fires a billable Bedrock call — rate limit before doing any work.
  if (!(await isStartAllowed(clientKey(request)))) {
    return NextResponse.json(
      { error: 'Demasiadas partidas en poco tiempo. Espera un momento e intenta de nuevo.' },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const payload = body as { language?: unknown; mode?: unknown };
  const language = parseChallengeLanguageParam(payload.language);
  const mode = parseGameMode(payload.mode);

  const result = await startGame(language, mode);
  return NextResponse.json(result);
}