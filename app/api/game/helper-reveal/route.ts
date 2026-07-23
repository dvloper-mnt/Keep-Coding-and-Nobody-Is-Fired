import { processHelperReveal } from '@/src/features/game/game-service';
import type { HelperRevealTarget } from '@/src/features/game/game-types';
import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// POST /api/game/helper-reveal — the Helper spends time to unlock one knowledge
// item or the hint of a specific step. Cost is applied server-side (the client
// never sends time deltas); if a client hacks its own console to read the
// locked text, that's on them — the ranking, the timer and the game state are
// all still gated by this endpoint.
// ---------------------------------------------------------------------------

interface RawBody {
  sessionId?: unknown;
  token?: unknown;
  target?: unknown;
}

// Narrow the untrusted body into a validated HelperRevealTarget without any
// `as` casts. Returns null when the shape is off — the caller responds 400.
function parseTarget(raw: unknown): HelperRevealTarget | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const type = record.type;
  const step = record.step;
  if (typeof step !== 'number') return null;

  if (type === 'knowledge') {
    const index = record.index;
    if (typeof index !== 'number') return null;
    return { type: 'knowledge', step, index };
  }
  if (type === 'hint') {
    return { type: 'hint', step };
  }
  return null;
}

export async function POST(request: NextRequest) {
  let body: RawBody;
  try {
    body = (await request.json()) as RawBody;
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }

  const { sessionId, token, target: rawTarget } = body;
  if (typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'sessionId requerido.' }, { status: 400 });
  }
  const target = parseTarget(rawTarget);
  if (!target) {
    return NextResponse.json({ error: 'Objetivo de revelación inválido.' }, { status: 400 });
  }
  const authToken = typeof token === 'string' ? token : undefined;

  const outcome = await processHelperReveal(sessionId, authToken, target);

  switch (outcome.kind) {
    case 'ok':
      return NextResponse.json({
        guide: outcome.guide,
        remainingTime: outcome.remainingTime,
      });
    case 'unauthorized':
      return NextResponse.json({ error: 'No autorizado para esta partida.' }, { status: 403 });
    case 'not-found':
      return NextResponse.json({ error: 'Sesión no encontrada.' }, { status: 404 });
    case 'not-playing':
      return NextResponse.json(
        { error: 'La partida no está en juego.' },
        { status: 409 },
      );
    case 'out-of-range':
      return NextResponse.json(
        { error: 'El paso o el índice están fuera de rango.' },
        { status: 400 },
      );
    case 'already-revealed':
      return NextResponse.json(
        { error: 'Ese ítem ya fue revelado.' },
        { status: 409 },
      );
  }
}
