import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QuackyMark from "../../icons/QuackyMark";

export type BroodPhase = "away" | "arriving" | "sitting" | "laying";

// Keep in step with `brood-arrive` and `brood-leave` in App.css.
const ARRIVE_MS = 1000;
const LAY_MS = 1700;

/**
 * The duck's visit, which outlasts the transcription: a voice note can finish
 * before the duck has even sat down, and it still gets to arrive and lay.
 */
export const useBroodPhase = (
  running: boolean,
  onLaid: () => void,
): BroodPhase => {
  const [phase, setPhase] = useState<BroodPhase>(running ? "sitting" : "away");
  const onLaidRef = useRef(onLaid);
  onLaidRef.current = onLaid;

  if (running && phase === "away") setPhase("arriving");
  if (running && phase === "laying") setPhase("sitting");

  useEffect(() => {
    if (phase === "sitting" && !running) setPhase("laying");
  }, [phase, running]);

  useEffect(() => {
    if (phase !== "arriving" && phase !== "laying") return;
    const timer = setTimeout(
      () => {
        if (phase === "laying") onLaidRef.current();
        setPhase(phase === "arriving" ? "sitting" : "away");
      },
      phase === "arriving" ? ARRIVE_MS : LAY_MS,
    );
    return () => clearTimeout(timer);
  }, [phase]);

  return phase;
};

// Pixel cells like the duck's, as [first column, width] per row.
const EGG_ROWS = [
  [4, 4],
  [2, 8],
  [2, 8],
  [1, 10],
  [1, 10],
  [1, 10],
  [0, 12],
  [0, 12],
  [0, 12],
  [0, 12],
  [0, 12],
  [0, 12],
  [1, 10],
  [1, 10],
  [2, 8],
  [4, 4],
];
const inEgg = (x: number, y: number) => {
  const row = EGG_ROWS[y];
  return !!row && x >= row[0] && x < row[0] + row[1];
};
// The crack: a zigzag across row 7.
const isTop = (x: number, y: number) => y < 7 || (y === 7 && x % 4 < 2);
const EGG_CELLS = EGG_ROWS.flatMap(([first, width], y) =>
  Array.from({ length: width }, (_, i) => {
    const x = first + i;
    return {
      x,
      y,
      edge: ![
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ].every(([nx, ny]) => inEgg(nx, ny)),
      top: isTop(x, y),
      // Along the zigzag, where the other half touches this cell.
      crack: [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ].some(([nx, ny]) => inEgg(nx, ny) && isTop(nx, ny) !== isTop(x, y)),
    };
  }),
);
const SPECKLES = new Set(["4,5", "7,3", "8,9", "3,10", "6,12"]);

const eggCells = (top: boolean, cracked: boolean) =>
  EGG_CELLS.filter((cell) => cell.top === top).map(({ x, y, edge, crack }) => (
    <rect
      key={`${x},${y}`}
      x={x}
      y={y}
      width="1"
      height="1"
      fill={
        edge || (cracked && crack)
          ? "currentColor"
          : SPECKLES.has(`${x},${y}`)
            ? "var(--color-background-ui)"
            : "var(--egg-shell)"
      }
    />
  ));

export const Egg: React.FC<{
  height: number;
  className?: string;
  cracked?: boolean;
}> = ({ height, className = "", cracked = false }) => (
  <svg
    viewBox="0 0 12 16"
    height={height}
    width={(height * 12) / 16}
    shapeRendering="crispEdges"
    aria-hidden="true"
    className={`egg ${className}`}
  >
    <g className="egg-top">{eggCells(true, cracked)}</g>
    <g>{eggCells(false, cracked)}</g>
  </svg>
);

// Webbed prints along the duck's path: offset from the stage's centre in px, and
// when it passes there in ms. Keep in step with `brood-arrive` / `brood-leave`.
const PRINTS_IN = [
  [104, 137],
  [88, 274],
  [72, 410],
  [56, 547],
];
const PRINTS_OUT = [
  [-60, 422],
  [-78, 514],
  [-96, 607],
  [-114, 699],
  [-132, 792],
];

