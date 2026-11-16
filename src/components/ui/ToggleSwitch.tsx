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
  hintWhenDisabled?: boolean;
  footer?: React.ReactNode;
  wrapDescription?: boolean;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  isUpdating = false,
  label,
  description,
  grouped = false,
  hintWhenDisabled = false,
  footer,
  wrapDescription = false,
}) => {
  return (
    <SettingContainer
      title={label}
      description={description}
      grouped={grouped}
      disabled={disabled}
      hintWhenDisabled={hintWhenDisabled}
      footer={footer}
      wrapDescription={wrapDescription}
    >
      <Switch
        checked={checked}
        onCheckedChange={(value) => {
          if (!isUpdating) onChange(value);
        }}
        disabled={disabled}
        aria-label={typeof label === "string" ? label : undefined}
      />
      {isUpdating && (
        <div className="toggle-spinner absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-logo-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </SettingContainer>
  );
};
