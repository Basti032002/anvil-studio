import { useEffect, useState, useSyncExternalStore } from "react";
import { t } from "../i18n";
import { BetaBadge } from "../features";
import { AlertIcon, BlueprintIcon, CloseIcon, CubeIcon, FolderIcon, GuiIcon, ImportIcon, ShieldIcon, PackageIcon, PlusIcon, PuzzleIcon, SearchIcon, TrashIcon, WrenchIcon } from "../icons";
import { pickFolder } from "../api";
import { closePluginPrompt, permLabel, PluginField, PluginInfo, PluginManifest, pluginApi, refreshPlugins, usePluginPrompt, usePlugins } from "../plugins";
import { toast } from "../state";
import { confirmDialog, promptDialog } from "./Overlay";
import { Toggle } from "./Chrome";

let open = false;
const subs = new Set<() => void>();
export function openPluginManager() {
  open = true;
  subs.forEach((f) => f());
}
function close() {
  open = false;
  subs.forEach((f) => f());
}
const useOpen = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => open,
  );

const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Was ein Plugin mitbringt – als kurze Liste */
function brings(m: PluginManifest): { icon: React.ReactNode; text: string; sub?: string }[] {
  const c = m.contributes ?? {};
  const out: { icon: React.ReactNode; text: string; sub?: string }[] = [];
  const n = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  if (n(c.abilities)) out.push({ icon: <CubeIcon size={14} />, text: t("Fähigkeiten für Blöcke") });
  if (n(c.nodes)) out.push({ icon: <BlueprintIcon size={14} />, text: t("Blueprint-Knoten") });
  if (n(c.editors)) out.push({ icon: <GuiIcon size={14} />, text: t("Editoren") });
  if (n(c.commands)) out.push({ icon: <WrenchIcon size={14} />, text: t("{n} Befehle", { n: n(c.commands) }), sub: (c.commands ?? []).map((x) => x.label).join(" · ") });
  if (n(c.export)) out.push({ icon: <ImportIcon size={14} />, text: t("Schritte nach dem Bauen"), sub: (c.export ?? []).map((x) => x.label).join(" · ") });
  for (const md of c.mods ?? []) out.push({ icon: <PackageIcon size={14} />, text: t("Liefert eine Mod mit: {m}", { m: md.name ?? md.id }), sub: t("wird beim Testen mitgeladen und als Abhängigkeit eingetragen") });
  return out;
}

function Perms({ m }: { m: PluginManifest }) {
  const perms = m.permissions ?? [];
  return (
    <div className="pl-perms">
      {perms.map((p) => {
        const l = permLabel(p);
        return (
          <div key={p} className={l.warn ? "pl-perm warn" : "pl-perm"}>
            {l.warn ? <AlertIcon size={14} /> : <CubeIcon size={14} />}
            <span>
              <b>{l.text}</b>
              <span className="muted small">{l.sub}</span>
            </span>
          </div>
        );
      })}
      <div className="pl-perm">
        <ShieldIcon size={14} />
        <span>
          <b>{t("Sonst kein Zugriff")}</b>
          <span className="muted small">{t("Skripte laufen abgeschottet – ohne Internet und ohne Dateien außerhalb des Projekts")}</span>
        </span>
      </div>
    </div>
  );
}

/** Vor dem Installieren: was das Plugin will */
async function install(path: string) {
  try {
    const info = await pluginApi.inspect(path);
    const m = info.manifest;
    const ok = await new Promise<boolean>((resolve) => setInstall({ manifest: m, size: info.size, installed: info.installed, path, resolve }));
    if (!ok) return;
    await pluginApi.install(path);
    await refreshPlugins();
    toast(t("„{p}“ ist installiert.", { p: m.name }), "success");
  } catch (e) {
    toast(String(e), "error");
  }
}

type InstallReq = { manifest: PluginManifest; size: number; installed: string | null; path: string; resolve: (ok: boolean) => void };
let installReq: InstallReq | null = null;
const installSubs = new Set<() => void>();
function setInstall(r: InstallReq | null) {
  installReq = r;
  installSubs.forEach((f) => f());
}
const useInstall = () =>
  useSyncExternalStore(
    (f) => {
      installSubs.add(f);
      return () => installSubs.delete(f);
    },
    () => installReq,
  );

export async function installPluginFile() {
  const { open: pick } = await import("@tauri-apps/plugin-dialog");
  const path = await pick({ multiple: false, title: t("Plugin installieren"), filters: [{ name: "Anvil-Studio-Plugin", extensions: ["anvilplugin", "zip"] }] });
  if (typeof path === "string") await install(path);
}

