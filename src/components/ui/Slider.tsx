import React from "react";
import { Slider as GlassSlider } from "glisse";
import { SettingContainer } from "./SettingContainer";

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  label: string;
  description: string;
  grouped?: boolean;
  showValue?: boolean;
  formatValue?: (value: number) => string;
}

export const Slider: React.FC<SliderProps> = ({
  value,
  onChange,
  min,
  max,
  step = 0.01,
  disabled = false,
  label,
  description,
  grouped = false,
  showValue = true,
  formatValue = (v) => v.toFixed(2),
}) => {
  return (
    <SettingContainer
      title={label}
      description={description}
      grouped={grouped}
      layout="horizontal"
      disabled={disabled}
    >
      <div className="w-full">
        <div className="flex items-center gap-3">
          <GlassSlider
            className="flex-grow"
            min={min}
            max={max}
            step={step}
            value={value}
            onValueChange={onChange}
            disabled={disabled}
            aria-label={label}
          />
          {showValue && (
            <span className="text-sm font-medium text-text/90 w-12 text-end">
              {formatValue(value)}
            </span>
          )}
        </div>
      </div>
    </SettingContainer>
  );
};
