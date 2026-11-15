import React from "react";
import QuackyDuck from "./QuackyDuck";

const BRAND_NAME = "Quacky";

interface QuackyLogoProps {
  width?: number | string;
  height?: number | string;
  className?: string;
}

/** The Quacky wordmark: the duck on the left, the name on the right. */
const QuackyLogo: React.FC<QuackyLogoProps> = ({
  width,
  height,
  className = "",
}) => (
  <div
    className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap ${className}`}
    style={{ width, height }}
    role="img"
    aria-label={BRAND_NAME}
  >
    <QuackyDuck className="h-[1.35em] w-[1.35em]" />
    <span
      className="text-[0.96em] font-semibold leading-none tracking-[-0.045em] text-text"
      style={{
        fontFamily: "'Space Grotesk', Inter, ui-sans-serif, sans-serif",
      }}
    >
      {BRAND_NAME}
    </span>
  </div>
);

export default QuackyLogo;
