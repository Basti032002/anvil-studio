import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { Content, contentApi, Project } from "./api";
import { t } from "./i18n";
import { confirmDialog } from "./components/Overlay";
import { toast } from "./state";
import { getPresent, setExternal } from "./undo";
import { CATS, NODES, NodeSpec, PropSpec } from "./views/workspace/blueprints";
import { ABILITIES } from "./views/workspace/Abilities";

/** Plugin-System: Manifest (plugin.json) und was ein Plugin beiträgt */
export type PluginField = { key: string; label: string; type?: string; def?: string; options?: [string, string][] | { id: string; label: string }[]; pin?: "num" | "bool" | "text" | "any" };
export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  anvilStudio?: string;
  permissions?: string[];
  contributes?: {
    nodes?: unknown[];
    abilities?: unknown[];
    editors?: unknown[];
    commands?: { id: string; label: string; desc?: string; script: string }[];
    export?: { id: string; label: string; when?: "after"; script: string }[];
    mods?: { id: string; file: string; name?: string; required?: boolean }[];
  };
};
export type PluginInfo = { id: string; manifest: PluginManifest; enabled: boolean; dir: string; size: number };
export type PluginEditor = { plugin: string; pluginName: string; id: string; label: string; item?: string; desc?: string; fields: PluginField[] };

export const pluginApi = {
  list: () => invoke<PluginInfo[]>("plugins_list"),
  inspect: (path: string) => invoke<{ manifest: PluginManifest; size: number; installed: string | null }>("plugins_inspect", { path }),
  install: (path: string) => invoke<PluginManifest>("plugins_install", { path }),
  remove: (id: string) => invoke<void>("plugins_remove", { id }),
  toggle: (id: string, enabled: boolean) => invoke<void>("plugins_toggle", { id, enabled }),
  scaffold: (dest: string, id: string, name: string) => invoke<string>("plugins_scaffold", { dest, id, name }),
  read: (id: string, path: string) => invoke<string>("plugin_read", { id, path }),
  icon: (id: string) => invoke<string | null>("plugin_icon", { id }),
};

// ---- Zustand: installierte Plugins ----
let plugins: PluginInfo[] = [];
let loaded = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const usePlugins = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => plugins,
  );
export const pluginsLoaded = () => loaded;

/** Plugins neu laden und ihre Knoten/Fähigkeiten in Anvil Studio eintragen */
export async function refreshPlugins() {
  try {
    plugins = await pluginApi.list();
  } catch {
    plugins = [];
  }
  loaded = true;
  await applyContributions();
  emit();
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);

/** Einträge aus contributes.<key>: direkt oder als Pfad zu einer JSON-Datei im Plugin */
async function contrib(p: PluginInfo, key: "nodes" | "abilities" | "editors"): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (const v of arr<unknown>(p.manifest.contributes?.[key])) {
    if (typeof v === "string") {
      try {
        const j = JSON.parse(await pluginApi.read(p.id, v));
        out.push(...(Array.isArray(j) ? j : [j]));
      } catch {
        /* kaputte Datei überspringen */
      }
    } else if (v && typeof v === "object") out.push(v as Record<string, unknown>);
  }
  return out;
}

const fieldToProp = (f: PluginField): PropSpec => {
  const type = f.type === "bool" ? "select" : f.type === "number" ? "number" : ["text", "select", "item", "block", "entity", "effect", "sound"].includes(f.type ?? "") ? (f.type as PropSpec["type"]) : "text";
  const opts = f.type === "bool" ? [{ id: "true", label: t("Ja") }, { id: "false", label: t("Nein") }] : (f.options ?? []).map((o) => (Array.isArray(o) ? { id: String(o[0]), label: String(o[1]) } : o));
  return { key: f.key, label: f.label, type, def: f.def ?? (f.type === "bool" ? "false" : ""), options: opts.length ? opts : undefined, pin: f.pin };
};

export let pluginEditors: PluginEditor[] = [];

