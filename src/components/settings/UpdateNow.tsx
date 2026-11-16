import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { Loader2 } from "lucide-react";
import { commands } from "../../bindings";
import { Button } from "../ui/Button";
import { useSettings } from "../../hooks/useSettings";
import { SettingContainer } from "../ui/SettingContainer";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current" }
  | { kind: "available"; version: string }
  | { kind: "installing"; version: string }
  | { kind: "waiting"; version: string }
  | { kind: "checkFailed" }
  | { kind: "installFailed"; version: string };

interface Props {
  grouped?: boolean;
}

/** Checking that answers instantly reads as a flicker; hold it a moment. */
const MIN_CHECK_MS = 500;

/** "Bin ich aktuell?": the installed version and a button to look right now. */
export const UpdateNow: React.FC<Props> = ({ grouped = false }) => {
  const { t } = useTranslation();
  const [version, setVersion] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const { getSetting } = useSettings();
  const autoChecks = getSetting("update_checks_enabled") ?? true;

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => {});
    // The background check (or the duck menu) may already be ahead of us.
    commands
      .updateStatus()
      .then((s) => {
        if (!s.version) return;
        setStatus(
          s.installing
            ? { kind: "installing", version: s.version }
            : { kind: "available", version: s.version },
        );
      })
      .catch(() => {});
    const offFailed = listen<string>("update-failed", (e) =>
      setStatus({ kind: "installFailed", version: e.payload }),
    );
    const offWaiting = listen<string>("update-waiting", (e) =>
      setStatus({ kind: "waiting", version: e.payload }),
    );
    return () => {
      offFailed.then((off) => off());
      offWaiting.then((off) => off());
    };
  }, []);

  const check = async () => {
    setStatus({ kind: "checking" });
    const [result] = await Promise.all([
      commands.checkUpdateNow(),
      new Promise((r) => setTimeout(r, MIN_CHECK_MS)),
    ]);
    if (result.status === "error") setStatus({ kind: "checkFailed" });
    else if (result.data)
      setStatus({ kind: "available", version: result.data });
    else setStatus({ kind: "current" });
  };

  const install = async (target: string) => {
    setStatus({ kind: "installing", version: target });
    const result = await commands.installUpdateNow();
    if (result.status === "error")
      setStatus({ kind: "installFailed", version: target });
    // On success Quacky restarts by itself.
  };

  const k = "settings.updates";
  const description = (() => {
    switch (status.kind) {
      case "idle":
        // Nothing until the version is known: no "Quacky ." flash.
        if (!version) return "";
        return autoChecks
          ? t(`${k}.idle`, { version })
          : t(`${k}.idleManual`, { version });
      case "checking":
        return t(`${k}.checking`);
      case "current":
        return t(`${k}.current`, { version });
      case "available":
        return t(`${k}.available`, { version: status.version });
      case "installing":
        return t(`${k}.installing`, { version: status.version });
      case "waiting":
        return t(`${k}.waiting`);
      case "checkFailed":
        return t(`${k}.failed`);
      case "installFailed":
        return t(`${k}.installFailed`);
    }
  })();

  const busy =
    status.kind === "checking" ||
    status.kind === "installing" ||
    status.kind === "waiting";
  const offersInstall =
    status.kind === "available" || status.kind === "installFailed";

  return (
    <SettingContainer
      title={t(`${k}.title`)}
      description={description}
      liveDescription
      grouped={grouped}
    >
      <Button
        variant={offersInstall ? "primary" : "secondary"}
        size="md"
        className="min-w-[116px] inline-flex items-center justify-center gap-1.5"
        aria-disabled={busy || undefined}
        onClick={() => {
          if (busy) return;
          if (offersInstall) install(status.version);
          else check();
        }}
      >
        {busy && (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        )}
        {status.kind === "checking"
          ? t(`${k}.checkingButton`)
          : status.kind === "installing" || status.kind === "waiting"
            ? t(`${k}.installingButton`)
            : offersInstall
              ? t(`${k}.install`)
              : t(`${k}.check`)}
      </Button>
    </SettingContainer>
  );
};
