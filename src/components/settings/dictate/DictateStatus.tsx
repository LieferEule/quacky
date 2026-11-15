import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import QuackyDuck from "../../icons/QuackyDuck";
import { useSettings } from "../../../hooks/useSettings";
import { useOsType } from "../../../hooks/useOsType";
import { formatKeyCombination } from "../../../lib/utils/keyboard";

type RecordingState = "idle" | "recording" | "transcribing";

const METER_BARS = 5;
// Which of the 16 level buckets each bar shows: the loudest, lowest one in the
// middle, falling off to both sides like the bars' resting wave.
const METER_BUCKETS = [3, 1, 0, 2, 4];
// As in the recording overlay (RecordingOverlay.tsx).
const METER_GAIN = 2.25;
const METER_ATTACK = 0.62;
const METER_RELEASE = 0.18;

/**
 * The top of Dictate: whether Quacky is ready, how to start it, and the quack
 * meter, which moves with the real microphone level while it listens.
 * State comes from `recording-state` (tray.rs) and levels from `mic-level`
 * (overlay.rs), both of which reach this window even while Puddle owns the
 * recording UI.
 */
export const DictateStatus: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting } = useSettings();
  const osType = useOsType();
  const [state, setState] = useState<RecordingState>("idle");
  const meterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unlistenState = listen<RecordingState>("recording-state", (event) =>
      setState(event.payload),
    );
    // Levels go straight to the bars' style, not through React state: ten
    // updates a second would otherwise re-render the whole row each time.
    const smoothed = Array<number>(METER_BARS).fill(0);
    const unlistenLevel = listen<number[]>("mic-level", (event) => {
      const bars = meterRef.current?.children;
      if (!bars) return;
      const levels = event.payload;
      for (let i = 0; i < bars.length; i++) {
        // A voice lives in the lowest buckets; the overlay reads the same ones
        // with the same gain.
        const target = Math.min(
          1,
          (levels[METER_BUCKETS[i]] ?? 0) * METER_GAIN,
        );
        const response = target > smoothed[i] ? METER_ATTACK : METER_RELEASE;
        smoothed[i] += (target - smoothed[i]) * response;
        (bars[i] as HTMLElement).style.setProperty(
          "--level",
          smoothed[i].toFixed(3),
        );
      }
    });
    return () => {
      unlistenState.then((fn) => fn());
      unlistenLevel.then((fn) => fn());
    };
  }, []);

  const binding = getSetting("bindings")?.transcribe?.current_binding ?? "";
  const shortcut = formatKeyCombination(binding, osType);
  const pushToTalk = getSetting("push_to_talk");

  const title =
    state === "recording"
      ? t("shell.status.listening")
      : state === "transcribing"
        ? t("shell.status.transcribing")
        : t("shell.status.ready");

  const [hintBefore, hintAfter] = (
    pushToTalk
      ? t("shell.status.holdHint", { shortcut: "\u0000" })
      : t("shell.status.pressHint", { shortcut: "\u0000" })
  ).split("\u0000");

  return (
    <section
      className="duck-hero flex items-center gap-4 px-1 pt-3 pb-1"
      data-state={state}
      aria-live="polite"
    >
      <QuackyDuck size={36} className="hero-duck" />
      <div className="min-w-0 flex-1">
        <h1 className="text-[15px] font-semibold leading-5">{title}</h1>
        <p className="text-[12px] leading-5 text-text/70 truncate">
          {shortcut ? (
            <>
              {hintBefore}
              <kbd className="key-cap">{shortcut}</kbd>
              {hintAfter}
            </>
          ) : (
            t("shell.status.noShortcut")
          )}
        </p>
      </div>
      <div
        ref={meterRef}
        className="quack-meter"
        role="img"
        aria-label={t("shell.status.meter")}
      >
        {Array.from({ length: METER_BARS }, (_, i) => (
          <i key={i} />
        ))}
      </div>
    </section>
  );
};
