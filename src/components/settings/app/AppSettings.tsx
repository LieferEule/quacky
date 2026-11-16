import React from "react";
import { useTranslation } from "react-i18next";
import { ShowOverlay } from "../ShowOverlay";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { StartHidden } from "../StartHidden";
import { AutostartToggle } from "../AutostartToggle";
import { ShowTrayIcon } from "../ShowTrayIcon";
import { AppLanguageSelector } from "../AppLanguageSelector";
import { ThemeSelector } from "../ThemeSelector";
import { AppDataDirectory } from "../AppDataDirectory";
import { LogDirectory } from "../debug";
import { UpdateNow } from "../UpdateNow";
import { UpdateChecksToggle } from "../UpdateChecksToggle";

export const AppSettings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <>
      <SettingsGroup title={t("shell.questions.appearance")}>
        <ThemeSelector grouped={true} />
        <AppLanguageSelector grouped={true} />
      </SettingsGroup>

      <SettingsGroup title={t("shell.questions.behavior")}>
        <StartHidden grouped={true} />
        <AutostartToggle grouped={true} />
        <ShowTrayIcon grouped={true} />
        <ShowOverlay grouped={true} />
      </SettingsGroup>

      <SettingsGroup title={t("shell.questions.updates")}>
        <UpdateNow grouped={true} />
        <UpdateChecksToggle grouped={true} />
      </SettingsGroup>

      <SettingsGroup title={t("shell.questions.folders")}>
        <AppDataDirectory grouped={true} />
        <LogDirectory grouped={true} />
      </SettingsGroup>
    </>
  );
};
