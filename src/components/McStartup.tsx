import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { mcApi } from "../workshop";
import { UserIcon } from "../icons";
import McLoginDialog from "./McLogin";
import { holdStartup, whenTourDone } from "./Tour";

/** Nach dem Start (und nach der Tour): Minecraft-Anmeldung anbieten, bis man angemeldet ist */
export default function McStartup() {
  const [show, setShow] = useState(false);
  const [login, setLogin] = useState(false);
  const release = useRef<() => void>(() => {});
  useEffect(() => {
    release.current = holdStartup();
    let alive = true;
    whenTourDone(async () => {
      const available = await mcApi.available().catch(() => false);
      const acc = available ? await mcApi.account().catch(() => null) : null;
      if (!alive) return;
      if (!available || acc) release.current();
      else setShow(true);
    });
    return () => {
      alive = false;
      release.current();
    };
  }, []);
  if (!show) return null;
  const close = () => {
    setShow(false);
    release.current();
  };
  if (login) return <McLoginDialog later reason={t("Über dein Microsoft-Konto – Anvil Studio sieht dein Passwort nie.")} onDone={close} onClose={close} />;
  return (
    <div className="modal-backdrop">
      <div className="dialog mc-login mc-intro" role="dialog" aria-label={t("Mit Minecraft-Konto anmelden")}>
        <div className="row">
          <span className="notes-badge">
            <UserIcon size={18} />
          </span>
          <div className="grow">
            <div className="panel-title-lg">{t("Mit Minecraft-Konto anmelden")}</div>
            <div className="muted small">{t("Melde dich mit dem Microsoft-Konto an, mit dem du Minecraft gekauft hast – damit startet Anvil Studio das Spiel zum Testen deiner Mods.")}</div>
          </div>
        </div>
        <div className="muted small">{t("Du kannst dich auch später unter Einstellungen → Konto anmelden. Bis dahin fragen wir bei jedem Start nach.")}</div>
        <div className="row mc-later">
          <span className="grow" />
          <button className="btn" onClick={close}>
            {t("Später")}
          </button>
          <button className="btn primary" onClick={() => setLogin(true)} autoFocus>
            {t("Jetzt anmelden")}
          </button>
        </div>
      </div>
    </div>
  );
}
