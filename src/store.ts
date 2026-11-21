import { t } from "./i18n";
// Kleiner globaler Speicher für Logs und laufende Prozesse,
// damit nichts verloren geht, wenn man zwischen Ansichten wechselt.
import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";
import { api, RunInfo, Task } from "./api";

export type Level = "info" | "warn" | "error" | "system" | "success";
export type Log = { id: number; line: string; level: Level; at: number };

type ExitInfo = { task: string; success: boolean; at: number };

const MAX_LINES = 5000;
let nextId = 1;
let logs: Record<string, Log[]> = {};
let running: Record<string, RunInfo> = {};
let lastExit: Record<string, ExitInfo> = {};
let version = 0;
const listeners = new Set<() => void>();

function notify() {
  version++;
  listeners.forEach((l) => l());
}

function classify(line: string, stream: string): Level {
  if (stream === "system") return "system";
  if (/BUILD SUCCESSFUL/.test(line)) return "success";
  if (/\b(ERROR|FATAL)\b|Exception|BUILD FAILED|^FAILURE:|error:/.test(line)) return "error";
  if (/\bWARN(ING)?\b|warning:/.test(line)) return "warn";
  return "info";
}

export function pushLog(projectId: string, line: string, stream = "system") {
  const list = logs[projectId] ?? [];
  const next = [...list, { id: nextId++, line, level: classify(line, stream), at: Date.now() }];
  logs = { ...logs, [projectId]: next.length > MAX_LINES ? next.slice(-MAX_LINES) : next };
  scheduleNotify();
}

// Viele Logzeilen kurz hintereinander nur einmal pro Frame rendern
let scheduled = false;
function scheduleNotify() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    notify();
  });
}

export function clearLogs(projectId: string) {
  logs = { ...logs, [projectId]: [] };
  notify();
}

export function markStarted(projectId: string, task: Task) {
  running = { ...running, [projectId]: { projectId, task, startedAt: Date.now() / 1000 } };
  notify();
}

/** Entfernt die Lauf-Markierung, z. B. wenn der Start gar nicht geklappt hat. */
export function markNotRunning(projectId: string) {
  const { [projectId]: _removed, ...rest } = running;
  running = rest;
  notify();
}

export async function initStore() {
  await listen<{ projectId: string; stream: string; line: string }>("log", (e) => {
    pushLog(e.payload.projectId, e.payload.line, e.payload.stream);
  });
  await listen<{ projectId: string; task: string; success: boolean; code: number | null }>(
    "run-exit",
    (e) => {
      const { projectId, task, success } = e.payload;
      const { [projectId]: _removed, ...rest } = running;
      running = rest;
      lastExit = { ...lastExit, [projectId]: { task, success, at: Date.now() / 1000 } };
      pushLog(projectId, success ? t("Beendet") : t("Beendet mit Fehler (Code {v0})", { v0: e.payload.code ?? "?" }));
      notify();
    },
  );
  const list = await api.runningTasks();
  running = Object.fromEntries(list.map((r) => [r.projectId, r]));
  notify();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStoreVersion() {
  return useSyncExternalStore(subscribe, () => version);
}

export function useLogs(projectId: string): Log[] {
  useStoreVersion();
  return logs[projectId] ?? [];
}

export function useRunning(projectId?: string): RunInfo | undefined {
  useStoreVersion();
  return projectId ? running[projectId] : undefined;
}

export function useAllRunning(): Record<string, RunInfo> {
  useStoreVersion();
  return running;
}

export function useLastExit(projectId: string): ExitInfo | undefined {
  useStoreVersion();
  return lastExit[projectId];
}
