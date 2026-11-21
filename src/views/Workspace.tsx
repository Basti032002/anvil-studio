import LocalizationTab from "./workspace/LocalizationTab";
import VariablesTab from "./workspace/VariablesTab";
import TagsTab from "./workspace/TagsTab";
import { t, translateMessage } from "../i18n";
import { MenuItem, openMenu } from "../components/Overlay";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { api, contentApi, CrashReport, Project, Task, TASK_LABELS } from "../api";
import ContentTab from "./workspace/ContentTab";
import ModsTab from "./workspace/ModsTab";
import ModSettingsTab from "./workspace/ModSettingsTab";
import ExportTab from "./workspace/ExportTab";

const CodeTab = lazy(() => import("./workspace/CodeTab"));
type MainTab = "content" | "code" | "vars" | "tags" | "loc" | "mods" | "settings" | "export" | "console";
import { RefreshIcon, UndoIcon, AlertIcon, CheckIcon, CopyIcon, ChevronIcon, CloseIcon, CodeIcon, CubeIcon, GearIcon, DownloadIcon, FileIcon, FolderIcon, HammerIcon, PackageIcon, PlayIcon, SearchIcon, SparkIcon, StopIcon, TerminalIcon, TranslateIcon, TrashIcon, VariableIcon, TagIcon } from "../icons";
import { toast, useSettings } from "../state";
import { clearLogs, markNotRunning, markStarted, pushLog, useLastExit, useLogs, useRunning } from "../store";

type Props = { project: Project; javaReady: boolean; autoRun?: boolean; onBack: () => void; onChanged?: () => void };