async function applyContributions() {
  // alte Plugin-Beiträge entfernen
  for (let i = NODES.length - 1; i >= 0; i--) if (NODES[i].kind.includes(":")) NODES.splice(i, 1);
  for (let i = ABILITIES.length - 1; i >= 0; i--) if (ABILITIES[i].kind.includes(":")) ABILITIES.splice(i, 1);
  pluginEditors = [];
  const cats = new Set(CATS.map((c) => c.id));
  for (const p of plugins.filter((x) => x.enabled)) {
    for (const n of await contrib(p, "nodes")) {
      const kind = str(n.kind);
      if (!/^[a-z0-9_]+$/.test(kind)) continue;
      const value = ["num", "bool", "text"].includes(str(n.value)) ? (str(n.value) as NodeSpec["value"]) : undefined;
      NODES.push({
        kind: `${p.id}:${kind}`,
        cat: (cats.has(str(n.cat) as never) ? str(n.cat) : value ? "values" : "other") as NodeSpec["cat"],
        label: str(n.label, kind),
        desc: str(n.desc),
        outs: value ? [] : arr<{ id: string; label: string }>(n.outs).length ? arr<{ id: string; label: string }>(n.outs) : [{ id: "next", label: "" }],
        props: arr<PluginField>(n.props).map(fieldToProp),
        value,
        plugin: p.manifest.name,
      });
    }
    for (const a of await contrib(p, "abilities")) {
      const kind = str(a.kind);
      if (!/^[a-z0-9_]+$/.test(kind)) continue;
      ABILITIES.push({ kind: `${p.id}:${kind}` as never, group: str(a.group, t("Plugins")), label: str(a.label, kind), desc: str(a.desc), icon: null, color: str(a.color, "#b892ff"), plugin: p.manifest.name, fields: arr<PluginField>(a.props) });
    }
    for (const e of await contrib(p, "editors")) {
      const id = str(e.id);
      if (!/^[a-z0-9_]+$/.test(id)) continue;
      pluginEditors.push({ plugin: p.id, pluginName: p.manifest.name, id, label: str(e.label, id), item: str(e.item), desc: str(e.desc), fields: arr<PluginField>(e.fields) });
    }
  }
}

export function pluginCommands(): { plugin: PluginInfo; id: string; label: string; desc?: string; script: string }[] {
  return plugins.filter((p) => p.enabled).flatMap((p) => arr<{ id: string; label: string; desc?: string; script: string }>(p.manifest.contributes?.commands).map((c) => ({ ...c, plugin: p })));
}

// ---- Berechtigungen (für Anzeige) ----
export function permLabel(p: string): { text: string; sub: string; warn?: boolean } {
  if (p.startsWith("network:")) return { text: t("Mit {h} verbinden", { h: p.slice(8) }), sub: t("nur diese Adresse"), warn: true };
  switch (p) {
    case "content.read":
      return { text: t("Projektinhalte lesen"), sub: t("Blöcke, Items, Blueprints … des geöffneten Projekts") };
    case "content.write":
      return { text: t("Projektinhalte ändern"), sub: t("Änderungen lassen sich rückgängig machen") };
    case "files.write":
      return { text: t("Dateien ins Projekt schreiben"), sub: t("nur unter src/main/resources und src/main/java") };
    case "export.jar":
      return { text: t("Die gebaute Mod-Datei lesen"), sub: t("z. B. zum Hochladen") };
    case "secrets":
      return { text: t("Zugangsschlüssel speichern"), sub: t("sicher in der Windows-Anmeldeinformationsverwaltung"), warn: true };
  }
  return { text: p, sub: t("unbekannte Berechtigung"), warn: true };
}

