import { useEffect, useState } from "react";
import { contentApi, JavaStatus, Project, TASK_LABELS, Task, timeAgo } from "../api";
import { AlertIcon, CubeIcon, FolderIcon, PlayIcon, PlusIcon, SearchIcon, TrashIcon } from "../icons";
import { useAllRunning } from "../store";

/** Erste Textur eines Projekts als Symbol (Block bevorzugt). */
function useProjectIcon(projectId: string) {
  const [icon, setIcon] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    contentApi
      .load(projectId)
      .then(async (c) => {
        const pick = c.generatedBlocks[0] ? (["block", c.generatedBlocks[0]] as const) : c.generatedItems[0] ? (["item", c.generatedItems[0]] as const) : null;
        if (!pick) return;
        const b64 = await contentApi.textureGet(projectId, pick[0], pick[1]);
        if (alive && b64) setIcon(`data:image/png;base64,${b64}`);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [projectId]);
  return icon;
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
          {projects.length > 0 && (
            <div className="project-stats" style={{ marginTop: 8 }}>
              <span>
                <b>{projects.length}</b>Projekte
              </span>
              <span>
                <b>{Object.keys(running).length}</b>laufen gerade
              </span>
              <span>
                <b>{projects.filter((p) => p.lastRun && !p.lastRun.success).length}</b>mit Fehlern
              </span>
            </div>
          )}
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
            <div className="callout-title">{java.broken ? "Java 21 ist beschädigt" : "Java 21 fehlt noch"}</div>
            <div className="muted small">
              {java.broken
                ? "Die Installation ist unvollständig (z. B. durch einen abgebrochenen Download). Anvil Studio lädt Java neu und prüft die Datei."
                : "Wird zum Bauen und Testen gebraucht. Anvil Studio lädt Eclipse Temurin herunter (ca. 190 MB)."}
            </div>
          </div>
          <button className="btn primary" onClick={onInstallJava} disabled={!!javaProgress}>
            {javaProgress ?? (java.broken ? "Java reparieren" : "Jetzt installieren")}
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
        <div className="project-grid">
          {shown.map((p, i) => (
            <ProjectCard key={p.id} project={p} index={i} running={running[p.id]?.task as Task | undefined} onOpen={onOpen} onTest={onTest} onRemove={onRemove} />
          ))}
          {shown.length === 0 && <p className="muted">Keine Treffer für „{query}“.</p>}
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  project: p,
  index,
  running,
  onOpen,
  onTest,
  onRemove,
}: {
  project: Project;
  index: number;
  running?: Task;
  onOpen: (id: string) => void;
  onTest: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const icon = useProjectIcon(p.id);
  return (
    <article className="card" style={{ "--i": index } as React.CSSProperties}>
      {running && <span className="card-live">läuft</span>}
      <button className="card-top" onClick={() => onOpen(p.id)} aria-label={`${p.name} öffnen`}>
        <span className="card-icon">{icon ? <img src={icon} alt="" /> : p.name.slice(0, 1).toUpperCase()}</span>
        <span className="min0">
          <div className="card-title ellipsis">{p.name}</div>
          <div className="card-sub mono ellipsis">{p.modId}</div>
        </span>
      </button>
      <div className="card-meta">
        <span className="tag">NeoForge</span>
        <span className="tag">Minecraft {p.mcVersion}</span>
      </div>
      <Status project={p} runningTask={running} />
      <div className="card-actions">
        <button className="btn" onClick={() => onOpen(p.id)}>
          Öffnen
        </button>
        <button className="btn primary" onClick={() => onTest(p.id)} disabled={!!running}>
          <PlayIcon size={12} /> Testen
        </button>
        <button
          className="icon-btn"
          style={{ flex: "none" }}
          aria-label="Aus Liste entfernen"
          data-tip="Aus Liste entfernen"
          onClick={() => {
            if (confirm(`„${p.name}“ aus der Liste entfernen? Die Dateien bleiben erhalten.`)) onRemove(p.id);
          }}
        >
          <TrashIcon size={15} />
        </button>
      </div>
    </article>
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
