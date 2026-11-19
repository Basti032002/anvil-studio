import { useState } from "react";
import { Project, TASK_LABELS, Task, timeAgo } from "../api";
import { PlayIcon, PlusIcon } from "../icons";
import { useAllRunning } from "../store";

// Farbige Kopfzeile pro Projekt, abgeleitet aus der Mod-ID
const HEADER_COLORS = ["#2B2147", "#3A2A17", "#173A2E", "#1B2E45", "#3D1E2A", "#2E3517"];
function headerColor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HEADER_COLORS[h % HEADER_COLORS.length];
}

type Props = {
  projects: Project[];
  onOpen: (id: string) => void;
  onTest: (id: string) => void;
  onNew: () => void;
  onRemove: (id: string) => void;
};

export default function ProjectList({ projects, onOpen, onTest, onNew, onRemove }: Props) {
  const [query, setQuery] = useState("");
  const running = useAllRunning();
  const shown = projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Projekte</h1>
          <p className="muted">Erstelle Mods, baue sie und teste sie mit einem Klick im Spiel.</p>
        </div>
        <div className="row">
          <label htmlFor="search" className="sr-only">
            Projekte durchsuchen
          </label>
          <input
            id="search"
            className="input"
            type="search"
            placeholder="Projekte durchsuchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn primary" onClick={onNew}>
            <PlusIcon /> Neues Projekt
          </button>
        </div>
      </header>

      {projects.length === 0 ? (
        <div className="empty">
          <h2>Noch keine Projekte</h2>
          <p className="muted">Lege deine erste Mod an. Anvil Studio lädt die NeoForge-Vorlage und richtet alles ein.</p>
          <button className="btn primary" onClick={onNew}>
            <PlusIcon /> Erste Mod erstellen
          </button>
        </div>
      ) : (
        <div className="grid">
          {shown.map((p) => {
            const run = running[p.id];
            return (
              <article className="card" key={p.id}>
                <div className="card-head" style={{ background: headerColor(p.modId) }}>
                  <span>{p.name}</span>
                </div>
                <div className="card-body">
                  <div className="row wrap">
                    <span className="tag">NeoForge</span>
                    <span className="tag">MC {p.mcVersion}</span>
                    <span className="tag mono">{p.modId}</span>
                  </div>
                  <Status project={p} runningTask={run?.task as Task | undefined} />
                  <div className="row">
                    <button className="btn grow" onClick={() => onOpen(p.id)}>
                      Öffnen
                    </button>
                    <button className="btn primary grow" onClick={() => onTest(p.id)} disabled={!!run}>
                      <PlayIcon /> Testen
                    </button>
                  </div>
                  <button
                    className="link subtle"
                    onClick={() => {
                      if (confirm(`„${p.name}“ aus der Liste entfernen? Die Dateien bleiben erhalten.`)) onRemove(p.id);
                    }}
                  >
                    Aus Liste entfernen
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Status({ project, runningTask }: { project: Project; runningTask?: Task }) {
  if (runningTask) {
    return (
      <div className="status">
        <span className="dot run" /> {TASK_LABELS[runningTask] ?? runningTask} läuft …
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
