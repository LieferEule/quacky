import React from "react";

/**
 * The QuackyMark body with its inside, one character per cell: `#` the mark,
 * `o` inside the duck. Same 30-column grid, each cell half as wide as tall, so
 * the viewBox is 30x32 like QuackyMark's. Puddle draws the same body.
 */
const BODY = [
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
];

// Rows 13-15: two orange legs with the feet pointing ahead. Walking swaps
// between the two steps, each with one foot lifted.
const STAND = [
  "...........##....##...........",
  "...........##....##...........",
  ".......######..######.........",
];
const STEP_LEFT = [
  "...........##....##...........",
  ".......######....##...........",
  "..............######..........",
];
const STEP_RIGHT = [
  "...........##....##...........",
  "...........##.######..........",
  ".......######.................",
];

type Part = "line" | "fill" | "bill";

// The bill (rows 3-4, left of the head) is orange like the legs.
const partOf = (cell: string, row: number, col: number): Part | null => {
  if (cell === ".") return null;
  if (row >= 13 || ((row === 3 || row === 4) && col < 7)) return "bill";
  return cell === "#" ? "line" : "fill";
};

// One rect per run of equal cells in a row.
const runsOf = (rows: string[], firstRow: number) =>
  rows.flatMap((line, i) => {
    const row = firstRow + i;
    const runs: { part: Part; x: number; y: number; w: number }[] = [];
    for (let col = 0; col < line.length; col++) {
      const part = partOf(line[col], row, col);
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

const cells = (rows: string[], firstRow: number) =>
  runsOf(rows, firstRow).map(({ part, x, y, w }) => (
    <rect
      key={`${x},${y}`}
      x={x}
      y={y}
      width={w}
      height="2"
      fill={FILL[part]}
    />
  ));

const BODY_CELLS = cells(BODY, 0);
const STAND_CELLS = cells(STAND, 13);
const STEP_LEFT_CELLS = cells(STEP_LEFT, 13);
const STEP_RIGHT_CELLS = cells(STEP_RIGHT, 13);

interface QuackyDuckProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  /** Steps from foot to foot (`duck-step` in App.css) instead of standing. */
  walking?: boolean;
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
  walking = false,
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
    {BODY_CELLS}
    {walking ? (
      <>
        <g className="duck-step">{STEP_LEFT_CELLS}</g>
        <g className="duck-step duck-step-other">{STEP_RIGHT_CELLS}</g>
      </>
    ) : (
      STAND_CELLS
    )}
  </svg>
);

export default QuackyDuck;
