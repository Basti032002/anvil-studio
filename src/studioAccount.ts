import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { LANG } from "./i18n";

/** Anvil-Studio-Konto (E-Mail + Passwort) – ohne Konto kein Zugang zum Studio */
export type StudioAccount = { id: string; email: string; name: string };
export type StudioStatus = { account: StudioAccount | null; offline: boolean };

let status: StudioStatus | null = null;
const subs = new Set<() => void>();
const set = (s: StudioStatus | null) => {
  status = s;
  subs.forEach((f) => f());
};
export const useStudioAccount = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => status,
  );

const lang = LANG === "de" ? "de" : "en";

export const studioAccount = {
  refresh: async () => {
    const s = await invoke<StudioStatus>("studio_account_status");
    set(s);
    return s;
  },
  register: (email: string, password: string, name: string) => invoke<{ needVerify: boolean; mailConfigured: boolean }>("studio_account_register", { email, password, name, lang }),
  resend: (email: string) => invoke<void>("studio_account_resend", { email, lang }),
  verify: async (email: string, code: string) => {
    const account = await invoke<StudioAccount>("studio_account_verify", { email, code });
    set({ account, offline: false });
    return account;
  },
  /** { needVerify } wenn die E-Mail noch bestätigt werden muss */
  login: async (email: string, password: string) => {
    const r = await invoke<{ account?: StudioAccount; needVerify?: boolean; message?: string }>("studio_account_login", { email, password, lang });
    if (r.account) set({ account: r.account, offline: false });
    return r;
  },
  forgot: (email: string) => invoke<void>("studio_account_forgot", { email, lang }),
  reset: async (email: string, code: string, password: string) => {
    const account = await invoke<StudioAccount>("studio_account_reset", { email, code, password });
    set({ account, offline: false });
    return account;
  },
  logout: async () => {
    await invoke<void>("studio_account_logout");
    set({ account: null, offline: false });
  },
  remove: async (password: string) => {
    await invoke<void>("studio_account_delete", { password });
    set({ account: null, offline: false });
  },
};
