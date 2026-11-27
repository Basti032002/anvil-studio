import { t } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { CloseIcon, CopyIcon, ExternalIcon, UserIcon } from "../icons";
import { toast } from "../state";
import { mcApi, McDeviceCode, McProfile, setProfile } from "../workshop";

/** Anmeldung mit dem Minecraft-Konto (Microsoft-Gerätecode). */
export default function McLoginDialog({ reason, onDone, onClose, later }: { reason?: string; onDone: (p: McProfile) => void; onClose: () => void; later?: boolean }) {
  const [code, setCode] = useState<McDeviceCode | null>(null);
  const [state, setState] = useState<"loading" | "waiting" | "expired" | "denied" | "error" | "unavailable">("loading");
  const [error, setError] = useState("");
  const timer = useRef<number>();
  const alive = useRef(true);

  async function start() {
    setState("loading");
    setError("");
    if (!(await mcApi.available().catch(() => false))) {
      setState("unavailable");
      return;
    }
    try {
      const c = await mcApi.startLogin();
      setCode(c);
      setState("waiting");
      navigator.clipboard.writeText(c.userCode).catch(() => {});
      api.openUrl(c.verificationUri).catch(() => {});
      poll(c, c.interval);
    } catch (e) {
      setError(String(e));
      setState("error");
    }
  }

  function poll(c: McDeviceCode, interval: number) {
    timer.current = window.setTimeout(async () => {
      if (!alive.current) return;
      try {
        const r = await mcApi.pollLogin(c.deviceCode);
        if (r.status === "done" && r.profile) {
          setProfile(r.profile);
          toast(t("Angemeldet als {name}.", { name: r.profile.name }), "success");
          onDone(r.profile);
        } else if (r.status === "pending") poll(c, interval);
        else if (r.status === "slow_down") poll(c, interval + 5);
        else setState(r.status === "expired" ? "expired" : "denied");
      } catch (e) {
        setError(String(e));
        setState("error");
      }
    }, interval * 1000);
  }

  useEffect(() => {
    start();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      alive.current = false;
      window.clearTimeout(timer.current);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog mc-login" role="dialog" aria-label={t("Mit Minecraft-Konto anmelden")}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row">
            <span className="notes-badge">
              <UserIcon size={18} />
            </span>
            <div>
              <div className="panel-title-lg">{t("Mit Minecraft-Konto anmelden")}</div>
              <div className="muted small">{reason ?? t("Über dein Microsoft-Konto – Anvil Studio sieht dein Passwort nie.")}</div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t("Schließen")} data-tip={t("Schließen")}>
            <CloseIcon size={14} />
          </button>
        </div>
        {state === "loading" && <p className="muted">{t("Verbinde mit Microsoft …")}</p>}
        {state === "waiting" && code && (
          <>
            <ol className="mc-steps">
              <li>{t("Im Browser hat sich microsoft.com/link geöffnet.")}</li>
              <li>{t("Gib diesen Code ein (er ist schon kopiert):")}</li>
            </ol>
            <button className="device-code" onClick={() => navigator.clipboard.writeText(code.userCode).then(() => toast(t("Code kopiert."), "success"))}>
              <span className="mono">{code.userCode}</span>
              <CopyIcon size={15} />
            </button>
            <ol className="mc-steps" start={3}>
              <li>{t("Mit dem Konto anmelden, mit dem du Minecraft gekauft hast.")}</li>
            </ol>
            <div className="row gap-6">
              <span className="spinner" />
              <span className="muted small">{t("Warte auf die Anmeldung …")}</span>
              <span className="grow" />
              <button className="btn small" onClick={() => api.openUrl(code.verificationUri)}>
                <ExternalIcon size={13} /> {t("Seite erneut öffnen")}
              </button>
            </div>
          </>
        )}
        {(state === "expired" || state === "denied") && (
          <div className="callout warn">
            <div className="grow">{state === "expired" ? t("Der Code ist abgelaufen.") : t("Die Anmeldung wurde abgebrochen.")}</div>
            <button className="btn small" onClick={start}>
              {t("Neu versuchen")}
            </button>
          </div>
        )}
        {state === "error" && (
          <div className="callout error">
            <div className="grow">{error}</div>
            <button className="btn small" onClick={start}>
              {t("Neu versuchen")}
            </button>
          </div>
        )}
        {state === "unavailable" && <div className="callout warn">{t("Diese Version von Anvil Studio wurde ohne Microsoft-Anmeldung gebaut. Sie kommt mit einem der nächsten Updates.")}</div>}
        {later && (
          <div className="row mc-later">
            <span className="grow" />
            <button className="btn small" onClick={onClose}>
              {t("Später")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
