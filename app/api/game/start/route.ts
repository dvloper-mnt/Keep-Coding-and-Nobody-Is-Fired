import { startGame } from '@/src/features/game/game-service';
import { NextResponse } from 'next/server';

export async function POST() {
  const result = await startGame();
  return NextResponse.json(result);
}