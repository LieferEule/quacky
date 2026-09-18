import { commands, type Theme } from "@/bindings";

/**
 * Appearance theme handling.
 *
 * Handy already ships a full light palette and a full dark palette (see
 * `App.css`). This module lets the user pick which one is used instead of
 * always following the OS:
 *  - `system` removes the override so the `prefers-color-scheme` media query
 *    governs (the historical behaviour).
 *  - `light` / `dark` set `data-theme` on the document root, whose
 *    higher-specificity CSS selectors win over the media query.
 *
 * The choice is persisted in `AppSettings` (source of truth) and mirrored to
 * localStorage so it can be applied synchronously on boot, before React mounts,
 * avoiding a flash of the wrong palette.
 */

export const THEME_STORAGE_KEY = "handy.theme";

export const THEME_OPTIONS: Theme[] = ["system", "light", "dark"];

const isTheme = (value: unknown): value is Theme =>
  value === "system" || value === "light" || value === "dark";

/** Apply a theme to the document root and remember it for the next launch. */
export const applyTheme = (theme: Theme): void => {
  const root = document.documentElement;
  if (theme === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage may be unavailable (e.g. private mode); the setting still
    // persists in AppSettings, so this only costs a one-frame flash on boot.
  }
};

/** Read the last-applied theme for synchronous boot-time application. */
export const getStoredTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // ignore
  }
  return "system";
};

/** Apply the persisted theme from AppSettings (the source of truth). */
export const syncThemeFromSettings = async (): Promise<void> => {
  try {
    const result = await commands.getAppSettings();
    if (result.status === "ok") {
      applyTheme(result.data.theme ?? "system");
    }
  } catch (e) {
    console.warn("Failed to sync theme from settings:", e);
  }
};

/* ----------------------------------------------------------------------------
 * Accent color.
 *
 * The brand accent (Quacky orange) lives in CSS as `--color-logo-primary` and
 * `--color-background-ui`; every accent surface (buttons, focus rings, the
 * recording overlay's dot/waveform, links) reads those tokens. A user-picked
 * accent overrides both via an inline style on the document root (inline styles
 * beat the :root/[data-theme] selectors), so it applies in light and dark alike.
 * `null` removes the override and falls back to the built-in orange.
 * ------------------------------------------------------------------------- */

export const ACCENT_STORAGE_KEY = "quacky.accent";
export const DEFAULT_ACCENT = "#ff6600";
const ACCENT_VARS = ["--color-logo-primary", "--color-background-ui"];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const isHex = (value: unknown): value is string =>
  typeof value === "string" && HEX_RE.test(value);

/** Write the accent CSS variables without touching persisted state. */
const setAccentVars = (color: string): void => {
  const root = document.documentElement;
  for (const v of ACCENT_VARS) root.style.setProperty(v, color);
};

/** Apply an accent color (or clear it) on the document root, and remember it. */
export const applyAccentColor = (color: string | null): void => {
  const root = document.documentElement;
  if (isHex(color)) {
    setAccentVars(color);
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, color);
    } catch {
      // localStorage optional; the setting still persists in AppSettings.
    }
  } else {
    for (const v of ACCENT_VARS) root.style.removeProperty(v);
    try {
      localStorage.removeItem(ACCENT_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
};

/** Read the last-applied accent for synchronous boot-time application. */
export const getStoredAccentColor = (): string | null => {
  try {
    const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
    if (isHex(stored)) return stored;
  } catch {
    // ignore
  }
  return null;
};

/** Apply the persisted accent from AppSettings. */
export const syncAccentFromSettings = async (): Promise<void> => {
  try {
    const result = await commands.getAppSettings();
    if (result.status === "ok") {
      applyAccentColor(result.data.accent_color ?? null);
    }
  } catch (e) {
    console.warn("Failed to sync accent from settings:", e);
  }
};
