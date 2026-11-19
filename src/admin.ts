import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";

export type AdminUser = { login: string; name: string | null; avatarUrl: string };
export type DeviceCode = { deviceCode: string; userCode: string; verificationUri: string; interval: number; expiresIn: number };
export type PollResult = { status: "pending" | "slow_down" | "done" | "denied" | "expired" | "forbidden"; user: AdminUser | null; login: string | null };

export type ReleaseRow = {
  id: number;
  tag: string;
  name: string;
  prerelease: boolean;
  draft: boolean;
  publishedAt: string;
  htmlUrl: string;
  body: string;
  downloads: number;
  assets: { name: string; downloads: number; size: number }[];
};
export type RunRow = {
  id: number;
  title: string;
  status: string;
  conclusion: string | null;
  headSha: string;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
  event: string;
};
export type Overview = { repoVersion: string; headSha: string; releases: ReleaseRow[]; runs: RunRow[]; unreleased: string[] };

export const adminApi = {
  configured: () => invoke<boolean>("admin_configured"),
  startLogin: () => invoke<DeviceCode>("admin_start_login"),
  pollLogin: (deviceCode: string) => invoke<PollResult>("admin_poll_login", { deviceCode }),
  session: () => invoke<AdminUser | null>("admin_session"),
  logout: () => invoke<void>("admin_logout"),
  overview: () => invoke<Overview>("admin_overview"),
  publish: (version: string, notes: string) => invoke<{ commitSha: string; commitUrl: string }>("admin_publish", { req: { version, notes } }),
  setPrerelease: (id: number, prerelease: boolean) => invoke<void>("admin_set_prerelease", { id, prerelease }),
  updateNotes: (id: number, body: string) => invoke<void>("admin_update_notes", { id, body }),
  deleteRelease: (id: number, tag: string) => invoke<void>("admin_delete_release", { id, tag }),
  rerun: (runId: number) => invoke<void>("admin_rerun", { runId }),
};

// ---- Sitzung (global) -------------------------------------------------------

let session: AdminUser | null = null;
const listeners = new Set<() => void>();
function setSession(u: AdminUser | null) {
  session = u;
  listeners.forEach((l) => l());
}
export function useAdminSession() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => session,
  );
}
export async function restoreSession() {
  try {
    setSession(await adminApi.session());
  } catch {
    setSession(null);
  }
}
export function loggedIn(u: AdminUser) {
  setSession(u);
}
export async function logout() {
  await adminApi.logout();
  setSession(null);
}

// ---- Versionen ---------------------------------------------------------------

export function bump(version: string, kind: "patch" | "minor" | "major" | "beta"): string {
  const [main, pre] = version.split("-");
  const [a, b, c] = main.split(".").map((n) => parseInt(n, 10) || 0);
  if (kind === "major") return `${a + 1}.0.0`;
  if (kind === "minor") return `${a}.${b + 1}.0`;
  if (kind === "patch") return pre ? `${a}.${b}.${c}` : `${a}.${b}.${c + 1}`;
  // beta: bestehende Beta hochzählen, sonst nächste Minor-Beta
  const m = pre?.match(/^beta\.(\d+)$/);
  if (m) return `${a}.${b}.${c}-beta.${parseInt(m[1], 10) + 1}`;
  return `${a}.${b + 1}.0-beta.1`;
}

export function relTime(iso: string): string {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
  return `vor ${Math.floor(diff / 86400)} Tagen`;
}
