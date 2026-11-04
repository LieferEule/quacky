import React from "react";
import { useTranslation } from "react-i18next";
import { Slider } from "../../ui/Slider";
import { useSettings } from "../../../hooks/useSettings";

interface DoubleTapWindowProps {
  grouped?: boolean;
}

/**
 * How long a second tap still counts as a double tap. This is also how long a
 * lone tap waits before it can transcribe, so shorter feels snappier at the
 * cost of missing slower double taps.
 */
export const DoubleTapWindow: React.FC<DoubleTapWindowProps> = ({
  grouped = false,
}) => {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();

  return (
    <Slider
      value={settings?.double_tap_window_ms ?? 350}
      onChange={(value) => updateSetting("double_tap_window_ms", value)}
      min={150}
      max={800}
      step={25}
      label={t("settings.debug.doubleTapWindow.title")}
      description={t("settings.debug.doubleTapWindow.description")}
      grouped={grouped}
      formatValue={(v) => `${v}ms`}
    />
  );
};
