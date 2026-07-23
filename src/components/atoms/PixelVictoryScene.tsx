import { PixelGrid } from './PixelGrid';

// ---------------------------------------------------------------------------
// PixelVictoryScene — two devs celebrating with arms up. Rendered from an
// ASCII grid so future tweaks don't require redrawing SVG rects by hand.
// Palette matches the game's amber/emerald "success" tone (`Crisis contenida`).
//
// The scene is intentionally small and legible in the demo video: ~10s of
// visible pixels per figure, no shading — clean 8-bit vibe.
// ---------------------------------------------------------------------------

// One 'dev celebrating' figure — 8 cols × 12 rows.
//  a = arms/hands (amber), b = head, c = torso (emerald), d = legs
const DEV_HAPPY: readonly string[] = [
  '..a....a', // fists
  '..a....a',
  '..a....a', // arms up
  '..a....a',
  '..a....a',
  '.abbbba.', // head + shoulders
  '.abbbba.',
  '.abbbba.',
  '..cccc..', // torso
  '..cccc..',
  '..cccc..',
  '..d..d..', // legs
];

// A single confetti "spark" — 3 cols × 3 rows.
const CONFETTI: readonly string[] = ['.s.', 'sss', '.s.'];

// Colors: solid amber for arms/legs, warm skin for head, emerald for torso.
const PALETTE = {
  a: '#fbbf24',
  b: '#fde68a',
  c: '#10b981',
  d: '#78716c',
  s: '#facc15',
} as const;

// Two devs side by side, both waving with confetti behind them. The animation
// is class-based so the caller can toggle it via CSS (respects prefers-reduced-
// motion). See app/globals.css for @keyframes pixel-cheer and pixel-sparkle.
export function PixelVictoryScene() {
  const cell = 4;
  const width = 96;
  const height = 60;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Dos desarrolladores celebrando la crisis contenida"
      className="pixel-victory h-32 w-auto"
      style={{ imageRendering: 'pixelated' }}
    >
      {/* Confetti in the background — spaced across the top */}
      <g className="pixel-sparkle">
        <PixelGrid rows={CONFETTI} palette={PALETTE} cellSize={cell} offsetX={10} offsetY={4} />
        <PixelGrid rows={CONFETTI} palette={PALETTE} cellSize={cell} offsetX={80} offsetY={4} />
        <PixelGrid rows={CONFETTI} palette={PALETTE} cellSize={cell} offsetX={46} offsetY={0} />
      </g>

      {/* Dev 1 (left, cheering) */}
      <g className="pixel-cheer" style={{ transformOrigin: '20px 40px' }}>
        <PixelGrid rows={DEV_HAPPY} palette={PALETTE} cellSize={cell} offsetX={8} offsetY={12} />
      </g>

      {/* Dev 2 (right, cheering out of phase for variety) */}
      <g className="pixel-cheer pixel-cheer--offset" style={{ transformOrigin: '76px 40px' }}>
        <PixelGrid rows={DEV_HAPPY} palette={PALETTE} cellSize={cell} offsetX={56} offsetY={12} />
      </g>
    </svg>
  );
}
