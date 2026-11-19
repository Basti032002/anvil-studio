import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";
import { restoreSession, useAccount } from "./admin";
import { api, importProject, JavaStatus, pickFolder, Project } from "./api";
import { ActivityBar, NavKey, StatusBar, TitleBar, Toasts } from "./components/Chrome";
import CommandPalette, { Command } from "./components/CommandPalette";
import { CubeIcon, GearIcon, GridIcon, HammerIcon, PlayIcon, PlusIcon, RefreshIcon, RocketIcon, ShieldIcon, StopIcon } from "./icons";
import { checkForUpdate, toast, useUpdate } from "./state";
import Admin from "./views/Admin";
import NewProject from "./views/NewProject";
import ProjectList from "./views/ProjectList";
import Settings from "./views/Settings";
import Workspace from "./views/Workspace";

/** Befehle an den geöffneten Arbeitsbereich (Palette & Tastenkürzel). */
export function workspaceCommand(cmd: "run" | "stop" | "build") {
  window.dispatchEvent(new CustomEvent("anvil:workspace", { detail: cmd }));
}

export default function App() {
  const [nav, setNav] = useState<NavKey>("projects");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [java, setJava] = useState<JavaStatus | null>(null);
  const [javaProgress, setJavaProgress] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  const update = useUpdate();
  const account = useAccount();
  const admin = account?.isAdmin ?? false;

  const reload = useCallback(async () => {
    try {
      setProjects(await api.listProjects());
      setJava(await api.javaStatus());
    } catch (e) {
      toast(String(e), "error");
    }
  }, []);

  useEffect(() => {
    reload();
    restoreSession();
    // Startbildschirm ausblenden
    const splash = document.getElementById("splash");
    if (splash) {
      splash.classList.add("hide");
      setTimeout(() => splash.remove(), 500);
    }
    const a = listen("run-exit", () => reload());
    const b = listen<{ phase: string; downloaded: number; total: number | null }>("java-progress", (e) => {
      const { phase, downloaded, total } = e.payload;
      const mb = (n: number) => (n / 1024 / 1024).toFixed(0);
      if (phase === "download") setJavaProgress(total ? `Java wird geladen … ${mb(downloaded)} / ${mb(total)} MB` : "Java wird geladen …");
      else if (phase === "extract") setJavaProgress("Java wird entpackt …");
    });
    return () => {
      a.then((f) => f());
      b.then((f) => f());
    };
  }, [reload]);

  // Globale Tastenkürzel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      } else if (mod && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setNav("new");
      } else if (mod && e.key === ",") {
        e.preventDefault();
        setNav("settings");
      } else if (mod && e.key === "1") {
        e.preventDefault();
        setNav("projects");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function installJava() {
    setJavaProgress("Starte Download …");
    try {
      setJava(await api.installJava());
      toast("Java 21 ist installiert.", "success");
    } catch (e) {
      toast(`Java-Installation fehlgeschlagen: ${e}`, "error");
    } finally {
      setJavaProgress(null);
    }
  }

  async function importExisting() {
    const dir = await pickFolder("Ordner eines bestehenden NeoForge-Projekts wählen");
    if (!dir) return;
    try {
      const p = await importProject(dir, true);
      await reload();
      toast(`„${p.name}“ wurde importiert.`, "success");
      openWorkspace(p.id);
    } catch (e) {
      toast(String(e), "error");
    }
  }

  function openWorkspace(id: string, run = false) {
    setWorkspaceId(id);
    setAutoRun(run);
    setNav("workspace");
  }

  const current = workspaceId ? projects.find((p) => p.id === workspaceId) : undefined;
  const subtitle =
    nav === "workspace" && current ? current.name : nav === "settings" ? "Einstellungen" : nav === "admin" ? "Entwicklerbereich" : undefined;

  const commands: Command[] = useMemo(() => {
    const inWs = nav === "workspace" && !!current;
    return [
      { id: "nav-projects", label: "Projekte anzeigen", group: "Navigation", icon: <GridIcon size={15} />, shortcut: "Strg 1", run: () => setNav("projects") },
      { id: "import", label: "Bestehendes Projekt importieren", group: "Navigation", icon: <PlusIcon size={15} />, run: () => importExisting() },
      { id: "nav-new", label: "Neues Projekt erstellen", group: "Navigation", icon: <PlusIcon size={15} />, shortcut: "Strg N", run: () => setNav("new") },
      { id: "nav-settings", label: "Einstellungen öffnen", group: "Navigation", icon: <GearIcon size={15} />, shortcut: "Strg ,", run: () => setNav("settings") },
      { id: "nav-admin", label: admin ? "Entwicklerbereich öffnen" : "Als Entwickler anmelden", group: "Navigation", icon: <ShieldIcon size={15} />, run: () => setNav("admin") },
      { id: "ws-run", label: "Starten", group: "Arbeitsbereich", icon: <PlayIcon size={13} />, shortcut: "F5", disabled: !inWs, run: () => workspaceCommand("run") },
      { id: "ws-stop", label: "Stoppen", group: "Arbeitsbereich", icon: <StopIcon size={13} />, shortcut: "Umschalt F5", disabled: !inWs, run: () => workspaceCommand("stop") },
      { id: "ws-build", label: "Bauen", group: "Arbeitsbereich", icon: <HammerIcon size={15} />, shortcut: "Strg B", disabled: !inWs, run: () => workspaceCommand("build") },
      { id: "upd", label: "Nach Updates suchen", group: "Anvil Studio", icon: <RefreshIcon size={15} />, run: () => checkForUpdate(true) },
      ...(admin
        ? [{ id: "publish", label: "Neue Version veröffentlichen", group: "Entwickler", icon: <RocketIcon size={15} />, run: () => setNav("admin") }]
        : []),
      ...projects.map((p) => ({
        id: `p-${p.id}`,
        label: p.name,
        group: "Projekt öffnen",
        icon: <CubeIcon size={15} />,
        run: () => openWorkspace(p.id),
      })),
      ...projects.map((p) => ({
        id: `t-${p.id}`,
        label: `${p.name} testen`,
        group: "Projekt testen",
        icon: <PlayIcon size={13} />,
        run: () => openWorkspace(p.id, true),
      })),
    ];
  }, [nav, current, projects, admin]);

  return (
    <div className="shell">
      <TitleBar subtitle={subtitle} onSearch={() => setPalette(true)} />
      <div className="shell-body">
        <ActivityBar
          active={nav}
          hasWorkspace={!!current}
          onNavigate={setNav}
          settingsBadge={update.phase === "available"}
          showAdmin={admin}
        />
        <main className="main">
          <div className="view" key={nav === "workspace" ? `ws-${current?.id}` : nav}>
            {nav === "projects" && (
              <ProjectList
                projects={projects}
                java={java}
                javaProgress={javaProgress}
                onInstallJava={installJava}
                onOpen={(id) => openWorkspace(id)}
                onTest={(id) => openWorkspace(id, true)}
                onNew={() => setNav("new")}
                onRemove={async (id) => {
                  await api.removeProject(id);
                  if (id === workspaceId) setWorkspaceId(null);
                  reload();
                }}
                onImport={importExisting}
              />
            )}
            {nav === "new" && (
              <NewProject
                onCancel={() => setNav("projects")}
                onCreated={async (p) => {
                  await reload();
                  toast(`„${p.name}“ wurde erstellt.`, "success");
                  openWorkspace(p.id);
                }}
              />
            )}
            {nav === "workspace" && current && (
              <Workspace project={current} javaReady={!!java?.installed} autoRun={autoRun} onBack={() => setNav("projects")} />
            )}
            {nav === "workspace" && !current && (
              <div className="page">
                <p className="muted">Kein Projekt geöffnet.</p>
              </div>
            )}
            {nav === "settings" && <Settings onOpenAdmin={() => setNav("admin")} />}
            {nav === "admin" && <Admin />}
          </div>
        </main>
      </div>
      <StatusBar java={java} javaProgress={javaProgress} onInstallJava={installJava} onOpenSettings={() => setNav("settings")} />
      <CommandPalette open={palette} onClose={() => setPalette(false)} commands={commands} />
      <Toasts />
    </div>
  );
}
