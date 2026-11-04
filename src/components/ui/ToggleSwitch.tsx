import React from "react";
import { Switch } from "glisse";
import { SettingContainer } from "./SettingContainer";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  isUpdating?: boolean;
  label: React.ReactNode;
  description: string;
  grouped?: boolean;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  isUpdating = false,
  label,
  description,
  grouped = false,
}) => {
  return (
    <SettingContainer
      title={label}
      description={description}
      grouped={grouped}
      disabled={disabled}
    >
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled || isUpdating}
        aria-label={typeof label === "string" ? label : undefined}
      />
      {isUpdating && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-logo-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </SettingContainer>
  );
};
