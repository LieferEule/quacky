import React from "react";
import { useTranslation } from "react-i18next";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";

interface DoubleTapLatchProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
  disabled?: boolean;
}

/**
 * Double tap to keep recording — the hands-free counterpart to push-to-talk.
 *
 * Only meaningful while push-to-talk is on: in toggle mode a single press
 * already latches, so the caller disables this.
 */
export const DoubleTapLatch: React.FC<DoubleTapLatchProps> = React.memo(
  ({ descriptionMode = "tooltip", grouped = false, disabled = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();

    const enabled = getSetting("double_tap_latch") ?? true;

    return (
      <ToggleSwitch
        checked={enabled}
        onChange={(value) => updateSetting("double_tap_latch", value)}
        isUpdating={isUpdating("double_tap_latch")}
        disabled={disabled}
        label={t("settings.general.doubleTapLatch.label")}
        description={t("settings.general.doubleTapLatch.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
      />
    );
  },
);
