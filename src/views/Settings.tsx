import { t, LANG, LANGUAGES, Lang, setLanguage } from "../i18n";
import { useState } from "react";
import { pickFolder, UpdateCheck } from "../api";
import { Segmented, Toggle } from "../components/Chrome";
import { AnvilLogo, CheckIcon, DownloadIcon, ExternalIcon, FolderIcon, GithubIcon, LogoutIcon, RefreshIcon, ShieldIcon } from "../icons";
import { logout, useAccount } from "../admin";
import { GitHubLogin, openGithub } from "./Admin";
import McLoginDialog from "../components/McLogin";
import { mcLogout, useWorkshop } from "../workshop";
import { studioAccount, useStudioAccount } from "../studioAccount";
import { promptDialog } from "../components/Overlay";
import { toast } from "../state";
import { checkForUpdate, installUpdate, updateSettings, useAppVersion, useSettings, useUpdate } from "../state";

type Section = "updates" | "account" | "workshop" | "general" | "appearance" | "about";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "updates", label: t("Updates") },
  { id: "account", label: t("Konto") },
  { id: "workshop", label: t("Workshop & Spielen") },
  { id: "general", label: t("Allgemein") },
  { id: "appearance", label: t("Darstellung") },
  { id: "about", label: t("Über") },
];

const CHECK_OPTIONS: { value: UpdateCheck; label: string }[] = [
  { value: "startup", label: t("Bei jedem Start") },
  { value: "daily", label: t("Täglich") },
  { value: "weekly", label: t("Wöchentlich") },
  { value: "manual", label: t("Nur manuell") },
];