type RunConfig = "client" | "client-world" | "server" | "data";
const RUN_CONFIGS: { id: RunConfig; label: string; task: Task }[] = [
  { id: "client", label: t("Client · Hauptmenü"), task: "runClient" },
  { id: "client-world", label: t("Client · Direkt in Welt"), task: "runClient" },
  { id: "server", label: t("Dedizierter Server"), task: "runServer" },
  { id: "data", label: t("Datagen"), task: "runData" },
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

export default function Workspace({ project, javaReady, autoRun, onBack, onChanged }: Props) {
  const settings = useSettings();
  const logs = useLogs(project.id);
  const running = useRunning(project.id);
  const lastExit = useLastExit(project.id);
  const [tab, setTab] = useState<Tab>("output");
  const [mainTab, setMainTab] = useState<MainTab>(() => (autoRun ? "console" : (load(`anvil.tab.${project.id}`, "content") as MainTab)));
  // andere Bereiche können einen Tab öffnen (z. B. „In Localization öffnen“)
  useEffect(() => {
    const on = (e: Event) => setMainTab((e as CustomEvent<MainTab>).detail);
    window.addEventListener("anvil:open-tab", on);
    return () => window.removeEventListener("anvil:open-tab", on);
  }, []);
  useEffect(() => save(`anvil.tab.${project.id}`, mainTab), [mainTab, project.id]);

  // Beim Öffnen: Projektdaten migrieren, ggf. neu erzeugen
  useEffect(() => {
    contentApi
      .open(project.id)
      .then((notes) => notes.forEach((n) => toast(n, "info", 7000)))
      .catch((e) => toast(String(e), "error"));
  }, [project.id]);
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
  const pendingRestart = useRef(false);

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
    if (pendingRestart.current) {
      pendingRestart.current = false;
      actions.current.run();
      return;
    }
    if (!lastExit.success) toast(t("{v0} ist fehlgeschlagen.", { v0: TASK_LABELS[lastExit.task as Task] ?? lastExit.task }), "error");
    refreshInfo().then(async () => {
      if (exportPending && lastExit.task === "build") {
        setExportPending(false);
        const list = await api.listJars(project.id);
        if (lastExit.success && list.length) {
          const jar = list[list.length - 1];
          pushLog(project.id, t("Mod-Datei fertig: {jar}", { jar: jar }));
          toast(t("Mod-Datei ist fertig gebaut."), "success");
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

  async function start(task: Task, opts: { world?: string; stay?: boolean } = {}) {
    if (!javaReady) {
      toast(t("Java 21 fehlt noch – installiere es über die Statusleiste unten."), "error");
      return;
    }
    setTab("output");
    if (!opts.stay) setMainTab("console");
    try {
      markStarted(project.id, task);
      await api.runTask(project.id, task, opts.world);
    } catch (e) {
      pushLog(project.id, t("Fehler: {e}", { e: e }));
      toast(String(e), "error");
      const list = await api.runningTasks();
      if (!list.some((r) => r.projectId === project.id)) markNotRunning(project.id);
    }
  }

  function runSelected() {
    const cfg = RUN_CONFIGS.find((c) => c.id === config) ?? RUN_CONFIGS[0];
    start(cfg.task, { world: cfg.id === "client-world" ? world : undefined });
  }

  // Tastenkürzel (F5 / Umschalt+F5 / Strg+B) und Befehle aus der Palette
  const runningRef = useRef(running);
  runningRef.current = running;
  const actions = useRef({ run: runSelected, build: () => start("build") });
  actions.current = { run: runSelected, build: () => start("build") };
  useEffect(() => {
    const exec = (cmd: string) => {
      if (cmd === "stop") {
        if (runningRef.current) api.stopTask(project.id).catch((e) => toast(String(e), "error"));
      } else if (cmd === "restart") {
        if (runningRef.current) {
          pendingRestart.current = true;
          api.stopTask(project.id).catch((e) => {
            pendingRestart.current = false;
            toast(String(e), "error");
          });
        } else actions.current.run();
      } else if (!runningRef.current) {
        if (cmd === "run") actions.current.run();
        if (cmd === "build") actions.current.build();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F5") {
        e.preventDefault();
        exec(e.shiftKey ? "stop" : "run");
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r" && runningRef.current) {
        e.preventDefault();
        exec("restart");
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        exec("build");
      }
    };
    const onCmd = (e: Event) => exec((e as CustomEvent<string>).detail);
    window.addEventListener("keydown", onKey);
    window.addEventListener("anvil:workspace", onCmd);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("anvil:workspace", onCmd);
    };
  }, [project.id]);

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
  const ideLabel = ide === "idea" ? t("IntelliJ") : t("VS Code");
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
            {t("Projekte")}
          </button>
          <ChevronIcon size={12} />
          <span className="crumb current">{project.name}</span>
        </div>

        <div className="run-group">
          <label htmlFor="runcfg" className="sr-only">
            {t("Startkonfiguration")}
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
            <button className="run-btn stop" onClick={() => api.stopTask(project.id).catch((e) => toast(String(e), "error"))} aria-label={t("Stoppen")} data-tip={t("Stoppen · Umschalt F5")}>
              <StopIcon size={13} />
            </button>
          ) : (
            <button className="run-btn" onClick={runSelected} aria-label={t("Starten")} data-tip={t("Starten · F5")}>
              <PlayIcon size={13} />
            </button>
          )}
          {running && (running.task === "runClient" || running.task === "runServer") && (
            <>
              <button
                className="icon-btn"
                onClick={() => contentApi.hotReload(project.id).then(() => toast(t("Im laufenden Spiel neu geladen."), "success")).catch((e) => toast(String(e), "error"))}
                aria-label={t("Neu laden")}
                data-tip={t("Texturen, Namen und Rezepte neu laden · ohne Neustart")}
              >
                <RefreshIcon size={16} />
              </button>
              <button
                className="icon-btn"
                onClick={() => window.dispatchEvent(new CustomEvent("anvil:workspace", { detail: "restart" }))}
                aria-label={t("Neu starten")}
                data-tip={t("Spiel neu starten · Strg R")}
              >
                <UndoIcon size={16} />
              </button>
            </>
          )}
          <button className="icon-btn" disabled={busy} onClick={() => start("build")} aria-label={t("Bauen")} data-tip={t("Bauen · Strg B")}>
            <HammerIcon size={16} />
          </button>
        </div>

        <div className="row gap-6">
          <button className="btn small" onClick={() => openIde(ide)}>
            <CodeIcon size={14} />{" "}{t("In {ide} öffnen", { ide: ideLabel })}
          </button>
          <button className="icon-btn" onClick={() => openIde(otherIde)} aria-label={t("In {v0} öffnen", { v0: ide === "idea" ? "VS Code" : "IntelliJ" })} data-tip={ide === "idea" ? t("VS Code") : t("IntelliJ")}>
            <CodeIcon size={16} />
          </button>
          <button className="icon-btn" onClick={() => openIde("folder")} aria-label={t("Ordner öffnen")} data-tip={t("Ordner öffnen")}>
            <FolderIcon size={16} />
          </button>
        </div>
        <div className={busy ? "run-progress active" : "run-progress"} />
      </div>

      <nav className="view-tabs" aria-label={t("Bereiche")}>
        {(
          [
            ["content", t("Inhalte"), <CubeIcon size={14} />],
            ["code", t("Code"), <CodeIcon size={14} />],
            ["vars", t("Variablen"), <VariableIcon size={14} />],
            ["tags", t("Tags"), <TagIcon size={14} />],
            ["loc", t("Localization"), <TranslateIcon size={14} />],
            ["mods", t("Mods"), <PackageIcon size={14} />],
            ["settings", t("Mod-Einstellungen"), <GearIcon size={14} />],
            ["export", t("Export"), <DownloadIcon size={14} />],
            ["console", t("Konsole"), <TerminalIcon size={14} />],
          ] as [MainTab, string, React.ReactNode][]
        ).map(([k, label, icon]) => (
          <button key={k} className={mainTab === k ? "view-tab active" : "view-tab"} onClick={() => setMainTab(k)}>
            {icon}
            {label}
            {k === "console" && busy && <span className="pulse-dot" />}
            {k === "console" && !busy && problems.length > 0 && <span className="count">{problems.length}</span>}
          </button>
        ))}
      </nav>

      {mainTab === "content" && (
        <div className="ws-view">
          <ContentTab project={project} />
        </div>
      )}
      {mainTab === "tags" && (
        <div className="ws-view">
          <TagsTab project={project} />
        </div>
      )}
      {mainTab === "vars" && (
        <div className="ws-view">
          <VariablesTab project={project} />
        </div>
      )}
      {mainTab === "loc" && (
        <div className="ws-view">
          <LocalizationTab project={project} />
        </div>
      )}
      {mainTab === "mods" && (
        <div className="ws-view">
          <ModsTab project={project} />
        </div>
      )}
      {mainTab === "settings" && (
        <div className="ws-view">
          <ModSettingsTab project={project} onSaved={onChanged} />
        </div>
      )}
      {mainTab === "export" && (
        <div className="ws-view">
          <ExportTab
            project={project}
            busy={busy}
            building={!!running && running.task === "build"}
            elapsed={elapsed}
            lastBuild={lastExit && lastExit.task === "build" ? { at: lastExit.at, success: lastExit.success } : null}
            onBuild={() => start("build", { stay: true })}
            onOpenSettings={() => setMainTab("settings")}
          />
        </div>
      )}
      {mainTab === "code" && (
        <div className="ws-view">
          <Suspense fallback={<div className="content-loading muted">{t("Editor wird geladen …")}</div>}>
            <CodeTab project={project} />
          </Suspense>
        </div>
      )}

      <div className="ws-body" style={{ display: mainTab === "console" ? undefined : "none" }}>
        {/* Explorer */}
        <aside className="explorer">
          <Section title={t("Projekt")} open={open.project} onToggle={() => setOpen((o) => ({ ...o, project: !o.project }))}>
            <dl className="meta-list">
              <dt>{t("Mod-ID")}</dt>
              <dd className="mono">{project.modId}</dd>
              <dt>{t("Paket")}</dt>
              <dd className="mono">{project.package}</dd>
              <dt>{t("Minecraft")}</dt>
              <dd>{project.mcVersion}{" "}{t("· NeoForge")}</dd>
              <dt>{t("Ordner")}</dt>
              <dd className="mono path">{project.path}</dd>
            </dl>
          </Section>

          <Section title={t("Export")} open={open.export} onToggle={() => setOpen((o) => ({ ...o, export: !o.export }))}>
            <button
              className="btn small full"
              disabled={busy}
              onClick={() => {
                setExportPending(true);
                start("build");
              }}
            >
              <DownloadIcon size={14} />{" "}{t("Mod-Datei (.jar) bauen")}
            </button>
            {jars.length > 0 ? (
              <ul className="file-list">
                {jars.map((j) => (
                  <li key={j}>
                    <button className="file" onClick={() => api.openPath(j)}>
                      <PackageIcon size={14} />
                      <span className="mono">{j.split(/[\\/]/).pop()}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">{t("Noch keine Mod-Datei gebaut.")}</p>
            )}
          </Section>

          <Section title={t("Bald verfügbar")} open={open.soon} onToggle={() => setOpen((o) => ({ ...o, soon: !o.soon }))}>
            <ul className="soon">
              <li>{t("Blöcke & Items per Formular")}</li>
              <li>{t("Pixel-Editor für Texturen")}</li>
              <li>{t("Andere Mods mitladen")}</li>
              <li>{t("Eingebauter Code-Editor")}</li>
            </ul>
          </Section>
        </aside>

        {/* Konsole */}
        <section className="panel-area">
          <div className="tabs">
            <button className={tab === "output" ? "tab active" : "tab"} onClick={() => setTab("output")}>
              {t("Ausgabe")}
            </button>
            <button className={tab === "problems" ? "tab active" : "tab"} onClick={() => setTab("problems")}>
              {t("Probleme")}{" "}{problems.length > 0 && <span className="count">{problems.length}</span>}
            </button>
            {crash && (
              <button className={tab === "crash" ? "tab active" : "tab"} onClick={() => setTab("crash")}>
                <AlertIcon size={13} />{" "}{t("Absturz")}
              </button>
            )}
            <span className="grow" />
            {tab !== "crash" && (
              <>
                <div className="search small">
                  <SearchIcon size={13} />
                  <label htmlFor="logfilter" className="sr-only">
                    {t("Ausgabe filtern")}
                  </label>
                  <input id="logfilter" placeholder={t("Filtern …")} value={filter} onChange={(e) => setFilter(e.target.value)} />
                </div>
                <button className="icon-btn" aria-label={t("Ausgabe leeren")} data-tip={t("Leeren")} onClick={() => clearLogs(project.id)}>
                  <TrashIcon size={15} />
                </button>
              </>
            )}
          </div>

          {tab === "crash" && crash ? (
            <div className="crash">
              <div className="crash-head">
                <div>
                  <div className="callout-title">{t("Letzter Absturz")}</div>
                  <div className="muted small">{new Date(crash.modified * 1000).toLocaleString("de-DE")}</div>
                </div>
                <button className="btn small" onClick={() => api.openPath(crash.path)}>
                  <FileIcon size={14} />{" "}{t("Datei öffnen")}
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
              onContextMenu={(e) => {
                const line = (e.target as HTMLElement).closest(".log")?.textContent ?? "";
                const sel = window.getSelection()?.toString() ?? "";
                openMenu(e, [
                  ...(sel ? [{ label: t("Auswahl kopieren"), icon: <CopyIcon size={15} />, onClick: () => navigator.clipboard.writeText(sel) } as MenuItem] : []),
                  ...(line ? [{ label: t("Zeile kopieren"), icon: <CopyIcon size={15} />, onClick: () => navigator.clipboard.writeText(line) } as MenuItem] : []),
                  { label: t("Alles kopieren"), icon: <CopyIcon size={15} />, onClick: () => navigator.clipboard.writeText(shown.map((l) => l.line).join("\n")) },
                  "separator",
                  { label: t("Ausgabe leeren"), icon: <TrashIcon size={15} />, onClick: () => clearLogs(project.id) },
                ]);
              }}
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
                      t("Keine Probleme – sauber!")
                    ) : (
                      <>
                        <kbd className="kbd-icon"><PlayIcon size={10} /></kbd> {t("Starte Minecraft mit deiner Mod.")}
                        <br />
                        <span className="muted">{t("Der erste Start dauert einige Minuten, weil Gradle Minecraft und NeoForge lädt.")}</span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                shown.map((l) => (
                  <div key={l.id} className={`log ${l.level}`}>
                    {l.level === "system" && <LogIcon line={l.line} />}
                    {l.level === "system" ? translateMessage(l.line) : l.line}
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* Inspector */}
        <aside className="inspector">
          <div className="side-title">{t("Testlauf")}</div>
          <div className={running ? "run-card live" : lastExit ? (lastExit.success ? "run-card ok" : "run-card fail") : "run-card"}>
            {running ? (
              <>
                <div className="run-head">
                  <span className="pulse-dot" /> {TASK_LABELS[running.task as Task] ?? running.task}
                </div>
                <div className="run-time mono">{time}</div>
                <button className="btn danger full" onClick={() => api.stopTask(project.id).catch((e) => toast(String(e), "error"))}>
                  <StopIcon size={12} />{" "}{t("Stoppen")}
                </button>
              </>
            ) : lastExit ? (
              <div className="run-head">
                <span className={lastExit.success ? "dot ok" : "dot fail"} />
                {TASK_LABELS[lastExit.task as Task] ?? lastExit.task} {lastExit.success ? "beendet" : "fehlgeschlagen"}
              </div>
            ) : (
              <div className="muted small">{t("Bereit. Wähle oben eine Konfiguration und drücke Start.")}</div>
            )}
          </div>

          <div className="side-title">{t("Testwelt")}</div>
          <div className="field">
            <label htmlFor="world">{t("Weltname")}</label>
            <input id="world" className="input" value={world} onChange={(e) => setWorld(e.target.value)} />
          </div>
          <p className="muted small">
            {t("Wird bei „Client · Direkt in Welt“ sofort geladen. Existiert sie noch nicht, starte einmal über das Hauptmenü und lege sie mit genau diesem Namen an.")}
          </p>

          <div className="side-title">{t("Schnellstart")}</div>
          <div className="quick">
            <button className="quick-btn" disabled={busy} onClick={() => start("runClient")}>
              <PlayIcon size={12} />{" "}{t("Client")}
            </button>
            <button className="quick-btn" disabled={busy} onClick={() => start("runServer")}>
              <TerminalIcon size={14} />{" "}{t("Server")}
            </button>
            <button className="quick-btn" disabled={busy} onClick={() => start("runData")}>
              <SparkIcon size={14} />{" "}{t("Datagen")}
            </button>
            <button className="quick-btn" disabled={busy} onClick={() => start("clean")}>
              <TrashIcon size={14} />{" "}{t("Aufräumen")}
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

/** Symbol vor Systemzeilen der Konsole (Start, Ende, Fehler, Datei). */
function LogIcon({ line }: { line: string }) {
  const icon = /^gradlew|zusätzliche Mods/.test(line) ? (
    <PlayIcon size={10} />
  ) : /^Beendet mit Fehler|^Fehler/.test(line) ? (
    <CloseIcon size={11} />
  ) : /^Beendet/.test(line) ? (
    <StopIcon size={10} />
  ) : /^Mod-Datei fertig/.test(line) ? (
    <CheckIcon size={11} />
  ) : null;
  return icon ? <span className="log-icon">{icon}</span> : null;
}
