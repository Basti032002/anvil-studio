import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { t } from "./i18n";
import type { Project } from "./api";

/** kind "xbox" = Übergangs-Anmeldung, solange Mojang die App noch nicht freigeschaltet hat */
export type McProfile = { uuid: string; name: string; skinUrl: string | null; kind?: "minecraft" | "xbox" };
export type McDeviceCode = { deviceCode: string; userCode: string; verificationUri: string; interval: number; expiresIn: number };
export type McPoll = { status: "pending" | "slow_down" | "done" | "denied" | "expired"; profile: McProfile | null };
export type WsStatus = "pending" | "public" | "rejected" | "blocked";
export type WsItem = {
  id: string;
  owner: { uuid: string; name: string };
  title: string;
  summary: string;
  description: string;
  categories: string[];
  mcVersion: string;
  modVersion: string;
  modId: string;
  license: string;
  trailerUrl: string;
  videos?: string[];
  images: string[];
  icon: string | null;
  hasMod: boolean;
  modSize: number;
  hasSource: boolean;
  sourceSize: number;
  downloads: number;
  featured: boolean;
  createdAt: number;
  updatedAt: number;
  status?: WsStatus;
  reason?: string;
  allowResubmit?: boolean;
  reports?: number;
  rating?: { avg: number; count: number };
  comments?: number;
  subscribers?: number;
  dependencies?: { id: string; title: string; available: boolean }[];
  myRating?: number;
  subscribed?: boolean;
  /** nur in „Abonniert“: neueste Fassung schon heruntergeladen */
  installed?: boolean;
};
export type WsComment = { id: number; author: { uuid: string; name: string }; text: string; createdAt: number; canDelete: boolean };
export type WsNotification = { id: number; kind: "approved" | "rejected" | "blocked" | "unblocked" | "featured" | "deleted" | "comment" | "update"; itemId: string; title: string; text: string; createdAt: number; read: boolean };
export type WsMe = { uuid: string; name: string; admin: boolean; sessionToken?: string };
export type WsSettings = { reviewMods: boolean; reviewSource: boolean; reviewUpdates: boolean };
export type WsStats = { pending: number; public: number; blocked: number; rejected: number; reported: number; downloads30: number };

export const CATEGORIES: { id: string; label: string }[] = [
  { id: "adventure", label: t("Abenteuer") },
  { id: "dimension", label: t("Dimension") },
  { id: "ores", label: t("Erze") },
  { id: "tools", label: t("Werkzeuge") },
  { id: "tech", label: t("Technik") },
  { id: "deco", label: t("Deko") },
  { id: "creatures", label: t("Kreaturen") },
  { id: "food", label: t("Essen") },
  { id: "magic", label: t("Magie") },
  { id: "minigame", label: t("Minispiel") },
  { id: "other", label: t("Sonstiges") },
];
export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id;

export const mcApi = {
  available: () => invoke<boolean>("mc_login_available"),
  startLogin: () => invoke<McDeviceCode>("mc_start_login"),
  pollLogin: (deviceCode: string) => invoke<McPoll>("mc_poll_login", { deviceCode }),
  account: () => invoke<McProfile | null>("mc_account"),
  logout: () => invoke<void>("mc_logout"),
};

