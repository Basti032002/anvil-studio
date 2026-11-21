import { Tooltips } from "./components/Tooltips";
import { installUndoKeys } from "./undo";
import { t, takeReturnNav } from "./i18n";
import { ContextMenuHost, DialogHost } from "./components/Overlay";
import PatchNotesDialog from "./components/PatchNotes";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { restoreSession, useAccount } from "./admin";
import { api, importProject, JavaStatus, pickFolder, Project } from "./api";
import { ActivityBar, NavKey, StatusBar, TitleBar, Toasts } from "./components/Chrome";
import CommandPalette, { Command } from "./components/CommandPalette";
import { WorkshopIcon, CubeIcon, GearIcon, GridIcon, HammerIcon, PlayIcon, PlusIcon, RefreshIcon, RocketIcon, ShieldIcon, StopIcon } from "./icons";
import { checkForUpdate, toast, useSettings, useUpdate } from "./state";
import Admin from "./views/Admin";
import NewProject from "./views/NewProject";
import ProjectList from "./views/ProjectList";
import Settings from "./views/Settings";
import Workspace from "./views/Workspace";
import Workshop from "./views/Workshop";
import { refreshWorkshop, useWorkshop } from "./workshop";
import { settingsApi } from "./api";

/** Befehle an den geöffneten Arbeitsbereich (Palette & Tastenkürzel). */
export function workspaceCommand(cmd: "run" | "stop" | "build") {
  window.dispatchEvent(new CustomEvent("anvil:workspace", { detail: cmd }));
}

const EDIT_LABELS = { cut: t("Ausschneiden"), copy: t("Kopieren"), paste: t("Einfügen"), selectAll: t("Alles markieren") };

