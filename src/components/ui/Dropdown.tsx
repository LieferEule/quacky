import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface DropdownProps {
  options: DropdownOption[];
  className?: string;
  selectedValue: string | null;
  onSelect: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onRefresh?: () => void;
  /** "chips" offers a fixed, short set of answers as capsules (theme,
   *  ducking speed); lists that grow or come from data stay a menu. */
  variant?: "menu" | "chips";
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  selectedValue,
  onSelect,
  className = "",
  placeholder = "Select an option...",
  disabled = false,
  onRefresh,
  variant = "menu",
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(
    (option) => option.value === selectedValue,
  );

  const handleSelect = (value: string) => {
    onSelect(value);
    setIsOpen(false);
  };

  if (variant === "chips") {
    // Arrow keys move the choice, as in any radio group.
    const step = (from: number, delta: number) => {
      const n = options.length;
      for (let i = 1; i <= n; i++) {
        const next = options[(from + delta * i + n * n) % n];
        if (!next.disabled) return next;
      }
      return null;
    };
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      const delta =
        e.key === "ArrowRight" || e.key === "ArrowDown"
          ? 1
          : e.key === "ArrowLeft" || e.key === "ArrowUp"
            ? -1
            : 0;
      if (!delta || disabled) return;
      e.preventDefault();
      const from = options.findIndex((o) => o.value === selectedValue);
      const next = step(Math.max(from, 0), delta);
      if (next) {
        onSelect(next.value);
        const chips = e.currentTarget.querySelectorAll("button");
        (chips[options.indexOf(next)] as HTMLButtonElement)?.focus();
      }
    };
    return (
      <div
        role="radiogroup"
        onKeyDown={handleKeyDown}
        className={`answer-chips flex flex-wrap justify-end gap-1.5 ${
          disabled ? "opacity-50" : ""
        } ${className}`}
      >
        {options.map((option) => {
          const selected = option.value === selectedValue;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={
                selected || (!selectedValue && option === options[0]) ? 0 : -1
              }
              disabled={disabled || option.disabled}
              className={`answer-chip ${selected ? "is-chosen" : ""}`}
              onClick={() => onSelect(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen && onRefresh) onRefresh();
    setIsOpen(!isOpen);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        className={`px-2.5 py-1 text-[12.5px] font-medium glass-control rounded-lg min-w-[180px] w-full text-start grid grid-cols-[1fr_auto] gap-2 items-center transition-all duration-150 ${
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "hover:bg-logo-primary/10 cursor-pointer hover:border-logo-primary"
        }`}
        onClick={handleToggle}
        disabled={disabled}
      >
        <span className="truncate">{selectedOption?.label || placeholder}</span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "transform rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {isOpen && !disabled && (
        <div className="absolute top-full left-0 right-0 mt-1 glass-pop z-50 max-h-60 overflow-y-auto py-1">
          {options.length === 0 ? (
            <div className="px-2 py-1 text-sm text-mid-gray">
              {t("common.noOptionsFound")}
            </div>
          ) : (
            options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`w-full px-2 py-1 text-sm text-start hover:bg-logo-primary/10 transition-colors duration-150 ${
                  selectedValue === option.value
                    ? "bg-logo-primary/20 font-semibold"
                    : ""
                } ${option.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                onClick={() => handleSelect(option.value)}
                disabled={option.disabled}
              >
                <span className="whitespace-normal break-words">
                  {option.label}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
