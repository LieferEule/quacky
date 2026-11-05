import { create } from "zustand";
import { commands, events } from "@/bindings";

/** Audio containers the importer can decode (see `file_import.rs`). */
export const AUDIO_EXTENSIONS = [
  "wav",
  "mp3",
  "m4a",
  "mp4",
  "aac",
  "flac",
  "ogg",
  "oga",
  "opus",
];

export type QueueItem = {
  id: number;
  fileName: string;
  path: string;
} & (
  | { status: "queued" | "running" }
  | { status: "done"; text: string; complete: boolean }
  /** `message` is the backend's error; none means a non-audio file. */
  | { status: "error"; message?: string }
);

export interface QueueProgress {
  secondsDone: number;
  secondsTotal: number;
  /** Wall-clock ms at which this run's first chunk began. */
  startedAt: number;
}

interface FileQueueState {
  items: QueueItem[];
  progress: QueueProgress | null;
  cancelling: boolean;
  /** Add files and start working. `onDone` gets this batch's finished files. */
  enqueue: (paths: string[], onDone?: (items: QueueItem[]) => void) => void;
  /** Stop the running file, keeping its transcript so far, and drop the rest. */
  cancel: () => void;
  /** Forget finished files; anything still queued or running stays. */
  clearFinished: () => void;
}

const fileNameOf = (path: string) => path.split(/[\\/]/).pop() || path;

const isAudio = (path: string) => {
  const ext = path.split(".").pop()?.toLowerCase();
  return !!ext && AUDIO_EXTENSIONS.includes(ext);
};

let nextId = 1;
let listeningForProgress = false;
const batches: { ids: Set<number>; onDone: (items: QueueItem[]) => void }[] =
  [];

/** The finished transcripts as one text, each under its file name if several. */
export const transcriptsAsText = (items: QueueItem[]) => {
  const done = items.flatMap((item) =>
    item.status === "done" && item.text.trim() ? [item] : [],
  );
  return done.length === 1
    ? done[0].text
    : done.map((item) => `${item.fileName}\n${item.text}`).join("\n\n");
};

/**
 * File transcription runs here rather than in the Files tab, so it survives
 * switching tabs and can be fed from outside the tab (the Finder service).
 * Files run one at a time: the engine handles one transcription at once, and
 * loading the file model only has to happen for the first.
 */
export const useFileQueueStore = create<FileQueueState>()((set, get) => {
  const replace = (id: number, item: QueueItem) =>
    set((state) => ({
      items: state.items.map((other) => (other.id === id ? item : other)),
    }));

  const settleBatches = () => {
    const { items } = get();
    // Oldest first, so with two batches the newer one's text ends up last.
    for (const batch of [...batches]) {
      const mine = items.filter((item) => batch.ids.has(item.id));
      if (mine.some((i) => i.status === "queued" || i.status === "running")) {
        continue;
      }
      batches.splice(batches.indexOf(batch), 1);
      batch.onDone(mine);
    }
  };

  const runNext = async () => {
    // Before anything else: a batch that just finished must not wait for
    // whatever was queued behind it.
    settleBatches();
    const { items } = get();
    if (items.some((item) => item.status === "running")) return;
    const next = items.find((item) => item.status === "queued");
    if (!next) {
      set({ cancelling: false });
      return;
    }

    const { id, path, fileName } = next;
    // A cancel applies to the run it was aimed at, not to the next file.
    set({ progress: null, cancelling: false });
    replace(id, { id, path, fileName, status: "running" });

    let finished: QueueItem | null;
    try {
      const result = await commands.transcribeFile(path, false);
      if (result.status === "ok") {
        finished = {
          id,
          path,
          fileName,
          status: "done",
          text: result.data.text,
          complete: result.data.complete,
        };
      } else {
        // Cancelling with nothing transcribed yet is a decision, not a failure.
        // Anything already done comes back as an incomplete result instead.
        finished = get().cancelling
          ? null
          : { id, path, fileName, status: "error", message: result.error };
      }
    } catch (error) {
      console.error("Failed to transcribe the file:", error);
      finished = get().cancelling
        ? null
        : { id, path, fileName, status: "error", message: String(error) };
    }

    if (finished) replace(id, finished);
    else
      set((state) => ({
        items: state.items.filter((item) => item.id !== id),
      }));
    set({ progress: null });
    void runNext();
  };

  return {
    items: [],
    progress: null,
    cancelling: false,

    enqueue: (paths, onDone) => {
      if (!listeningForProgress) {
        listeningForProgress = true;
        // Only long audio is chunked, so only long audio reports progress.
        // `chunk: 0` marks the start, after decode and model load, so the rate
        // reflects transcription alone.
        void events.transcriptionProgress.listen((event) => {
          const { chunk, seconds_done, seconds_total } = event.payload;
          set((state) => ({
            progress: {
              secondsDone: seconds_done,
              secondsTotal: seconds_total,
              startedAt:
                chunk === 0 || !state.progress
                  ? Date.now()
                  : state.progress.startedAt,
            },
          }));
        });
      }

      const added: QueueItem[] = paths.map((path) => {
        const base = { id: nextId++, path, fileName: fileNameOf(path) };
        // Say so here rather than letting it fail deep inside the decoder.
        return isAudio(path)
          ? { ...base, status: "queued" }
          : { ...base, status: "error" };
      });
      if (onDone) {
        batches.push({ ids: new Set(added.map((item) => item.id)), onDone });
      }
      set((state) => ({ items: [...state.items, ...added] }));
      void runNext();
    },

    cancel: () => {
      set((state) => ({
        cancelling: true,
        items: state.items.filter((item) => item.status !== "queued"),
      }));
      void commands.cancelFileTranscription();
    },

    clearFinished: () =>
      set((state) => ({
        items: state.items.filter(
          (item) => item.status === "queued" || item.status === "running",
        ),
      })),
  };
});