export default function PluginManager() {
  const isOpen = useOpen();
  const list = usePlugins();
  const req = useInstall();
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    refreshPlugins();
    let un: (() => void) | undefined;
    // Plugin-Datei ins Fenster ziehen
    import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent((e) => {
          if (e.payload.type === "over" || e.payload.type === "enter") setDrag(true);
          else if (e.payload.type === "leave") setDrag(false);
          else if (e.payload.type === "drop") {
            setDrag(false);
            const f = e.payload.paths.find((p) => /\.(anvilplugin|zip)$/i.test(p));
            if (f) install(f);
          }
        }),
      )
      .then((u) => (un = u))
      .catch(() => {});
    return () => un?.();
  }, [isOpen]);

  const cur = list.find((p) => p.id === sel) ?? list[0];
  const query = q.trim().toLowerCase();
  const shown = list.filter((p) => !query || `${p.manifest.name} ${p.manifest.description ?? ""} ${p.id}`.toLowerCase().includes(query));

  async function toggle(p: PluginInfo, v: boolean) {
    await pluginApi.toggle(p.id, v).catch((e) => toast(String(e), "error"));
    await refreshPlugins();
  }
  async function remove(p: PluginInfo) {
    if (!(await confirmDialog(t("„{p}“ deinstallieren?", { p: p.manifest.name }), t("Was du mit dem Plugin gebaut hast, bleibt im Projekt – es wird nur nicht mehr gebaut, bis du das Plugin wieder installierst."), t("Deinstallieren"), t("Abbrechen"), true))) return;
    await pluginApi.remove(p.id).catch((e) => toast(String(e), "error"));
    await refreshPlugins();
  }
  async function scaffold() {
    const name = await promptDialog(t("Neues Plugin anlegen"), t("Name des Plugins"), t("Mein Plugin"), t("Weiter"), t("Abbrechen"));
    if (!name) return;
    const id = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mein-plugin";
    const dest = await pickFolder(t("Wohin soll der Plugin-Ordner?"));
    if (!dest) return;
    try {
      const dir = await pluginApi.scaffold(dest, id, name);
      toast(t("Plugin-Gerüst angelegt: {d}", { d: dir }), "success");
      if (await confirmDialog(t("Plugin gleich zum Testen installieren?"), t("Du kannst den Ordner danach bearbeiten und erneut installieren, um Änderungen zu übernehmen."), t("Installieren"), t("Später"))) await install(dir);
    } catch (e) {
      toast(String(e), "error");
    }
  }

  return (
    <>
      {isOpen && (
        <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
          <div className={drag ? "dialog pl-dialog dragging" : "dialog pl-dialog"} role="dialog" aria-label={t("Plugins")}>
            <div className="pl-head">
              <span className="pl-icon">
                <PuzzleIcon size={18} />
              </span>
              <div className="grow">
                <div className="row gap-8">
                  <span className="panel-title-lg">{t("Plugins")}</span>
                  <BetaBadge feature="plugins" />
                </div>
                <div className="muted small">{t("Erweiterungen für Anvil Studio: neue Fähigkeiten, Knoten, Editoren, Werkzeuge und Schritte beim Export.")}</div>
              </div>
              <button className="btn primary" onClick={installPluginFile}>
                <ImportIcon size={14} /> {t("Plugin-Datei installieren …")}
              </button>
              <button className="btn" onClick={scaffold}>
                <PlusIcon size={14} /> {t("Neues Plugin anlegen")}
              </button>
              <button className="icon-btn" onClick={close} aria-label={t("Schließen")}>
                <CloseIcon size={14} />
              </button>
            </div>
            <div className="pl-body">
              <div className="pl-list">
                <div className="row gap-8">
                  <div className="search grow">
                    <SearchIcon size={13} />
                    <input placeholder={t("Installierte Plugins durchsuchen …")} value={q} onChange={(e) => setQ(e.target.value)} />
                  </div>
                  <span className="chip-soft">{t("{n} installiert", { n: list.length })}</span>
                </div>
                {shown.map((p) => (
                  <div key={p.id} className={cur?.id === p.id ? "pl-row active" : "pl-row"} onClick={() => setSel(p.id)}>
                    <span className="pl-icon">
                      <PuzzleIcon size={18} />
                    </span>
                    <div className="grow">
                      <div>
                        <b>{p.manifest.name}</b> <span className="muted small">v{p.manifest.version}{p.manifest.author ? ` · ${t("von {a}", { a: p.manifest.author })}` : ""}</span>
                      </div>
                      <div className="muted small">{p.manifest.description}</div>
                    </div>
                    <span onClick={(e) => e.stopPropagation()}>
                      <Toggle label={t("Aktiv")} checked={p.enabled} onChange={(v) => toggle(p, v)} />
                    </span>
                  </div>
                ))}
                <div className="pl-drop muted">
                  <FolderIcon size={18} /> {t("Ziehe eine .anvilplugin-Datei hierher, um sie zu installieren.")}
                </div>
              </div>
              {cur ? (
                <aside className="pl-side">
                  <div className="row gap-10">
                    <span className="pl-icon big">
                      <PuzzleIcon size={22} />
                    </span>
                    <div>
                      <div className="panel-title">{cur.manifest.name}</div>
                      <div className="muted small mono">
                        {cur.id} · v{cur.manifest.version} · {fmtSize(cur.size)}
                      </div>
                    </div>
                  </div>
                  {cur.manifest.description && <div className="small">{cur.manifest.description}</div>}
                  <div className="field-label">{t("Bringt mit")}</div>
                  {brings(cur.manifest).map((b, i) => (
                    <div key={i} className="pl-perm">
                      {b.icon}
                      <span>
                        <b>{b.text}</b>
                        {b.sub && <span className="muted small">{b.sub}</span>}
                      </span>
                    </div>
                  ))}
                  <div className="field-label">{t("Darf")}</div>
                  <Perms m={cur.manifest} />
                  <span className="grow" />
                  <button className="btn danger" onClick={() => remove(cur)}>
                    <TrashIcon size={14} /> {t("Deinstallieren")}
                  </button>
                </aside>
              ) : (
                <aside className="pl-side muted">
                  <PuzzleIcon size={26} />
                  <div>{t("Noch keine Plugins installiert. Plugins sind .anvilplugin-Dateien – installiere eine über den Knopf oben oder ziehe sie in dieses Fenster.")}</div>
                </aside>
              )}
            </div>
          </div>
        </div>
      )}
      {req && (
        <div className="modal-backdrop">
          <div className="dialog pl-install" role="dialog" aria-label={t("Plugin installieren")}>
            <div className="row gap-12">
              <span className="pl-icon big">
                <PuzzleIcon size={22} />
              </span>
              <div className="grow">
                <div className="panel-title-lg">{req.installed ? t("„{p}“ aktualisieren?", { p: req.manifest.name }) : t("„{p}“ installieren?", { p: req.manifest.name })}</div>
                <div className="muted small">
                  v{req.manifest.version}
                  {req.installed ? ` (${t("installiert: v{v}", { v: req.installed })})` : ""} · {req.manifest.author ? t("von {a}", { a: req.manifest.author }) : t("unbekannter Autor")} · {fmtSize(req.size)}
                </div>
              </div>
            </div>
            {req.manifest.description && <div className="small">{req.manifest.description}</div>}
            <div className="field-label">{t("Dieses Plugin möchte")}</div>
            <Perms m={req.manifest} />
            <div className="callout warn small">
              <AlertIcon size={14} /> {t("Installiere nur Plugins aus Quellen, denen du vertraust. Plugin-Knoten und -Fähigkeiten landen als Code in deiner Mod.")}
            </div>
            <div className="row gap-8">
              <span className="grow" />
              <button
                className="btn"
                onClick={() => {
                  req.resolve(false);
                  setInstall(null);
                }}
              >
                {t("Abbrechen")}
              </button>
              <button
                className="btn primary"
                autoFocus
                onClick={() => {
                  req.resolve(true);
                  setInstall(null);
                }}
              >
                {req.installed ? t("Aktualisieren") : t("Installieren")}
              </button>
            </div>
          </div>
        </div>
      )}
      <PluginPromptHost />
    </>
  );
}

