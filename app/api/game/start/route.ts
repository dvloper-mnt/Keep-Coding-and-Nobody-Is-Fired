import { SELECTABLE_LANGUAGES } from '@/src/features/game/challenge-language';
import { isStartAllowed, startGame } from '@/src/features/game/game-service';
import type { ChallengeLanguage } from '@/src/features/game/game-types';
import { NextRequest, NextResponse } from 'next/server';

function parseLanguage(value: unknown): ChallengeLanguage {
  return SELECTABLE_LANGUAGES.includes(value as ChallengeLanguage)
    ? (value as ChallengeLanguage)
    : 'random';
}

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
  const language = parseLanguage((body as { language?: unknown }).language);

  const result = await startGame(language);
  return NextResponse.json(result);
}