export default function Settings({ onOpenAdmin }: { onOpenAdmin: () => void }) {
  const s = useSettings();
  const [section, setSection] = useState<Section>("updates");
  if (!s) return <div className="page muted">{t("Lade Einstellungen …")}</div>;

  return (
    <div className="settings">
      <nav className="settings-nav" aria-label={t("Einstellungsbereiche")}>
        <div className="eyebrow">{t("Einstellungen")}</div>
        {SECTIONS.filter((x) => x.id !== "workshop" || s.workshopEnabled).map((x) => (
          <button key={x.id} className={section === x.id ? "settings-link active" : "settings-link"} onClick={() => setSection(x.id)}>
            {x.label}
          </button>
        ))}
      </nav>
      <div className="settings-content" key={section}>
        {section === "updates" && <UpdatesSection onAccount={() => setSection("account")} />}
        {section === "account" && <AccountSection onOpenAdmin={onOpenAdmin} />}
        {section === "workshop" && <WorkshopSection />}
        {section === "general" && (
          <>
            <h2>{t("Allgemein")}</h2>
            <div className="setting-list">
              <Row title={t("Sprache")} desc={t("Sprache der gesamten Oberfläche. Die Ansicht wird dafür kurz neu geladen.")}>
                <select className="input" style={{ width: 200 }} aria-label={t("Sprache")} value={LANG} onChange={(e) => setLanguage(e.target.value as Lang, "settings")}>
                  {LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Row>
              <Row title={t("Einführung")} desc={t("Die Tour durch Anvil Studio noch einmal ansehen.")}>
                <button className="btn" onClick={() => window.dispatchEvent(new Event("anvil:tour-start"))}>
                  {t("Tour starten")}
                </button>
              </Row>
              <Row title={t("Standard-Editor")} desc={t("Womit „In … öffnen“ im Arbeitsbereich dein Projekt öffnet.")}>
                <Segmented
                  label={t("Standard-Editor")}
                  value={s.defaultIde}
                  options={[
                    { value: "code", label: t("VS Code") },
                    { value: "idea", label: t("IntelliJ IDEA") },
                  ]}
                  onChange={(v) => updateSettings({ defaultIde: v })}
                />
              </Row>
              <Row title={t("Speicherort für neue Projekte")} desc={t("Leer lassen für „Dokumente\\Anvil Studio“.")}>
                <ProjectsDirInput value={s.projectsDir} onSave={(v) => updateSettings({ projectsDir: v })} />
              </Row>
            </div>
          </>
        )}
        {section === "appearance" && (
          <>
            <h2>{t("Darstellung")}</h2>
            <div className="setting-list">
              <Row title={t("Theme")} desc={t("Hell, dunkel oder automatisch wie Windows.")}>
                <div className="theme-cards" role="radiogroup" aria-label={t("Theme")}>
                  {(
                    [
                      ["dark", t("Dunkel")],
                      ["light", t("Hell")],
                      ["system", t("System")],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      role="radio"
                      aria-checked={s.theme === v}
                      className={s.theme === v ? "theme-card active" : "theme-card"}
                      onClick={() => updateSettings({ theme: v })}
                    >
                      <span className={`theme-mini ${v}`}>
                        <i />
                        <b />
                      </span>
                      {label}
                    </button>
                  ))}
                </div>
              </Row>
              <Row title={t("Akzentfarbe")} desc={t("Farbe für Knöpfe, Markierungen und Fortschritt.")}>
                <div className="accent-dots" role="radiogroup" aria-label={t("Akzentfarbe")}>
                  {(
                    [
                      ["green", t("Grün"), "#4fb33d"],
                      ["blue", t("Blau"), "#3f82e6"],
                      ["violet", t("Violett"), "#8a64ea"],
                      ["orange", t("Orange"), "#e0802c"],
                    ] as const
                  ).map(([v, label, color]) => (
                    <button
                      key={v}
                      role="radio"
                      aria-checked={s.accent === v}
                      aria-label={label}
                      title={label}
                      className={s.accent === v ? "accent-dot active" : "accent-dot"}
                      style={{ background: color }}
                      onClick={() => updateSettings({ accent: v })}
                    />
                  ))}
                </div>
              </Row>
              <Row title={t("Animationen reduzieren")} desc={t("Schaltet Übergänge und Bewegungen ab.")}>
                <Toggle label={t("Animationen reduzieren")} checked={s.reduceMotion} onChange={(v) => updateSettings({ reduceMotion: v })} />
              </Row>
              <Row title={t("Schriftgröße der Konsole")} desc={`${s.consoleFontSize} px`}>
                <input
                  type="range"
                  className="range"
                  min={10}
                  max={18}
                  value={s.consoleFontSize}
                  aria-label={t("Schriftgröße der Konsole")}
                  onChange={(e) => updateSettings({ consoleFontSize: Number(e.target.value) })}
                />
              </Row>
            </div>
            <div className="console-preview mono" style={{ fontSize: s.consoleFontSize }}>
              <div className="log info">{t("[Render thread/INFO] Minecraft wird geladen")}</div>
              <div className="log warn">{t("[Render thread/WARN] Textur fehlt: example_item")}</div>
              <div className="log success">{t("BUILD SUCCESSFUL in 12s")}</div>
            </div>
          </>
        )}
        {section === "about" && <About onOpenAdmin={onOpenAdmin} />}
      </div>
    </div>
  );
}

function UpdatesSection({ onAccount }: { onAccount: () => void }) {
  const s = useSettings()!;
  const account = useAccount();
  const tester = !!account?.isTester;
  const u = useUpdate();
  const version = useAppVersion();
  const last = s.lastUpdateCheck ? new Date(s.lastUpdateCheck * 1000).toLocaleString("de-DE") : t("noch nie");
  const busy = u.phase === "checking" || u.phase === "downloading" || u.phase === "installing";

  return (
    <>
      <h2>{t("Updates")}</h2>

      <div className={`update-hero ${u.phase}`}>
        <div className="update-icon">
          {u.phase === "available" || u.phase === "downloading" || u.phase === "installing" ? <DownloadIcon size={22} /> : <CheckIcon size={22} />}
        </div>
        <div className="grow">
          {u.phase === "available" && u.info ? (
            <>
              <div className="update-title">
                {t("Version {version} ist verfügbar", { version: u.info.version })}{" "}{u.info.prerelease && <span className="tag">{t("Vorabversion")}</span>}
              </div>
              <div className="muted small">
                {t("Installiert:")}{" "}{version}
                {u.waitingForIdle && t(" · wird installiert, sobald kein Spiel oder Build mehr läuft")}
              </div>
            </>
          ) : u.phase === "downloading" ? (
            <>
              <div className="update-title">{t("Update wird heruntergeladen …")}</div>
              <div className="bar">
                <span style={{ width: `${Math.round((u.progress ?? 0) * 100)}%` }} />
              </div>
            </>
          ) : u.phase === "installing" ? (
            <>
              <div className="update-title">{t("Wird installiert")}</div>
              <div className="muted small">{t("Anvil Studio schließt sich und startet danach neu.")}</div>
            </>
          ) : u.phase === "checking" ? (
            <>
              <div className="update-title">{t("Suche nach Updates …")}</div>
              <div className="bar indeterminate">
                <span />
              </div>
            </>
          ) : u.phase === "error" ? (
            <>
              <div className="update-title">{u.info ? t("Update auf {version} fehlgeschlagen", { version: u.info.version }) : t("Update-Prüfung fehlgeschlagen")}</div>
              {u.info && (
                <div className="muted small">
                  {t("Die Verbindung zu GitHub wurde unterbrochen – oft durch Virenscanner, Firewall oder DNS-Filter. Du kannst den Installer auch im Browser laden.")}
                </div>
              )}
              <div className="error-text small" style={{ whiteSpace: "pre-wrap", userSelect: "text" }}>{u.error}</div>
            </>
          ) : (
            <>
              <div className="update-title">{t("Anvil Studio")}{" "}{version}</div>
              <div className="muted small">{t("Zuletzt geprüft:")}{" "}{last}</div>
            </>
          )}
        </div>
        {u.phase === "error" && u.info && (
          <button className="btn" onClick={() => openGithub(u.info!.htmlUrl)}>
            <ExternalIcon size={14} />{" "}{t("Im Browser herunterladen")}
          </button>
        )}
        {u.phase === "available" || (u.phase === "error" && u.info) ? (
          <button className="btn primary" onClick={installUpdate}>
            <DownloadIcon size={15} /> {u.phase === "error" ? t("Erneut versuchen") : t("Jetzt installieren")}
          </button>
        ) : (
          <button className="btn" onClick={() => checkForUpdate(true)} disabled={busy}>
            <RefreshIcon size={15} />{" "}{t("Nach Updates suchen")}
          </button>
        )}
      </div>

      {u.phase === "available" && u.info?.notes && (
        <div className="notes">
          <div className="side-title">{t("Was ist neu")}</div>
          <pre>{u.info.notes.slice(0, 4000)}</pre>
        </div>
      )}

      <div className="setting-list">
        <Row title={t("Nach Updates suchen")} desc={t("Wie oft Anvil Studio auf GitHub nach einer neuen Version schaut.")}>
          <Segmented label={t("Nach Updates suchen")} value={s.updateCheck} options={CHECK_OPTIONS} onChange={(v) => updateSettings({ updateCheck: v })} />
        </Row>
        <Row title={t("Updates automatisch installieren")} desc={t("Gefundene Updates direkt herunterladen und installieren. Läuft gerade ein Spiel oder Build, wird gewartet.")}>
          <Toggle label={t("Updates automatisch installieren")} checked={s.autoInstall} onChange={(v) => updateSettings({ autoInstall: v })} />
        </Row>
        <Row
          title={t("Update-Kanal")}
          desc={
            s.updateChannel === "dev"
              ? t("Dev: experimentelle Funktionen für Tester. Kann instabil sein.")
              : s.updateChannel === "beta"
                ? t("Beta: neue Funktionen früher ausprobieren. Du bekommst auch alle stabilen Versionen.")
                : t("Stabil: nur getestete Versionen.")
          }
        >
          <Segmented
            label={t("Update-Kanal")}
            value={s.updateChannel}
            onChange={(v) => updateSettings({ updateChannel: v })}
            options={[
              { value: "stable", label: t("Stabil") },
              { value: "beta", label: t("Beta") },
              { value: "dev", label: t("Dev"), disabled: !tester, title: tester ? undefined : t("Nur für angemeldete Tester") },
            ]}
          />
        </Row>
        {!tester && (
          <div className="setting-row hint">
            <div className="muted small">{t("Dev-Versionen gibt es nur für eingeladene Tester mit GitHub-Anmeldung.")}</div>
            <button className="btn small" onClick={onAccount}>
              <GithubIcon size={14} /> {account ? t("Konto ansehen") : t("Mit GitHub anmelden")}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function WorkshopSection() {
  const s = useSettings()!;
  const ws = useWorkshop();
  const [login, setLogin] = useState(false);
  return (
    <>
      <h2>{t("Workshop & Spielen")}</h2>
      <div className="setting-list">
        <Row title={t("Startseite")} desc={t("Welche Seite beim Öffnen von Anvil Studio erscheint.")}>
          <Segmented
            label={t("Startseite")}
            value={s.startPage}
            options={[
              { value: "workshop", label: t("Workshop") },
              { value: "projects", label: t("Projekte") },
            ]}
            onChange={(v) => updateSettings({ startPage: v })}
          />
        </Row>
        <Row
          title={t("Minecraft-Konto")}
          desc={ws.profile ? (ws.profile.kind === "xbox" ? t("Angemeldet als {name} (Xbox-Konto). Der Workshop funktioniert schon – Spielen geht erst, wenn Mojang die Minecraft-Anmeldung für Anvil Studio freigeschaltet hat. Danach einmal ab- und wieder anmelden.", { name: ws.profile.name }) : t("Angemeldet als {name}. Wird zum Spielen und Hochladen im Workshop benutzt.", { name: ws.profile.name })) : t("Zum Spielen und Hochladen im Workshop. Anmeldung über Microsoft.")}
        >
          {ws.profile ? (
            <button className="btn ghost" onClick={() => mcLogout()}>
              <LogoutIcon size={14} /> {t("Abmelden")}
            </button>
          ) : (
            <button className="btn" onClick={() => setLogin(true)}>
              {t("Anmelden")}
            </button>
          )}
        </Row>
        <Row title={t("Arbeitsspeicher beim Spielen")} desc={t("Wie viel RAM Minecraft beim Spielen aus dem Workshop bekommt.")}>
          <select className="input" style={{ width: 140 }} value={s.playMemoryMb} onChange={(e) => updateSettings({ playMemoryMb: Number(e.target.value) })} aria-label={t("Arbeitsspeicher beim Spielen")}>
            {[2048, 3072, 4096, 6144, 8192].map((m) => (
              <option key={m} value={m}>
                {m / 1024} GB
              </option>
            ))}
          </select>
        </Row>
        <Row title={t("Workshop-Server")} desc={s.workshopEnabled === false ? t("Der Workshop ist gerade ausgeschaltet.") : t("Wird zentral von Anvil Studio festgelegt und automatisch aktualisiert.")}>
          <span className="mono muted small">{s.workshopUrl}</span>
        </Row>
      </div>
      {login && <McLoginDialog onClose={() => setLogin(false)} onDone={() => setLogin(false)} />}
    </>
  );
}

/** Anvil-Studio-Konto und Minecraft-Konto */
function StudioAccountPanel() {
  const st = useStudioAccount();
  const ws = useWorkshop();
  const [login, setLogin] = useState(false);
  const acc = st?.account;
  async function remove() {
    const pw = await promptDialog(t("Konto löschen"), t("Zum Löschen dein Passwort eingeben. Das Konto wird sofort und endgültig gelöscht – deine Projekte auf diesem PC bleiben erhalten."), "", t("Endgültig löschen"), t("Abbrechen"), true);
    if (!pw) return;
    try {
      await studioAccount.remove(pw);
    } catch (e) {
      toast(String(e), "error");
    }
  }
  return (
    <>
      <div className="about">
        <span className="avatar studio-avatar">{(acc?.name || acc?.email || "?").slice(0, 1).toUpperCase()}</span>
        <div className="grow">
          <div className="update-title">{acc?.name || acc?.email}</div>
          <div className="muted small">
            {acc?.email}
            {st?.offline ? ` · ${t("offline – gespeicherte Anmeldung")}` : ""}
          </div>
        </div>
        <button className="btn ghost" onClick={() => studioAccount.logout()}>
          <LogoutIcon size={14} /> {t("Abmelden")}
        </button>
      </div>
      <div className="setting-list" style={{ marginTop: 16, marginBottom: 28 }}>
        <Row
          title={t("Minecraft-Konto")}
          desc={ws.profile ? t("Angemeldet als {name}. Wird zum Spielen und Testen deiner Mods benutzt.", { name: ws.profile.name }) : t("Zum Starten von Minecraft beim Testen. Anmeldung über Microsoft.")}
        >
          {ws.profile ? (
            <button className="btn ghost" onClick={() => mcLogout()}>
              <LogoutIcon size={14} /> {t("Abmelden")}
            </button>
          ) : (
            <button className="btn" onClick={() => setLogin(true)}>
              {t("Anmelden")}
            </button>
          )}
        </Row>
        <Row title={t("Konto löschen")} desc={t("Löscht dein Anvil-Studio-Konto auf dem Server. Deine Projekte auf diesem PC bleiben erhalten.")}>
          <button className="btn danger" onClick={remove}>
            {t("Konto löschen")}
          </button>
        </Row>
      </div>
      {login && <McLoginDialog onDone={() => setLogin(false)} onClose={() => setLogin(false)} />}
    </>
  );
}

function AccountSection({ onOpenAdmin }: { onOpenAdmin: () => void }) {
  const account = useAccount();
  return (
    <>
      <h2>{t("Konto")}</h2>
      <StudioAccountPanel />
      <h2>{t("GitHub (Dev-Versionen)")}</h2>
      {!account ? (
        <div className="panel account-login">
          <div>
            <div className="setting-title">{t("Mit GitHub anmelden")}</div>
            <div className="muted small">{t("Nötig für Dev-Versionen (nur eingeladene Tester) und den Entwicklerbereich. Anvil Studio bekommt dabei nur Lesezugriff auf das Dev-Repo.")}</div>
          </div>
          <GitHubLogin compact />
        </div>
      ) : (
        <>
          <div className="about">
            <img className="avatar" src={account.user.avatarUrl} alt="" />
            <div className="grow">
              <div className="update-title">{account.user.name ?? account.user.login}</div>
              <div className="muted small">@{account.user.login}</div>
            </div>
            <button className="btn ghost" onClick={() => logout()}>
              <LogoutIcon size={14} />{" "}{t("Abmelden")}
            </button>
          </div>
          <div className="setting-list" style={{ marginTop: 16 }}>
            <Row title={t("Dev-Versionen")} desc={account.isTester ? t("Du bist als Tester freigeschaltet und kannst den Kanal „Dev“ wählen.") : t("Kein Zugriff. Wenn du eingeladen wurdest, nimm die Einladung auf GitHub an und melde dich neu an.")}>
              {account.isTester ? (
                <span className="tag ch-dev">{t("Tester")}</span>
              ) : (
                <button className="btn small" onClick={() => openGithub("https://github.com/Basti032002/anvil-studio-dev/invitations")}>
                  <ExternalIcon size={14} />{" "}{t("Einladung öffnen")}
                </button>
              )}
            </Row>
            {account.isAdmin && (
              <Row title={t("Entwicklerbereich")} desc={t("Versionen veröffentlichen, Releases, Tester und Builds verwalten.")}>
                <button className="btn" onClick={onOpenAdmin}>
                  <ShieldIcon size={14} />{" "}{t("Öffnen")}
                </button>
              </Row>
            )}
          </div>
        </>
      )}
    </>
  );
}

function About({ onOpenAdmin }: { onOpenAdmin: () => void }) {
  const version = useAppVersion();
  const account = useAccount();
  const admin = account?.isAdmin ? account.user : null;
  return (
    <>
      <h2>{t("Über")}</h2>
      <div className="about">
        <div className="about-logo">
          <AnvilLogo size={30} />
        </div>
        <div>
          <div className="update-title">{t("Anvil Studio")}{" "}{version}</div>
          <div className="muted small">{t("Launcher zum Erstellen, Bauen und Testen von Minecraft-Mods.")}</div>
        </div>
      </div>
      <div className="setting-list" style={{ marginTop: 16 }}>
        <Row title={t("Entwicklerbereich")} desc={admin ? t("Angemeldet als {login}.", { login: admin.login }) : t("Versionen veröffentlichen und Releases verwalten. Nur für den Entwickler.")}>
          <button className="btn" onClick={onOpenAdmin}>
            <ShieldIcon size={14} /> {admin ? t("Öffnen") : t("Mit GitHub anmelden")}
          </button>
        </Row>
      </div>
    </>
  );
}

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <div className="setting-title">{title}</div>
        <div className="muted small">{desc}</div>
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

function ProjectsDirInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  return (
    <div className="input-row">
      <input
        className="input mono"
        style={{ width: 260 }}
        aria-label={t("Speicherort für neue Projekte")}
        placeholder={t("Dokumente\\Anvil Studio")}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onSave(v)}
      />
      <button
        className="btn"
        onClick={async () => {
          const d = await pickFolder(t("Standard-Ordner für neue Projekte"), v);
          if (d) {
            setV(d);
            onSave(d);
          }
        }}
      >
        <FolderIcon size={14} />{" "}{t("Durchsuchen …")}
      </button>
    </div>
  );
}
