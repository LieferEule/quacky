import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  AlertCircle,
  Check,
  Copy,
  FileAudio,
  Upload,
  X,
  ChevronDown,
} from "lucide-react";
import { Button } from "../../ui/Button";
import {
  BroodStage,
  Egg,
  EGG_HEIGHT,
  FlyingEgg,
  useBroodPhase,
} from "./DuckBrood";
import { DragDropToggle } from "../DragDropToggle";
import { SettingsGroup } from "../../ui/SettingsGroup";
import { useSettings } from "../../../hooks/useSettings";
import { useModelStore } from "../../../stores/modelStore";
import {
  AUDIO_EXTENSIONS,
  transcriptsAsText,
  useFileQueueStore,
} from "../../../stores/fileQueueStore";
import type { ModelInfo } from "@/bindings";

/** Sentinel for "no override"; `null` is what actually reaches the backend. */
const FOLLOW_DICTATION = "__follow_dictation__";

const ScoreBar: React.FC<{ label: string; score: number }> = ({
  label,
  score,
}) => (
  <div className="flex items-center gap-2">
    <p className="text-[11px] text-text/50 w-14 text-end">{label}</p>
    <div className="w-14 h-1 bg-mid-gray/20 rounded-full overflow-hidden">
      <div
        className="h-full bg-logo-primary rounded-full"
        style={{ width: `${Math.round(score * 100)}%` }}
      />
    </div>
  </div>
);

interface ModelRowProps {
  title: string;
  description: string;
  model?: ModelInfo;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}

const ModelRow: React.FC<ModelRowProps> = ({
  title,
  description,
  model,
  selected,
  disabled,
  onSelect,
}) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
        selected ? "bg-logo-primary/10" : "hover:bg-mid-gray/10"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`w-4 h-4 shrink-0 rounded-full border flex items-center justify-center ${
          selected ? "border-logo-primary" : "border-mid-gray/60"
        }`}
      >
        {selected && <span className="w-2 h-2 rounded-full bg-logo-primary" />}
      </span>

      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-text truncate">
          {title}
        </span>
        <span className="block text-xs text-text/60 truncate">
          {description}
        </span>
      </span>

      {model && (model.accuracy_score > 0 || model.speed_score > 0) && (
        <span className="hidden sm:block space-y-1 shrink-0">
          <ScoreBar
            label={t("onboarding.modelCard.accuracy")}
            score={model.accuracy_score}
          />
          <ScoreBar
            label={t("onboarding.modelCard.speed")}
            score={model.speed_score}
          />
        </span>
      )}
    </button>
  );
};

