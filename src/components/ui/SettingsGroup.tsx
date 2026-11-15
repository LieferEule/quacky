import React from "react";
import QuackyDuck from "../icons/QuackyDuck";

interface SettingsGroupProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
}

/**
 * A settings group is something the duck asks: its avatar beside a speech
 * bubble whose heading is the question and whose rows are the answers.
 */
export const SettingsGroup: React.FC<SettingsGroupProps> = ({
  title,
  description,
  children,
}) => {
  return (
    <section className="duck-say flex items-start gap-2.5">
      <span className="duck-avatar" aria-hidden="true">
        <QuackyDuck size={15} />
      </span>
      <div className="duck-bubble min-w-0 flex-1">
        {title && (
          <header className="px-3.5 pt-3 pb-1">
            <h2 className="text-[13.5px] font-semibold leading-5">{title}</h2>
            {description && (
              <p className="text-[11.5px] leading-4 text-text/65 mt-0.5">
                {description}
              </p>
            )}
          </header>
        )}
        <div className="divide-y divide-[var(--glass-hair)]">{children}</div>
      </div>
    </section>
  );
};
