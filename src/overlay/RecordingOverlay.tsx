import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Lock, Sparkles } from "lucide-react";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./RecordingOverlay.css";
import { commands, events } from "@/bindings";
import type {
  StreamPhase,
  StreamPhaseEvent,
  StreamTextEvent,
  StreamWorkKind,
} from "@/bindings";
import { platform } from "@tauri-apps/plugin-os";
import WaterLine from "./WaterLine";
import i18n, { syncLanguageFromSettings } from "@/i18n";
import { getLanguageDirection } from "@/lib/utils/rtl";

type OverlayState =
  | "recording"
  | "streaming"
  | "transcribing"
  | "processing"
  | "done";
type OverlayMode = "transcription" | "voice_action";
type OverlayDisplayEvent =
  | OverlayState
  | { state: OverlayState; mode?: OverlayMode };

// Mic levels arrive as 16 FFT buckets; a voice lives in the lowest ones. The
// gain lifts quieter speech without touching the recording or VAD; WaterLine
// does its own smoothing.
const VOICE_BUCKETS = 6;
const VOICE_GAIN = 2.6;
// Real glass behind the card on macOS (window_glass.rs); the card keeps a CSS
// surface everywhere else.
const NATIVE_GLASS = platform() === "macos";
if (NATIVE_GLASS) document.documentElement.dataset.glass = "native";

