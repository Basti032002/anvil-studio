import LocalizationTab from "./workspace/LocalizationTab";
import { BetaBadge, type FeatureId } from "../features";
import { UndoButtons } from "../components/UndoButtons";
import VariablesTab from "./workspace/VariablesTab";
import TagsTab from "./workspace/TagsTab";
import TexturesTab from "./workspace/TexturesTab";
import { t } from "../i18n";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { api, contentApi, CrashReport, Project, Task, TASK_LABELS } from "../api";
import ContentTab from "./workspace/ContentTab";
import ModsTab from "./workspace/ModsTab";
import ModSettingsTab from "./workspace/ModSettingsTab";
import ExportTab from "./workspace/ExportTab";
import ConsoleView from "./workspace/ConsoleView";

const CodeTab = lazy(() => import("./workspace/CodeTab"));
type MainTab = "content" | "textures" | "code" | "vars" | "tags" | "loc" | "mods" | "settings" | "export" | "console";
import { RefreshIcon, UndoIcon, ChevronIcon, CodeIcon, CubeIcon, GearIcon, DownloadIcon, FolderIcon, HammerIcon, PackageIcon, PlayIcon, StopIcon, TerminalIcon, TranslateIcon, VariableIcon, TagIcon, ImageIcon } from "../icons";
import { toast, useSettings } from "../state";
import { markNotRunning, markStarted, pushLog, useLastExit, useLogs, useRunning } from "../store";

type Props = { project: Project; javaReady: boolean; autoRun?: boolean; onBack: () => void; onChanged?: () => void };

type RunConfig = "client" | "client-world" | "server" | "data";
const RUN_CONFIGS: { id: RunConfig; label: string; task: Task }[] = [
  { id: "client", label: t("Client · Hauptmenü"), task: "runClient" },
  { id: "client-world", label: t("Client · Direkt in Welt"), task: "runClient" },
  { id: "server", label: t("Dedizierter Server"), task: "runServer" },
  { id: "data", label: t("Datagen"), task: "runData" },
];


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

const TAB_FEATURE: Partial<Record<string, FeatureId>> = { textures: "textures", vars: "variables", tags: "tags", code: "code", loc: "loc", mods: "mods", settings: "modsettings", export: "export" };

export default function Workspace({ project, javaReady, autoRun, onBack, onChanged }: Props) {
  const settings = useSettings();
  const logs = useLogs(project.id);
  const running = useRunning(project.id);
  const lastExit = useLastExit(project.id);
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
  const [jars, setJars] = useState<string[]>([]);
  const [crash, setCrash] = useState<CrashReport | null>(null);
  const [exportPending, setExportPending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
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

  async function start(task: Task, opts: { world?: string; stay?: boolean } = {}) {
    if (!javaReady) {
      toast(t("Java 21 fehlt noch – installiere es über die Statusleiste unten."), "error");
      return;
    }
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

  const ide = settings?.defaultIde ?? "code";
  const ideLabel = ide === "idea" ? t("IntelliJ") : t("VS Code");
  const otherIde = ide === "idea" ? "code" : "idea";
  const busy = !!running;

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
          <UndoButtons />
        </div>

        <div className="run-group" data-tour="run">
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
                <BetaBadge feature="hotreload" />
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
            ["textures", t("Texturen"), <ImageIcon size={14} />],
            "|",
            ["vars", t("Variablen"), <VariableIcon size={14} />],
            ["tags", t("Tags"), <TagIcon size={14} />],
            ["code", t("Code"), <CodeIcon size={14} />],
            "|",
            ["loc", t("Sprachen"), <TranslateIcon size={14} />],
            ["mods", t("Mods"), <PackageIcon size={14} />],
            ["settings", t("Mod-Einstellungen"), <GearIcon size={14} />],
            ["export", t("Export"), <DownloadIcon size={14} />],
          ] as ([MainTab, string, React.ReactNode] | "|")[]
        ).map((x, i) =>
          x === "|" ? (
            <span key={`sep${i}`} className="view-tab-sep" aria-hidden="true" />
          ) : (
            <button key={x[0]} className={mainTab === x[0] ? "view-tab active" : "view-tab"} onClick={() => setMainTab(x[0])} data-tour={`tab-${x[0]}`}>
              {x[2]}
              {x[1]}
              <BetaBadge feature={TAB_FEATURE[x[0]]} />
            </button>
          ),
        )}
        <span className="grow" />
        <button
          data-tour="tab-console"
          className={["view-tab", "console-tab", mainTab === "console" ? "active" : "", busy ? "running" : problems.length > 0 ? "problems" : ""].join(" ")}
          onClick={() => setMainTab("console")}
        >
          <TerminalIcon size={14} />
          {t("Konsole")}
          <BetaBadge feature="console" />
          {busy && <span className="console-tab-state"><span className="pulse-dot" />{t("läuft")}</span>}
          {!busy && problems.length > 0 && <span className="count">{problems.length}</span>}
        </button>
      </nav>

      {mainTab === "content" && (
        <div className="ws-view">
          <ContentTab project={project} />
        </div>
      )}
      {mainTab === "textures" && (
        <div className="ws-view">
          <TexturesTab project={project} />
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
        <ConsoleView
          project={project}
          logs={logs}
          running={running}
          lastExit={lastExit}
          elapsed={elapsed}
          crash={crash}
          jars={jars}
          fontSize={settings?.consoleFontSize ?? 12}
          world={world}
          onWorld={setWorld}
          onStart={(task) => start(task)}
          onRun={runSelected}
          onStop={() => api.stopTask(project.id).catch((e) => toast(String(e), "error"))}
          onRestart={() => window.dispatchEvent(new CustomEvent("anvil:workspace", { detail: "restart" }))}
          onReload={() => contentApi.hotReload(project.id).then(() => toast(t("Im laufenden Spiel neu geladen."), "success")).catch((e) => toast(String(e), "error"))}
          onBuildJar={() => {
            setExportPending(true);
            start("build");
          }}
          javaReady={javaReady}
        />
      </div>
    </div>
  );
}
