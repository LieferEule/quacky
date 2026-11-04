import React from "react";
import { SegmentedControl } from "glisse";
import { useTranslation } from "react-i18next";
import { useSettings } from "../hooks/useSettings";
import {
  DictateSettings,
  AppSettings,
  HistorySettings,
  DebugSettings,
  AboutSettings,
  ModelsSettings,
  TranscribeSettings,
} from "./settings";

export type Section = keyof typeof SECTIONS_CONFIG;

interface SectionConfig {
  component: React.ComponentType;
  enabled: (settings: any) => boolean;
}

export const SECTIONS_CONFIG = {
  dictate: {
    component: DictateSettings,
    enabled: () => true,
  },
  transcribe: {
    component: TranscribeSettings,
    enabled: () => true,
  },
  history: {
    component: HistorySettings,
    enabled: () => true,
  },
  models: {
    component: ModelsSettings,
    enabled: () => true,
  },
  app: {
    component: AppSettings,
    enabled: () => true,
  },
  about: {
    component: AboutSettings,
    enabled: () => true,
  },
  debug: {
    component: DebugSettings,
    enabled: (settings) => settings?.debug_mode ?? false,
  },
} as const satisfies Record<string, SectionConfig>;

interface SectionTabsProps {
  activeSection: Section;
  onSectionChange: (section: Section) => void;
}

/**
 * The sections as Glisse's segmented control across the top of the window:
 * click a tab, or press and hold to lift the selection into a lens and drag it
 * across tabs, the same gesture as the switches.
 */
export const SectionTabs: React.FC<SectionTabsProps> = ({
  activeSection,
  onSectionChange,
}) => {
  const { t } = useTranslation();
  const { settings } = useSettings();

  const items = Object.entries(SECTIONS_CONFIG)
    .filter(([_, config]) => config.enabled(settings))
    .map(([id]) => ({ value: id, label: t(`shell.tabs.${id}`) }));

  return (
    <SegmentedControl
      className="section-tabs"
      aria-label={t("sidebar.navigation")}
      items={items}
      value={activeSection}
      onValueChange={(value) => onSectionChange(value as Section)}
    />
  );
};
