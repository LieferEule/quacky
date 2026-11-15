import React from "react";

/**
 * The QuackyMark grid with its inside, one character per cell: `#` the mark,
 * `o` inside the duck. Same 30x16 cells, each half as wide as tall, so the
 * viewBox is 30x32 like QuackyMark's. Puddle draws the same grid.
 */
const GRID = [
  ".......#########..............",
  ".....##ooooooo##..............",
  ".....##oo##ooo##..............",
  "#######ooooooo##..............",
  "#########ooooo##..............",
  ".......##ooo##............####",
  ".....####ooo##################",
  "...####ooooooooooooooooooooo##",
  "...##oooooooooooooooooo##ooo##",
  "...##oooooo##oooooooo##ooooo##",
  "...##oooooo##########ooooo##..",
  ".....##ooooooooooooooooo##....",
  ".......#################......",
  "...........##oooo##...........",
  ".....########oo####...........",
  ".............######...........",
];

type Part = "line" | "fill" | "bill";

// Bill (rows 3-4, left of the head) and legs with feet (from row 13, the
// cells between the legs included) are orange.
const partOf = (row: number, col: number): Part | null => {
  const cell = GRID[row][col];
  if (cell === ".") return null;
  if (row >= 13 || ((row === 3 || row === 4) && col < 7)) return "bill";
  return cell === "#" ? "line" : "fill";
};

// One rect per run of equal cells in a row.
const RUNS = GRID.flatMap((line, row) => {
  const runs: { part: Part; x: number; y: number; w: number }[] = [];
  for (let col = 0; col < line.length; col++) {
    const part = partOf(row, col);
    if (!part) continue;
    const last = runs[runs.length - 1];
    if (last && last.part === part && last.x + last.w === col) last.w++;
    else runs.push({ part, x: col, y: row * 2, w: 1 });
  }
  return runs;
});

const FILL: Record<Part, string> = {
  line: "var(--duck-line)",
  fill: "var(--duck-fill)",
  bill: "var(--duck-bill)",
};

interface QuackyDuckProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

/**
 * The duck as a character: water-blue lines, white inside, orange bill and
 * feet (the "Pfütze" colours, shared with Puddle). QuackyMark stays the
 * one-colour mark for places that follow the text colour.
 */
const QuackyDuck: React.FC<QuackyDuckProps> = ({
  size = 24,
  width,
  height,
  ...props
}) => (
  <svg
    viewBox="0 0 30 32"
    width={width ?? size}
    height={height ?? size}
    shapeRendering="crispEdges"
    role="img"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    {RUNS.map(({ part, x, y, w }) => (
      <rect
        key={`${x},${y}`}
        x={x}
        y={y}
        width={w}
        height="2"
        fill={FILL[part]}
      />
    ))}
  </svg>
);

export default QuackyDuck;
