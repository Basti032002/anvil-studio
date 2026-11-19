import { useState } from "react";
import { UpdateCheck } from "../api";
import { Segmented, Toggle } from "../components/Chrome";
import { AnvilLogo, CheckIcon, DownloadIcon, RefreshIcon } from "../icons";
import { checkForUpdate, installUpdate, updateSettings, useAppVersion, useSettings, useUpdate } from "../state";

type Section = "updates" | "general" | "appearance" | "about";
const SECTIONS: { id: Section; label: string }[] = [
  { id: "updates", label: "Updates" },
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

export default function Settings() {
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
        {section === "updates" && <UpdatesSection />}
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
        {section === "about" && <About />}
      </div>
    </div>
  );
}

function UpdatesSection() {
  const s = useSettings()!;
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
              <div className="update-title">Update-Prüfung fehlgeschlagen</div>
              <div className="error-text small">{u.error}</div>
            </>
          ) : (
            <>
              <div className="update-title">Anvil Studio {version}</div>
              <div className="muted small">Zuletzt geprüft: {last}</div>
            </>
          )}
        </div>
        {u.phase === "available" ? (
          <button className="btn primary" onClick={installUpdate}>
            <DownloadIcon size={15} /> Jetzt installieren
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
        <Row title="Vorabversionen" desc="Auch Beta-Versionen (Pre-Releases) anbieten.">
          <Toggle label="Vorabversionen" checked={s.includePrerelease} onChange={(v) => updateSettings({ includePrerelease: v })} />
        </Row>
      </div>
    </>
  );
}

function About() {
  const version = useAppVersion();
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
          <div className="muted small">Quellcode: github.com/Basti032002/anvil-studio</div>
        </div>
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
    <input
      className="input mono"
      style={{ width: 300 }}
      aria-label="Speicherort für neue Projekte"
      placeholder="Dokumente\Anvil Studio"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
    />
  );
}
