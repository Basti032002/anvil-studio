import { t } from "../i18n";
import { confirmDialog, contextMenu, showDialog } from "../components/Overlay";
import { useEffect, useState } from "react";
import { api, contentApi, JavaStatus, Project, TASK_LABELS, Task, timeAgo } from "../api";
import { toast } from "../state";

type RemoveMode = "list" | "trash" | "delete";
import { AlertIcon, ArrowRightIcon, CodeIcon, CoffeeIcon, CopyIcon, CubeIcon, FolderIcon, FolderOpenIcon, PlayIcon, PlusIcon, SearchIcon, TrashIcon } from "../icons";
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
  onRemove: (id: string, mode: RemoveMode) => void;
  onImport: () => void;
};

export default function ProjectList({ projects, java, javaProgress, onInstallJava, onOpen, onTest, onNew, onRemove, onImport }: Props) {
  const [query, setQuery] = useState("");
  const running = useAllRunning();
  const opened = (id: string) => Number(localStorage.getItem(`anvil.opened.${id}`) || 0);
  const shown = projects
    .filter((p) => `${p.name} ${p.modId} ${p.path}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Math.max(opened(b.id), b.createdAt) - Math.max(opened(a.id), a.createdAt));

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow">{t("Werkstatt")}</div>
          <h1>{t("Projekte")}</h1>
          {projects.length > 0 && (
            <div className="project-stats" style={{ marginTop: 8 }}>
              <span>
                <b>{projects.length}</b>{t("Projekte")}
              </span>
              <span>
                <b>{Object.keys(running).length}</b>{t("laufen gerade")}
              </span>
              <span>
                <b>{projects.filter((p) => p.lastRun && !p.lastRun.success).length}</b>{t("mit Fehlern")}
              </span>
            </div>
          )}
        </div>
        <div className="row">
          <div className="search">
            <SearchIcon size={15} />
            <label htmlFor="search" className="sr-only">
              {t("Projekte durchsuchen")}
            </label>
            <input id="search" type="search" placeholder={t("Suchen …")} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button className="btn" onClick={onImport}>
            <FolderIcon size={15} />{" "}{t("Importieren")}
          </button>
          <button className="btn primary" onClick={onNew} data-tour="new-project">
            <PlusIcon size={15} />{" "}{t("Neues Projekt")}
          </button>
        </div>
      </header>

      {java && !java.installed && (
        <div className="callout warn">
          <AlertIcon size={18} />
          <div className="grow">
            <div className="callout-title">{java.broken ? t("Java 21 ist beschädigt") : t("Java 21 fehlt noch")}</div>
            <div className="muted small">
              {java.broken
                ? t("Die Installation ist unvollständig (z. B. durch einen abgebrochenen Download). Anvil Studio lädt Java neu und prüft die Datei.")
                : t("Wird zum Bauen und Testen gebraucht. Anvil Studio lädt Eclipse Temurin herunter (ca. 190 MB).")}
            </div>
          </div>
          <button className="btn primary" onClick={onInstallJava} disabled={!!javaProgress}>
            <CoffeeIcon size={14} /> {javaProgress ?? (java.broken ? t("Java reparieren") : t("Jetzt installieren"))}
          </button>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <CubeIcon size={28} />
          </div>
          <h2>{t("Deine Werkbank ist noch leer")}</h2>
          <p className="muted">{t("Lege deine erste Mod an. Anvil Studio lädt die NeoForge-Vorlage und richtet alles ein.")}</p>
          <div className="row center">
            <button className="btn primary" onClick={onNew} data-tour="new-project">
              <PlusIcon size={15} />{" "}{t("Erste Mod erstellen")}
            </button>
            <button className="btn" onClick={onImport}>
              <FolderIcon size={15} />{" "}{t("Bestehendes Projekt importieren")}
            </button>
          </div>
        </div>
      ) : (
        <div className="project-table" role="table" aria-label={t("Projekte")}>
          <div className="project-row head" role="row">
            <span role="columnheader" className="grow">{t("Zuletzt geöffnet")}</span>
            <span role="columnheader" className="pr-ver">{t("Version")}</span>
            <span role="columnheader" className="pr-status">{t("Zustand")}</span>
            <span role="columnheader" className="pr-when">{t("Geöffnet")}</span>
            <span className="pr-actions" />
          </div>
          {shown.map((p, i) => (
            <ProjectCard key={p.id} project={p} index={i} running={running[p.id]?.task as Task | undefined} onOpen={onOpen} onTest={onTest} onRemove={onRemove} />
          ))}
          {shown.length === 0 && <p className="muted" style={{ padding: 12 }}>{t("Keine Treffer für „{query}“.", { query })}</p>}
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
  onRemove: (id: string, mode: RemoveMode) => void;
}) {
  const icon = useProjectIcon(p.id);
  const askRemove = async () => {
    const mode = await showDialog<RemoveMode>({
      title: t("„{name}“ entfernen?", { name: p.name }),
      icon: <TrashIcon size={20} />,
      danger: true,
      message: (
        <>
          {t("Du kannst das Projekt nur aus der Liste nehmen (die Dateien bleiben) oder den Projektordner löschen:")}
          <br />
          <code>{p.path}</code>
        </>
      ),
      actions: [
        { label: t("Nur aus Liste"), value: "list", kind: "ghost" },
        { label: t("In den Papierkorb"), value: "trash" },
        { label: t("Endgültig löschen"), value: "delete", kind: "danger" },
      ],
    });
    if (!mode) return;
    if (mode === "delete") {
      const sure = await confirmDialog(
        t("Wirklich endgültig löschen?"),
        <>{t("Der Ordner wird mit allen Dateien unwiderruflich gelöscht.")}</>,
        t("Endgültig löschen"),
        t("Abbrechen"),
        true,
      );
      if (!sure) return;
    }
    onRemove(p.id, mode);
  };
  const menu = contextMenu(() => [
    { label: t("Öffnen"), icon: <ArrowRightIcon size={15} />, onClick: () => onOpen(p.id) },
    { label: t("Testen"), icon: <PlayIcon size={15} />, onClick: () => onTest(p.id), disabled: !!running },
    "separator",
    { label: t("Im Explorer zeigen"), icon: <FolderOpenIcon size={15} />, onClick: () => api.openIn(p.id, "folder").catch((e) => toast(String(e), "error")) },
    { label: t("In VS Code öffnen"), icon: <CodeIcon size={15} />, onClick: () => api.openIn(p.id, "code").catch((e) => toast(String(e), "error")) },
    { label: t("Pfad kopieren"), icon: <CopyIcon size={15} />, onClick: () => navigator.clipboard.writeText(p.path).then(() => toast(t("Pfad kopiert."), "success")) },
    "separator",
    { label: t("Entfernen …"), icon: <TrashIcon size={15} />, danger: true, onClick: askRemove, disabled: !!running },
  ]);
  const openedAt = Number(localStorage.getItem(`anvil.opened.${p.id}`) || 0);
  return (
    <div className="project-row" role="row" style={{ "--i": index } as React.CSSProperties} {...menu} onDoubleClick={() => onOpen(p.id)}>
      <button className="pr-main grow" onClick={() => onOpen(p.id)} aria-label={t("{name} öffnen", { name: p.name })}>
        <span className="pr-icon">{icon ? <img src={icon} alt="" /> : p.name.slice(0, 1).toUpperCase()}</span>
        <span className="min0">
          <span className="pr-name ellipsis">
            {p.name}
            {running && <span className="card-live inline">{t("läuft")}</span>}
          </span>
          <span className="pr-path mono ellipsis">{p.path}</span>
        </span>
      </button>
      <span className="pr-ver muted small">
        {t("NeoForge")} {p.mcVersion}
      </span>
      <span className="pr-status small">
        <Status project={p} runningTask={running} />
      </span>
      <span className="pr-when muted small">{openedAt ? timeAgo(openedAt) : "—"}</span>
      <span className="pr-actions">
        <button className="btn small primary" onClick={() => onTest(p.id)} disabled={!!running} data-tip={t("Testen")}>
          <PlayIcon size={11} /> {t("Testen")}
        </button>
        <button className="icon-btn" aria-label={t("Entfernen")} data-tip={t("Entfernen")} disabled={!!running} onClick={askRemove}>
          <TrashIcon size={14} />
        </button>
      </span>
    </div>
  );
}

function Status({ project, runningTask }: { project: Project; runningTask?: Task }) {
  if (runningTask) {
    return (
      <div className="status">
        <span className="pulse-dot" /> {TASK_LABELS[runningTask] ?? runningTask}{" "}{t("läuft …")}
      </div>
    );
  }
  const r = project.lastRun;
  if (!r) {
    return (
      <div className="status muted">
        <span className="dot none" />{" "}{t("Noch nie gebaut")}
      </div>
    );
  }
  const label = TASK_LABELS[r.task as Task] ?? r.task;
  return r.success ? (
    <div className="status">
      <span className="dot ok" /> {t("{label} erfolgreich · {time}", { label, time: timeAgo(r.finishedAt) })}
    </div>
  ) : (
    <div className="status error-text">
      <span className="dot fail" /> {t("{label} fehlgeschlagen · {time}", { label, time: timeAgo(r.finishedAt) })}
    </div>
  );
}
