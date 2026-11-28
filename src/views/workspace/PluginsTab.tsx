import { useEffect, useMemo, useState } from "react";
import { t } from "../../i18n";
import { Content, contentApi, Project } from "../../api";
import { useUndoable } from "../../undo";
import { getDraft, setDraft } from "./draft";
import { PlusIcon, PuzzleIcon, SaveIcon, SearchIcon, TrashIcon, CloseIcon as XIcon } from "../../icons";
import { PluginEditor, PluginField, pluginEditors, usePlugins } from "../../plugins";
import { toast } from "../../state";
import { Toggle } from "../../components/Chrome";
import { OwnEntry } from "../../components/ItemPicker";
import { openPluginManager } from "../../components/PluginManager";
import { ItemField } from "./ContentForms";
import { ENTITIES } from "./blueprints";
import { variantIds } from "./contentDefaults";

type Entry = Record<string, unknown> & { id: string };
type Row = Record<string, string>;

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const defaults = (fields: PluginField[]): Record<string, unknown> =>
  Object.fromEntries(fields.map((f) => [f.key, f.type === "list" || f.type === "entries" ? [] : (f.def ?? (f.type === "bool" ? "false" : ""))]));
const shown = (f: PluginField, row: Record<string, unknown>) => !f.when || f.when.values.includes(str(row[f.when.key] ?? ""));

