import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import { commands } from "../../bindings";
import type { AutoSubmitKey } from "../../bindings";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { useSettings } from "../../hooks/useSettings";
import { useOsType } from "../../hooks/useOsType";

interface Props {
  grouped?: boolean;
}

export const VoiceCommands: React.FC<Props> = React.memo(
  ({ grouped = false }) => {
    const { t } = useTranslation();
    const osType = useOsType();
    const { getSetting, updateSetting, isUpdating } = useSettings();
    const enabled = getSetting("voice_commands_enabled") ?? true;
    // "abschicken" presses the key chosen under "Automatisch absenden",
    // even while that is off; say which one.
    const key = (getSetting("auto_submit_key") || "enter") as AutoSubmitKey;
    const keyLabel =
      key === "cmd_enter"
        ? osType === "macos"
          ? t("settings.advanced.autoSubmit.options.cmdEnter")
          : t("settings.advanced.autoSubmit.options.superEnter")
        : key === "ctrl_enter"
          ? t("settings.advanced.autoSubmit.options.ctrlEnter")
          : t("settings.advanced.autoSubmit.options.enter");

    return (
      <ToggleSwitch
        checked={enabled}
        onChange={(value) => updateSetting("voice_commands_enabled", value)}
        isUpdating={isUpdating("voice_commands_enabled")}
        label={t("settings.dictationTools.voiceCommands.label")}
        description={t("settings.dictationTools.voiceCommands.description", {
          key: keyLabel,
        })}
        wrapDescription
        grouped={grouped}
      />
    );
  },
);

/** Asked once per app run: it does not change while the window is open. */
let cachedAvailability: boolean | null = null;

const SIRI_SETTINGS =
  "x-apple.systempreferences:com.apple.Siri-Settings.extension";

export const SelfCorrection: React.FC<Props> = React.memo(
  ({ grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();
    const enabled = getSetting("self_correction_enabled") ?? false;
    const [available, setAvailable] = useState<boolean | null>(
      cachedAvailability,
    );

    useEffect(() => {
      if (cachedAvailability !== null) return;
      let alive = true;
      commands
        .checkAppleIntelligenceAvailable()
        .catch(() => false)
        .then((ok) => {
          cachedAvailability = ok;
          if (alive) setAvailable(ok);
        });
      return () => {
        alive = false;
      };
    }, []);

    const unavailable = available === false;

    return (
      <ToggleSwitch
        checked={enabled && !unavailable}
        onChange={(value) => updateSetting("self_correction_enabled", value)}
        isUpdating={isUpdating("self_correction_enabled")}
        disabled={available !== true}
        hintWhenDisabled={unavailable}
        label={t("settings.dictationTools.selfCorrection.label")}
        description={
          unavailable
            ? t("settings.dictationTools.selfCorrection.unavailable")
            : t("settings.dictationTools.selfCorrection.description")
        }
        footer={
          unavailable ? (
            <button
              type="button"
              onClick={() => openUrl(SIRI_SETTINGS).catch(() => {})}
              className="mt-1 text-[11.5px] leading-4 font-medium text-logo-primary hover:underline cursor-pointer rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-logo-primary"
            >
              {t("settings.dictationTools.selfCorrection.openSettings")}
            </button>
          ) : undefined
        }
        grouped={grouped}
      />
    );
  },
);
