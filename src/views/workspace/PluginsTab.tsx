import { useEffect, useMemo, useState } from "react";
import { t } from "../../i18n";
import { Content, contentApi, Project } from "../../api";
import { useUndoable } from "../../undo";
import { getDraft, setDraft } from "./draft";
import { PlusIcon, PuzzleIcon, SaveIcon, TrashIcon } from "../../icons";
import { PluginEditor, PluginField, pluginEditors, usePlugins } from "../../plugins";
import { toast } from "../../state";
import { Toggle } from "../../components/Chrome";
import { openPluginManager } from "../../components/PluginManager";

type Entry = Record<string, string> & { id: string };

/** Editoren aus Plugins: Listen von Einträgen mit Formular, gebaut als Dateien in die Mod */
export default function PluginsTab({ project }: { project: Project }) {
  const plugins = usePlugins();
  const editors = useMemo(() => [...pluginEditors], [plugins]);
  const [content, setContent, hist] = useUndoable<Content | null>(`content:${project.id}`, null);
  const [saved, setSaved] = useState("");
  const [edKey, setEdKey] = useState("");
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = getDraft(project.id);
    if (d) {
      hist.load(d.content);
      setSaved(d.saved);
      return;
    }
    contentApi
      .load(project.id)
      .then((c) => {
        hist.load(c);
        setSaved(JSON.stringify(c));
      })
      .catch((e) => toast(String(e), "error"));
  }, [project.id]);
  useEffect(() => {
    if (content && saved) setDraft(project.id, content, saved);
  }, [content, saved, project.id]);

  const ed: PluginEditor | undefined = editors.find((e) => `${e.plugin}:${e.id}` === edKey) ?? editors[0];
  if (!content) return <div className="content-loading muted">{t("Lade …")}</div>;
  if (!ed)
    return (
      <div className="empty">
        <div className="empty-icon">
          <PuzzleIcon size={24} />
        </div>
        <h2>{t("Keine Plugin-Editoren")}</h2>
        <p className="muted">{t("Hier erscheinen Editoren aus installierten Plugins.")}</p>
        <button className="btn" onClick={openPluginManager}>
          {t("Plugins verwalten")}
        </button>
      </div>
    );

  const dirty = JSON.stringify(content) !== saved;
  const data = (content.pluginData?.[ed.plugin] ?? {}) as Record<string, Entry[]>;
  const list: Entry[] = Array.isArray(data[ed.id]) ? data[ed.id] : [];
  const cur = list[Math.min(sel, list.length - 1)];
  const setList = (next: Entry[]) =>
    setContent((c) => (c ? { ...c, pluginData: { ...(c.pluginData ?? {}), [ed.plugin]: { ...((c.pluginData?.[ed.plugin] as object) ?? {}), [ed.id]: next } } } : c));
  const add = () => {
    let n = list.length + 1;
    while (list.some((e) => e.id === `${ed.id}_${n}`)) n++;
    const e: Entry = { id: `${ed.id}_${n}`, ...Object.fromEntries(ed.fields.map((f) => [f.key, f.def ?? ""])) };
    setList([...list, e]);
    setSel(list.length);
  };
  const upd = (patch: Partial<Entry>) => setList(list.map((e) => (e === cur ? ({ ...e, ...patch } as Entry) : e)));

  async function save() {
    if (!content) return;
    setBusy(true);
    try {
      const r = await contentApi.save(project.id, content);
      hist.replace(r.content);
      setSaved(JSON.stringify(r.content));
      toast(t("Gespeichert – die Dateien der Plugins wurden erzeugt."), "success");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  const input = (f: PluginField) => {
    const v = cur?.[f.key] ?? f.def ?? "";
    const set = (x: string) => upd({ [f.key]: x });
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
    return <input className="input" type={f.type === "number" ? "number" : "text"} value={v} onChange={(e) => set(e.target.value)} />;
  };

  return (
    <div className="loc-tab">
      <header className="loc-head">
        <div className="grow">
          <h1>{t("Plugins")}</h1>
          <p className="muted">{t("Editoren aus deinen Plugins. Die Einträge werden beim Speichern als Dateien in die Mod geschrieben.")}</p>
        </div>
        <button className="btn small" onClick={openPluginManager}>
          <PuzzleIcon size={14} /> {t("Plugins verwalten")}
        </button>
        <button className={busy ? "btn primary loading" : "btn primary"} disabled={busy || !dirty} onClick={save}>
          <SaveIcon size={14} /> {dirty ? t("Speichern") : t("Alles gespeichert")}
        </button>
      </header>
      <div className="loc-langs">
        {editors.map((e) => (
          <button key={`${e.plugin}:${e.id}`} className={e === ed ? "loc-lang active" : "loc-lang"} onClick={() => (setEdKey(`${e.plugin}:${e.id}`), setSel(0))}>
            <PuzzleIcon size={12} /> {e.label} <span className="muted small">{e.pluginName}</span>
          </button>
        ))}
      </div>
      <div className="pl-editor">
        <div className="pl-entries">
          {list.map((e, i) => (
            <button key={e.id + i} className={e === cur ? "pl-entry active" : "pl-entry"} onClick={() => setSel(i)}>
              <span className="grow">{e[ed.fields[0]?.key] || e.id}</span>
              <span className="mono muted small">{e.id}</span>
            </button>
          ))}
          <button className="ability-add" onClick={add}>
            <PlusIcon size={14} /> {ed.item ? t("{x} hinzufügen", { x: ed.item }) : t("Eintrag hinzufügen")}
          </button>
        </div>
        {cur ? (
          <div className="panel pl-form">
            {ed.desc && <div className="muted small">{ed.desc}</div>}
            <label className="field">
              <span className="field-label">{t("ID")}</span>
              <input className="input mono" value={cur.id} onChange={(e) => upd({ id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
            </label>
            {ed.fields.map((f) => (
              <label key={f.key} className="field">
                <span className="field-label">{f.label}</span>
                {input(f)}
              </label>
            ))}
            <button
              className="btn danger small"
              onClick={() => {
                setList(list.filter((e) => e !== cur));
                setSel(Math.max(0, sel - 1));
              }}
            >
              <TrashIcon size={13} /> {t("Entfernen")}
            </button>
          </div>
        ) : (
          <div className="muted pl-form">{t("Noch keine Einträge.")}</div>
        )}
      </div>
    </div>
  );
}