const RecordingOverlay: React.FC = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<OverlayState>("recording");
  const [mode, setMode] = useState<OverlayMode>("transcription");
  // The voice, 0..1, for the water. A ref: it changes ten times a second.
  const voiceRef = useRef(0);
  // The card on screen, whichever form it has; the glass follows it.
  const cardRef = useRef<HTMLDivElement>(null);
  const [streamText, setStreamText] = useState<StreamTextEvent>({
    committed: "",
    tentative: "",
  });
  const [phase, setPhase] = useState<StreamPhase>("listening");
  const [workKind, setWorkKind] = useState<StreamWorkKind>("transcribing");
  const [elapsed, setElapsed] = useState(0);
  // Bumped on each new streaming session so the Live card remounts fresh (replays
  // the pop-in, and never animates in from the previous panel's open size).
  const [session, setSession] = useState(0);
  // Overlay placement (top vs bottom of the screen). The Live panel grows downward
  // from a top overlay (oldest line under the pill) and upward from a bottom one.
  const [position, setPosition] = useState<"top" | "bottom">("bottom");
  // True once live text overflows the cap. A top overlay fades its top edge only
  // while overflowing, so the resting first line stays crisp flush under the pill.
  const [overflowing, setOverflowing] = useState(false);
  // True while a file is dragged over the overlay — highlights the pill as a drop
  // target. Dropping a file transcribes the file instead of the microphone.
  const [dragActive, setDragActive] = useState(false);
  // The completion pill distinguishes a completed paste from an automatic or
  // explicit clipboard copy, so disabling Auto Copy never shows a false claim.
  const [doneCopied, setDoneCopied] = useState(false);
  // Whether the text was typed into the app (any paste method but "none").
  const [donePasted, setDonePasted] = useState(true);
  // Which card is on screen: the Live card or the compact pill. The done
  // state morphs out of whichever it was, instead of cutting to a new card.
  const [liveForm, setLiveForm] = useState(false);
  // For a moment after "done" arrives, the previous row stays under the done
  // row and fades out, so the card is never empty in between.
  const [ghostRow, setGhostRow] = useState(false);
  const stateRef = useRef<OverlayState>("recording");
  // True while a double tap has latched the recording, so it keeps running
  // without the key held. The only on-screen sign that the latch caught.
  const [handsFree, setHandsFree] = useState(false);

  // Live-text scroll-back: the text region "sticks" to the newest line while the
  // user is at the bottom; if they scroll up to read history, auto-follow pauses
  // until they scroll back down.
  const capRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const pinnedRef = useRef(true);
  // Whether the drag-drop file-transcription feature is enabled (opt-in). Read
  // from settings each time the overlay shows; a ref so the once-registered
  // drag-drop handler always sees the current value.
  const dragDropEnabledRef = useRef(false);
  const direction = getLanguageDirection(i18n.language);

  useEffect(() => {
    const setupEventListeners = async () => {
      const unlistenShow = await listen("show-overlay", async (event) => {
        const payload = event.payload as OverlayDisplayEvent;
        const overlayState =
          typeof payload === "string" ? payload : payload.state;
        const overlayMode =
          typeof payload === "string"
            ? "transcription"
            : (payload.mode ?? "transcription");
        await syncLanguageFromSettings();
        // The Live panel flows downward from a top overlay and upward from a
        // bottom one; read the placement so the layout can flip to match.
        try {
          const settings = await commands.getAppSettings();
          if (settings.status === "ok") {
            setPosition(
              settings.data.overlay_position === "top" ? "top" : "bottom",
            );
            dragDropEnabledRef.current =
              settings.data.drag_drop_enabled ?? false;
            if (overlayState === "done") {
              setDoneCopied(
                settings.data.clipboard_handling === "copy_to_clipboard",
              );
              setDonePasted(settings.data.paste_method !== "none");
            }
          }
        } catch {
          // Keep the previous/default placement if settings can't be read.
        }
        setMode(overlayMode);
        if (overlayState === "done" && stateRef.current !== "done") {
          setGhostRow(true);
          window.setTimeout(() => setGhostRow(false), 160);
        }
        stateRef.current = overlayState;
        setState(overlayState);
        if (overlayState === "streaming") setLiveForm(true);
        else if (overlayState !== "done") setLiveForm(false);
        if (overlayState === "recording" || overlayState === "streaming") {
          setStreamText({ committed: "", tentative: "" });
          // A fresh recording is never latched yet; the backend says so
          // separately once a double tap lands.
          setHandsFree(false);
        }
        if (overlayState === "streaming") {
          setPhase("listening");
          setWorkKind("transcribing");
          setElapsed(0);
          setSession((s) => s + 1); // remount the card fresh for this session
        }
        setIsVisible(true);
      });

      const unlistenHide = await listen("hide-overlay", () => {
        setIsVisible(false);
        setHandsFree(false);
      });

      const unlistenHandsFree = await listen<boolean>("hands-free", (event) => {
        setHandsFree(event.payload === true);
      });

      const unlistenLevel = await listen<number[]>("mic-level", (event) => {
        const buckets = (event.payload as number[]).slice(0, VOICE_BUCKETS);
        const mean =
          buckets.reduce((sum, v) => sum + (v || 0), 0) /
          Math.max(1, buckets.length);
        voiceRef.current = Math.min(1, mean * VOICE_GAIN);
      });

      const unlistenStream = await events.streamTextEvent.listen((event) => {
        setStreamText(event.payload);
      });

      const unlistenPhase = await events.streamPhaseEvent.listen((event) => {
        const payload: StreamPhaseEvent = event.payload;
        setPhase(payload.phase);
        if (payload.kind) setWorkKind(payload.kind);
      });

      return () => {
        unlistenShow();
        unlistenHide();
        unlistenHandsFree();
        unlistenLevel();
        unlistenStream();
        unlistenPhase();
      };
    };

    setupEventListeners();
  }, []);

  // Drag-and-drop an audio file onto the overlay to transcribe the file instead
  // of the microphone. Tauri intercepts native OS drops and delivers them as
  // webview drag-drop events (HTML5 DnD is disabled while that's on).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        // Opt-in: do nothing (no highlight, no drop) unless the feature is on.
        if (!dragDropEnabledRef.current) return;
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setDragActive(true);
        } else if (payload.type === "leave") {
          setDragActive(false);
        } else if (payload.type === "drop") {
          setDragActive(false);
          const file = payload.paths?.[0];
          if (!file) return;
          // Discard any in-progress mic recording, then transcribe the file.
          commands
            .cancelOperation()
            .finally(() => commands.transcribeFile(file, true));
        }
      })
      .then((u) => {
        if (disposed) u();
        else unlisten = u;
      });
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Keep the native glass under the card: where it is, its corner radius, and
  // how visible (the card fades and scales in and out). Checked every frame,
  // sent only on change, so a resting pill costs nothing; WebKit pauses this
  // loop while the overlay window is hidden.
  useEffect(() => {
    if (!NATIVE_GLASS) return;
    let raf = 0;
    let last = "";
    let prev: number[] | null = null;
    const tick = () => {
      const el = cardRef.current;
      let frame = [0, 0, 0, 0, 0, 0];
      if (el) {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const scale = el.offsetWidth ? box.width / el.offsetWidth : 1;
        const radius = (parseFloat(style.borderTopLeftRadius) || 0) * scale;
        const parent = el.parentElement;
        const opacity =
          parseFloat(style.opacity) *
          (parent ? parseFloat(getComputedStyle(parent).opacity) : 1);
        frame = [box.left, box.top, box.width, box.height, radius, opacity];
      }
      // Native glass moves the moment it's told, the page paints a frame
      // later; sending the previous frame's rect keeps them in step instead
      // of the glass running ahead of the card during a morph.
      // Shrinking, a delayed rect would stick out past the card, so the glass
      // takes the overlap of both: never ahead while growing, never outside
      // while shrinking.
      let send = frame;
      // Growing (the bubble): follow the card as it is now. Shrinking or
      // fading: the overlap of the last two rects, so the glass never shows
      // outside the card.
      const shrinking =
        prev !== null &&
        (frame[2] * frame[3] < prev[2] * prev[3] - 0.5 || frame[5] < prev[5]);
      if (prev && shrinking) {
        const left = Math.max(prev[0], frame[0]);
        const top = Math.max(prev[1], frame[1]);
        const right = Math.min(prev[0] + prev[2], frame[0] + frame[2]);
        const bottom = Math.min(prev[1] + prev[3], frame[1] + frame[3]);
        send = [
          left,
          top,
          Math.max(0, right - left),
          Math.max(0, bottom - top),
          frame[4],
          frame[5],
        ];
      }
      prev = frame;
      const key = send.map((v) => v.toFixed(1)).join(",");
      if (key !== last) {
        last = key;
        const [x, y, width, height, radius, opacity] = send;
        commands.setOverlayGlass(x, y, width, height, radius, opacity);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // The Live panel is open once there is text to show.
  const liveOpen =
    state === "streaming" &&
    (streamText.committed.length > 0 || streamText.tentative.length > 0);
  const liveWorking = state === "streaming" && phase === "working";

  // When the panel opens, the water swells and dissolves into it; once that
  // is over it unmounts, so a long dictation doesn't keep drawing it.
  const [flooded, setFlooded] = useState(false);
  useEffect(() => {
    if (!liveOpen) {
      setFlooded(false);
      return;
    }
    const id = window.setTimeout(() => setFlooded(true), 420);
    return () => window.clearTimeout(id);
  }, [liveOpen]);

  // With the water gone from the open panel, the caret carries the voice: it
  // brightens with each syllable, so pauses still read as "listening".
  useEffect(() => {
    if (!liveOpen || liveWorking) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let shown = 0;
    const tick = () => {
      const target = voiceRef.current;
      shown += (target - shown) * 0.25;
      const el = caretRef.current;
      if (el) el.style.setProperty("--voice", shown.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [liveOpen, liveWorking]);

  // Elapsed timer while the Live overlay listens; it stops once finalizing.
  useEffect(() => {
    if (state !== "streaming" || !isVisible || liveWorking) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [state, isVisible, liveWorking]);

  // Stick to the bottom as text streams in — but only while pinned, so a user who
  // has scrolled up to read history isn't yanked back down by the next chunk.
  useLayoutEffect(() => {
    const el = capRef.current;
    if (!el) return;
    // A new line grows the panel smoothly instead of jumping a line height.
    const text = textRef.current;
    if (text) {
      const max = parseFloat(getComputedStyle(el).maxHeight) || 72;
      el.style.height = `${Math.min(text.offsetHeight, max)}px`;
    }
    // Fade the top edge only once text actually overflows the cap. Until
    // then the first line rides the rising top edge and a new line is
    // uncovered below it; pinning would clip the top while the card grows.
    const over = text
      ? text.offsetHeight > (parseFloat(getComputedStyle(el).maxHeight) || 72)
      : el.scrollHeight > el.clientHeight + 1;
    setOverflowing(over);
    if (over && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [streamText]);

  // Each fresh streaming session starts pinned to the bottom, fade cleared.
  useEffect(() => {
    pinnedRef.current = true;
    setOverflowing(false);
  }, [session]);

  // Re-pin when the user is within ~a line of the bottom; unpin otherwise.
  const handleStreamScroll = () => {
    const el = capRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 16;
  };

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const isVoiceAction = mode === "voice_action";

  // ---- Shared building blocks (one visual language for every overlay form) ----
  const cancelBtn = (
    <button
      className="sx"
      aria-label={t("overlay.cancel")}
      title={t("overlay.cancel")}
      onClick={() => commands.cancelOperation()}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M4 4 L12 12 M12 4 L4 12"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );

  // Reuse the exact Sparkles mark from the AI settings navigation. A shared
  // symbol reads as one product language; a one-off text badge did not.
  const aiMark = <Sparkles className="sai-icon" aria-hidden="true" />;

  // Lock: only while a double tap has latched the recording. Kept mounted so
  // it can fade in and out instead of popping.
  const lockMark = (
    <span
      className={`shands-free-icon ${handsFree ? "on" : ""}`}
      role="img"
      aria-label={handsFree ? t("overlay.handsFree") : undefined}
      aria-hidden={!handsFree}
      title={handsFree ? t("overlay.handsFreeHint") : undefined}
    >
      <Lock aria-hidden="true" />
    </span>
  );

  // One row for the card in every phase. Closed: water (left, filling) |
  // lock + cancel. Open: the water swells and dissolves into the panel, and
  // the text's left edge carries the timer, or what it's doing once it
  // finalizes. The water never comes back inside the open panel.
  const liveRow = (
    open: boolean,
    working: boolean,
    label: string,
    ghost = false,
  ) => (
    <div
      className={`sbase swater-row ${handsFree ? "locked" : ""}`}
      role={working ? "status" : undefined}
    >
      {working && <span className="sr-only">{label}</span>}
      {isVoiceAction && aiMark}
      {!(open && (flooded || ghost)) && (
        <WaterLine
          level={voiceRef}
          calm={working}
          className={`swater ${open ? "flood" : ""}`}
        />
      )}
      {open && (
        <span className="sslot">
          <span className={`stimer ${working ? "out" : ""}`}>
            {fmtTime(elapsed)}
          </span>
          <span className={`sslot-label ${working ? "" : "out"}`}>{label}</span>
        </span>
      )}
      <div className="sbase-r">
        {lockMark}
        {cancelBtn}
      </div>
    </div>
  );

  const handleCopyAgain = async () => {
    await commands.copyLastTranscript();
    setDoneCopied(true);
    setDonePasted(false); // the label now says what the click did
  };

  // Say where the text went: pasted, on the clipboard, or (paste off and no
  // copy) just saved.
  const doneLabel = isVoiceAction
    ? t("overlay.voiceDone")
    : donePasted
      ? t("overlay.pasted")
      : doneCopied
        ? t("overlay.copied")
        : t("overlay.done");

  // completion mark (left) | completion label (center) | copy button (right) —
  // same 3-zone grid as the other rows. The label only says "Copied" when true.
  const doneRow = (
    <div className="sdone-row">
      <svg className="sdone-check" viewBox="0 0 18 18" aria-hidden="true">
        <path
          d="M3.5 9.5 7.2 13 14.5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="swork-label" role="status" key={doneLabel}>
        {doneLabel}
      </span>
      <button
        className="sx"
        aria-label={t("overlay.copyAgain")}
        title={t("overlay.copyAgain")}
        onClick={handleCopyAgain}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <rect
            x="5"
            y="5"
            width="8"
            height="8"
            rx="1.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M3 9V4.2A1.2 1.2 0 0 1 4.2 3H9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );

  // The done row lands on top of the row that was there, which fades out
  // underneath it, so the card never shows empty glass in between.
  const doneStack = (wasOpen: boolean, label: string) => (
    <div className="srows">
      {ghostRow && (
        <div className="sghost" aria-hidden="true">
          {liveRow(wasOpen, true, label, true)}
        </div>
      )}
      {doneRow}
    </div>
  );

  // drop-target hint — down-into-tray icon + "drop file" label. Replaces the
  // active row while an audio file is dragged over the overlay.
  const dropRow = (
    <div className="sbase">
      <div className="sbase-l">
        <span className="sdrop-icon">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M8 2.5 V9.5 M5 6.5 L8 9.8 L11 6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M3.5 12.5 H12.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </div>
      <span className="swork-label">{t("overlay.dropFile")}</span>
      <div className="sbase-r" />
    </div>
  );

  // Voice Actions keep their Sparkles mark and say what they do while working.
  const workingRow = (label: string, showCancel: boolean) => (
    <div className="sbase" role="status">
      <div className="sbase-l">{aiMark}</div>
      <span className="swork-label">{label}</span>
      <div className="sbase-r">{showCancel && cancelBtn}</div>
    </div>
  );

  // ---- Live overlay: a pill that sculpts open into a panel ----
  const hoverProps = {
    onMouseEnter: () => commands.overlayHover(true),
    onMouseLeave: () => commands.overlayHover(false),
  };

  if (state === "streaming" || (state === "done" && liveForm)) {
    const isDone = state === "done";
    const hasText =
      !isDone &&
      (streamText.committed.length > 0 || streamText.tentative.length > 0);
    const working = !isDone && phase === "working";
    // What the card showed just before "done", for the fading ghost row.
    const wasOpen =
      streamText.committed.length > 0 || streamText.tentative.length > 0;
    // Keep the panel open whenever there's text — even while finalizing — so the
    // transcript stays put under a working spinner instead of collapsing and
    // squishing the text mid-stream. Only fall back to the small working pill
    // when there was no text to preserve.
    const open = hasText;
    const collapsed = working && !hasText;
    const liveLabel = isVoiceAction
      ? workKind === "polishing"
        ? t("overlay.voiceProcessing")
        : t("overlay.voiceTranscribing")
      : workKind === "polishing"
        ? t("overlay.processing")
        : t("overlay.transcribing");

    return (
      <div dir={direction} className={`ov-stage ${position}`}>
        <div
          key={session}
          ref={cardRef}
          className={`scard ${isVoiceAction ? "voice-action" : ""} ${
            open ? "open" : ""
          } ${collapsed ? "working" : ""} ${
            working && open ? "finalizing" : ""
          } ${isDone ? "cdone" : ""} ${
            isVisible ? "" : "leaving"
          } ${dragActive ? "dragging" : ""}`}
          {...hoverProps}
        >
          <div className="stext">
            <div className="stext-clip">
              <div
                className={`stext-cap ${overflowing ? "overflowing" : ""}`}
                ref={capRef}
                onScroll={handleStreamScroll}
              >
                <p ref={textRef}>
                  <span className="committed">
                    {streamText.committed
                      ? streamText.committed.trimEnd() +
                        (streamText.tentative ? " " : "")
                      : ""}
                  </span>
                  <span className="tentative">{streamText.tentative}</span>
                  {/* Drop the blinking caret once finalizing — it's no longer
                      capturing, and the text-state mark conveys the work. */}
                  {!working && !isDone && (
                    <span className="scaret" ref={caretRef} />
                  )}
                </p>
              </div>
            </div>
          </div>
          {isDone
            ? doneStack(wasOpen, liveLabel)
            : working && !open && isVoiceAction
              ? workingRow(liveLabel, true)
              : liveRow(open, working, liveLabel)}
        </div>
      </div>
    );
  }

  // ---- Minimal overlay: exactly one row at a time — waveform (recording), or a
  // text mark + label (transcribing / processing). Never both. The pill animates
  // its width between them; the cancel button is in both rows so it stays put.
  // Done (out of the compact pill): the same card narrows into the result;
  // the backend hides it after a few seconds unless the pointer rests on it.
  const isDone = state === "done";
  const working = state === "transcribing" || state === "processing";
  const workLabel = isVoiceAction
    ? state === "processing"
      ? t("overlay.voiceProcessing")
      : t("overlay.voiceTranscribing")
    : state === "processing"
      ? t("overlay.processing")
      : t("overlay.transcribing");

  return (
    <div
      dir={direction}
      className={`ov-stage ${position} ov-fade ${isVisible ? "show" : ""}`}
    >
      <div
        ref={cardRef}
        className={`scard compact ${isVoiceAction ? "voice-action" : ""} ${
          (working && isVisible) || dragActive ? "cworking" : ""
        } ${isDone ? "cdone" : ""} ${dragActive ? "dragging cdrop" : ""}`}
        {...hoverProps}
      >
        {isDone
          ? doneStack(false, workLabel)
          : dragActive
            ? dropRow
            : working && isVoiceAction
              ? workingRow(workLabel, true)
              : liveRow(false, working, workLabel)}
      </div>
    </div>
  );
};

export default RecordingOverlay;
