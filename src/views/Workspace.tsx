import { useEffect, useMemo, useRef, useState } from "react";
import { api, CrashReport, Project, Task, TASK_LABELS } from "../api";
import {
  AlertIcon,
  ChevronIcon,
  CodeIcon,
  DownloadIcon,
  FolderIcon,
  HammerIcon,
  PlayIcon,
  SearchIcon,
  SparkIcon,
  StopIcon,
  TerminalIcon,
  TrashIcon,
} from "../icons";
import { toast, useSettings } from "../state";
import { clearLogs, markNotRunning, markStarted, pushLog, useLastExit, useLogs, useRunning } from "../store";

type Props = { project: Project; javaReady: boolean; autoRun?: boolean; onBack: () => void };

type RunConfig = "client" | "client-world" | "server" | "data";
const RUN_CONFIGS: { id: RunConfig; label: string; task: Task }[] = [
  { id: "client", label: "Client · Hauptmenü", task: "runClient" },
  { id: "client-world", label: "Client · Direkt in Welt", task: "runClient" },
  { id: "server", label: "Dedizierter Server", task: "runServer" },
  { id: "data", label: "Datagen", task: "runData" },
];

type Tab = "output" | "problems" | "crash";

function load(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* egal */
  }
}

export default function Workspace({ project, javaReady, autoRun, onBack }: Props) {
  const settings = useSettings();
  const logs = useLogs(project.id);
  const running = useRunning(project.id);
  const lastExit = useLastExit(project.id);
  const [tab, setTab] = useState<Tab>("output");
  const [config, setConfig] = useState<RunConfig>(() => load(`anvil.config.${project.id}`, "client") as RunConfig);
  const [world, setWorld] = useState(() => load(`anvil.world.${project.id}`, "Dev-Welt"));
  const [filter, setFilter] = useState("");
  const [jars, setJars] = useState<string[]>([]);
  const [crash, setCrash] = useState<CrashReport | null>(null);
  const [exportPending, setExportPending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [open, setOpen] = useState({ project: true, export: true, soon: false });
  const consoleRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const autoRunDone = useRef(false);

  useEffect(() => save(`anvil.config.${project.id}`, config), [config, project.id]);
  useEffect(() => save(`anvil.world.${project.id}`, world), [world, project.id]);

  async function refreshInfo() {
    setJars(await api.listJars(project.id).catch(() => []));
    setCrash(await api.latestCrashReport(project.id).catch(() => null));
  }
  useEffect(() => {
    refreshInfo();
  }, [project.id]);

  useEffect(() => {
    if (!lastExit) return;
    if (!lastExit.success) toast(`${TASK_LABELS[lastExit.task as Task] ?? lastExit.task} ist fehlgeschlagen.`, "error");
    refreshInfo().then(async () => {
      if (exportPending && lastExit.task === "build") {
        setExportPending(false);
        const list = await api.listJars(project.id);
        if (lastExit.success && list.length) {
          const jar = list[list.length - 1];
          pushLog(project.id, `✔ Mod-Datei fertig: ${jar}`);
          toast("Mod-Datei ist fertig gebaut.", "success");
          api.openPath(jar).catch(() => {});
        }
      }
    });
  }, [lastExit?.at]);

  useEffect(() => {
    if (!running) return;
    const tick = () => setElapsed(Math.floor(Date.now() / 1000 - running.startedAt));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [running?.startedAt]);

  useEffect(() => {
    const el = consoleRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [logs.length, tab, filter]);

  async function start(task: Task, opts: { world?: string } = {}) {
    if (!javaReady) {
      toast("Java 21 fehlt noch – installiere es über die Statusleiste unten.", "error");
      return;
    }
    setTab("output");
    try {
      markStarted(project.id, task);
      await api.runTask(project.id, task, opts.world);
    } catch (e) {
      pushLog(project.id, `✖ ${e}`);
      toast(String(e), "error");
      const list = await api.runningTasks();
      if (!list.some((r) => r.projectId === project.id)) markNotRunning(project.id);
    }
  }

  function runSelected() {
    const cfg = RUN_CONFIGS.find((c) => c.id === config) ?? RUN_CONFIGS[0];
    start(cfg.task, { world: cfg.id === "client-world" ? world : undefined });
  }

  useEffect(() => {
    if (autoRun && !autoRunDone.current && !running) {
      autoRunDone.current = true;
      runSelected();
    }
  }, [autoRun]);

  const problems = useMemo(() => logs.filter((l) => l.level === "error" || l.level === "warn"), [logs]);
  const shown = useMemo(() => {
    const base = tab === "problems" ? problems : logs;
    const q = filter.trim().toLowerCase();
    return q ? base.filter((l) => l.line.toLowerCase().includes(q)) : base;
  }, [logs, problems, tab, filter]);

  const ide = settings?.defaultIde ?? "code";
  const ideLabel = ide === "idea" ? "IntelliJ" : "VS Code";
  const otherIde = ide === "idea" ? "code" : "idea";
  const busy = !!running;
  const time = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  const openIde = (target: "code" | "idea" | "folder") => api.openIn(project.id, target).catch((e) => toast(String(e), "error"));

  return (
    <div className="workspace">
      {/* Werkzeugleiste wie in einer IDE */}
      <div className="toolbar">
        <div className="crumbs">
          <button className="crumb" onClick={onBack}>
            Projekte
          </button>
          <ChevronIcon size={12} />
          <span className="crumb current">{project.name}</span>
        </div>

        <div className="run-group">
          <label htmlFor="runcfg" className="sr-only">
            Startkonfiguration
          </label>
          <div className="select-wrap">
            <TerminalIcon size={14} />
            <select id="runcfg" value={config} onChange={(e) => setConfig(e.target.value as RunConfig)} disabled={busy}>
              {RUN_CONFIGS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {busy ? (
            <button className="run-btn stop" onClick={() => api.stopTask(project.id).catch((e) => toast(String(e), "error"))} aria-label="Stoppen" data-tip="Stoppen">
              <StopIcon size={13} />
            </button>
          ) : (
            <button className="run-btn" onClick={runSelected} aria-label="Starten" data-tip="Starten">
              <PlayIcon size={13} />
            </button>
          )}
          <button className="icon-btn" disabled={busy} onClick={() => start("build")} aria-label="Bauen" data-tip="Bauen">
            <HammerIcon size={16} />
          </button>
        </div>

        <div className="row gap-6">
          <button className="btn small" onClick={() => openIde(ide)}>
            <CodeIcon size={14} /> In {ideLabel} öffnen
          </button>
          <button className="icon-btn" onClick={() => openIde(otherIde)} aria-label={`In ${ide === "idea" ? "VS Code" : "IntelliJ"} öffnen`} data-tip={ide === "idea" ? "VS Code" : "IntelliJ"}>
            <CodeIcon size={16} />
          </button>
          <button className="icon-btn" onClick={() => openIde("folder")} aria-label="Ordner öffnen" data-tip="Ordner öffnen">
            <FolderIcon size={16} />
          </button>
        </div>
        <div className={busy ? "run-progress active" : "run-progress"} />
      </div>

      <div className="ws-body">
        {/* Explorer */}
        <aside className="explorer">
          <Section title="Projekt" open={open.project} onToggle={() => setOpen((o) => ({ ...o, project: !o.project }))}>
            <dl className="meta-list">
              <dt>Mod-ID</dt>
              <dd className="mono">{project.modId}</dd>
              <dt>Paket</dt>
              <dd className="mono">{project.package}</dd>
              <dt>Minecraft</dt>
              <dd>{project.mcVersion} · NeoForge</dd>
              <dt>Ordner</dt>
              <dd className="mono path">{project.path}</dd>
            </dl>
          </Section>

          <Section title="Export" open={open.export} onToggle={() => setOpen((o) => ({ ...o, export: !o.export }))}>
            <button
              className="btn small full"
              disabled={busy}
              onClick={() => {
                setExportPending(true);
                start("build");
              }}
            >
              <DownloadIcon size={14} /> .jar bauen
            </button>
            {jars.length > 0 ? (
              <ul className="file-list">
                {jars.map((j) => (
                  <li key={j}>
                    <button className="file" onClick={() => api.openPath(j)}>
                      <span className="file-icon" />
                      <span className="mono">{j.split(/[\\/]/).pop()}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Noch keine Mod-Datei gebaut.</p>
            )}
          </Section>

          <Section title="Bald verfügbar" open={open.soon} onToggle={() => setOpen((o) => ({ ...o, soon: !o.soon }))}>
            <ul className="soon">
              <li>Blöcke &amp; Items per Formular</li>
              <li>Pixel-Editor für Texturen</li>
              <li>Andere Mods mitladen</li>
              <li>Eingebauter Code-Editor</li>
            </ul>
          </Section>
        </aside>

        {/* Konsole */}
        <section className="panel-area">
          <div className="tabs">
            <button className={tab === "output" ? "tab active" : "tab"} onClick={() => setTab("output")}>
              Ausgabe
            </button>
            <button className={tab === "problems" ? "tab active" : "tab"} onClick={() => setTab("problems")}>
              Probleme {problems.length > 0 && <span className="count">{problems.length}</span>}
            </button>
            {crash && (
              <button className={tab === "crash" ? "tab active" : "tab"} onClick={() => setTab("crash")}>
                <AlertIcon size={13} /> Absturz
              </button>
            )}
            <span className="grow" />
            {tab !== "crash" && (
              <>
                <div className="search small">
                  <SearchIcon size={13} />
                  <label htmlFor="logfilter" className="sr-only">
                    Ausgabe filtern
                  </label>
                  <input id="logfilter" placeholder="Filtern …" value={filter} onChange={(e) => setFilter(e.target.value)} />
                </div>
                <button className="icon-btn" aria-label="Ausgabe leeren" data-tip="Leeren" onClick={() => clearLogs(project.id)}>
                  <TrashIcon size={15} />
                </button>
              </>
            )}
          </div>

          {tab === "crash" && crash ? (
            <div className="crash">
              <div className="crash-head">
                <div>
                  <div className="callout-title">Letzter Absturz</div>
                  <div className="muted small">{new Date(crash.modified * 1000).toLocaleString("de-DE")}</div>
                </div>
                <button className="btn small" onClick={() => api.openPath(crash.path)}>
                  Datei öffnen
                </button>
              </div>
              <pre className="crash-body" style={{ fontSize: settings?.consoleFontSize ?? 12 }}>
                {crash.content.slice(0, 20000)}
              </pre>
            </div>
          ) : (
            <div
              className="console"
              ref={consoleRef}
              style={{ fontSize: settings?.consoleFontSize ?? 12 }}
              onScroll={(e) => {
                const el = e.currentTarget;
                stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
              }}
            >
              {shown.length === 0 ? (
                <div className="console-empty">
                  <SparkIcon size={22} />
                  <div>
                    {tab === "problems" ? (
                      "Keine Probleme – sauber!"
                    ) : (
                      <>
                        Drücke <kbd>▶</kbd>, um Minecraft mit deiner Mod zu starten.
                        <br />
                        <span className="muted">Der erste Start dauert einige Minuten, weil Gradle Minecraft und NeoForge lädt.</span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                shown.map((l) => (
                  <div key={l.id} className={`log ${l.level}`}>
                    {l.line}
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* Inspector */}
        <aside className="inspector">
          <div className="side-title">Testlauf</div>
          <div className={running ? "run-card live" : lastExit ? (lastExit.success ? "run-card ok" : "run-card fail") : "run-card"}>
            {running ? (
              <>
                <div className="run-head">
                  <span className="pulse-dot" /> {TASK_LABELS[running.task as Task] ?? running.task}
                </div>
                <div className="run-time mono">{time}</div>
                <button className="btn danger full" onClick={() => api.stopTask(project.id).catch((e) => toast(String(e), "error"))}>
                  <StopIcon size={12} /> Stoppen
                </button>
              </>
            ) : lastExit ? (
              <div className="run-head">
                <span className={lastExit.success ? "dot ok" : "dot fail"} />
                {TASK_LABELS[lastExit.task as Task] ?? lastExit.task} {lastExit.success ? "beendet" : "fehlgeschlagen"}
              </div>
            ) : (
              <div className="muted small">Bereit. Wähle oben eine Konfiguration und drücke ▶.</div>
            )}
          </div>

          <div className="side-title">Testwelt</div>
          <div className="field">
            <label htmlFor="world">Weltname</label>
            <input id="world" className="input" value={world} onChange={(e) => setWorld(e.target.value)} />
          </div>
          <p className="muted small">
            Wird bei „Client · Direkt in Welt“ sofort geladen. Existiert sie noch nicht, starte einmal über das Hauptmenü und lege sie mit
            genau diesem Namen an.
          </p>

          <div className="side-title">Schnellstart</div>
          <div className="quick">
            <button className="quick-btn" disabled={busy} onClick={() => start("runClient")}>
              <PlayIcon size={12} /> Client
            </button>
            <button className="quick-btn" disabled={busy} onClick={() => start("runServer")}>
              <TerminalIcon size={14} /> Server
            </button>
            <button className="quick-btn" disabled={busy} onClick={() => start("runData")}>
              <SparkIcon size={14} /> Datagen
            </button>
            <button className="quick-btn" disabled={busy} onClick={() => start("clean")}>
              <TrashIcon size={14} /> Aufräumen
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className={open ? "section open" : "section"}>
      <button className="section-head" onClick={onToggle} aria-expanded={open}>
        <ChevronIcon size={12} /> {title}
      </button>
      <div className="section-body">
        <div className="section-inner">{children}</div>
      </div>
    </div>
  );
}
