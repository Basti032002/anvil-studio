import { invoke } from "@tauri-apps/api/core";

export type LastRun = { task: string; success: boolean; finishedAt: number };

export type Project = {
  id: string;
  name: string;
  modId: string;
  package: string;
  mcVersion: string;
  loader: string;
  path: string;
  createdAt: number;
  lastRun: LastRun | null;
};

export type JavaStatus = { installed: boolean; version: number; path: string | null };
export type RunInfo = { projectId: string; task: string; startedAt: number };
export type CrashReport = { path: string; content: string; modified: number };

export type CreateRequest = {
  name: string;
  modId: string;
  package: string;
  mcVersion: string;
  author: string;
  description: string;
  parentDir: string | null;
};

export type Task = "runClient" | "runServer" | "runData" | "build" | "clean";

export const api = {
  listProjects: () => invoke<Project[]>("list_projects"),
  removeProject: (projectId: string) => invoke<void>("remove_project", { projectId }),
  javaStatus: () => invoke<JavaStatus>("java_status"),
  installJava: () => invoke<JavaStatus>("install_java"),
  supportedVersions: () => invoke<{ versions: string[]; defaultDir: string }>("supported_versions"),
  createProject: (req: CreateRequest) => invoke<Project>("create_project", { req }),
  runTask: (projectId: string, task: Task, world?: string) =>
    invoke<void>("run_task", { projectId, task, world: world ?? null }),
  stopTask: (projectId: string) => invoke<void>("stop_task", { projectId }),
  runningTasks: () => invoke<RunInfo[]>("running_tasks"),
  openIn: (projectId: string, target: "code" | "idea" | "folder") =>
    invoke<void>("open_in", { projectId, target }),
  openPath: (path: string) => invoke<void>("open_path", { path }),
  listJars: (projectId: string) => invoke<string[]>("list_jars", { projectId }),
  latestCrashReport: (projectId: string) =>
    invoke<CrashReport | null>("latest_crash_report", { projectId }),
};

export const TASK_LABELS: Record<Task, string> = {
  runClient: "Testen (Client)",
  runServer: "Server",
  runData: "Datagen",
  build: "Bauen",
  clean: "Aufräumen",
};

export function timeAgo(seconds: number): string {
  const diff = Math.max(0, Date.now() / 1000 - seconds);
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
  return `vor ${Math.floor(diff / 86400)} Tagen`;
}