// ---- Skripte: laufen abgeschottet (eigene Herkunft, kein Internet, keine Dateien) ----
const SANDBOX = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:">
<script>
let w;
addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type === "start") {
    try {
      w = new Worker(URL.createObjectURL(new Blob([d.code], { type: "text/javascript" })));
      w.onmessage = (m) => parent.postMessage(m.data, "*");
      w.onerror = (err) => parent.postMessage({ type: "error", message: String(err.message || err) }, "*");
    } catch (err) {
      // ohne Worker: direkt hier (auch hier gilt: kein Internet)
      const shim = { onmessage: null };
      w = { postMessage: (m) => shim.onmessage && shim.onmessage({ data: m }) };
      try { new Function("self", "postMessage", d.code)(shim, (m) => parent.postMessage(m, "*")); }
      catch (e2) { parent.postMessage({ type: "error", message: String(e2) }, "*"); }
    }
  } else if (w) w.postMessage(d);
});
parent.postMessage({ type: "ready" }, "*");
</script>`;

const BOOT = `
"use strict";
for (const k of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "indexedDB", "caches", "Worker", "SharedWorker", "BroadcastChannel"]) {
  try { Object.defineProperty(self, k, { value: undefined, configurable: false, writable: false }); } catch (e) {}
}
let __seq = 0; const __wait = new Map();
self.onmessage = (e) => { const d = e.data; const w = __wait.get(d.id); if (!w) return; __wait.delete(d.id); d.error ? w.rej(new Error(d.error)) : w.res(d.result); };
const __call = (method, ...args) => new Promise((res, rej) => { const id = ++__seq; __wait.set(id, { res, rej }); postMessage({ type: "call", id, method, args }); });
const anvil = Object.freeze({
  plugin: __CTX.plugin, project: __CTX.project, context: __CTX.context,
  content: Object.freeze({ get: () => __call("content.get"), set: (c) => __call("content.set", c), data: () => __call("content.data"), setData: (v) => __call("content.setData", v) }),
  ui: Object.freeze({ toast: (text, kind) => __call("ui.toast", String(text), kind), confirm: (title, text) => __call("ui.confirm", title, text), prompt: (title, fields) => __call("ui.prompt", title, fields), pickFile: (o) => __call("ui.pickFile", o || {}) }),
  files: Object.freeze({ write: (path, data) => __call("files.write", path, data) }),
  export: Object.freeze({ jar: () => __call("export.jar") }),
  net: Object.freeze({ fetch: (url, opts) => __call("net.fetch", url, opts || {}) }),
  secrets: Object.freeze({ get: (n) => __call("secrets.get", n), set: (n, v) => __call("secrets.set", n, v) }),
  log: (...a) => __call("log", a.map(String).join(" ")),
});
`;

/** Eingabe-Formular für Skripte (anvil.ui.prompt) – wird vom Plugin-Dialog-Host angezeigt */
export type PromptReq = { title: string; fields: PluginField[]; resolve: (v: Record<string, string> | null) => void };
let prompt: PromptReq | null = null;
const promptSubs = new Set<() => void>();
export const usePluginPrompt = () =>
  useSyncExternalStore(
    (f) => {
      promptSubs.add(f);
      return () => promptSubs.delete(f);
    },
    () => prompt,
  );
export function closePluginPrompt(v: Record<string, string> | null) {
  const p = prompt;
  prompt = null;
  promptSubs.forEach((f) => f());
  p?.resolve(v);
}
const askPrompt = (title: string, fields: PluginField[]) =>
  new Promise<Record<string, string> | null>((resolve) => {
    prompt = { title, fields, resolve };
    promptSubs.forEach((f) => f());
  });

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

/** Skript eines Plugins ausführen. context: z. B. { step: "after-export" } */
export async function runPluginScript(p: PluginInfo, script: string, project: Project | null, context: Record<string, unknown> = {}): Promise<unknown> {
  const may = (perm: string) => (p.manifest.permissions ?? []).includes(perm);
  const needPerm = (perm: string) => {
    if (!may(perm)) throw new Error(t("Das Plugin hat keine Berechtigung „{p}“.", { p: perm }));
  };
  const needProject = () => {
    if (!project) throw new Error(t("Dafür muss ein Projekt geöffnet sein."));
    return project;
  };
  const src = await pluginApi.read(p.id, script);
  const ctx = { plugin: { id: p.id, name: p.manifest.name, version: p.manifest.version }, project: project ? { id: project.id, name: project.name, modId: project.modId, mcVersion: project.mcVersion } : null, context };
  const code = `const __CTX = ${JSON.stringify(ctx)};\n${BOOT}\n(async () => { try { const __m = {};\n${src.replace(/\bexport\s+default\s+/, "__m.default = ")}\n;const __f = __m.default || self.main; if (typeof __f !== "function") throw new Error("Das Skript hat keine export default-Funktion."); const r = await __f(anvil); postMessage({ type: "done", result: r === undefined ? null : r }); } catch (e) { postMessage({ type: "error", message: String((e && e.stack) || e) }); } })();`;

  const loadContent = async (): Promise<Content> => {
    const pr = needProject();
    return (getPresent(`content:${pr.id}`) as Content | undefined) ?? (await contentApi.load(pr.id));
  };
  const handle = async (method: string, args: unknown[]): Promise<unknown> => {
    switch (method) {
      case "log":
        console.info(`[Plugin ${p.id}]`, args[0]);
        return null;
      case "ui.toast":
        toast(String(args[0]).slice(0, 300), args[1] === "error" ? "error" : args[1] === "success" ? "success" : "info");
        return null;
      case "ui.confirm":
        return confirmDialog(String(args[0] ?? ""), String(args[1] ?? ""), t("Ja"), t("Abbrechen"));
      case "ui.prompt":
        return askPrompt(String(args[0] ?? ""), arr<PluginField>(args[1]));
      case "ui.pickFile": {
        const o = (args[0] ?? {}) as { types?: string[] };
        const { open } = await import("@tauri-apps/plugin-dialog");
        const exts = (o.types ?? []).map((x) => x.replace(/^\./, "")).filter((x) => /^[a-z0-9]+$/i.test(x));
        const path = await open({ multiple: false, filters: exts.length ? [{ name: exts.join(", "), extensions: exts }] : undefined });
        if (typeof path !== "string") return null;
        return invoke("plugin_read_picked", { path });
      }
      case "content.get":
        needPerm("content.read");
        return structuredClone(await loadContent());
      case "content.set": {
        needPerm("content.write");
        const pr = needProject();
        const next = args[0] as Content;
        if (!next || typeof next !== "object" || !Array.isArray((next as Content).blocks)) throw new Error(t("Ungültiger Inhalt."));
        if (!setExternal(`content:${pr.id}`, next)) await contentApi.save(pr.id, next);
        return null;
      }
      case "content.data": {
        const c = await loadContent();
        return structuredClone(c.pluginData?.[p.id] ?? null);
      }
      case "content.setData": {
        const pr = needProject();
        const c = await loadContent();
        const next = { ...c, pluginData: { ...(c.pluginData ?? {}), [p.id]: args[0] } };
        if (!setExternal(`content:${pr.id}`, next)) await contentApi.save(pr.id, next);
        return null;
      }
      case "files.write": {
        const pr = needProject();
        const data = args[1];
        return invoke("plugin_write_file", { id: p.id, projectId: pr.id, path: String(args[0]), text: typeof data === "string" ? data : null, base64: typeof data === "string" ? null : null });
      }
      case "export.jar":
        return invoke("plugin_latest_jar", { id: p.id, projectId: needProject().id });
      case "net.fetch": {
        const o = (args[1] ?? {}) as { method?: string; headers?: Record<string, string>; body?: string; json?: unknown; multipart?: unknown[] };
        const headers = { ...(o.headers ?? {}) };
        let body = o.body ?? null;
        if (o.json !== undefined) {
          body = JSON.stringify(o.json);
          headers["Content-Type"] ??= "application/json";
        }
        return invoke("plugin_http", { id: p.id, url: String(args[0]), method: o.method ?? "GET", headers, body, multipart: o.multipart ?? null });
      }
      case "secrets.get":
        return invoke("plugin_secret_get", { id: p.id, name: String(args[0]) });
      case "secrets.set":
        return invoke("plugin_secret_set", { id: p.id, name: String(args[0]), value: args[1] == null ? null : String(args[1]) });
    }
    throw new Error(t("Unbekannte Funktion: {m}", { m: method }));
  };
  void b64;

  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.style.display = "none";
    frame.srcdoc = SANDBOX;
    let finished = false;
    const timer = window.setTimeout(() => finish(new Error(t("Das Plugin-Skript hat zu lange gebraucht und wurde beendet."))), 15 * 60 * 1000);
    const finish = (e: Error | null, result?: unknown) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMsg);
      frame.remove();
      if (e) reject(e);
      else resolve(result);
    };
    const onMsg = async (ev: MessageEvent) => {
      if (ev.source !== frame.contentWindow) return;
      const d = ev.data ?? {};
      if (d.type === "ready") frame.contentWindow?.postMessage({ type: "start", code }, "*");
      else if (d.type === "done") finish(null, d.result);
      else if (d.type === "error") finish(new Error(String(d.message)));
      else if (d.type === "call") {
        try {
          const result = await handle(String(d.method), Array.isArray(d.args) ? d.args : []);
          frame.contentWindow?.postMessage({ id: d.id, result }, "*");
        } catch (e) {
          frame.contentWindow?.postMessage({ id: d.id, error: String(e instanceof Error ? e.message : e) }, "*");
        }
      }
    };
    window.addEventListener("message", onMsg);
    document.body.appendChild(frame);
  });
}

/** Befehl eines Plugins aus der Befehlspalette */
export async function runPluginCommand(p: PluginInfo, script: string, project: Project | null) {
  try {
    await runPluginScript(p, script, project, { step: "command" });
  } catch (e) {
    toast(t("Plugin „{p}“: {e}", { p: p.manifest.name, e: String(e instanceof Error ? e.message : e).split("\n")[0] }), "error");
  }
}

/** Nach erfolgreichem Bauen: Export-Schritte der Plugins */
export async function runExportSteps(project: Project) {
  for (const p of plugins.filter((x) => x.enabled)) {
    for (const s of arr<{ id: string; label: string; script: string }>(p.manifest.contributes?.export)) {
      try {
        await runPluginScript(p, s.script, project, { step: "after-export", id: s.id });
      } catch (e) {
        toast(t("Plugin „{p}“: {e}", { p: p.manifest.name, e: String(e instanceof Error ? e.message : e).split("\n")[0] }), "error");
      }
    }
  }
}
