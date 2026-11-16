import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: "default" | "compact";
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(
    { className = "", variant = "default", disabled, ...props },
    ref,
  ) {
    const baseClasses =
      "px-2 py-1 text-[12.5px] font-medium glass-control rounded-lg text-start transition-[background-color,border-color,opacity] duration-150";

    const interactiveClasses = disabled
      ? "opacity-60 cursor-not-allowed"
      : "hover:bg-logo-primary/10 hover:border-logo-primary focus:outline-none focus:bg-logo-primary/20 focus:border-logo-primary";

    const variantClasses = {
      default: "px-3 py-2",
      compact: "px-2 py-1",
    } as const;

    return (
      <input
        ref={ref}
        className={`${baseClasses} ${variantClasses[variant]} ${interactiveClasses} ${className}`}
        disabled={disabled}
        {...props}
      />
    );
  },
);