export default function App() {
  const [returnNav] = useState(() => takeReturnNav());
  const [nav, setNavRaw] = useState<NavKey>(() => (returnNav === "settings" ? "settings" : "projects"));
  const navigated = useRef(false);
  const setNav = useCallback((k: NavKey) => {
    navigated.current = true;
    setNavRaw(k);
  }, []);
  const ws = useWorkshop();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [java, setJava] = useState<JavaStatus | null>(null);
  const [javaProgress, setJavaProgress] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  const update = useUpdate();
  const account = useAccount();
  const admin = account?.isAdmin ?? false;
  const settings = useSettings();
  // Workshop ausgeschaltet: nur Admins sehen ihn noch
  const workshopVisible = settings?.workshopEnabled !== false || admin || !!ws.me?.admin;
  useEffect(() => installUndoKeys(), []);
  useEffect(() => {
    if (!workshopVisible && nav === "workshop") setNavRaw("projects");
  }, [workshopVisible, nav]);

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
    refreshWorkshop();
    // Startseite aus den Einstellungen
    if (!returnNav)
      settingsApi
        .get()
        .then((s) => {
          if (!navigated.current && s.startPage === "workshop" && s.workshopEnabled !== false) setNavRaw("workshop");
        })
        .catch(() => {});
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
      if (phase === "download") setJavaProgress(total ? t("Java wird geladen … {v0} / {v1} MB", { v0: mb(downloaded), v1: mb(total) }) : t("Java wird geladen …"));
      else if (phase === "extract") setJavaProgress(t("Java wird entpackt …"));
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
    setJavaProgress(t("Starte Download …"));
    try {
      setJava(await api.installJava());
      toast(t("Java 21 ist installiert."), "success");
    } catch (e) {
      toast(t("Java-Installation fehlgeschlagen: {e}", { e: e }), "error");
    } finally {
      setJavaProgress(null);
    }
  }

  async function importExisting() {
    const dir = await pickFolder(t("Ordner eines bestehenden NeoForge-Projekts wählen"));
    if (!dir) return;
    try {
      const p = await importProject(dir, true);
      await reload();
      toast(t("„{name}“ wurde importiert.", { name: p.name }), "success");
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
    nav === "workspace" && current ? current.name : nav === "settings" ? t("Einstellungen") : nav === "admin" ? t("Entwicklerbereich") : nav === "workshop" ? t("Workshop") : undefined;

  const commands: Command[] = useMemo(() => {
    const inWs = nav === "workspace" && !!current;
    return [
      { id: "nav-workshop", label: t("Workshop öffnen"), group: t("Navigation"), icon: <WorkshopIcon size={15} />, run: () => setNav("workshop") },
      { id: "nav-projects", label: t("Projekte anzeigen"), group: t("Navigation"), icon: <GridIcon size={15} />, shortcut: t("Strg 1"), run: () => setNav("projects") },
      { id: "import", label: t("Bestehendes Projekt importieren"), group: t("Navigation"), icon: <PlusIcon size={15} />, run: () => importExisting() },
      { id: "nav-new", label: t("Neues Projekt erstellen"), group: t("Navigation"), icon: <PlusIcon size={15} />, shortcut: t("Strg N"), run: () => setNav("new") },
      { id: "nav-settings", label: t("Einstellungen öffnen"), group: t("Navigation"), icon: <GearIcon size={15} />, shortcut: t("Strg ,"), run: () => setNav("settings") },
      { id: "nav-admin", label: admin ? t("Entwicklerbereich öffnen") : t("Als Entwickler anmelden"), group: t("Navigation"), icon: <ShieldIcon size={15} />, run: () => setNav("admin") },
      { id: "ws-run", label: t("Starten"), group: t("Arbeitsbereich"), icon: <PlayIcon size={13} />, shortcut: "F5", disabled: !inWs, run: () => workspaceCommand("run") },
      { id: "ws-stop", label: t("Stoppen"), group: t("Arbeitsbereich"), icon: <StopIcon size={13} />, shortcut: t("Umschalt F5"), disabled: !inWs, run: () => workspaceCommand("stop") },
      { id: "ws-build", label: t("Bauen"), group: t("Arbeitsbereich"), icon: <HammerIcon size={15} />, shortcut: t("Strg B"), disabled: !inWs, run: () => workspaceCommand("build") },
      { id: "upd", label: t("Nach Updates suchen"), group: t("Anvil Studio"), icon: <RefreshIcon size={15} />, run: () => checkForUpdate(true) },
      ...(admin
        ? [{ id: "publish", label: t("Neue Version veröffentlichen"), group: t("Entwickler"), icon: <RocketIcon size={15} />, run: () => setNav("admin") }]
        : []),
      ...projects.map((p) => ({
        id: `p-${p.id}`,
        label: p.name,
        group: t("Projekt öffnen"),
        icon: <CubeIcon size={15} />,
        run: () => openWorkspace(p.id),
      })),
      ...projects.map((p) => ({
        id: `t-${p.id}`,
        label: `${p.name} testen`,
        group: t("Projekt testen"),
        icon: <PlayIcon size={13} />,
        run: () => openWorkspace(p.id, true),
      })),
    ];
  }, [nav, current, projects, admin]);

  return (
    <div className="shell">
      <Tooltips />
      <TitleBar subtitle={subtitle} onSearch={() => setPalette(true)} />
      <div className="shell-body">
        <ActivityBar
          active={nav}
          hasWorkspace={!!current}
          onNavigate={setNav}
          settingsBadge={update.phase === "available"}
          showAdmin={admin || !!ws.me?.admin}
          showWorkshop={workshopVisible}
        />
        <main className="main">
          <div className="view" key={nav === "workspace" ? `ws-${current?.id}` : nav}>
            {nav === "workshop" && (
              <Workshop
                projects={projects}
                onOpenProject={async (p) => {
                  await reload();
                  openWorkspace(p.id);
                }}
              />
            )}
            {nav === "projects" && (
              <ProjectList
                projects={projects}
                java={java}
                javaProgress={javaProgress}
                onInstallJava={installJava}
                onOpen={(id) => openWorkspace(id)}
                onTest={(id) => openWorkspace(id, true)}
                onNew={() => setNav("new")}
                onRemove={async (id, mode) => {
                  try {
                    await api.removeProject(id, mode);
                    toast(mode === "list" ? t("Projekt aus der Liste entfernt.") : mode === "trash" ? t("Projekt in den Papierkorb verschoben.") : t("Projekt endgültig gelöscht."), "success");
                  } catch (e) {
                    toast(String(e), "error");
                  }
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
                  toast(t("„{name}“ wurde erstellt.", { name: p.name }), "success");
                  openWorkspace(p.id);
                }}
              />
            )}
            {nav === "workspace" && current && (
              <Workspace project={current} javaReady={!!java?.installed} autoRun={autoRun} onBack={() => setNav("projects")} onChanged={reload} />
            )}
            {nav === "workspace" && !current && (
              <div className="page">
                <p className="muted">{t("Kein Projekt geöffnet.")}</p>
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
      <DialogHost />
      <PatchNotesDialog />
      <ContextMenuHost editLabels={EDIT_LABELS} />
    </div>
  );
}
