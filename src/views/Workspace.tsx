import { useEffect, useMemo, useRef, useState } from "react";
import { api, CrashReport, Project, Task, TASK_LABELS } from "../api";
import { HammerIcon, PlayIcon, StopIcon } from "../icons";
import { clearLogs, markNotRunning, markStarted, pushLog, useLastExit, useLogs, useRunning } from "../store";

type Props = {
  project: Project;
  javaReady: boolean;
  autoRun?: boolean;
  onBack: () => void;
  onError: (msg: string) => void;
};

type Filter = "all" | "problems";
type Mode = "menu" | "world";

function load(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* egal */
  }
}

export default function Workspace({ project, javaReady, autoRun, onBack, onError }: Props) {
  const logs = useLogs(project.id);
  const running = useRunning(project.id);
  const lastExit = useLastExit(project.id);
  const [filter, setFilter] = useState<Filter>("all");
  const [mode, setMode] = useState<Mode>(() => load(`anvil.mode.${project.id}`, "menu") as Mode);
  const [world, setWorld] = useState(() => load(`anvil.world.${project.id}`, "Dev-Welt"));
  const [jars, setJars] = useState<string[]>([]);
  const [crash, setCrash] = useState<CrashReport | null>(null);
  const [exportPending, setExportPending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const consoleRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const autoRunDone = useRef(false);

  useEffect(() => store(`anvil.mode.${project.id}`, mode), [mode, project.id]);
  useEffect(() => store(`anvil.world.${project.id}`, world), [world, project.id]);

  async function refreshInfo() {
    setJars(await api.listJars(project.id).catch(() => []));
    setCrash(await api.latestCrashReport(project.id).catch(() => null));
  }

  useEffect(() => {
    refreshInfo();
  }, [project.id]);

  // Nach jedem Lauf: Jars/Crash-Reports neu einlesen, Export abschließen
  useEffect(() => {
    if (!lastExit) return;
    refreshInfo().then(async () => {
      if (exportPending && lastExit.task === "build") {
        setExportPending(false);
        const list = await api.listJars(project.id);
        if (lastExit.success && list.length) {
          pushLog(project.id, `✔ Mod-Datei fertig: ${list[list.length - 1]}`);
          api.openPath(list[list.length - 1]).catch(() => {});
        }
      }
    });
  }, [lastExit?.at]);

  // Laufzeit-Anzeige
  useEffect(() => {
    if (!running) return;
    const tick = () => setElapsed(Math.floor(Date.now() / 1000 - running.startedAt));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [running?.startedAt]);

  // Konsole automatisch nach unten scrollen, solange man unten ist
  useEffect(() => {
    const el = consoleRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [logs.length, filter]);

  async function start(task: Task) {
    if (!javaReady) {
      onError("Java 21 fehlt noch – installiere es unten links unter „Umgebung“.");
      return;
    }
    try {
      markStarted(project.id, task);
      await api.runTask(project.id, task, task === "runClient" && mode === "world" ? world : undefined);
    } catch (e) {
      pushLog(project.id, `✖ ${e}`);
      onError(String(e));
      // Fehlstart: Markierung entfernen, falls im Backend nichts läuft
      const list = await api.runningTasks();
      if (!list.some((r) => r.projectId === project.id)) markNotRunning(project.id);
    }
  }

  useEffect(() => {
    if (autoRun && !autoRunDone.current && !running) {
      autoRunDone.current = true;
      start("runClient");
    }
  }, [autoRun]);

  const shown = useMemo(
    () => (filter === "all" ? logs : logs.filter((l) => l.level === "error" || l.level === "warn")),
    [logs, filter],
  );
  const problemCount = useMemo(() => logs.filter((l) => l.level === "error" || l.level === "warn").length, [logs]);

  const busy = !!running;
  const mins = Math.floor(elapsed / 60);
  const secs = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="workspace">
      <header className="ws-header">
        <div className="row">
          <button className="link" onClick={onBack}>
            ← Projekte
          </button>
          <div>
            <div className="ws-title">{project.name}</div>
            <div className="muted small">
              NeoForge · MC {project.mcVersion} · Java 21 · <span className="mono">{project.modId}</span>
            </div>
          </div>
        </div>
        <div className="row wrap">
          <button className="btn" onClick={() => api.openIn(project.id, "code").catch((e) => onError(String(e)))}>
            VS Code
          </button>
          <button className="btn" onClick={() => api.openIn(project.id, "idea").catch((e) => onError(String(e)))}>
            IntelliJ
          </button>
          <button className="btn dark" disabled={busy} onClick={() => start("build")}>
            <HammerIcon /> Bauen
          </button>
          <button className="btn dark" disabled={busy} onClick={() => start("runData")}>
            Datagen
          </button>
          <button className="btn dark" disabled={busy} onClick={() => start("runServer")}>
            Server
          </button>
          <div className="split">
            <button className="btn primary split-main" disabled={busy} onClick={() => start("runClient")}>
              <PlayIcon /> Testen
            </button>
            <label htmlFor="mode" className="sr-only">
              Testmodus
            </label>
            <select id="mode" className="split-select" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
              <option value="menu">Hauptmenü</option>
              <option value="world">Direkt in Welt</option>
            </select>
          </div>
        </div>
      </header>

      <div className="ws-body">
        <aside className="ws-side">
          <div className="side-title">PROJEKT</div>
          <dl className="info">
            <dt>Mod-ID</dt>
            <dd className="mono">{project.modId}</dd>
            <dt>Paket</dt>
            <dd className="mono">{project.package}</dd>
            <dt>Ordner</dt>
            <dd className="mono path">{project.path}</dd>
          </dl>
          <button className="btn small" onClick={() => api.openIn(project.id, "folder").catch((e) => onError(String(e)))}>
            Ordner öffnen
          </button>

          <div className="side-title">MOD EXPORTIEREN</div>
          <button
            className="btn small"
            disabled={busy}
            onClick={() => {
              setExportPending(true);
              start("build");
            }}
          >
            .jar bauen &amp; anzeigen
          </button>
          {jars.length > 0 && (
            <ul className="file-list">
              {jars.map((j) => (
                <li key={j}>
                  <button className="link mono small" onClick={() => api.openPath(j)}>
                    {j.split(/[\\/]/).pop()}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="side-title">BALD VERFÜGBAR</div>
          <ul className="soon">
            <li>Blöcke &amp; Items per Formular</li>
            <li>Pixel-Editor für Texturen</li>
            <li>Andere Mods mitladen (JEI …)</li>
            <li>Eingebauter Code-Editor</li>
          </ul>
        </aside>

        <section className="ws-main">
          <div className="console-tabs">
            <button className={filter === "all" ? "tab active" : "tab"} onClick={() => setFilter("all")}>
              Ausgabe
            </button>
            <button className={filter === "problems" ? "tab active" : "tab"} onClick={() => setFilter("problems")}>
              Probleme {problemCount > 0 && <span className="badge">{problemCount}</span>}
            </button>
            <span className="grow" />
            <button className="tab" onClick={() => clearLogs(project.id)}>
              Leeren
            </button>
          </div>
          <div
            className="console"
            ref={consoleRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
          >
            {shown.length === 0 ? (
              <div className="console-empty">
                Noch keine Ausgabe. Klicke auf <b>Testen</b>, um Minecraft mit deiner Mod zu starten. Der erste Start dauert
                einige Minuten, weil Gradle Minecraft und NeoForge herunterlädt.
              </div>
            ) : (
              shown.map((l) => (
                <div key={l.id} className={`log ${l.level}`}>
                  {l.line}
                </div>
              ))
            )}
          </div>
        </section>

        <aside className="ws-run">
          <div className="side-title">TESTLAUF</div>
          {running ? (
            <div className="run-card active">
              <div className="run-head">
                <span className="dot run" /> {TASK_LABELS[running.task as Task] ?? running.task} läuft
              </div>
              <div className="muted small">
                seit {mins}:{secs} min
              </div>
              <button className="btn danger" onClick={() => api.stopTask(project.id).catch((e) => onError(String(e)))}>
                <StopIcon /> Stoppen
              </button>
            </div>
          ) : lastExit ? (
            <div className={lastExit.success ? "run-card ok" : "run-card fail"}>
              <div className="run-head">
                <span className={lastExit.success ? "dot ok" : "dot fail"} />
                {TASK_LABELS[lastExit.task as Task] ?? lastExit.task} {lastExit.success ? "beendet" : "fehlgeschlagen"}
              </div>
            </div>
          ) : (
            <div className="run-card">
              <div className="muted small">Bereit zum Testen.</div>
            </div>
          )}

          <div className="side-title">BEIM START</div>
          <div className="field">
            <label htmlFor="world">Testwelt</label>
            <input
              id="world"
              className="input"
              value={world}
              disabled={mode !== "world"}
              onChange={(e) => setWorld(e.target.value)}
            />
          </div>
          <p className="muted small">
            „Direkt in Welt“ lädt diese Welt sofort. Gibt es sie noch nicht, starte einmal mit „Hauptmenü“ und lege sie im
            Spiel mit genau diesem Namen an.
          </p>

          {crash && (
            <>
              <div className="side-title">LETZTER ABSTURZ</div>
              <div className="run-card fail">
                <div className="small">{new Date(crash.modified * 1000).toLocaleString("de-DE")}</div>
                <pre className="crash-snippet">{crashSummary(crash.content)}</pre>
                <button className="btn small" onClick={() => api.openPath(crash.path)}>
                  Crash-Report öffnen
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

// Die wichtigsten Zeilen aus dem Crash-Report: Beschreibung + erste Exception
function crashSummary(text: string) {
  const lines = text.split(/\r?\n/);
  const desc = lines.find((l) => l.startsWith("Description:")) ?? "";
  const ex = lines.find((l) => /Exception|Error/.test(l) && !l.startsWith("Description")) ?? "";
  return [desc, ex].filter(Boolean).join("\n").slice(0, 400);
}
