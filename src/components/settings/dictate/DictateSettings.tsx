import React from "react";
import { useTranslation } from "react-i18next";
import { type } from "@tauri-apps/plugin-os";
import { MicrophoneSelector } from "../MicrophoneSelector";
import { ShortcutInput } from "../ShortcutInput";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { OutputDeviceSelector } from "../OutputDeviceSelector";
import { PushToTalk } from "../PushToTalk";
import { DoubleTapLatch } from "../DoubleTapLatch";
import { AutoCopyClipboard } from "../AutoCopyClipboard";
import { AudioFeedback } from "../AudioFeedback";
import { useSettings } from "../../../hooks/useSettings";
import { VolumeSlider } from "../VolumeSlider";
import { AudioDucking } from "../AudioDucking";
import { AudioDuckingSpeed } from "../AudioDuckingSpeed";
import { SoundPicker } from "../SoundPicker";
import { PasteMethodSetting } from "../PasteMethod";
import { TypingToolSetting } from "../TypingTool";
import { ClipboardHandlingSetting } from "../ClipboardHandling";
import { AutoSubmit } from "../AutoSubmit";
import { AppendTrailingSpace } from "../AppendTrailingSpace";
import { ModelSettingsCard } from "./ModelSettingsCard";
import { DictateStatus } from "./DictateStatus";

export const DictateSettings: React.FC = () => {
  const { t } = useTranslation();
  const { audioFeedbackEnabled, getSetting } = useSettings();
  const pushToTalk = getSetting("push_to_talk");
  const doubleTapLatch = getSetting("double_tap_latch") ?? true;
  const duckingEnabled = getSetting("mute_while_recording") ?? false;
  const isLinux = type() === "linux";
  return (
    <>
      <DictateStatus />

      <SettingsGroup title={t("shell.questions.shortcuts")}>
        <ShortcutInput shortcutId="transcribe" grouped={true} />
        <PushToTalk grouped={true} />
        {/* Hands-free only exists as a distinct gesture while push-to-talk is
            on — in toggle mode a single press already keeps recording. */}
        <DoubleTapLatch grouped={true} disabled={!pushToTalk} />
        {/* In plain push-to-talk the release key already ends the recording, so
            the cancel shortcut is redundant. A latched hands-free recording has
            no such escape — a tap transcribes it — so cancel is the only way to
            discard one and stays visible. Hidden on Linux either way (dynamic
            shortcut instability). */}
        {!isLinux && (!pushToTalk || doubleTapLatch) && (
          <ShortcutInput shortcutId="cancel" grouped={true} />
        )}
        <ShortcutInput shortcutId="copy_last_transcript" grouped={true} />
        <ShortcutInput shortcutId="insert_last_transcript" grouped={true} />
      </SettingsGroup>

      <ModelSettingsCard />

      <SettingsGroup title={t("shell.questions.microphone")}>
        <MicrophoneSelector grouped={true} />
        <AudioDucking grouped={true} />
        <AudioDuckingSpeed grouped={true} disabled={!duckingEnabled} />
        <AudioFeedback grouped={true} />
        <SoundPicker
          label={t("settings.debug.soundTheme.label")}
          description={t("settings.debug.soundTheme.description")}
        />
        <OutputDeviceSelector grouped={true} disabled={!audioFeedbackEnabled} />
        <VolumeSlider disabled={!audioFeedbackEnabled} />
      </SettingsGroup>

      <SettingsGroup title={t("shell.questions.output")}>
        <PasteMethodSetting grouped={true} />
        <TypingToolSetting grouped={true} />
        <ClipboardHandlingSetting grouped={true} />
        <AutoCopyClipboard grouped={true} />
        <AutoSubmit grouped={true} />
        <AppendTrailingSpace grouped={true} />
      </SettingsGroup>
    </>
  );
};
