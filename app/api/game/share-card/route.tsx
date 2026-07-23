import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { parseShareCardParams } from '@/src/features/game/share-card-params';

// ---------------------------------------------------------------------------
// GET /api/game/share-card — renders a PNG social card (1200×630) with the
// team name, score, and rounds. Meant to be linked/downloaded from the
// endless game-over view so the player can share their run outside the app.
//
// Params come from the URL and are UNTRUSTED. `parseShareCardParams` reuses
// `sanitizeTeamName` and clamps score/rounds to sane bounds. The card is
// rendered as a PNG, not HTML, so we don't defend against XSS here — but we
// still drop control chars and cap sizes to prevent nonsense/layout breaks.
//
// See node_modules/next/dist/docs/01-app/03-api-reference/04-functions/
// image-response.md for the API surface (Next 16 keeps the same signature as
// Next 14/15; the breaking change only affected `params` in pages).
// ---------------------------------------------------------------------------

const WIDTH = 1200;
const HEIGHT = 630;

const GAME_URL = 'hackaton.dvloper.com.co';
const GAME_NAME = 'Keep Coding and Nobody Is Fired';

export async function GET(request: NextRequest) {
  const parsed = parseShareCardParams(new URL(request.url));
  if (!parsed.ok) {
    return new Response(parsed.reason, { status: 400 });
  }

  const { team, score, rounds } = parsed;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          backgroundColor: '#09090b',
          backgroundImage:
            'linear-gradient(135deg, #09090b 0%, #18181b 60%, #451a03 100%)',
          color: '#fafafa',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Top bar: game brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              display: 'flex',
              padding: '8px 20px',
              borderRadius: '999px',
              border: '2px solid #f59e0b',
              color: '#fbbf24',
              fontSize: '22px',
              fontWeight: 600,
              letterSpacing: '0.12em',
            }}
          >
            DEBUG SIMULATOR
          </div>
          <span style={{ fontSize: '22px', color: '#a1a1aa' }}>{GAME_NAME}</span>
        </div>

        {/* Hero: team name */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <span style={{ fontSize: '28px', color: '#a1a1aa' }}>Nuestro equipo</span>
          <span
            style={{
              fontSize: '96px',
              fontWeight: 800,
              color: '#fbbf24',
              lineHeight: 1,
            }}
          >
            {team}
          </span>
        </div>

        {/* Stats: score + rounds */}
        <div style={{ display: 'flex', gap: '48px' }}>
          <Stat label="Puntaje" value={score.toLocaleString('es')} accent="#fbbf24" />
          <Stat label="Rondas" value={rounds.toLocaleString('es')} accent="#fafafa" />
        </div>

        {/* Footer: URL */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '26px', color: '#71717a' }}>¿Puedes superarlo?</span>
          <span style={{ fontSize: '26px', fontWeight: 600, color: '#f59e0b' }}>{GAME_URL}</span>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        // Deterministic given the same params — cache aggressively at the edge.
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    },
  );
}

interface StatProps {
  label: string;
  value: string;
  accent: string;
}

function Stat({ label, value, accent }: StatProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '24px 32px',
        borderRadius: '20px',
        backgroundColor: 'rgba(24, 24, 27, 0.6)',
        border: '1px solid rgba(161, 161, 170, 0.2)',
      }}
    >
      <span style={{ fontSize: '24px', color: '#a1a1aa', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: '84px', fontWeight: 800, color: accent, lineHeight: 1 }}>
        {value}
      </span>
    </div>
  );
}
