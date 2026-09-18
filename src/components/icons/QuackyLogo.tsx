import React from "react";
import VoiceMark from "./VoiceMark";

const BRAND_NAME = "Quacky";

interface QuackyLogoProps {
  width?: number | string;
  height?: number | string;
  className?: string;
}

/**
 * The Quacky wordmark: mark on the left, name on the right.
 *
 * `VoiceMark` is the inherited placeholder glyph. To drop in the real logo,
 * replace that component's SVG — everything here (sizing, spacing, the accent
 * colour token) keeps working, and no other file needs to change.
 */
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
    <VoiceMark className="h-[1.35em] w-[1.35em] text-logo-primary" />
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
