import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "../../hooks/useSettings";
import type { TextReplacement } from "../../bindings";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { SettingContainer } from "../ui/SettingContainer";

interface TextReplacementsProps {
  grouped?: boolean;
}

const MAX_TRIGGER = 60;

/** Same key the backend matches on: words lowercased, hyphens as spaces. */
const triggerKey = (s: string) =>
  s
    .toLowerCase()
    .split(/[\s-]+/)
    .filter(Boolean)
    .join(" ");

export const TextReplacements: React.FC<TextReplacementsProps> = React.memo(
  ({ grouped = false }) => {
    const { t } = useTranslation();
    const { getSetting, updateSetting, isUpdating } = useSettings();
    const replacements: TextReplacement[] =
      getSetting("text_replacements") || [];
    const busy = isUpdating("text_replacements");

    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    /** The trigger of the entry being edited, or null when adding. */
    const [editing, setEditing] = useState<string | null>(null);
    const [flash, setFlash] = useState<string | null>(null);
    const fromRef = useRef<HTMLInputElement>(null);
    const toRef = useRef<HTMLInputElement>(null);
    const removeRefs = useRef<(HTMLButtonElement | null)[]>([]);
    /** Only the row just saved animates in, not every row on each visit. */
    const [fresh, setFresh] = useState<string | null>(null);
    const [toFocused, setToFocused] = useState(false);

    useEffect(() => {
      if (!fresh) return;
      const timer = window.setTimeout(() => setFresh(null), 600);
      return () => window.clearTimeout(timer);
    }, [fresh]);

    useEffect(() => {
      if (!flash) return;
      // The list scrolls past 220px: bring the entry into view first.
      document
        .querySelector('.replacement-row[data-flash="true"]')
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      const timer = window.setTimeout(() => setFlash(null), 600);
      return () => window.clearTimeout(timer);
    }, [flash]);

    const trigger = from.trim();
    const tooLong = trigger.length > MAX_TRIGGER;
    const duplicate = replacements.find(
      (r) => r.from !== editing && triggerKey(r.from) === triggerKey(trigger),
    );
    const error = tooLong
      ? t("settings.dictationTools.replacements.tooLong", {
          max: MAX_TRIGGER,
        })
      : duplicate && trigger
        ? t("settings.dictationTools.replacements.duplicate", {
            from: duplicate.from,
          })
        : null;
    const canSave = trigger.length > 0 && !error && !busy;

    const reset = () => {
      setFrom("");
      setTo("");
      setEditing(null);
    };

    const handleSave = () => {
      if (!canSave) {
        if (duplicate) {
          // Clear first so a second attempt flashes again.
          setFlash(null);
          requestAnimationFrame(() => setFlash(duplicate.from));
        }
        return;
      }
      const entry = { from: trigger, to };
      const next = editing
        ? replacements.map((r) => (r.from === editing ? entry : r))
        : [...replacements, entry];
      updateSetting("text_replacements", next);
      if (!editing) setFresh(entry.from);
      reset();
      fromRef.current?.focus();
    };

    const handleRemove = (index: number) => {
      const removed = replacements[index];
      updateSetting(
        "text_replacements",
        replacements.filter((_, i) => i !== index),
      );
      if (editing === removed.from) reset();
      // Keep the keyboard in the list: next row, else previous, else input.
      requestAnimationFrame(() => {
        const target =
          removeRefs.current[index] ?? removeRefs.current[index - 1];
        (target ?? fromRef.current)?.focus();
      });
    };

    const startEdit = (r: TextReplacement) => {
      setEditing(r.from);
      setFrom(r.from);
      setTo(r.to);
      fromRef.current?.focus();
    };

    const onFromKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        // An empty "to" is allowed (it deletes the word), but Enter in the
        // first field moves on rather than saving one by accident.
        if (to === "") toRef.current?.focus();
        else handleSave();
      } else if (e.key === "Escape" && editing) {
        reset();
      }
    };

    const onToKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape" && editing) {
        reset();
        fromRef.current?.focus();
      }
    };

    const hint = error
      ? error
      : trigger && to === "" && toFocused
        ? t("settings.dictationTools.replacements.emptyHint")
        : null;

    return (
      <SettingContainer
        title={t("settings.dictationTools.replacements.title")}
        description={t("settings.dictationTools.replacements.description")}
        grouped={grouped}
        layout="stacked"
      >
        <div className="flex items-center gap-2">
          <Input
            ref={fromRef}
            type="text"
            className={`w-32 ${error ? "!border-red-500/70" : ""}`}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            onKeyDown={onFromKeyDown}
            placeholder={t("settings.dictationTools.replacements.from")}
            aria-label={t("settings.dictationTools.replacements.from")}
            aria-invalid={error ? true : undefined}
            aria-describedby={hint ? "replacement-hint" : undefined}
            variant="compact"
          />
          <span className="text-[13px] text-text/40" aria-hidden="true">
            →
          </span>
          <Input
            ref={toRef}
            type="text"
            className="min-w-0 flex-1"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onKeyDown={onToKeyDown}
            onFocus={() => setToFocused(true)}
            onBlur={() => setToFocused(false)}
            placeholder={t("settings.dictationTools.replacements.to")}
            aria-label={t("settings.dictationTools.replacements.to")}
            variant="compact"
          />
          {editing && (
            <Button
              onClick={() => {
                reset();
                fromRef.current?.focus();
              }}
              variant="ghost"
              size="sm"
              className="self-stretch rounded-lg px-3 text-[12.5px] shrink-0"
            >
              {t("settings.dictationTools.replacements.cancel")}
            </Button>
          )}
          <Button
            onClick={handleSave}
            // A duplicate stays clickable so the click can point at the entry.
            disabled={!canSave && !duplicate}
            aria-disabled={!canSave}
            variant={canSave ? "primary" : "secondary"}
            size="sm"
            className={`self-stretch rounded-lg px-3 text-[12.5px] shrink-0 ${!canSave && duplicate ? "opacity-50" : ""}`}
          >
            {editing
              ? t("settings.dictationTools.replacements.save")
              : t("settings.dictationTools.replacements.add")}
          </Button>
        </div>
        {hint && (
          <p
            id="replacement-hint"
            role={error ? "alert" : undefined}
            className={`mt-1 text-[11.5px] leading-4 ${error ? "text-red-500" : "text-text/55"}`}
          >
            {hint}
          </p>
        )}
        {replacements.length > 0 && (
          <ul className="mt-2 -mx-1 max-h-[220px] overflow-y-auto flex flex-col gap-0.5">
            {replacements.map((r, index) => (
              <li
                key={r.from}
                className="replacement-row group flex items-center gap-2 min-h-7 px-1 rounded-md text-[12px] min-w-0"
                data-flash={flash === r.from ? "true" : undefined}
                data-new={fresh === r.from ? "true" : undefined}
                data-editing={editing === r.from ? "true" : undefined}
              >
                <button
                  type="button"
                  onClick={() => startEdit(r)}
                  className="flex items-center gap-2 min-w-0 flex-1 text-start cursor-pointer rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-logo-primary"
                  aria-label={t("settings.dictationTools.replacements.edit", {
                    from: r.from,
                  })}
                >
                  <span className="font-medium text-text max-w-[40%] truncate">
                    {r.from}
                  </span>
                  <span className="text-[13px] text-text/40" aria-hidden="true">
                    →
                  </span>
                  <span
                    className={`truncate flex-1 ${r.to ? "text-text/65" : "text-text/55"}`}
                    title={r.to}
                  >
                    {r.to || t("settings.dictationTools.replacements.deleted")}
                  </span>
                </button>
                <Button
                  ref={(el) => {
                    removeRefs.current[index] = el;
                  }}
                  onClick={() => handleRemove(index)}
                  variant="ghost"
                  size="sm"
                  className="shrink-0 w-6 h-6 !p-0 inline-flex items-center justify-center opacity-60 hover:opacity-100 focus-visible:opacity-100"
                  aria-label={t("settings.dictationTools.replacements.remove", {
                    from: r.from,
                  })}
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingContainer>
    );
  },
);
