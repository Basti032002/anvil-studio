import { t, translateMessage } from "./i18n";
// Globale Zustände außerhalb von Projekten: Einstellungen, Toasts, Updates.
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { useSyncExternalStore } from "react";
import { api, Settings, settingsApi, UpdateInfo } from "./api";

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: T | ((v: T) => T)) => {
      value = typeof next === "function" ? (next as (v: T) => T)(value) : next;
      listeners.forEach((l) => l());
    },
    use: () =>
      useSyncExternalStore(
        (l) => {
          listeners.add(l);
          return () => listeners.delete(l);
        },
        () => value,
      ),
  };
}

// ---- Einstellungen ------------------------------------------------------

const settingsStore = createStore<Settings | null>(null);
export const useSettings = settingsStore.use;
export const getSettings = settingsStore.get;

function applyMotion(reduce: boolean) {
  document.documentElement.classList.toggle("reduce-motion", reduce);
}

// ---- Theme ------------------------------------------------------------------

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const themeStore = createStore<"dark" | "light">("dark");
/** Tatsächlich aktives Theme (System aufgelöst). */
export const useResolvedTheme = themeStore.use;

export function applyTheme(theme: Settings["theme"] = "dark", accent: Settings["accent"] = "green") {
  const resolved = theme === "system" ? (darkQuery.matches ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.accent = accent;
  themeStore.set(resolved);
  try {
    localStorage.setItem("anvil.theme", JSON.stringify({ resolved, accent }));
  } catch {
    /* egal */
  }
}
darkQuery.addEventListener("change", () => {
  const s = settingsStore.get();
  if (s?.theme === "system") applyTheme("system", s.accent);
});

export async function loadSettings() {
  const s = await settingsApi.get();
  settingsStore.set(s);
  applyMotion(s.reduceMotion);
  applyTheme(s.theme, s.accent);
  return s;
}

export async function updateSettings(patch: Partial<Settings>) {
  const current = settingsStore.get();
  if (!current) return;
  const optimistic = { ...current, ...patch };
  settingsStore.set(optimistic);
  applyMotion(optimistic.reduceMotion);
  applyTheme(optimistic.theme, optimistic.accent);
  try {
    settingsStore.set(await settingsApi.save(optimistic));
  } catch (e) {
    toast(t("Einstellungen konnten nicht gespeichert werden: {e}", { e: e }), "error");
  }
}

// ---- Toasts -------------------------------------------------------------

export type Toast = { id: number; text: string; kind: "info" | "success" | "error"; leaving?: boolean };
const toastStore = createStore<Toast[]>([]);
export const useToasts = toastStore.use;
let toastId = 1;

export function toast(text: string, kind: Toast["kind"] = "info", ms = 4500) {
  const id = toastId++;
  toastStore.set((list) => [...list.slice(-3), { id, text: translateMessage(text), kind }]);
  setTimeout(() => dismissToast(id), ms);
}

export function dismissToast(id: number) {
  toastStore.set((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
  setTimeout(() => toastStore.set((list) => list.filter((t) => t.id !== id)), 220);
}

// ---- Version & Updates --------------------------------------------------

const versionStore = createStore<string>("");
export const useAppVersion = versionStore.use;

export type UpdatePhase = "idle" | "checking" | "none" | "available" | "downloading" | "installing" | "error";
export type UpdateState = {
  phase: UpdatePhase;
  info?: UpdateInfo;
  progress?: number; // 0..1
  error?: string;
  waitingForIdle?: boolean;
};
const updateStore = createStore<UpdateState>({ phase: "idle" });
export const useUpdate = updateStore.use;

const DAY = 86400;
const INTERVALS: Record<string, number> = { daily: DAY, weekly: 7 * DAY };

export async function checkForUpdate(manual = false) {
  const s = settingsStore.get();
  if (!s) return;
  const phase = updateStore.get().phase;
  if (phase === "checking" || phase === "downloading" || phase === "installing") return;
  updateStore.set({ phase: "checking" });
  try {
    const info = await settingsApi.checkUpdate(s.updateChannel);
    settingsStore.set({ ...(settingsStore.get() ?? s), lastUpdateCheck: Math.floor(Date.now() / 1000) });
    if (!info) {
      updateStore.set({ phase: "none" });
      if (manual) toast(t("Du hast die neueste Version."), "success");
      return;
    }
    updateStore.set({ phase: "available", info });
    if (s.autoInstall && !manual) {
      toast(t("Update {version} gefunden – wird automatisch installiert.", { version: info.version }), "info");
      installWhenIdle();
    } else {
      toast(t("Update {version} ist verfügbar.", { version: info.version }), "info");
    }
  } catch (e) {
    updateStore.set({ phase: "error", error: translateMessage(String(e)) });
    if (manual) toast(String(e), "error");
  }
}

let idleTimer: number | undefined;
/** Installiert, sobald kein Spiel/Build mehr läuft – damit nichts abgebrochen wird. */
export function installWhenIdle() {
  const tryInstall = async () => {
    const running = await api.runningTasks().catch(() => []);
    if (running.length > 0) {
      updateStore.set((u) => ({ ...u, waitingForIdle: true }));
      idleTimer = window.setTimeout(tryInstall, 15000);
      return;
    }
    installUpdate();
  };
  window.clearTimeout(idleTimer);
  tryInstall();
}

export async function installUpdate() {
  const { info } = updateStore.get();
  if (!info) return;
  if (import.meta.env.DEV) {
    toast(t("Im Entwicklungsmodus werden keine Updates installiert."), "info");
    return;
  }
  updateStore.set({ phase: "downloading", info, progress: 0 });
  try {
    await settingsApi.installUpdate(info);
    updateStore.set({ phase: "installing", info, progress: 1 });
  } catch (e) {
    updateStore.set({ phase: "error", info, error: translateMessage(String(e)) });
    toast(t("Update fehlgeschlagen: {e}", { e: e }), "error");
  }
}

/** Beim Start aufrufen: lädt Einstellungen und plant die Update-Prüfung. */
export async function initApp() {
  versionStore.set(await getVersion().catch(() => ""));
  await listen<{ downloaded: number; total: number | null }>("update-progress", (e) => {
    const { downloaded, total } = e.payload;
    updateStore.set((u) => ({ ...u, progress: total ? downloaded / total : undefined }));
  });
  const s = await loadSettings();

  const due = () => {
    const cur = settingsStore.get() ?? s;
    const interval = INTERVALS[cur.updateCheck];
    return interval !== undefined && Date.now() / 1000 - cur.lastUpdateCheck > interval;
  };
  if (s.updateCheck === "startup" || due()) {
    setTimeout(() => checkForUpdate(false), 2500);
  }
  // Läuft das Programm tagelang, trotzdem regelmäßig prüfen
  setInterval(() => {
    if (due()) checkForUpdate(false);
  }, 60 * 60 * 1000);
}
