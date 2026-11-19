import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { api, JavaStatus, Project } from "./api";
import { AnvilLogo } from "./icons";
import { useAllRunning } from "./store";
import NewProject from "./views/NewProject";
import ProjectList from "./views/ProjectList";
import Workspace from "./views/Workspace";

type View = { name: "list" } | { name: "new" } | { name: "workspace"; id: string; autoRun?: boolean };

export default function App() {
  const [view, setView] = useState<View>({ name: "list" });
  const [projects, setProjects] = useState<Project[]>([]);
  const [java, setJava] = useState<JavaStatus | null>(null);
  const [javaProgress, setJavaProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useAllRunning();

  const reload = useCallback(async () => {
    try {
      setProjects(await api.listProjects());
      setJava(await api.javaStatus());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Liste aktualisieren, wenn ein Lauf endet (Status „Build erfolgreich“ usw.)
  useEffect(() => {
    const un = listen("run-exit", () => reload());
    return () => {
      un.then((f) => f());
    };
  }, [reload]);

  useEffect(() => {
    const un = listen<{ phase: string; downloaded: number; total: number | null }>("java-progress", (e) => {
      const { phase, downloaded, total } = e.payload;
      const mb = (n: number) => (n / 1024 / 1024).toFixed(0);
      if (phase === "download") setJavaProgress(total ? `Lade … ${mb(downloaded)} / ${mb(total)} MB` : "Lade …");
      else if (phase === "extract") setJavaProgress("Entpacke …");
      else setJavaProgress(null);
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  async function installJava() {
    setError(null);
    setJavaProgress("Starte Download …");
    try {
      setJava(await api.installJava());
    } catch (e) {
      setError(`Java-Installation fehlgeschlagen: ${e}`);
    } finally {
      setJavaProgress(null);
    }
  }

  const current = view.name === "workspace" ? projects.find((p) => p.id === view.id) : undefined;
  const runningCount = Object.keys(running).length;

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          <AnvilLogo />
          <span>Anvil Studio</span>
        </div>
        <div className="nav">
          <button className={view.name !== "new" ? "nav-item active" : "nav-item"} onClick={() => setView({ name: "list" })}>
            Projekte
          </button>
          <button className={view.name === "new" ? "nav-item active" : "nav-item"} onClick={() => setView({ name: "new" })}>
            Neues Projekt
          </button>
        </div>

        <div className="env-box">
          <div className="env-title">Umgebung</div>
          <div className="env-row">
            <span>Java {java?.version ?? 21} (Temurin)</span>
            {java?.installed ? <span className="ok">bereit</span> : <span className="warn">fehlt</span>}
          </div>
          {java && !java.installed && (
            <button className="btn small primary" disabled={!!javaProgress} onClick={installJava}>
              {javaProgress ?? "Java installieren"}
            </button>
          )}
          <div className="env-row">
            <span>Laufende Prozesse</span>
            <span className={runningCount ? "ok" : ""}>{runningCount}</span>
          </div>
          <div className="env-row">
            <span>Testkonto</span>
            <span>Offline · Dev</span>
          </div>
        </div>
      </nav>

      <main className="content">
        {error && (
          <div className="banner error" role="alert">
            <span>{error}</span>
            <button className="link" onClick={() => setError(null)}>
              Schließen
            </button>
          </div>
        )}
        {view.name === "list" && (
          <ProjectList
            projects={projects}
            onOpen={(id) => setView({ name: "workspace", id })}
            onTest={(id) => setView({ name: "workspace", id, autoRun: true })}
            onNew={() => setView({ name: "new" })}
            onRemove={async (id) => {
              await api.removeProject(id);
              reload();
            }}
          />
        )}
        {view.name === "new" && (
          <NewProject
            onCancel={() => setView({ name: "list" })}
            onCreated={async (p) => {
              await reload();
              setView({ name: "workspace", id: p.id });
            }}
          />
        )}
        {view.name === "workspace" && current && (
          <Workspace
            key={current.id}
            project={current}
            javaReady={!!java?.installed}
            autoRun={view.autoRun}
            onBack={() => setView({ name: "list" })}
            onError={setError}
          />
        )}
      </main>
    </div>
  );
}
