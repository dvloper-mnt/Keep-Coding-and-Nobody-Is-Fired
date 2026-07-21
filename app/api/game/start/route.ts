import { SELECTABLE_LANGUAGES } from '@/src/features/game/challenge-language';
import { startGame } from '@/src/features/game/game-service';
import type { ChallengeLanguage } from '@/src/features/game/game-types';
import { NextRequest, NextResponse } from 'next/server';

function parseLanguage(value: unknown): ChallengeLanguage {
  return SELECTABLE_LANGUAGES.includes(value as ChallengeLanguage)
    ? (value as ChallengeLanguage)
    : 'random';
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const language = parseLanguage((body as { language?: unknown }).language);

  const result = await startGame(language);
  return NextResponse.json(result);
}
