// ---------------------------------------------------------------------------
// PixelGrid — turns an ASCII grid into a compact set of SVG rects. Each row is
// a string; each character maps to a color in the palette (or is skipped when
// absent, which is the "transparent pixel" behavior). Used by the victory /
// defeat pixel-art scenes so the art is authorable as ASCII in-source instead
// of hand-crafting hundreds of <rect> tags.
//
// Rows must be equal length; the caller is expected to pad. Cells outside the
// palette (e.g. ".") render nothing — that's how negative space is drawn.
// ---------------------------------------------------------------------------

interface PixelGridProps {
  rows: readonly string[];
  palette: Readonly<Record<string, string>>;
  cellSize?: number;
  offsetX?: number;
  offsetY?: number;
}

export function PixelGrid({
  rows,
  palette,
  cellSize = 4,
  offsetX = 0,
  offsetY = 0,
}: PixelGridProps) {
  const cells: React.ReactElement[] = [];
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const key = row[x];
      const fill = palette[key];
      if (!fill) continue;
      cells.push(
        <rect
          key={`${x}-${y}`}
          x={offsetX + x * cellSize}
          y={offsetY + y * cellSize}
          width={cellSize}
          height={cellSize}
          fill={fill}
        />,
      );
    }
  }
  return <g>{cells}</g>;
}
