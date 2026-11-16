import React from "react";

interface SettingContainerProps {
  /** Rendered as content, so a node is allowed (e.g. an interactive label). */
  title: React.ReactNode;
  description: string;
  children: React.ReactNode;
  grouped?: boolean;
  layout?: "horizontal" | "stacked";
  disabled?: boolean;
  /** Keep the description whole and readable while disabled (it explains
   *  how to enable the row) and show `footer` under it. */
  hintWhenDisabled?: boolean;
  footer?: React.ReactNode;
  /** Show the whole description instead of clamping it to two lines. */
  wrapDescription?: boolean;
}

/**
 * One row of a duck bubble: title, a short description under it (clamped to
 * two lines, the whole text on hover), and the control on the trailing side.
 */
export const SettingContainer: React.FC<SettingContainerProps> = ({
  title,
  description,
  children,
  grouped = false,
  layout = "horizontal",
  disabled = false,
  hintWhenDisabled = false,
  footer,
  wrapDescription = false,
}) => {
  const frame = grouped ? "" : "glass-card";
  const label = (
    <div
      className={`min-w-0 transition-opacity duration-200 ease-[var(--ease-out)] ${disabled && !hintWhenDisabled ? "opacity-45" : ""}`}
    >
      <h3 className="text-[13px] font-medium leading-5">{title}</h3>
      {description && (
        <p
          className={`text-[11.5px] leading-4 text-text/65 ${wrapDescription || (disabled && hintWhenDisabled) ? "" : "line-clamp-2"}`}
          title={description}
        >
          {description}
        </p>
      )}
      {footer}
    </div>
  );

  if (layout === "stacked") {
    return (
      <div className={`setting-row px-3.5 py-2.5 ${frame}`}>
        <div className="mb-2">{label}</div>
        <div className="w-full">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={`setting-row flex items-center justify-between gap-4 min-h-11 px-3.5 py-2 ${frame}`}
    >
      <div className="max-w-[62%]">{label}</div>
      <div className="relative shrink-0">{children}</div>
    </div>
  );
};
