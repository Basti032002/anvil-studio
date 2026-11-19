import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";

export type AdminUser = { login: string; name: string | null; avatarUrl: string };
export type DeviceCode = { deviceCode: string; userCode: string; verificationUri: string; interval: number; expiresIn: number };
export type AccountInfo = { user: AdminUser; isAdmin: boolean; isTester: boolean };
export type PollResult = { status: "pending" | "slow_down" | "done" | "denied" | "expired"; account: AccountInfo | null };
export type Tester = { login: string; avatarUrl: string; pending: boolean; invitationId: number | null };
export type Channel = "stable" | "beta" | "dev";

export type ReleaseRow = {
  id: number;
  repo: string;
  channel: Channel;
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
  configured: () => invoke<boolean>("account_configured"),
  startLogin: () => invoke<DeviceCode>("account_start_login"),
  pollLogin: (deviceCode: string) => invoke<PollResult>("account_poll_login", { deviceCode }),
  session: () => invoke<AccountInfo | null>("account_session"),
  logout: () => invoke<void>("account_logout"),
  testers: () => invoke<Tester[]>("admin_testers"),
  addTester: (login: string) => invoke<void>("admin_add_tester", { login }),
  removeTester: (login: string, invitationId: number | null) => invoke<void>("admin_remove_tester", { login, invitationId }),
  overview: () => invoke<Overview>("admin_overview"),
  publish: (version: string, notes: string) => invoke<{ commitSha: string; commitUrl: string }>("admin_publish", { req: { version, notes } }),
  setPrerelease: (repo: string, id: number, prerelease: boolean) => invoke<void>("admin_set_prerelease", { repo, id, prerelease }),
  updateNotes: (repo: string, id: number, body: string) => invoke<void>("admin_update_notes", { repo, id, body }),
  deleteRelease: (repo: string, id: number, tag: string) => invoke<void>("admin_delete_release", { repo, id, tag }),
  rerun: (runId: number) => invoke<void>("admin_rerun", { runId }),
};

// ---- Sitzung (global) -------------------------------------------------------

let session: AccountInfo | null = null;
const listeners = new Set<() => void>();
function setSession(u: AccountInfo | null) {
  session = u;
  listeners.forEach((l) => l());
}
/** Angemeldetes GitHub-Konto (mit Rollen) oder null. */
export function useAccount() {
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
export function loggedIn(u: AccountInfo) {
  setSession(u);
}
export async function logout() {
  await adminApi.logout();
  setSession(null);
}

// ---- Versionen ---------------------------------------------------------------

export type BumpKind = "patch" | "minor" | "major" | "beta" | "dev";
export function bump(version: string, kind: BumpKind): string {
  const [main, pre] = version.split("-");
  const [a, b, c] = main.split(".").map((n) => parseInt(n, 10) || 0);
  if (kind === "major") return `${a + 1}.0.0`;
  if (kind === "minor") return `${a}.${b + 1}.0`;
  if (kind === "patch") return pre ? `${a}.${b}.${c}` : `${a}.${b}.${c + 1}`;
  // beta/dev: bestehende Vorabversion hochzählen, sonst nächste Minor-Version
  const m = pre?.match(new RegExp(`^${kind}\\.(\\d+)$`));
  if (m) return `${a}.${b}.${c}-${kind}.${parseInt(m[1], 10) + 1}`;
  if (pre) return `${a}.${b}.${c}-${kind}.1`;
  return `${a}.${b + 1}.0-${kind}.1`;
}

export function relTime(iso: string): string {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
  return `vor ${Math.floor(diff / 86400)} Tagen`;
}

export function channelOf(version: string): Channel {
  if (version.includes("-dev")) return "dev";
  if (version.includes("-")) return "beta";
  return "stable";
}

export const CHANNEL_LABEL: Record<Channel, string> = { stable: "Stabil", beta: "Beta", dev: "Dev" };
