import React from "react";

interface QuackyMarkProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

/**
 * The Quacky duck.
 *
 * Drawn as one rectangle per run of the original 30x16 pixel grid rather than
 * traced into curves, so it stays exactly the artwork it was drawn as and the
 * edges land on whole units at any size. Cells are half as wide as they are
 * tall, which is why the viewBox is 30x32.
 *
 * Fill is `currentColor`, so it follows the accent token wherever it is placed.
 */
const QuackyMark: React.FC<QuackyMarkProps> = ({
  size = 24,
  width,
  height,
  className,
  ...props
}) => (
  <svg
    viewBox="0 0 30 32"
    width={width ?? size}
    height={height ?? size}
    className={className}
    fill="currentColor"
    shapeRendering="crispEdges"
    role="img"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect x="7" y="0" width="9" height="2" />
    <rect x="5" y="2" width="2" height="4" />
    <rect x="14" y="2" width="2" height="8" />
    <rect x="9" y="4" width="2" height="2" />
    <rect x="0" y="6" width="7" height="2" />
    <rect x="0" y="8" width="9" height="2" />
    <rect x="7" y="10" width="2" height="2" />
    <rect x="12" y="10" width="2" height="2" />
    <rect x="26" y="10" width="4" height="2" />
    <rect x="5" y="12" width="4" height="2" />
    <rect x="12" y="12" width="18" height="2" />
    <rect x="3" y="14" width="4" height="2" />
    <rect x="28" y="14" width="2" height="6" />
    <rect x="3" y="16" width="2" height="6" />
    <rect x="23" y="16" width="2" height="2" />
    <rect x="11" y="18" width="2" height="2" />
    <rect x="21" y="18" width="2" height="2" />
    <rect x="11" y="20" width="10" height="2" />
    <rect x="26" y="20" width="2" height="2" />
    <rect x="5" y="22" width="2" height="2" />
    <rect x="24" y="22" width="2" height="2" />
    <rect x="7" y="24" width="17" height="2" />
    <rect x="11" y="26" width="2" height="2" />
    <rect x="17" y="26" width="2" height="2" />
    <rect x="5" y="28" width="8" height="2" />
    <rect x="15" y="28" width="4" height="2" />
    <rect x="13" y="30" width="6" height="2" />
  </svg>
);

export default QuackyMark;
