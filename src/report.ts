import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";

/** „Problem melden“ – wird vom Server als GitHub-Issue im privaten Repo angelegt */
export type ReportKind = "manual" | "app_crash" | "mc_crash" | "build" | "problem";
export type ReportRequest = {
  kind: ReportKind;
  title?: string;
  description?: string;
  projectId?: string;
  /** Minecraft-Logs und Absturzbericht mitsammeln */
  minecraft?: boolean;
  since?: number;
  /** Erst fragen („Minecraft ist abgestürzt – melden?“) statt gleich das Formular zu zeigen */
  ask?: string;
  extraLogs?: { name: string; text: string }[];
};
export type Collected = { system: [string, string][]; logs: { name: string; text: string }[] };

let current: ReportRequest | null = null;
const subs = new Set<() => void>();
export function openReport(r: ReportRequest) {
  current = r;
  subs.forEach((f) => f());
}
export function closeReport() {
  current = null;
  subs.forEach((f) => f());
}
export const useReportRequest = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => current,
  );

export const reportApi = {
  collect: (projectId: string | null, minecraft: boolean, since: number | null) => invoke<Collected>("report_collect", { projectId, minecraft, since }),
  send: (kind: ReportKind, title: string, description: string, system: [string, string][], logs: { name: string; text: string }[]) =>
    invoke<{ issue?: number; stored?: boolean }>("report_send", { kind, title, description, system, logs }),
  pendingCrash: () => invoke<string | null>("report_pending_crash"),
  dismissCrash: () => invoke<void>("report_dismiss_crash"),
  mcCrashed: (projectId: string, since: number) => invoke<boolean>("report_mc_crashed", { projectId, since }),
};

/** Nach einem fehlgeschlagenen Lauf: Absturz oder Baufehler zum Melden anbieten */
export function offerCrashReport(projectId: string, task: string, startedAt: number) {
  const isRun = task.startsWith("run");
  const go = (crashed: boolean) =>
    openReport({
      kind: crashed ? "mc_crash" : "build",
      projectId,
      minecraft: true,
      since: startedAt,
      ask: crashed ? "mc_crash" : "build",
    });
  if (isRun) reportApi.mcCrashed(projectId, startedAt).then(go, () => go(false));
  else go(false);
}