export const wsApi = {
  baseUrl: () => invoke<string>("ws_base_url"),
  list: (kind: "mod" | "source", q = "", mc = "", category = "", sort = "", offset = 0) => invoke<{ total: number; items: WsItem[] }>("ws_list", { kind, q, mc, category, sort, offset }),
  item: (id: string) => invoke<WsItem>("ws_item", { id }),
  me: () => invoke<WsMe | null>("ws_me"),
  myItems: () => invoke<{ items: WsItem[] }>("ws_my_items"),
  remove: (id: string) => invoke<void>("ws_delete", { id }),
  report: (id: string, reason: string) => invoke<void>("ws_report", { id, reason }),
  upload: (req: {
    projectId: string;
    itemId: string | null;
    includeMod: boolean;
    includeSource: boolean;
    title: string;
    summary: string;
    description: string;
    categories: string[];
    trailerUrl: string;
    videos?: string[];
    images: string[];
    imageOrder?: string[];
    dependencies?: string[];
  }) => invoke<WsItem>("ws_upload", { req }),
  remoteConfig: () => invoke<{ enabled: boolean; url: string }>("ws_remote_config"),
  checkUrl: (url: string) => invoke<void>("ws_check_url", { url }),
  imagePreview: (path: string) => invoke<string>("ws_image_preview", { path }),
  rate: (id: string, stars: number) => invoke<WsItem>("ws_rate", { id, stars }),
  comments: (id: string) => invoke<{ comments: WsComment[] }>("ws_comments", { id }),
  addComment: (id: string, text: string) => invoke<WsComment>("ws_comment_add", { id, text }),
  deleteComment: (commentId: number) => invoke<void>("ws_comment_delete", { commentId }),
  subscribe: (id: string, on: boolean) => invoke<WsItem>("ws_subscribe", { id, on }),
  subscriptions: () => invoke<{ items: WsItem[] }>("ws_subscriptions"),
  syncSubscriptions: () => invoke<number>("ws_sync_subscriptions"),
  notifications: () => invoke<{ unread: number; items: WsNotification[] }>("ws_notifications"),
  readNotifications: () => invoke<void>("ws_notifications_read"),
  download: (id: string, kind: "mod" | "source", dest: string) => invoke<void>("ws_download", { id, kind, dest }),
  openSource: (id: string) => invoke<Project>("ws_open_source", { id }),
  adminItems: (status: string, q = "") => invoke<{ items: WsItem[] }>("ws_admin_items", { status, q }),
  adminStats: () => invoke<WsStats>("ws_admin_stats"),
  adminReports: (id: string) => invoke<{ reports: { id: number; reporter: string; reason: string; createdAt: number; resolved: number }[] }>("ws_admin_reports", { id }),
  adminAction: (id: string, action: "approve" | "reject" | "block" | "unblock" | "feature" | "dismiss-reports", reason = "", allowResubmit = true, featured = false) =>
    invoke<WsItem>("ws_admin_action", { id, action, reason, allowResubmit, featured }),
  adminPatch: (id: string, patch: Partial<Pick<WsItem, "title" | "summary" | "description" | "categories" | "reason" | "allowResubmit">>) => invoke<WsItem>("ws_admin_patch", { id, patch }),
  adminSettings: (settings?: WsSettings) => invoke<WsSettings>("ws_admin_settings", { settings: settings ?? null }),
  play: (item: WsItem) => invoke<void>("play_mod", { req: { itemId: item.id, title: item.title, mcVersion: item.mcVersion, modVersion: item.modVersion || String(item.updatedAt) } }),
};

// ---- Sitzung (global) ---------------------------------------------------------

type State = { profile: McProfile | null; me: WsMe | null; base: string; checked: boolean };
let state: State = { profile: null, me: null, base: "", checked: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
export function useWorkshop(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Beim Start: Konto und Workshop-Rechte prüfen (still, ohne Fehlermeldung) */
export async function refreshWorkshop() {
  const base = await wsApi.baseUrl().catch(() => "");
  const profile = await mcApi.account().catch(() => null);
  set({ base, profile, checked: true });
  if (profile) {
    const me = await wsApi.me().catch(() => null);
    set({ me });
  } else set({ me: null });
}

/** Workshop-Konto neu holen (z. B. wenn es beim Start nicht geklappt hat) */
export async function refreshMe() {
  if (!state.profile) return;
  const me = await wsApi.me().catch(() => null);
  if (me) set({ me });
}

export function setProfile(profile: McProfile | null) {
  set({ profile });
  if (profile) wsApi.me().then((me) => set({ me })).catch(() => set({ me: null }));
  else set({ me: null });
}

export async function mcLogout() {
  await mcApi.logout().catch(() => {});
  set({ profile: null, me: null });
}

/** Absolute Bild-URL vom Server */
export const wsUrl = (path: string | null | undefined) => {
  if (!path) return "";
  // Bilder von Uploads, die noch geprüft werden, sieht nur der Ersteller oder ein Admin
  const t = state.me?.sessionToken;
  return t ? `${state.base}${path}${path.includes("?") ? "&" : "?"}t=${encodeURIComponent(t)}` : `${state.base}${path}`;
};

export const fmtSize = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** YouTube-Link → Einbettungs-Adresse */
export function youtubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0` : null;
}
