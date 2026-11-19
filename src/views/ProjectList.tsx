import { useState } from "react";
import { JavaStatus, Project, TASK_LABELS, Task, timeAgo } from "../api";
import { AlertIcon, CubeIcon, FolderIcon, PlayIcon, PlusIcon, SearchIcon, TrashIcon } from "../icons";
import { useAllRunning } from "../store";

// Farbton pro Projekt aus der Mod-ID – für den Pixel-Kopf der Karte
const HUES = [265, 32, 150, 210, 340, 90, 190];
function hue(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

type Props = {
  projects: Project[];
  java: JavaStatus | null;
  javaProgress: string | null;
  onInstallJava: () => void;
  onOpen: (id: string) => void;
  onTest: (id: string) => void;
  onNew: () => void;
  onRemove: (id: string) => void;
  onImport: () => void;
};

export default function ProjectList({ projects, java, javaProgress, onInstallJava, onOpen, onTest, onNew, onRemove, onImport }: Props) {
  const [query, setQuery] = useState("");
  const running = useAllRunning();
  const shown = projects.filter((p) => `${p.name} ${p.modId}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow">Werkstatt</div>
          <h1>Projekte</h1>
        </div>
        <div className="row">
          <div className="search">
            <SearchIcon size={15} />
            <label htmlFor="search" className="sr-only">
              Projekte durchsuchen
            </label>
            <input id="search" type="search" placeholder="Suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button className="btn" onClick={onImport}>
            <FolderIcon size={15} /> Importieren
          </button>
          <button className="btn primary" onClick={onNew}>
            <PlusIcon size={15} /> Neues Projekt
          </button>
        </div>
      </header>

      {java && !java.installed && (
        <div className="callout warn">
          <AlertIcon size={18} />
          <div className="grow">
            <div className="callout-title">Java 21 fehlt noch</div>
            <div className="muted small">Wird zum Bauen und Testen gebraucht. Anvil Studio lädt Eclipse Temurin herunter (ca. 190 MB).</div>
          </div>
          <button className="btn primary" onClick={onInstallJava} disabled={!!javaProgress}>
            {javaProgress ?? "Jetzt installieren"}
          </button>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <CubeIcon size={28} />
          </div>
          <h2>Deine Werkbank ist noch leer</h2>
          <p className="muted">Lege deine erste Mod an. Anvil Studio lädt die NeoForge-Vorlage und richtet alles ein.</p>
          <div className="row center">
            <button className="btn primary" onClick={onNew}>
              <PlusIcon size={15} /> Erste Mod erstellen
            </button>
            <button className="btn" onClick={onImport}>
              <FolderIcon size={15} /> Bestehendes Projekt importieren
            </button>
          </div>
        </div>
      ) : (
        <div className="grid">
          {shown.map((p, i) => {
            const run = running[p.id];
            return (
              <article className="card" key={p.id} style={{ "--hue": hue(p.modId), "--i": i } as React.CSSProperties}>
                <button className="card-head" onClick={() => onOpen(p.id)} aria-label={`${p.name} öffnen`}>
                  <span className="card-pixels" aria-hidden="true" />
                  <span className="card-title">{p.name}</span>
                  {run && <span className="card-live">läuft</span>}
                </button>
                <div className="card-body">
                  <div className="row wrap gap-6">
                    <span className="tag">NeoForge</span>
                    <span className="tag">{p.mcVersion}</span>
                    <span className="tag mono">{p.modId}</span>
                  </div>
                  <Status project={p} runningTask={run?.task as Task | undefined} />
                  <div className="row">
                    <button className="btn grow" onClick={() => onOpen(p.id)}>
                      Öffnen
                    </button>
                    <button className="btn primary grow" onClick={() => onTest(p.id)} disabled={!!run}>
                      <PlayIcon size={12} /> Testen
                    </button>
                    <button
                      className="icon-btn"
                      aria-label="Aus Liste entfernen"
                      data-tip="Aus Liste entfernen"
                      onClick={() => {
                        if (confirm(`„${p.name}“ aus der Liste entfernen? Die Dateien bleiben erhalten.`)) onRemove(p.id);
                      }}
                    >
                      <TrashIcon size={15} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {shown.length === 0 && <p className="muted">Keine Treffer für „{query}“.</p>}
        </div>
      )}
    </div>
  );
}

function Status({ project, runningTask }: { project: Project; runningTask?: Task }) {
  if (runningTask) {
    return (
      <div className="status">
        <span className="pulse-dot" /> {TASK_LABELS[runningTask] ?? runningTask} läuft …
      </div>
    );
  }
  const r = project.lastRun;
  if (!r) {
    return (
      <div className="status muted">
        <span className="dot none" /> Noch nie gebaut
      </div>
    );
  }
  const label = TASK_LABELS[r.task as Task] ?? r.task;
  return r.success ? (
    <div className="status">
      <span className="dot ok" /> {label} erfolgreich · {timeAgo(r.finishedAt)}
    </div>
  ) : (
    <div className="status error-text">
      <span className="dot fail" /> {label} fehlgeschlagen · {timeAgo(r.finishedAt)}
    </div>
  );
}
