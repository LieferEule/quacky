import React, { useEffect, useState, useRef, type ReactNode } from "react";
import { toast, Toaster } from "sonner";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { platform } from "@tauri-apps/plugin-os";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  checkAccessibilityPermission,
  checkMicrophonePermission,
} from "tauri-plugin-macos-permissions-api";
import { ModelStateEvent, RecordingErrorEvent } from "./lib/types/events";
import "./App.css";
import AccessibilityPermissions from "./components/AccessibilityPermissions";
import ModelSelector from "./components/model-selector";
import Onboarding, { AccessibilityOnboarding } from "./components/onboarding";
import {
  SectionTabs,
  Section,
  SECTIONS_CONFIG,
} from "./components/SectionTabs";
import { WhatsNewGate } from "./components/whats-new";
import { useSettings } from "./hooks/useSettings";
import { useSettingsStore } from "./stores/settingsStore";
import { transcriptsAsText, useFileQueueStore } from "./stores/fileQueueStore";
import { commands } from "@/bindings";
import { getLanguageDirection, initializeRTL } from "@/lib/utils/rtl";

type OnboardingStep = "accessibility" | "model" | "done";

// Each section opens with its title and one line of duck wit, then its panes.
// Keyed by section so the page settles in afresh on every switch.
const SectionPage: React.FC<{ section: Section }> = ({ section }) => {
  const { t } = useTranslation();
  const ActiveComponent =
    SECTIONS_CONFIG[section]?.component || SECTIONS_CONFIG.dictate.component;
  return (
    <div className="section-page max-w-2xl w-full mx-auto">
      {/* Dictate opens on the duck's own status row instead of a title. */}
      {section !== "dictate" && (
        <header className="mb-4 px-1 pt-2">
          <h1 className="text-[17px] font-semibold leading-6 tracking-[-0.01em]">
            {t(`shell.pages.${section}.title`)}
          </h1>
          <p className="text-[12px] text-text/65">
            {t(`shell.pages.${section}.subtitle`)}
          </p>
        </header>
      )}
      <div className="space-y-4">
        <ActiveComponent />
      </div>
    </div>
  );
};

