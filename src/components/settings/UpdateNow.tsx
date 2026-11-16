import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { commands } from "../../bindings";
import { Button } from "../ui/Button";
import { SettingContainer } from "../ui/SettingContainer";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current" }
  | { kind: "available"; version: string }
  | { kind: "installing"; version: string }
  | { kind: "failed" };

interface Props {
  grouped?: boolean;
}

/** "Bin ich aktuell?": the installed version and a button to look right now. */
export const UpdateNow: React.FC<Props> = ({ grouped = false }) => {
  const { t } = useTranslation();
  const [version, setVersion] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => {});
    // The background check may already have found one.
    commands
      .pendingUpdateVersion()
      .then((v) => v && setStatus({ kind: "available", version: v }))
      .catch(() => {});
  }, []);

  const check = async () => {
    setStatus({ kind: "checking" });
    const result = await commands.checkUpdateNow();
    if (result.status === "error") setStatus({ kind: "failed" });
    else if (result.data)
      setStatus({ kind: "available", version: result.data });
    else setStatus({ kind: "current" });
  };

  const install = async () => {
    if (status.kind !== "available") return;
    setStatus({ kind: "installing", version: status.version });
    const result = await commands.installUpdateNow();
    if (result.status === "error") setStatus({ kind: "failed" });
    // On success Quacky restarts by itself.
  };

  const k = "settings.updates";
  const description = {
    idle: t(`${k}.idle`, { version }),
    checking: t(`${k}.checking`),
    current: t(`${k}.current`, { version }),
    available:
      status.kind === "available"
        ? t(`${k}.available`, { version: status.version })
        : "",
    installing:
      status.kind === "installing"
        ? t(`${k}.installing`, { version: status.version })
        : "",
    failed: t(`${k}.failed`),
  }[status.kind];

  return (
    <SettingContainer
      title={t(`${k}.title`)}
      description={description}
      grouped={grouped}
    >
      {status.kind === "available" ? (
        <Button variant="primary" size="md" onClick={install}>
          {t(`${k}.install`)}
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="md"
          onClick={check}
          disabled={status.kind === "checking" || status.kind === "installing"}
        >
          {t(`${k}.check`)}
        </Button>
      )}
    </SettingContainer>
  );
};
