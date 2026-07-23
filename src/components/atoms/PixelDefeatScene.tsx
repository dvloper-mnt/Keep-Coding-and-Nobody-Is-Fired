import { PixelGrid } from './PixelGrid';

// ---------------------------------------------------------------------------
// PixelDefeatScene — angry boss looming over two defeated devs. Same ASCII-
// grid approach as the victory scene, but the palette flips cool → hostile
// (red boss, muted greys for the devs). Meant to punch in the demo video's
// game-over sting without new binary assets.
// ---------------------------------------------------------------------------

// Angry boss — 10 cols × 14 rows. Tie visible, arms crossed.
//  h = head, e = angry eyes (red), t = tie (red), s = shirt, l = arms/limbs
const BOSS_ANGRY: readonly string[] = [
  '..llllll..',
  '.lhhhhhhl.',
  '.lheeeehl.', // angry eyes
  '.lhhhhhhl.',
  '.lhh~~hhl.', // frown (~)
  '.lhhhhhhl.',
  '..lssssl..', // neck / collar
  '.lssttssl.', // tie
  'lssssttssss',
  'lssssttssss',
  'lssssssssss',
  'lssssssssss',
  '.ss......ss',
  '.ss......ss',
];

// Defeated dev — 8 cols × 12 rows. Head down, shoulders slumped.
//  H = head, B = body, L = legs, r = raindrop trail (red)
const DEV_SAD: readonly string[] = [
  '........',
  '..HHHH..', // head lowered
  '..HHHH..',
  '..HHHH..',
  '..HHHH..',
  '.BBBBBB.', // shoulders slumped
  '.BBBBBB.',
  'BBBBBBBB',
  'BBBBBBBB',
  '.LL..LL.',
  '.LL..LL.',
  '.LL..LL.',
];

// Rain drop — 1 col × 3 rows.
const DROP: readonly string[] = ['r', 'r', 'r'];

const PALETTE = {
  // boss
  h: '#f87171', // face (red-toned to signal anger)
  e: '#fef2f2',
  '~': '#450a0a',
  t: '#7f1d1d',
  s: '#3f3f46', // shirt (dark grey)
  l: '#292524',
  // devs
  H: '#a8a29e',
  B: '#57534e',
  L: '#292524',
  // rain
  r: '#dc2626',
} as const;

export function PixelDefeatScene() {
  const cell = 4;
  const width = 128;
  const height = 68;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Un jefe furioso frente a dos desarrolladores derrotados"
      className="pixel-defeat h-32 w-auto"
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Rain / anger drops falling from the top */}
      <g className="pixel-rain">
        <PixelGrid rows={DROP} palette={PALETTE} cellSize={cell} offsetX={54} offsetY={0} />
        <PixelGrid rows={DROP} palette={PALETTE} cellSize={cell} offsetX={78} offsetY={4} />
        <PixelGrid rows={DROP} palette={PALETTE} cellSize={cell} offsetX={102} offsetY={0} />
      </g>

      {/* Angry boss on the left (larger figure) */}
      <g className="pixel-shake" style={{ transformOrigin: '24px 40px' }}>
        <PixelGrid rows={BOSS_ANGRY} palette={PALETTE} cellSize={cell} offsetX={4} offsetY={8} />
      </g>

      {/* Two defeated devs on the right */}
      <g>
        <PixelGrid rows={DEV_SAD} palette={PALETTE} cellSize={cell} offsetX={58} offsetY={16} />
        <PixelGrid rows={DEV_SAD} palette={PALETTE} cellSize={cell} offsetX={92} offsetY={16} />
      </g>
    </svg>
  );
}