function App() {
  const { t, i18n } = useTranslation();
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep | null>(
    null,
  );
  // Track if this is a returning user who just needs to grant permissions
  // (vs a new user who needs full onboarding including model selection)
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [currentSection, setCurrentSection] = useState<Section>("dictate");
  const { settings, updateSetting } = useSettings();
  const direction = getLanguageDirection(i18n.language);
  const refreshAudioDevices = useSettingsStore(
    (state) => state.refreshAudioDevices,
  );
  const refreshOutputDevices = useSettingsStore(
    (state) => state.refreshOutputDevices,
  );
  const hasCompletedPostOnboardingInit = useRef(false);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  // Initialize RTL direction when language changes
  useEffect(() => {
    initializeRTL(i18n.language);
  }, [i18n.language]);

  // Initialize Enigo, shortcuts, and refresh audio devices when main app loads
  useEffect(() => {
    if (onboardingStep === "done" && !hasCompletedPostOnboardingInit.current) {
      hasCompletedPostOnboardingInit.current = true;
      Promise.all([
        commands.initializeEnigo(),
        commands.initializeShortcuts(),
      ]).catch((e) => {
        console.warn("Failed to initialize:", e);
      });
      refreshAudioDevices();
      refreshOutputDevices();
    }
  }, [onboardingStep, refreshAudioDevices, refreshOutputDevices]);

  // Handle keyboard shortcuts for debug mode toggle
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl+Shift+D (Windows/Linux) or Cmd+Shift+D (macOS)
      const isDebugShortcut =
        event.shiftKey &&
        event.key.toLowerCase() === "d" &&
        (event.ctrlKey || event.metaKey);

      if (isDebugShortcut) {
        event.preventDefault();
        const currentDebugMode = settings?.debug_mode ?? false;
        updateSetting("debug_mode", !currentDebugMode);
      }
    };

    // Add event listener when component mounts
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup event listener when component unmounts
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [settings?.debug_mode, updateSetting]);

  // Listen for recording errors from the backend and show a toast
  useEffect(() => {
    const unlisten = listen<RecordingErrorEvent>("recording-error", (event) => {
      const { error_type, detail } = event.payload;

      if (error_type === "microphone_permission_denied") {
        const currentPlatform = platform();
        const platformKey = `errors.micPermissionDenied.${currentPlatform}`;
        const description = t(platformKey, {
          defaultValue: t("errors.micPermissionDenied.generic"),
        });
        toast.error(t("errors.micPermissionDeniedTitle"), { description });
      } else if (error_type === "no_input_device") {
        toast.error(t("errors.noInputDeviceTitle"), {
          description: t("errors.noInputDevice"),
        });
      } else {
        toast.error(
          t("errors.recordingFailed", { error: detail ?? "Unknown error" }),
        );
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Listen for paste failures and show a toast.
  // The technical error detail is logged to handy.log on the Rust side
  // (see actions.rs `error!("Failed to paste transcription: ...")`),
  // so we show a localized, user-friendly message here instead of the raw error.
  // Dropping an audio file on the main window transcribes it. The recording
  // overlay is a non-activating panel on macOS and never receives Finder drops,
  // so this window is the dependable drop target.
  // Read through a ref: the drop listener is registered once, so capturing the
  // section directly would freeze it at "dictate".
  const sectionRef = useRef<Section>(currentSection);
  // The content scrolls in one container shared by every section, so a new
  // section would otherwise open at the previous one's scroll position.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [currentSection]);
  useEffect(() => {
    sectionRef.current = currentSection;
  }, [currentSection]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        // The Transcribe tab registers its own handler and transcribes into the
        // app instead of typing the result somewhere. Two handlers on one window
        // event, so exactly one of them has to stand down.
        if (sectionRef.current === "transcribe") return;
        const file = event.payload.paths?.[0];
        if (!file) return;
        // While the queue works, a second run alongside it would reset its
        // shared cancel flag and partial buffer. Join the queue instead.
        const queue = useFileQueueStore.getState();
        if (
          queue.items.some(
            (item) => item.status === "queued" || item.status === "running",
          )
        ) {
          queue.enqueue(event.payload.paths);
          return;
        }
        // Read the setting per drop so toggling it takes effect immediately.
        void commands.getAppSettings().then((settings) => {
          if (settings.status !== "ok" || !settings.data.drag_drop_enabled)
            return;
          void commands.transcribeFile(file, true).then((result) => {
            if (result.status === "error") toast.error(String(result.error));
          });
        });
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });

    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Audio files sent from the Finder's right-click service land in the Files
  // queue. They may have arrived before this window was listening, so check at
  // mount too. The batch ends on the clipboard: the point of the right-click is
  // to get the text without having to come back to this window.
  useEffect(() => {
    if (onboardingStep !== "done") return;
    const takeOpenedFiles = async () => {
      const paths = await commands.takeOpenedFiles();
      if (paths.length === 0) return;
      setCurrentSection("transcribe");
      useFileQueueStore.getState().enqueue(paths, (items) => {
        const text = transcriptsAsText(items);
        if (!text) return;
        void writeText(text).then(
          () => toast.success(t("transcribe.copiedToClipboard")),
          (error) => console.error("Failed to copy the transcript:", error),
        );
      });
    };
    // Listen first: an event sent before the listener exists would be lost.
    const unlisten = listen("files-opened", () => void takeOpenedFiles());
    void unlisten.then(takeOpenedFiles);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [onboardingStep, t]);

  useEffect(() => {
    const unlisten = listen("paste-error", () => {
      toast.error(t("errors.pasteFailedTitle"), {
        description: t("errors.pasteFailed"),
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Listen for transcription failures and show a toast.
  // The payload is the backend error message (also logged to handy.log).
  useEffect(() => {
    const unlisten = listen<string>("transcription-error", (event) => {
      toast.error(t("errors.transcriptionFailedTitle"), {
        description: event.payload,
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Listen for model loading failures and show a toast
  useEffect(() => {
    const unlisten = listen<ModelStateEvent>("model-state-changed", (event) => {
      if (event.payload.event_type === "loading_failed") {
        toast.error(
          t("errors.modelLoadFailed", {
            model:
              event.payload.model_name || t("errors.modelLoadFailedUnknown"),
          }),
          {
            description: event.payload.error,
          },
        );
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  const revealMainWindowForPermissions = async () => {
    try {
      await commands.showMainWindowCommand();
    } catch (e) {
      console.warn("Failed to show main window for permission onboarding:", e);
    }
  };

  const checkOnboardingStatus = async () => {
    try {
      const settingsResult = await commands.getAppSettings();
      const hasCompletedOnboarding =
        settingsResult.status === "ok" &&
        settingsResult.data.onboarding_completed === true;
      const currentPlatform = platform();

      if (hasCompletedOnboarding) {
        // Returning user - check if they need to grant permissions first
        setIsReturningUser(true);

        if (currentPlatform === "macos") {
          try {
            const [hasAccessibility, hasMicrophone] = await Promise.all([
              checkAccessibilityPermission(),
              checkMicrophonePermission(),
            ]);
            if (!hasAccessibility || !hasMicrophone) {
              await revealMainWindowForPermissions();
              setOnboardingStep("accessibility");
              return;
            }
          } catch (e) {
            console.warn("Failed to check macOS permissions:", e);
            // If we can't check, proceed to main app and let them fix it there
          }
        }

        if (currentPlatform === "windows") {
          try {
            const microphoneStatus =
              await commands.getWindowsMicrophonePermissionStatus();
            if (
              microphoneStatus.supported &&
              microphoneStatus.overall_access === "denied"
            ) {
              await revealMainWindowForPermissions();
              setOnboardingStep("accessibility");
              return;
            }
          } catch (e) {
            console.warn("Failed to check Windows microphone permissions:", e);
            // If we can't check, proceed to main app and let them fix it there
          }
        }

        setOnboardingStep("done");
      } else {
        // New user - start full onboarding
        setIsReturningUser(false);
        setOnboardingStep("accessibility");
      }
    } catch (error) {
      console.error("Failed to check onboarding status:", error);
      setOnboardingStep("accessibility");
    }
  };

  const handleAccessibilityComplete = () => {
    // Returning users already have models, skip to main app
    // New users need to select a model
    setOnboardingStep(isReturningUser ? "done" : "model");
  };

  const handleModelSelected = () => {
    // Transition to main app - user has started a download
    setOnboardingStep("done");
  };

  // Rendered once around every step below (including onboarding) so
  // toast.error() calls surface to the user. sonner renders via a portal, so
  // its position in the tree doesn't affect layout. Without this, errors during
  // onboarding (e.g. a model download failing because blob.handy.computer is
  // unreachable) are silently swallowed and the wizard just appears to "blink".
  const toaster = (
    <Toaster
      theme="system"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "glass-pop px-4 py-3 flex items-center gap-3 text-sm",
          title: "font-medium",
          description: "text-mid-gray",
        },
      }}
    />
  );

  // Still checking onboarding status
  if (onboardingStep === null) {
    return null;
  }

  // Select the content for the current step. The Toaster is rendered once, in a
  // stable wrapper around this node, so crossing between onboarding steps and
  // the main app never remounts it (which would drop any in-flight toast).
  let content: ReactNode;
  if (onboardingStep === "accessibility") {
    content = (
      <AccessibilityOnboarding onComplete={handleAccessibilityComplete} />
    );
  } else if (onboardingStep === "model") {
    content = <Onboarding onModelSelected={handleModelSelected} />;
  } else {
    content = (
      <div
        dir={direction}
        className="h-screen flex flex-col select-none cursor-default"
      >
        <WhatsNewGate />
        {/* Title bar: the traffic lights on the left, the section tabs centred.
            The whole strip drags the window. */}
        <header
          data-tauri-drag-region
          className="grid h-[52px] shrink-0 grid-cols-[minmax(64px,1fr)_auto_minmax(140px,1fr)] items-center gap-2 px-3"
        >
          {/* The traffic lights sit in the first column. */}
          <span />
          <SectionTabs
            activeSection={currentSection}
            onSectionChange={setCurrentSection}
          />
          <div className="flex min-w-0 justify-end text-[12px] text-text/65">
            <ModelSelector />
          </div>
        </header>
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="flex flex-col items-center px-12 pt-1 pb-8 gap-4">
            <AccessibilityPermissions />
            <SectionPage key={currentSection} section={currentSection} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {toaster}
      {content}
    </>
  );
}

export default App;
