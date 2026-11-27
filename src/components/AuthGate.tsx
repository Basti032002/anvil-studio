import { useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { AnvilLogo } from "../icons";
import { getSettings } from "../state";
import { studioAccount } from "../studioAccount";
import { TitleBar } from "./Chrome";

type Mode = "login" | "register" | "verify" | "forgot" | "reset";

/** Vor dem Studio: Anmelden oder Konto erstellen (E-Mail + Passwort, Bestätigung per Code) */
export default function AuthGate({ offlineError }: { offlineError?: string }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(offlineError ?? "");
  const [info, setInfo] = useState("");

  const go = (m: Mode) => {
    setMode(m);
    setError("");
    setInfo("");
    setCode("");
  };

  async function run(f: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await f();
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (mode === "login")
      run(async () => {
        const r = await studioAccount.login(email, password);
        if (r.needVerify) {
          setMode("verify");
          setInfo(t("Bitte bestätige zuerst deine E-Mail – wir haben dir einen neuen Code geschickt."));
        }
      });
    else if (mode === "register") {
      if (password !== password2) return setError(t("Die Passwörter stimmen nicht überein."));
      if (!agree) return setError(t("Bitte stimme der Datenschutzerklärung zu."));
      run(async () => {
        await studioAccount.register(email, password, name);
        go("verify");
      });
    } else if (mode === "verify") run(async () => void (await studioAccount.verify(email, code)));
    else if (mode === "forgot")
      run(async () => {
        await studioAccount.forgot(email);
        go("reset");
        setInfo(t("Wenn es ein Konto zu dieser E-Mail gibt, ist ein Code unterwegs."));
      });
    else if (mode === "reset") {
      if (password !== password2) return setError(t("Die Passwörter stimmen nicht überein."));
      run(async () => void (await studioAccount.reset(email, code, password)));
    }
  };

  const privacy = () => api.openUrl(`${getSettings()?.workshopUrl ?? "https://workshop.forge-host.net"}/#privacy`).catch(() => {});

  const titles: Record<Mode, [string, string]> = {
    login: [t("Willkommen zurück"), t("Melde dich mit deinem Anvil-Studio-Konto an.")],
    register: [t("Konto erstellen"), t("Ein Konto für Anvil Studio – kostenlos, nur E-Mail und Passwort.")],
    verify: [t("E-Mail bestätigen"), t("Wir haben dir einen 6-stelligen Code an {email} geschickt.", { email })],
    forgot: [t("Passwort vergessen"), t("Gib deine E-Mail ein, wir schicken dir einen Code.")],
    reset: [t("Neues Passwort"), t("Gib den Code aus der E-Mail und dein neues Passwort ein.")],
  };

  return (
    <div className="shell">
      <TitleBar />
      <div className="auth">
        <div className="auth-side" aria-hidden="true">
          <span className="auth-logo">
            <AnvilLogo size={44} />
          </span>
          <div className="auth-brand">{t("Anvil Studio")}</div>
          <div className="auth-tag">{t("Eigene Minecraft-Mods bauen – ohne programmieren zu müssen.")}</div>
        </div>
        <form className="auth-card" onSubmit={submit}>
          <div className="auth-title">{titles[mode][0]}</div>
          <div className="muted small">{titles[mode][1]}</div>

          {mode === "register" && (
            <label className="auth-field">
              <span>{t("Name (freiwillig)")}</span>
              <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
            </label>
          )}
          {(mode === "login" || mode === "register" || mode === "forgot") && (
            <label className="auth-field">
              <span>{t("E-Mail")}</span>
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
            </label>
          )}
          {(mode === "verify" || mode === "reset") && (
            <label className="auth-field">
              <span>{t("Code aus der E-Mail")}</span>
              <input
                className="input auth-code mono"
                inputMode="numeric"
                required
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                autoComplete="one-time-code"
                autoFocus
              />
            </label>
          )}
          {(mode === "login" || mode === "register" || mode === "reset") && (
            <label className="auth-field">
              <span>{mode === "reset" ? t("Neues Passwort") : t("Passwort")}</span>
              <input className="input" type="password" required minLength={mode === "login" ? 1 : 8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} />
              {mode !== "login" && <span className="muted small">{t("Mindestens 8 Zeichen.")}</span>}
            </label>
          )}
          {(mode === "register" || mode === "reset") && (
            <label className="auth-field">
              <span>{t("Passwort wiederholen")}</span>
              <input className="input" type="password" required value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
            </label>
          )}
          {mode === "register" && (
            <label className="auth-check">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>
                {t("Ich habe die")}{" "}
                <a href="#" onClick={(e) => (e.preventDefault(), privacy())}>
                  {t("Datenschutzerklärung")}
                </a>{" "}
                {t("gelesen und bin einverstanden.")}
              </span>
            </label>
          )}

          {info && <div className="callout">{info}</div>}
          {error && <div className="callout error">{error}</div>}

          <button className="btn primary auth-submit" type="submit" disabled={busy}>
            {busy
              ? t("Einen Moment …")
              : mode === "login"
                ? t("Anmelden")
                : mode === "register"
                  ? t("Konto erstellen")
                  : mode === "verify"
                    ? t("Bestätigen")
                    : mode === "forgot"
                      ? t("Code schicken")
                      : t("Passwort speichern")}
          </button>

          <div className="auth-links">
            {mode === "login" && (
              <>
                <a href="#" onClick={(e) => (e.preventDefault(), go("forgot"))}>
                  {t("Passwort vergessen?")}
                </a>
                <span className="grow" />
                <span className="muted small">{t("Noch kein Konto?")}</span>
                <a href="#" onClick={(e) => (e.preventDefault(), go("register"))}>
                  {t("Registrieren")}
                </a>
              </>
            )}
            {mode === "verify" && (
              <>
                <a href="#" onClick={(e) => (e.preventDefault(), run(async () => (await studioAccount.resend(email), setInfo(t("Neuer Code ist unterwegs – schau auch im Spam-Ordner.")))))}>
                  {t("Code erneut senden")}
                </a>
                <span className="grow" />
                <a href="#" onClick={(e) => (e.preventDefault(), go("login"))}>
                  {t("Zurück zur Anmeldung")}
                </a>
              </>
            )}
            {(mode === "register" || mode === "forgot" || mode === "reset") && (
              <>
                <span className="grow" />
                <a href="#" onClick={(e) => (e.preventDefault(), go("login"))}>
                  {mode === "register" ? t("Schon ein Konto? Anmelden") : t("Zurück zur Anmeldung")}
                </a>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