const Footprints: React.FC<{ prints: number[][] }> = ({ prints }) => (
  <>
    {prints.map(([x, delay], i) => (
      <svg
        key={x}
        viewBox="0 0 8 7"
        className="brood-print"
        style={
          {
            left: `calc(50% + ${x}px)`,
            bottom: i % 2 ? 4 : 0,
            animationDelay: `${delay}ms`,
          } as React.CSSProperties
        }
      >
        <path d="M8 3 4.4 2.5 0 0l1.5 2L0 3.5 1.5 5 0 7l4.4-2.5L8 4Z" />
      </svg>
    ))}
  </>
);

/** The text, shrinking under the duck as the run progresses, then the egg. */
export const BroodStage: React.FC<{
  phase: BroodPhase;
  laysEgg: boolean;
  /** Share of the audio done, where the run reports it (long files). */
  done: number;
  eggRef: React.RefObject<HTMLDivElement>;
}> = ({ phase, laysEgg, done, eggRef }) => {
  // Coming back to a run already under way, the duck did not just walk in.
  const walkedIn = useRef(phase !== "sitting");
  return (
    <div
      className="brood"
      data-phase={phase}
      aria-hidden="true"
      style={{ "--brood-done": done } as React.CSSProperties}
    >
      <div className="brood-paper">
        <i />
        <i />
        <i />
      </div>
      {phase === "laying" ? (
        <Footprints prints={PRINTS_OUT} />
      ) : (
        walkedIn.current && <Footprints prints={PRINTS_IN} />
      )}
      {phase === "laying" && laysEgg && (
        <div ref={eggRef} className="brood-egg">
          <Egg height={EGG_HEIGHT} />
        </div>
      )}
      <div className="brood-duck">
        <QuackyMark size={34} className="brood-duck-body" />
        <svg
          viewBox="0 0 12 8"
          className="brood-wing"
          shapeRendering="crispEdges"
        >
          <rect x="0" y="4" width="8" height="4" />
          <rect x="3" y="2" width="7" height="2" />
          <rect x="6" y="0" width="6" height="2" />
        </svg>
      </div>
    </div>
  );
};

export const EGG_HEIGHT = 28;
const FLIGHT_MS = 1100;
// Where the throw ends and each bounce lands, as shares of the flight.
const THROW_END = 0.6;
const BOUNCE_END = 0.84;

/** Offset from the landing spot at `t`: a throw, then two shrinking bounces. */
const flightPoint = (t: number, dx: number, dy: number) => {
  const arc = (u: number, height: number) => height * 4 * u * (1 - u);
  if (t < THROW_END) {
    const u = t / THROW_END;
    return {
      x: dx * (1 - 0.88 * u),
      y: dy * (1 - u) - arc(u, 54),
      tilt: -24 * Math.sin(Math.PI * u),
    };
  }
  if (t < BOUNCE_END) {
    const u = (t - THROW_END) / (BOUNCE_END - THROW_END);
    return {
      x: dx * (0.12 - 0.08 * u),
      y: -arc(u, 16),
      tilt: 6 * Math.sin(Math.PI * u),
    };
  }
  const u = (t - BOUNCE_END) / (1 - BOUNCE_END);
  return {
    x: dx * 0.04 * (1 - u),
    y: -arc(u, 5),
    tilt: -2 * Math.sin(Math.PI * u),
  };
};

/**
 * The egg's way from the stage to its row in the list. The row's own egg stays
 * hidden until this one lands on it, so both have to be the same size. One
 * flight per mount: the parent keys it by file.
 */
export const FlyingEgg: React.FC<{
  from: DOMRect;
  target: () => Element | null;
  onLanded: () => void;
}> = ({ from, target, onLanded }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [to, setTo] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    const row = target();
    if (!row || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onLanded();
      return;
    }
    row.scrollIntoView({ block: "nearest" });
    setTo(row.getBoundingClientRect());
  }, []);

  useLayoutEffect(() => {
    if (!to || !ref.current) return;
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const keyframes = Array.from({ length: 61 }, (_, i) => {
      const { x, y, tilt } = flightPoint(i / 60, dx, dy);
      return { transform: `translate(${x}px, ${y}px) rotate(${tilt}deg)` };
    });
    const flight = ref.current.animate(keyframes, FLIGHT_MS);
    flight.onfinish = onLanded;
    return () => flight.cancel();
  }, [to]);

  if (!to) return null;
  return createPortal(
    <div
      ref={ref}
      className="flying-egg"
      aria-hidden="true"
      style={{ left: to.left, top: to.top }}
    >
      <Egg height={EGG_HEIGHT} />
    </div>,
    document.body,
  );
};
