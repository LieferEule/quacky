import React from "react";
import { useTranslation } from "react-i18next";
import { type } from "@tauri-apps/plugin-os";
import { MicrophoneSelector } from "../MicrophoneSelector";
import { ShortcutInput } from "../ShortcutInput";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { OutputDeviceSelector } from "../OutputDeviceSelector";
import { PushToTalk } from "../PushToTalk";
import { DoubleTapLatch } from "../DoubleTapLatch";
import { DragDropToggle } from "../DragDropToggle";
import { AutoCopyClipboard } from "../AutoCopyClipboard";
import { AudioFeedback } from "../AudioFeedback";
import { useSettings } from "../../../hooks/useSettings";
import { VolumeSlider } from "../VolumeSlider";
import { AudioDucking } from "../AudioDucking";
import { AudioDuckingSpeed } from "../AudioDuckingSpeed";
import { SoundPicker } from "../SoundPicker";
import { AccentColorPicker } from "../AccentColorPicker";
import { ModelSettingsCard } from "./ModelSettingsCard";

export const GeneralSettings: React.FC = () => {
  const { t } = useTranslation();
  const { audioFeedbackEnabled, getSetting } = useSettings();
  const pushToTalk = getSetting("push_to_talk");
  const doubleTapLatch = getSetting("double_tap_latch") ?? true;
  const duckingEnabled = getSetting("mute_while_recording") ?? false;
  const isLinux = type() === "linux";
  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("settings.general.title")}>
        <ShortcutInput shortcutId="transcribe" grouped={true} />
        <PushToTalk descriptionMode="tooltip" grouped={true} />
        {/* Hands-free only exists as a distinct gesture while push-to-talk is
            on — in toggle mode a single press already keeps recording. */}
        <DoubleTapLatch
          descriptionMode="tooltip"
          grouped={true}
          disabled={!pushToTalk}
        />
        {/* In plain push-to-talk the release key already ends the recording, so
            the cancel shortcut is redundant. A latched hands-free recording has
            no such escape — a tap transcribes it — so cancel is the only way to
            discard one and stays visible. Hidden on Linux either way (dynamic
            shortcut instability). */}
        {!isLinux && (!pushToTalk || doubleTapLatch) && (
          <ShortcutInput shortcutId="cancel" grouped={true} />
        )}
        <AutoCopyClipboard descriptionMode="tooltip" grouped={true} />
        {/* The on-demand counterpart to the auto-copy toggle above: reach for
            the last transcript deliberately instead of copying every one. */}
        <ShortcutInput shortcutId="copy_last_transcript" grouped={true} />
        <ShortcutInput shortcutId="insert_last_transcript" grouped={true} />
        <DragDropToggle descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>

      <ModelSettingsCard />
      <SettingsGroup title={t("settings.sound.title")}>
        <MicrophoneSelector descriptionMode="tooltip" grouped={true} />
        <AudioDucking descriptionMode="tooltip" grouped={true} />
        <AudioDuckingSpeed
          descriptionMode="tooltip"
          grouped={true}
          disabled={!duckingEnabled}
        />
        <AudioFeedback descriptionMode="tooltip" grouped={true} />
        <SoundPicker
          label={t("settings.debug.soundTheme.label")}
          description={t("settings.debug.soundTheme.description")}
        />
        <OutputDeviceSelector
          descriptionMode="tooltip"
          grouped={true}
          disabled={!audioFeedbackEnabled}
        />
        <VolumeSlider disabled={!audioFeedbackEnabled} />
      </SettingsGroup>

      <SettingsGroup title={t("settings.appearance.title")}>
        <AccentColorPicker descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>
    </div>
  );
};
