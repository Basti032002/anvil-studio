import { useState } from "react";
import { pickFolder, UpdateCheck } from "../api";
import { Segmented, Toggle } from "../components/Chrome";
import { AnvilLogo, CheckIcon, DownloadIcon, ExternalIcon, FolderIcon, GithubIcon, LogoutIcon, RefreshIcon, ShieldIcon } from "../icons";
import { logout, useAccount } from "../admin";
import { GitHubLogin, openGithub } from "./Admin";
import { checkForUpdate, installUpdate, updateSettings, useAppVersion, useSettings, useUpdate } from "../state";

type Section = "updates" | "account" | "general" | "appearance" | "about";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "updates", label: "Updates" },
  { id: "account", label: "Konto" },
  { id: "general", label: "Allgemein" },
  { id: "appearance", label: "Darstellung" },
  { id: "about", label: "Über" },
];

const CHECK_OPTIONS: { value: UpdateCheck; label: string }[] = [
  { value: "startup", label: "Bei jedem Start" },
  { value: "daily", label: "Täglich" },
  { value: "weekly", label: "Wöchentlich" },
  { value: "manual", label: "Nur manuell" },
];

export default function Settings({ onOpenAdmin }: { onOpenAdmin: () => void }) {
  const s = useSettings();
  const [section, setSection] = useState<Section>("updates");
  if (!s) return <div className="page muted">Lade Einstellungen …</div>;

  return (
    <div className="settings">
      <nav className="settings-nav" aria-label="Einstellungsbereiche">
        <div className="eyebrow">Einstellungen</div>
        {SECTIONS.map((x) => (
          <button key={x.id} className={section === x.id ? "settings-link active" : "settings-link"} onClick={() => setSection(x.id)}>
            {x.label}
          </button>
        ))}
      </nav>
      <div className="settings-content" key={section}>
        {section === "updates" && <UpdatesSection onAccount={() => setSection("account")} />}
        {section === "account" && <AccountSection onOpenAdmin={onOpenAdmin} />}
        {section === "general" && (
          <>
            <h2>Allgemein</h2>
            <div className="setting-list">
              <Row title="Standard-Editor" desc="Womit „In … öffnen“ im Arbeitsbereich dein Projekt öffnet.">
                <Segmented
                  label="Standard-Editor"
                  value={s.defaultIde}
                  options={[
                    { value: "code", label: "VS Code" },
                    { value: "idea", label: "IntelliJ IDEA" },
                  ]}
                  onChange={(v) => updateSettings({ defaultIde: v })}
                />
              </Row>
              <Row title="Speicherort für neue Projekte" desc="Leer lassen für „Dokumente\Anvil Studio“.">
                <ProjectsDirInput value={s.projectsDir} onSave={(v) => updateSettings({ projectsDir: v })} />
              </Row>
            </div>
          </>
        )}
        {section === "appearance" && (
          <>
            <h2>Darstellung</h2>
            <div className="setting-list">
              <Row title="Theme" desc="Hell, dunkel oder automatisch wie Windows.">
                <div className="theme-cards" role="radiogroup" aria-label="Theme">
                  {(
                    [
                      ["dark", "Dunkel"],
                      ["light", "Hell"],
                      ["system", "System"],
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
              <Row title="Akzentfarbe" desc="Farbe für Knöpfe, Markierungen und Fortschritt.">
                <div className="accent-dots" role="radiogroup" aria-label="Akzentfarbe">
                  {(
                    [
                      ["green", "Grün", "#4fb33d"],
                      ["blue", "Blau", "#3f82e6"],
                      ["violet", "Violett", "#8a64ea"],
                      ["orange", "Orange", "#e0802c"],
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
              <Row title="Animationen reduzieren" desc="Schaltet Übergänge und Bewegungen ab.">
                <Toggle label="Animationen reduzieren" checked={s.reduceMotion} onChange={(v) => updateSettings({ reduceMotion: v })} />
              </Row>
              <Row title="Schriftgröße der Konsole" desc={`${s.consoleFontSize} px`}>
                <input
                  type="range"
                  className="range"
                  min={10}
                  max={18}
                  value={s.consoleFontSize}
                  aria-label="Schriftgröße der Konsole"
                  onChange={(e) => updateSettings({ consoleFontSize: Number(e.target.value) })}
                />
              </Row>
            </div>
            <div className="console-preview mono" style={{ fontSize: s.consoleFontSize }}>
              <div className="log info">[Render thread/INFO] Minecraft wird geladen</div>
              <div className="log warn">[Render thread/WARN] Textur fehlt: example_item</div>
              <div className="log success">BUILD SUCCESSFUL in 12s</div>
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
  const last = s.lastUpdateCheck ? new Date(s.lastUpdateCheck * 1000).toLocaleString("de-DE") : "noch nie";
  const busy = u.phase === "checking" || u.phase === "downloading" || u.phase === "installing";

  return (
    <>
      <h2>Updates</h2>

      <div className={`update-hero ${u.phase}`}>
        <div className="update-icon">
          {u.phase === "available" || u.phase === "downloading" || u.phase === "installing" ? <DownloadIcon size={22} /> : <CheckIcon size={22} />}
        </div>
        <div className="grow">
          {u.phase === "available" && u.info ? (
            <>
              <div className="update-title">
                Version {u.info.version} ist verfügbar {u.info.prerelease && <span className="tag">Vorabversion</span>}
              </div>
              <div className="muted small">
                Installiert: {version}
                {u.waitingForIdle && " · wird installiert, sobald kein Spiel oder Build mehr läuft"}
              </div>
            </>
          ) : u.phase === "downloading" ? (
            <>
              <div className="update-title">Update wird heruntergeladen …</div>
              <div className="bar">
                <span style={{ width: `${Math.round((u.progress ?? 0) * 100)}%` }} />
              </div>
            </>
          ) : u.phase === "installing" ? (
            <>
              <div className="update-title">Wird installiert</div>
              <div className="muted small">Anvil Studio schließt sich und startet danach neu.</div>
            </>
          ) : u.phase === "checking" ? (
            <>
              <div className="update-title">Suche nach Updates …</div>
              <div className="bar indeterminate">
                <span />
              </div>
            </>
          ) : u.phase === "error" ? (
            <>
              <div className="update-title">{u.info ? `Update auf ${u.info.version} fehlgeschlagen` : "Update-Prüfung fehlgeschlagen"}</div>
              {u.info && (
                <div className="muted small">
                  Die Verbindung zu GitHub wurde unterbrochen – oft durch Virenscanner, Firewall oder DNS-Filter. Du kannst den Installer auch im Browser laden.
                </div>
              )}
              <div className="error-text small" style={{ whiteSpace: "pre-wrap", userSelect: "text" }}>{u.error}</div>
            </>
          ) : (
            <>
              <div className="update-title">Anvil Studio {version}</div>
              <div className="muted small">Zuletzt geprüft: {last}</div>
            </>
          )}
        </div>
        {u.phase === "error" && u.info && (
          <button className="btn" onClick={() => openGithub(u.info!.htmlUrl)}>
            <ExternalIcon size={14} /> Im Browser herunterladen
          </button>
        )}
        {u.phase === "available" || (u.phase === "error" && u.info) ? (
          <button className="btn primary" onClick={installUpdate}>
            <DownloadIcon size={15} /> {u.phase === "error" ? "Erneut versuchen" : "Jetzt installieren"}
          </button>
        ) : (
          <button className="btn" onClick={() => checkForUpdate(true)} disabled={busy}>
            <RefreshIcon size={15} /> Nach Updates suchen
          </button>
        )}
      </div>

      {u.phase === "available" && u.info?.notes && (
        <div className="notes">
          <div className="side-title">Was ist neu</div>
          <pre>{u.info.notes.slice(0, 4000)}</pre>
        </div>
      )}

      <div className="setting-list">
        <Row title="Nach Updates suchen" desc="Wie oft Anvil Studio auf GitHub nach einer neuen Version schaut.">
          <Segmented label="Nach Updates suchen" value={s.updateCheck} options={CHECK_OPTIONS} onChange={(v) => updateSettings({ updateCheck: v })} />
        </Row>
        <Row title="Updates automatisch installieren" desc="Gefundene Updates direkt herunterladen und installieren. Läuft gerade ein Spiel oder Build, wird gewartet.">
          <Toggle label="Updates automatisch installieren" checked={s.autoInstall} onChange={(v) => updateSettings({ autoInstall: v })} />
        </Row>
        <Row
          title="Update-Kanal"
          desc={
            s.updateChannel === "dev"
              ? "Dev: experimentelle Funktionen für Tester. Kann instabil sein."
              : s.updateChannel === "beta"
                ? "Beta: neue Funktionen früher ausprobieren. Du bekommst auch alle stabilen Versionen."
                : "Stabil: nur getestete Versionen."
          }
        >
          <Segmented
            label="Update-Kanal"
            value={s.updateChannel}
            onChange={(v) => updateSettings({ updateChannel: v })}
            options={[
              { value: "stable", label: "Stabil" },
              { value: "beta", label: "Beta" },
              { value: "dev", label: "Dev", disabled: !tester, title: tester ? undefined : "Nur für angemeldete Tester" },
            ]}
          />
        </Row>
        {!tester && (
          <div className="setting-row hint">
            <div className="muted small">Dev-Versionen gibt es nur für eingeladene Tester mit GitHub-Anmeldung.</div>
            <button className="btn small" onClick={onAccount}>
              <GithubIcon size={14} /> {account ? "Konto ansehen" : "Mit GitHub anmelden"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function AccountSection({ onOpenAdmin }: { onOpenAdmin: () => void }) {
  const account = useAccount();
  return (
    <>
      <h2>Konto</h2>
      {!account ? (
        <div className="panel account-login">
          <div>
            <div className="setting-title">Mit GitHub anmelden</div>
            <div className="muted small">Nötig für Dev-Versionen (nur eingeladene Tester) und den Entwicklerbereich. Anvil Studio bekommt dabei nur Lesezugriff auf das Dev-Repo.</div>
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
              <LogoutIcon size={14} /> Abmelden
            </button>
          </div>
          <div className="setting-list" style={{ marginTop: 16 }}>
            <Row title="Dev-Versionen" desc={account.isTester ? "Du bist als Tester freigeschaltet und kannst den Kanal „Dev“ wählen." : "Kein Zugriff. Wenn du eingeladen wurdest, nimm die Einladung auf GitHub an und melde dich neu an."}>
              {account.isTester ? (
                <span className="tag ch-dev">Tester</span>
              ) : (
                <button className="btn small" onClick={() => openGithub("https://github.com/Basti032002/anvil-studio-dev/invitations")}>
                  <ExternalIcon size={14} /> Einladung öffnen
                </button>
              )}
            </Row>
            {account.isAdmin && (
              <Row title="Entwicklerbereich" desc="Versionen veröffentlichen, Releases, Tester und Builds verwalten.">
                <button className="btn" onClick={onOpenAdmin}>
                  <ShieldIcon size={14} /> Öffnen
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
      <h2>Über</h2>
      <div className="about">
        <div className="about-logo">
          <AnvilLogo size={30} />
        </div>
        <div>
          <div className="update-title">Anvil Studio {version}</div>
          <div className="muted small">Launcher zum Erstellen, Bauen und Testen von Minecraft-Mods.</div>
        </div>
      </div>
      <div className="setting-list" style={{ marginTop: 16 }}>
        <Row title="Entwicklerbereich" desc={admin ? `Angemeldet als ${admin.login}.` : "Versionen veröffentlichen und Releases verwalten. Nur für den Entwickler."}>
          <button className="btn" onClick={onOpenAdmin}>
            <ShieldIcon size={14} /> {admin ? "Öffnen" : "Mit GitHub anmelden"}
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
        aria-label="Speicherort für neue Projekte"
        placeholder="Dokumente\Anvil Studio"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onSave(v)}
      />
      <button
        className="btn"
        onClick={async () => {
          const d = await pickFolder("Standard-Ordner für neue Projekte", v);
          if (d) {
            setV(d);
            onSave(d);
          }
        }}
      >
        <FolderIcon size={14} /> Durchsuchen …
      </button>
    </div>
  );
}