/** Eingabeformular für Plugin-Skripte (anvil.ui.prompt) */
function PluginPromptHost() {
  const req = usePluginPrompt();
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => {
    if (req) setVals(Object.fromEntries(req.fields.map((f) => [f.key, f.def ?? ""])));
  }, [req]);
  if (!req) return null;
  const input = (f: PluginField) => {
    const v = vals[f.key] ?? "";
    const set = (x: string) => setVals((s) => ({ ...s, [f.key]: x }));
    if (f.type === "select")
      return (
        <select className="input" value={v} onChange={(e) => set(e.target.value)}>
          {(f.options ?? []).map((o) => {
            const [id, l] = Array.isArray(o) ? o : [o.id, o.label];
            return (
              <option key={id} value={id}>
                {l}
              </option>
            );
          })}
        </select>
      );
    if (f.type === "bool") return <Toggle label={f.label} checked={v === "true"} onChange={(x) => set(x ? "true" : "false")} />;
    if (f.type === "textarea") return <textarea className="input pl-textarea" value={v} onChange={(e) => set(e.target.value)} />;
    return <input className="input" type={f.type === "password" ? "password" : f.type === "number" ? "number" : "text"} value={v} onChange={(e) => set(e.target.value)} />;
  };
  return (
    <div className="modal-backdrop">
      <form
        className="dialog pl-install"
        onSubmit={(e) => {
          e.preventDefault();
          closePluginPrompt(vals);
        }}
      >
        <div className="row gap-10">
          <span className="pl-icon">
            <PuzzleIcon size={16} />
          </span>
          <div className="panel-title-lg grow">{req.title}</div>
        </div>
        {req.fields.map((f) => (
          <label key={f.key} className="field">
            <span className="field-label">{f.label}</span>
            {input(f)}
          </label>
        ))}
        <div className="row gap-8">
          <span className="grow" />
          <button type="button" className="btn" onClick={() => closePluginPrompt(null)}>
            {t("Abbrechen")}
          </button>
          <button type="submit" className="btn primary">
            {t("OK")}
          </button>
        </div>
      </form>
    </div>
  );
}