/** Editoren aus Plugins: Listen von Einträgen mit Formular, gebaut als Dateien in die Mod */
export default function PluginsTab({ project }: { project: Project }) {
  const plugins = usePlugins();
  const editors = useMemo(() => [...pluginEditors], [plugins]);
  const [content, setContent, hist] = useUndoable<Content | null>(`content:${project.id}`, null);
  const [saved, setSaved] = useState("");
  const [edKey, setEdKey] = useState("");
  const [sel, setSel] = useState(0);
  const [q, setQ] = useState("");
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

  const own: OwnEntry[] = useMemo(
    () =>
      content
        ? [
            ...content.blocks.flatMap((b) => variantIds(b).map((v) => ({ id: v.id, name: v.name, kind: "block" as const, shape: v.shape }))),
            ...content.items.map((i) => ({ id: i.id, name: i.nameEn || i.id, kind: "item" as const })),
          ]
        : [],
    [content],
  );

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
  const pdata = (content.pluginData?.[ed.plugin] ?? {}) as Record<string, Entry[]>;
  const entriesOf = (editor: string): Entry[] => (Array.isArray(pdata[editor || ed.id]) ? pdata[editor || ed.id] : []);
  const list = entriesOf(ed.id);
  const cur = list[Math.min(sel, list.length - 1)];
  const titleKey = ed.titleField ?? ed.fields.find((f) => !f.type || f.type === "text")?.key ?? "";
  const title = (e: Entry) => str(e[titleKey]) || e.id;
  const setList = (next: Entry[]) =>
    setContent((c) => (c ? { ...c, pluginData: { ...(c.pluginData ?? {}), [ed.plugin]: { ...((c.pluginData?.[ed.plugin] as object) ?? {}), [ed.id]: next } } } : c));
  const add = () => {
    let n = list.length + 1;
    while (list.some((e) => e.id === `${ed.id}_${n}`)) n++;
    const e: Entry = { id: `${ed.id}_${n}`, ...defaults(ed.fields) };
    const g = ed.groupBy && cur ? str(cur[ed.groupBy]) : "";
    if (ed.groupBy && g) e[ed.groupBy] = g;
    setList([...list, e]);
    setSel(list.length);
  };
  const upd = (patch: Record<string, unknown>) => setList(list.map((e) => (e === cur ? ({ ...e, ...patch } as Entry) : e)));

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

  /** Ein einfaches Eingabefeld (auch in Listen-Zeilen) */
  const simple = (f: PluginField, v: string, set: (x: string) => void) => {
    switch (f.type) {
      case "select":
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
      case "bool":
        return <Toggle label={f.label} checked={v === "true"} onChange={(x) => set(x ? "true" : "false")} />;
      case "textarea":
        return <textarea className="input pl-textarea" value={v} onChange={(e) => set(e.target.value)} />;
      case "item":
      case "block":
        return <ItemField project={project} own={own} value={v} onChange={set} placeholder={f.type === "block" ? t("Block wählen …") : t("Item wählen …")} blocksOnly={f.type === "block"} />;
      case "entity":
        return (
          <select className="input" value={v} onChange={(e) => set(e.target.value)}>
            {!v && <option value="">{t("– auswählen –")}</option>}
            {content.mobs.map((m) => (
              <option key={m.id} value={`${project.modId}:${m.id}`}>
                {m.nameEn || m.id} ({t("eigene")})
              </option>
            ))}
            {ENTITIES.map((e) => (
              <option key={e} value={`minecraft:${e}`}>
                {e.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        );
      case "dimension":
        return (
          <select className="input" value={v} onChange={(e) => set(e.target.value)}>
            {!v && <option value="">{t("– auswählen –")}</option>}
            {content.dimensions.map((d) => (
              <option key={d.id} value={`${project.modId}:${d.id}`}>
                {d.nameEn || d.id} ({t("eigene")})
              </option>
            ))}
            <option value="minecraft:overworld">{t("Oberwelt")}</option>
            <option value="minecraft:the_nether">{t("Nether")}</option>
            <option value="minecraft:the_end">{t("End")}</option>
          </select>
        );
      case "entry": {
        const items = entriesOf(f.editor ?? "").filter((x) => x !== cur);
        return (
          <select className="input" value={v} onChange={(e) => set(e.target.value)}>
            <option value="">{f.any ?? t("– auswählen –")}</option>
            {items.map((x) => (
              <option key={x.id} value={x.id}>
                {title(x)}
              </option>
            ))}
          </select>
        );
      }
      case "number":
        return <input className="input" type="number" step="any" value={v} onChange={(e) => set(e.target.value)} />;
      default: {
        const sugg = f.suggest ? [...new Set(list.map((x) => str(x[f.key])).filter(Boolean))] : [];
        return (
          <>
            <input className="input" value={v} list={sugg.length ? `pl-sugg-${f.key}` : undefined} onChange={(e) => set(e.target.value)} />
            {sugg.length > 0 && (
              <datalist id={`pl-sugg-${f.key}`}>
                {sugg.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            )}
          </>
        );
      }
    }
  };

  const field = (f: PluginField) => {
    if (!cur) return null;
    const raw = cur[f.key];
    if (f.type === "entries") {
      const ids = Array.isArray(raw) ? (raw as string[]) : [];
      const pool = entriesOf(f.editor ?? "").filter((x) => x !== cur && !ids.includes(x.id));
      return (
        <div className="pl-chips">
          {ids.map((id) => {
            const e = entriesOf(f.editor ?? "").find((x) => x.id === id);
            return (
              <span key={id} className={e ? "pl-chip" : "pl-chip missing"}>
                {e ? title(e) : id}
                <button aria-label={t("Entfernen")} onClick={() => upd({ [f.key]: ids.filter((x) => x !== id) })}>
                  <XIcon size={11} />
                </button>
              </span>
            );
          })}
          {pool.length > 0 && (
            <select className="input pl-chip-add" value="" onChange={(e) => e.target.value && upd({ [f.key]: [...ids, e.target.value] })}>
              <option value="">+ {f.addLabel ?? t("Hinzufügen")}</option>
              {pool.map((x) => (
                <option key={x.id} value={x.id}>
                  {title(x)}
                </option>
              ))}
            </select>
          )}
          {!ids.length && !pool.length && <span className="muted small">{t("Noch nichts zum Auswählen.")}</span>}
        </div>
      );
    }
    if (f.type === "list") {
      const rows = Array.isArray(raw) ? (raw as Row[]) : [];
      const cols = f.fields ?? [];
      const setRows = (next: Row[]) => upd({ [f.key]: next });
      return (
        <div className="pl-rows">
          {rows.map((r, i) => (
            <div key={i} className="pl-row">
              {cols.filter((c) => shown(c, r)).map((c) => (
                <div key={c.key} className="pl-cell" style={{ flex: c.width ? `0 0 ${c.width}px` : "1 1 0" }} title={c.label}>
                  {simple(c, r[c.key] ?? c.def ?? "", (x) => setRows(rows.map((y, j) => (j === i ? { ...y, [c.key]: x } : y))))}
                </div>
              ))}
              <button className="icon-btn" aria-label={t("Entfernen")} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                <TrashIcon size={13} />
              </button>
            </div>
          ))}
          <button className="pl-row-add" onClick={() => setRows([...rows, defaults(cols) as Row])}>
            <PlusIcon size={13} /> {f.addLabel ?? t("Zeile hinzufügen")}
          </button>
        </div>
      );
    }
    return simple(f, str(raw ?? f.def ?? ""), (x) => upd({ [f.key]: x }));
  };

  const labelled = (f: PluginField) =>
    f.type === "bool" ? (
      <div key={f.key} className="pl-bool">
        <span className="grow">
          <span>{f.label}</span>
          {f.hint && <span className="muted small">{f.hint}</span>}
        </span>
        {field({ ...f, label: "" })}
      </div>
    ) : (
      <label key={f.key} className="field">
        <span className="field-label">{f.label}</span>
        {field(f)}
        {f.hint && <span className="muted small">{f.hint}</span>}
      </label>
    );

  // Abschnitte: Felder ohne section oben im Kopf-Block, dann je Abschnitt eine Karte
  const mainFields = ed.fields.filter((f) => !f.side);
  const sections: { name: string; hint?: string; fields: PluginField[] }[] = [];
  for (const f of mainFields) {
    const name = f.section ?? "";
    const s = sections.find((x) => x.name === name) ?? (sections.push({ name, fields: [] }), sections[sections.length - 1]);
    s.fields.push(f);
  }
  const sideFields = ed.fields.filter((f) => f.side);

  // Liste: gruppiert (z. B. nach Kapitel) und durchsuchbar
  const ql = q.trim().toLowerCase();
  const visible = list.map((e, i) => ({ e, i })).filter(({ e }) => !ql || `${title(e)} ${e.id}`.toLowerCase().includes(ql));
  const groups: [string, { e: Entry; i: number }[]][] = [];
  for (const it of visible) {
    const g = ed.groupBy ? str(it.e[ed.groupBy]) || t("Ohne Gruppe") : "";
    const hit = groups.find(([n]) => n === g);
    if (hit) hit[1].push(it);
    else groups.push([g, [it]]);
  }

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
      {editors.length > 1 && (
        <div className="loc-langs">
          {editors.map((e) => (
            <button key={`${e.plugin}:${e.id}`} className={e === ed ? "loc-lang active" : "loc-lang"} onClick={() => (setEdKey(`${e.plugin}:${e.id}`), setSel(0))}>
              <PuzzleIcon size={12} /> {e.label} <span className="muted small">{e.pluginName}</span>
            </button>
          ))}
        </div>
      )}
      <div className={sideFields.length ? "pl-editor with-side" : "pl-editor"}>
        <div className="pl-entries">
          <div className="pl-entries-head">
            <b>{ed.label}</b>
            <span className="muted small">
              {t("aus „{p}“", { p: ed.pluginName })} · {list.length}
            </span>
          </div>
          <div className="pl-search">
            <label className="search grow">
              <SearchIcon size={13} />
              <input placeholder={t("Suchen …")} value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <button className="btn primary small" onClick={add} aria-label={ed.item ? t("{x} hinzufügen", { x: ed.item }) : t("Eintrag hinzufügen")} data-tip={ed.item ? t("{x} hinzufügen", { x: ed.item }) : t("Eintrag hinzufügen")}>
              <PlusIcon size={14} />
            </button>
          </div>
          {groups.map(([g, items]) => (
            <div key={g} className="pl-group">
              {ed.groupBy && <div className="pl-group-head">{g}</div>}
              {items.map(({ e, i }) => (
                <button key={e.id + i} className={e === cur ? "pl-entry active" : "pl-entry"} onClick={() => setSel(i)}>
                  <span className="grow">{title(e)}</span>
                  <span className="mono muted small">{e.id}</span>
                </button>
              ))}
            </div>
          ))}
          {!list.length && (
            <button className="ability-add" onClick={add}>
              <PlusIcon size={14} /> {ed.item ? t("{x} hinzufügen", { x: ed.item }) : t("Eintrag hinzufügen")}
            </button>
          )}
        </div>
        {cur ? (
          <>
            <div className="pl-form">
              <div className="pl-form-head">
                <div className="grow">
                  <b className="pl-form-title">{title(cur)}</b>
                  <input className="input mono small pl-id" value={cur.id} aria-label={t("ID")} onChange={(e) => upd({ id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
                </div>
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
              {ed.desc && <div className="muted small">{ed.desc}</div>}
              {sections.map((s) => (
                <section key={s.name} className="panel pl-section">
                  {s.name && <b className="pl-section-title">{s.name}</b>}
                  <div className={s.name ? "pl-section-body" : "pl-section-body grid"}>{s.fields.map(labelled)}</div>
                </section>
              ))}
            </div>
            {sideFields.length > 0 && (
              <aside className="pl-side">
                <b>{t("Optionen")}</b>
                {sideFields.map(labelled)}
              </aside>
            )}
          </>
        ) : (
          <div className="muted pl-form">{t("Noch keine Einträge.")}</div>
        )}
      </div>
    </div>
  );
}
