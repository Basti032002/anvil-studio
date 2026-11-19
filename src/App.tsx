import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { api, JavaStatus, Project } from "./api";
import { ActivityBar, NavKey, StatusBar, TitleBar, Toasts } from "./components/Chrome";
import { toast, useUpdate } from "./state";
import NewProject from "./views/NewProject";
import ProjectList from "./views/ProjectList";
import Settings from "./views/Settings";
import Workspace from "./views/Workspace";

export default function App() {
  const [nav, setNav] = useState<NavKey>("projects");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [java, setJava] = useState<JavaStatus | null>(null);
  const [javaProgress, setJavaProgress] = useState<string | null>(null);
  const update = useUpdate();

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

  function openWorkspace(id: string, run = false) {
    setWorkspaceId(id);
    setAutoRun(run);
    setNav("workspace");
  }

  const current = workspaceId ? projects.find((p) => p.id === workspaceId) : undefined;
  const subtitle = nav === "workspace" && current ? current.name : nav === "settings" ? "Einstellungen" : undefined;

  return (
    <div className="shell">
      <TitleBar subtitle={subtitle} />
      <div className="shell-body">
        <ActivityBar
          active={nav}
          hasWorkspace={!!current}
          onNavigate={setNav}
          settingsBadge={update.phase === "available"}
        />
        <main className="main">
          {/* key sorgt für die Einblend-Animation bei jedem Ansichtswechsel */}
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
            {nav === "settings" && <Settings />}
          </div>
        </main>
      </div>
      <StatusBar java={java} javaProgress={javaProgress} onInstallJava={installJava} onOpenSettings={() => setNav("settings")} />
      <Toasts />
    </div>
  );
}