const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, "0")}`;
};

/** Ticks once a second while a transcription is running, to drive the countdown. */
const useTicker = (running: boolean) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);
};

/**
 * File transcription, kept deliberately separate from dictation.
 *
 * The mic path delivers text into whatever app has focus. That is wrong for a
 * recorded meeting: it can run for minutes and the result belongs here, where it
 * can be read and copied. So the queue (`fileQueueStore`) calls `transcribeFile`
 * with `deliver: false` — no overlay, nothing typed anywhere — and this shows the
 * transcripts themselves.
 */
export const TranscribeSettings: React.FC = () => {
  const { t } = useTranslation();
  const { getSetting, updateSetting } = useSettings();
  const models = useModelStore((state) => state.models);
  const initialize = useModelStore((state) => state.initialize);

  const items = useFileQueueStore((state) => state.items);
  const progress = useFileQueueStore((state) => state.progress);
  const cancelling = useFileQueueStore((state) => state.cancelling);
  const enqueue = useFileQueueStore((state) => state.enqueue);
  const cancel = useFileQueueStore((state) => state.cancel);
  const clearFinished = useFileQueueStore((state) => state.clearFinished);
  const hatch = useFileQueueStore((state) => state.hatch);

  const [dragging, setDragging] = useState(false);
  const [modelListOpen, setModelListOpen] = useState(false);
  /** Which copy button just worked: an item's id, or "all". */
  const [copied, setCopied] = useState<number | "all" | null>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = items.find((item) => item.status === "running");
  const waiting = items.filter((item) => item.status === "queued").length;
  const finished = items.filter(
    (item) => item.status === "done" || item.status === "error",
  );
  const running = !!current;
  useTicker(running);

  const stageEgg = useRef<HTMLDivElement>(null);
  const [flight, setFlight] = useState<{ id: number; from: DOMRect } | null>(
    null,
  );
  const broodPhase = useBroodPhase(running, () => {
    const from = stageEgg.current?.getBoundingClientRect();
    if (from && newest) setFlight({ id: newest.id, from });
  });
  // A cancelled run may leave no result, so count rather than assume one.
  const settled = useRef(finished.length);
  if (running) settled.current = finished.length;
  // While the duck is still on the stage, a new result is the egg it is about
  // to lay; the egg joins the list once the duck has left.
  const layingNew =
    !running && broodPhase !== "away" && finished.length > settled.current;
  const shown = layingNew ? finished.slice(0, -1) : finished;
  const newest = finished[finished.length - 1];
  const laysEgg = layingNew && newest.status === "done" && !!newest.text.trim();
  /** Eggs cracked while this tab is open; older ones just stay open. */
  const freshlyHatched = useRef(new Set<number>());

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(
    () => () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    },
    [],
  );

  // The window-level handler in App.tsx stands down while this tab is open, so
  // a drop here is unambiguous. Unlike the global one it is not gated on the
  // drag-and-drop setting: dropping onto this zone is as explicit as clicking.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "over") {
          setDragging(true);
          return;
        }
        setDragging(false);
        if (event.payload.type !== "drop") return;
        if (event.payload.paths?.length) enqueue(event.payload.paths);
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [enqueue]);

  const handlePick = useCallback(async () => {
    const picked = await open({
      multiple: true,
      directory: false,
      filters: [{ name: t("transcribe.filter"), extensions: AUDIO_EXTENSIONS }],
    });
    if (picked?.length) enqueue(picked);
  }, [enqueue, t]);

  const handleCopy = useCallback(async (key: number | "all", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error("Failed to copy the transcript:", error);
    }
  }, []);

  const installedModels = useMemo(
    () => models.filter((model) => model.is_downloaded),
    [models],
  );

  const selectedFileModel =
    (getSetting("file_transcription_model") as string | null) ??
    FOLLOW_DICTATION;

  const selectedModel = installedModels.find(
    (model) => model.id === selectedFileModel,
  );
  const selectedModelLabel =
    selectedModel?.name ?? t("transcribe.model.followDictation");
  const selectedModelHint =
    selectedModel?.description ?? t("transcribe.model.followDictationHint");

  const handleModelChange = useCallback(
    (value: string) => {
      void updateSetting(
        "file_transcription_model",
        value === FOLLOW_DICTATION ? null : value,
      );
    },
    [updateSetting],
  );

  // Picking is a one-off decision, so the list folds away again once made.
  const selectModel = useCallback(
    (value: string) => {
      handleModelChange(value);
      setModelListOpen(false);
    },
    [handleModelChange],
  );

  // Measured on this machine with this model, rather than guessed from a
  // catalogue score benchmarked on someone else's hardware.
  const remaining = (() => {
    if (!progress || progress.secondsDone <= 0) return null;
    const elapsed = (Date.now() - progress.startedAt) / 1000;
    if (elapsed <= 0) return null;
    const rate = progress.secondsDone / elapsed;
    if (rate <= 0) return null;
    return (progress.secondsTotal - progress.secondsDone) / rate;
  })();

  return (
    <div className="space-y-4">
      <SettingsGroup title={t("shell.questions.listenFile")}>
        <div className="p-3 text-left">
          {broodPhase !== "away" ? (
            <>
              <BroodStage
                phase={broodPhase}
                laysEgg={laysEgg}
                eggRef={stageEgg}
                done={
                  progress && progress.secondsTotal > 0
                    ? progress.secondsDone / progress.secondsTotal
                    : 0
                }
              />
              {current && (
                <div className="min-w-0 mt-1">
                  <div className="flex items-start gap-3">
                    <p className="text-sm font-medium text-text truncate flex-1 min-w-0">
                      {current.fileName}
                    </p>
                    {/* Stopping is a request, not an abandonment: the run finishes
                      its current chunk and hands back everything so far. */}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={cancel}
                      disabled={cancelling}
                      className="flex items-center gap-1 shrink-0"
                    >
                      <X className="w-3 h-3" />
                      {cancelling
                        ? t("transcribe.cancelling")
                        : t("transcribe.cancel")}
                    </Button>
                  </div>
                  <p className="text-sm text-text/60 mt-1">
                    {cancelling
                      ? t("transcribe.cancellingHint")
                      : t("transcribe.workingHint")}
                    {waiting > 0 &&
                      ` ${t("transcribe.queued", { count: waiting })}`}
                  </p>

                  {progress && progress.secondsTotal > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <div className="h-1.5 rounded-full bg-mid-gray/20 overflow-hidden">
                        <div
                          className="h-full bg-logo-primary transition-[width] duration-500"
                          style={{
                            width: `${Math.min(100, (progress.secondsDone / progress.secondsTotal) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-mid-gray tabular-nums">
                        {t("transcribe.progress", {
                          done: formatDuration(progress.secondsDone),
                          total: formatDuration(progress.secondsTotal),
                        })}
                        {remaining !== null &&
                          ` · ${t("transcribe.remaining", {
                            time: formatDuration(remaining),
                          })}`}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div
              className={`drop-pond px-4 py-5 text-center ${
                dragging ? "is-dragging" : ""
              }`}
            >
              <Upload
                className="mx-auto w-5 h-5 text-logo-primary"
                strokeWidth={1.75}
              />
              <p className="text-[13.5px] font-semibold text-text mt-2">
                {dragging ? t("transcribe.dropNow") : t("transcribe.heading")}
              </p>
              <p className="text-[12px] leading-4 text-text/65 mt-1 max-w-sm mx-auto">
                {t("transcribe.body")}
              </p>
              <div className="mt-3.5">
                <Button variant="primary" size="md" onClick={handlePick}>
                  {finished.length === 0
                    ? t("transcribe.pick")
                    : t("transcribe.pickAnother")}
                </Button>
              </div>
              <p className="text-[11.5px] leading-4 text-text/60 mt-3">
                {t("transcribe.formats")}
              </p>
            </div>
          )}
        </div>
      </SettingsGroup>

      {shown.length > 0 && (
        <SettingsGroup
          title={
            shown.length > 1
              ? t("transcribe.resultsTitle")
              : shown[0].status === "error"
                ? t("transcribe.errorTitle")
                : shown[0].complete
                  ? t("transcribe.resultTitle")
                  : t("transcribe.partialTitle")
          }
        >
          {shown.length > 1 && (
            <div className="flex justify-end gap-2 px-3.5 pb-2.5">
              {!running && (
                <Button variant="ghost" size="sm" onClick={clearFinished}>
                  {t("transcribe.clearList")}
                </Button>
              )}
              {transcriptsAsText(shown) && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    void handleCopy("all", transcriptsAsText(shown))
                  }
                  className="flex items-center gap-1"
                >
                  {copied === "all" ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  {copied === "all"
                    ? t("transcribe.copied")
                    : t("transcribe.copyAll")}
                </Button>
              )}
            </div>
          )}
          {shown.map((item) => (
            <div key={item.id} className="px-3.5 py-3 text-left space-y-2">
              <div className="flex items-center gap-2">
                {item.status === "error" ? (
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                ) : !item.text.trim() ? (
                  <FileAudio className="w-4 h-4 shrink-0 text-logo-primary" />
                ) : item.hatched ? (
                  <Egg
                    height={EGG_HEIGHT}
                    cracked
                    className={`egg-hatched ${
                      freshlyHatched.current.has(item.id) ? "is-fresh" : ""
                    }`}
                  />
                ) : (
                  <button
                    type="button"
                    data-egg={item.id}
                    className="egg-button"
                    aria-label={`${t("transcribe.hatch")}: ${item.fileName}`}
                    onClick={() => {
                      freshlyHatched.current.add(item.id);
                      hatch(item.id);
                    }}
                  >
                    <Egg
                      height={EGG_HEIGHT}
                      className={
                        flight?.id === item.id ? "invisible" : "egg-laid"
                      }
                    />
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-text truncate">
                    {item.fileName}
                  </p>
                  {item.status === "done" &&
                    item.text.trim() &&
                    !item.hatched && (
                      <p className="text-[11.5px] leading-4 text-text/60">
                        {t("transcribe.hatch")}
                      </p>
                    )}
                </div>
                {item.status === "done" && item.text.trim() && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleCopy(item.id, item.text)}
                    className="flex items-center gap-1 shrink-0"
                  >
                    {copied === item.id ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    {copied === item.id
                      ? t("transcribe.copied")
                      : t("transcribe.copy")}
                  </Button>
                )}
              </div>

              {item.status === "error" ? (
                <p className="text-[12px] leading-4 text-text/70 break-words">
                  {item.message ?? t("transcribe.notAudio")}
                </p>
              ) : item.status === "done" ? (
                <>
                  {!item.complete && (
                    <p className="flex items-start gap-2 text-[12px] leading-4 text-text/70">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px text-logo-primary" />
                      {t("transcribe.partialNote")}
                    </p>
                  )}
                  {!item.text.trim() ? (
                    <p className="text-[12px] text-text/65">
                      {t("transcribe.empty")}
                    </p>
                  ) : (
                    item.hatched && (
                      <div
                        className={`hatched-text ${
                          freshlyHatched.current.has(item.id) ? "is-fresh" : ""
                        }`}
                      >
                        <p
                          className={`min-h-0 text-[13px] text-text/90 whitespace-pre-wrap overflow-y-auto leading-relaxed select-text ${
                            shown.length > 1 ? "max-h-40" : "max-h-96"
                          }`}
                        >
                          {item.text}
                        </p>
                      </div>
                    )
                  )}
                </>
              ) : null}
            </div>
          ))}
          {shown.some((item) => item.status === "done") && (
            <p className="px-3.5 py-2.5 text-[11.5px] leading-4 text-text/65">
              {t("transcribe.savedToHistory")}
            </p>
          )}
        </SettingsGroup>
      )}

      <SettingsGroup
        title={t("shell.questions.fileModel")}
        description={t("transcribe.model.description")}
      >
        <button
          type="button"
          onClick={() => setModelListOpen((open) => !open)}
          disabled={running}
          className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
            running
              ? "opacity-50 cursor-not-allowed"
              : "cursor-pointer hover:bg-mid-gray/10"
          }`}
        >
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-text truncate">
              {selectedModelLabel}
            </span>
            <span className="block text-xs text-text/60 truncate">
              {selectedModelHint}
            </span>
          </span>
          <ChevronDown
            className={`w-4 h-4 shrink-0 text-text/60 transition-transform ${
              modelListOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {modelListOpen && (
          <>
            <ModelRow
              title={t("transcribe.model.followDictation")}
              description={t("transcribe.model.followDictationHint")}
              selected={selectedFileModel === FOLLOW_DICTATION}
              disabled={running}
              onSelect={() => selectModel(FOLLOW_DICTATION)}
            />
            {installedModels.map((model) => (
              <ModelRow
                key={model.id}
                title={model.name}
                description={model.description}
                model={model}
                selected={selectedFileModel === model.id}
                disabled={running}
                onSelect={() => selectModel(model.id)}
              />
            ))}
          </>
        )}
      </SettingsGroup>

      <SettingsGroup title={t("shell.questions.dropFiles")}>
        <DragDropToggle grouped={true} />
      </SettingsGroup>

      {flight && (
        <FlyingEgg
          key={flight.id}
          from={flight.from}
          target={() => document.querySelector(`[data-egg="${flight.id}"]`)}
          onLanded={() => setFlight(null)}
        />
      )}
    </div>
  );
};
