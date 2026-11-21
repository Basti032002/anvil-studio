import { useEffect, useMemo, useState } from "react";
import { t } from "../../i18n";
import { Content, contentApi, Project, VarDef, VarKind, VarScope } from "../../api";
import { confirmDialog } from "../../components/Overlay";
import { AlertIcon, CloseIcon, InfoIcon, PlusIcon, SaveIcon, SearchIcon, TrashIcon, VariableIcon } from "../../icons";
import { toast } from "../../state";
import { getDraft, setDraft } from "./draft";
import { nodeSpec } from "./blueprints";
import { cleanVarName, newVar, renameVar, undeclaredVars, VAR_KINDS, VAR_SCOPES, varKindLabel, varScopeLabel, varUsages } from "./variables";

const nodeLabel = (kind: string) => nodeSpec(kind)?.label ?? kind;

export default function VariablesTab({ project }: { project: Project }) {
  const [content, setContent] = useState<Content | null>(null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [usagesOf, setUsagesOf] = useState<string | null>(null);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const d = getDraft(project.id);
    if (d) {
      setContent(d.content);
      setSaved(d.saved);
      return;
    }
    contentApi
      .load(project.id)
      .then((c) => {
        setContent(c);
        setSaved(JSON.stringify(c));
      })
      .catch((e) => toast(String(e), "error"));
  }, [project.id]);
  useEffect(() => {
    if (content && saved) setDraft(project.id, content, saved);
  }, [content, saved, project.id]);

  const vars = content?.variables ?? [];
  const missing = useMemo(() => (content ? undeclaredVars(content) : []), [content]);
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    if (content) for (const v of vars) m.set(v.name, varUsages(content, v.name, nodeLabel).length);
    return m;
  }, [content, vars]);

  if (!content) return <div className="loc-tab muted">{t("Lade …")}</div>;
  const dirty = JSON.stringify(content) !== saved;
  const query = q.trim().toLowerCase();
  const rows = vars.filter((v) => !query || `${v.name} ${v.desc} ${varKindLabel(v.kind)} ${varScopeLabel(v.scope)}`.toLowerCase().includes(query));

  const patch = (name: string, p: Partial<VarDef>) => setContent((c) => (c ? { ...c, variables: (c.variables ?? []).map((v) => (v.name === name ? { ...v, ...p } : v)) } : c));

  function rename(from: string, raw: string) {
    const to = cleanVarName(raw);
    if (!to || to === from) return;
    if (vars.some((v) => v.name === to)) {
      toast(t("Eine Variable mit diesem Namen gibt es schon."), "error");
      return;
    }
    setContent((c) => (c ? renameVar(c, from, to) : c));
    setSel((s) => new Set([...s].map((x) => (x === from ? to : x))));
  }

  function add(v: VarDef) {
    setContent((c) => (c ? { ...c, variables: [...(c.variables ?? []), v] } : c));
    setCreating(false);
  }

  async function removeSelected() {
    const names = [...sel];
    if (!names.length) return;
    const used = names.filter((n) => (usage.get(n) ?? 0) > 0);
    const ok = await confirmDialog(
      names.length === 1 ? t("„{name}“ löschen?", { name: names[0] }) : t("{n} Variablen löschen?", { n: String(names.length) }),
      used.length ? t("{n} davon werden noch in Blueprints benutzt. Dort gelten sie danach als einfache Zahl.", { n: String(used.length) }) : t("Sie werden in keinem Blueprint benutzt."),
      t("Löschen"),
      t("Abbrechen"),
      true,
    );
    if (!ok) return;
    setContent((c) => (c ? { ...c, variables: (c.variables ?? []).filter((v) => !names.includes(v.name)) } : c));
    setSel(new Set());
  }

  async function save() {
    if (!content) return;
    setBusy(true);
    try {
      const r = await contentApi.save(project.id, content);
      setContent(r.content);
      setSaved(JSON.stringify(r.content));
      toast(t("Gespeichert."), "success");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  const allSel = rows.length > 0 && rows.every((r) => sel.has(r.name));
  const uses = usagesOf ? varUsages(content, usagesOf, nodeLabel) : [];

  return (
    <div className="loc-tab vars-tab">
      <header className="loc-head">
        <div className="grow">
          <h1>{t("Variablen")}</h1>
          <p className="muted">{t("Werte, die sich deine Mod merkt – z. B. Punkte, ein Zuhause oder ob eine Quest erledigt ist. Benutze sie in Blueprints.")}</p>
        </div>
        <button className={busy ? "btn primary loading" : "btn primary"} disabled={busy || !dirty} onClick={save}>
          <SaveIcon size={14} /> {dirty ? t("Speichern") : t("Alles gespeichert")}
        </button>
      </header>

      <div className="loc-tools">
        <button className="btn primary small" onClick={() => setCreating(true)}>
          <PlusIcon size={14} /> {t("Neue Variable")}
        </button>
        <button className="btn small" disabled={!sel.size} onClick={removeSelected}>
          <TrashIcon size={14} /> {t("Ausgewählte löschen")}
        </button>
        <button className="btn small" disabled={sel.size !== 1} onClick={() => setUsagesOf([...sel][0])}>
          <SearchIcon size={14} /> {t("Verwendungen suchen")}
        </button>
        <button className={help ? "btn small active" : "btn small"} onClick={() => setHelp((h) => !h)}>
          <InfoIcon size={14} /> {t("Hilfe zu Variablen")}
        </button>
        <span className="grow" />
        <div className="search">
          <SearchIcon size={13} />
          <input placeholder={t("Variablen durchsuchen …")} aria-label={t("Variablen durchsuchen")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {help && <VarHelp onClose={() => setHelp(false)} />}

      {missing.length > 0 && (
        <div className="vars-missing">
          <AlertIcon size={15} />
          <span className="grow">
            {t("In Blueprints benutzt, aber nicht angelegt:")} {missing.map((m) => <code key={m}>{m}</code>)}
          </span>
          <button className="btn small" onClick={() => setContent((c) => (c ? { ...c, variables: [...(c.variables ?? []), ...missing.map((m) => newVar(m))] } : c))}>
            {t("Alle anlegen")}
          </button>
        </div>
      )}

      {vars.length === 0 ? (
        <div className="vars-empty">
          <VariableIcon size={34} />
          <h3>{t("Noch keine Variablen")}</h3>
          <p className="muted">{t("Lege eine Variable an und benutze sie dann im Blueprint-Editor mit „Variable setzen“ oder in Texten mit {var:name}.")}</p>
          <button className="btn primary" onClick={() => setCreating(true)}>
            <PlusIcon size={14} /> {t("Neue Variable")}
          </button>
        </div>
      ) : (
        <div className="loc-table-wrap">
          <table className="loc-table vars-table">
            <thead>
              <tr>
                <th style={{ width: 34 }}>
                  <input type="checkbox" checked={allSel} aria-label={t("Alle auswählen")} onChange={() => setSel(allSel ? new Set() : new Set(rows.map((r) => r.name)))} />
                </th>
                <th>{t("Name")}</th>
                <th>{t("Typ")}</th>
                <th>{t("Gültigkeit")}</th>
                <th>{t("Startwert")}</th>
                <th>{t("Beschreibung")}</th>
                <th style={{ width: 110 }}>{t("Verwendungen")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.name} className={sel.has(v.name) ? "selected" : ""}>
                  <td>
                    <input
                      type="checkbox"
                      checked={sel.has(v.name)}
                      aria-label={v.name}
                      onChange={() =>
                        setSel((s) => {
                          const n = new Set(s);
                          if (n.has(v.name)) n.delete(v.name);
                          else n.add(v.name);
                          return n;
                        })
                      }
                    />
                  </td>
                  <td>
                    <NameInput value={v.name} onCommit={(to) => rename(v.name, to)} />
                  </td>
                  <td>
                    <select className="input" value={v.kind} onChange={(e) => patch(v.name, { kind: e.target.value as VarKind, default: VAR_KINDS.find((k) => k.id === e.target.value)!.def })}>
                      {VAR_KINDS.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select className="input" value={v.scope} onChange={(e) => patch(v.name, { scope: e.target.value as VarScope })} title={VAR_SCOPES.find((s) => s.id === v.scope)?.desc}>
                      {VAR_SCOPES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <DefaultInput v={v} onChange={(d) => patch(v.name, { default: d })} />
                  </td>
                  <td>
                    <input className="input" value={v.desc} placeholder={t("Wofür ist sie da?")} onChange={(e) => patch(v.name, { desc: e.target.value })} />
                  </td>
                  <td>
                    <button className="vars-uses" onClick={() => setUsagesOf(v.name)} disabled={!usage.get(v.name)}>
                      {usage.get(v.name) ? t("{n}× benutzt", { n: String(usage.get(v.name)) }) : t("unbenutzt")}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    {t("Nichts gefunden.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {usagesOf && (
        <div className="vars-usages">
          <div className="vars-usages-head">
            <strong>
              {t("Verwendungen von")} <code>{usagesOf}</code>
            </strong>
            <span className="muted small">{uses.length ? t("{n} Stellen", { n: String(uses.length) }) : t("Nirgends benutzt")}</span>
            <span className="grow" />
            <button className="icon-btn" onClick={() => setUsagesOf(null)} aria-label={t("Schließen")}>
              <CloseIcon size={14} />
            </button>
          </div>
          {uses.map((u, i) => (
            <div key={i} className="vars-use">
              <span className="chip">{u.blueprint}</span>
              <span>{u.label}</span>
            </div>
          ))}
        </div>
      )}

      {creating && <NewVarDialog taken={vars.map((v) => v.name)} onCancel={() => setCreating(false)} onCreate={add} />}
    </div>
  );
}

function NameInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className="input mono"
      value={v}
      onChange={(e) => setV(cleanVarName(e.target.value))}
      onBlur={() => (v ? onCommit(v) : setV(value))}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function DefaultInput({ v, onChange }: { v: VarDef; onChange: (d: string) => void }) {
  switch (v.kind) {
    case "logic":
      return (
        <select className="input" value={v.default === "true" ? "true" : "false"} onChange={(e) => onChange(e.target.value)}>
          <option value="false">{t("Falsch (aus)")}</option>
          <option value="true">{t("Wahr (an)")}</option>
        </select>
      );
    case "direction":
      return (
        <select className="input" value={v.default || "north"} onChange={(e) => onChange(e.target.value)}>
          {[
            ["north", t("Norden")],
            ["south", t("Süden")],
            ["east", t("Osten")],
            ["west", t("Westen")],
            ["up", t("Oben")],
            ["down", t("Unten")],
          ].map(([id, l]) => (
            <option key={id} value={id}>
              {l}
            </option>
          ))}
        </select>
      );
    case "number":
      return <input className="input" type="number" step="any" value={v.default} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <input className="input mono" value={v.default} placeholder={VAR_KINDS.find((k) => k.id === v.kind)?.def} onChange={(e) => onChange(e.target.value)} />;
  }
}

function NewVarDialog({ taken, onCancel, onCreate }: { taken: string[]; onCancel: () => void; onCreate: (v: VarDef) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<VarKind>("number");
  const [scope, setScope] = useState<VarScope>("player");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  const clash = taken.includes(name);
  const ok = !!name && !clash;
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="vars-dialog" role="dialog" aria-label={t("Neue Variable")}>
        <div className="vars-dialog-head">
          <VariableIcon size={18} />
          <strong className="grow">{t("Neue Variable")}</strong>
          <button className="icon-btn" onClick={onCancel} aria-label={t("Schließen")}>
            <CloseIcon size={14} />
          </button>
        </div>
        <label className="field">
          <span>{t("Name")}</span>
          <input autoFocus className="input mono" value={name} placeholder="punkte" onChange={(e) => setName(cleanVarName(e.target.value))} onKeyDown={(e) => e.key === "Enter" && ok && onCreate(newVar(name, kind, scope))} />
          {clash && <span className="err small">{t("Eine Variable mit diesem Namen gibt es schon.")}</span>}
        </label>
        <div className="field">
          <span>{t("Typ")}</span>
          <div className="vars-kinds">
            {VAR_KINDS.map((k) => (
              <button key={k.id} className={kind === k.id ? "vars-kind active" : "vars-kind"} onClick={() => setKind(k.id)}>
                <strong>{k.label}</strong>
                <span className="muted tiny">{k.desc}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>{t("Gültigkeit")}</span>
          <div className="vars-scopes">
            {VAR_SCOPES.map((s) => (
              <button key={s.id} className={scope === s.id ? "vars-kind active" : "vars-kind"} onClick={() => setScope(s.id)}>
                <strong>{s.label}</strong>
                <span className="muted tiny">{s.desc}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="vars-dialog-foot">
          <button className="btn" onClick={onCancel}>
            {t("Abbrechen")}
          </button>
          <button className="btn primary" disabled={!ok} onClick={() => onCreate(newVar(name, kind, scope))}>
            <PlusIcon size={14} /> {t("Anlegen")}
          </button>
        </div>
      </div>
    </div>
  );
}

function VarHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="vars-help">
      <button className="icon-btn vars-help-x" onClick={onClose} aria-label={t("Schließen")}>
        <CloseIcon size={14} />
      </button>
      <div>
        <strong>{t("Typ")}</strong>
        <p className="muted small">{t("Bestimmt, was in der Variable steht: eine Zahl, Wahr/Falsch, Text, ein Item, ein Block, eine Richtung oder eine Position.")}</p>
      </div>
      <div>
        <strong>{t("Gültigkeit")}</strong>
        <p className="muted small">{t("„Welt“ gibt es einmal für alle. „Spieler“ hat jeder Spieler für sich. „Bis Neustart“ und „bis zum Tod“ werden automatisch zurückgesetzt.")}</p>
      </div>
      <div>
        <strong>{t("Im Blueprint")}</strong>
        <p className="muted small">{t("„Variable setzen“ ändert den Wert – fest, aus einer anderen Variable oder aus dem Spiel. „Wenn … dann“ mit „Variable vergleichen“ prüft ihn.")}</p>
      </div>
      <div>
        <strong>{t("In Texten und Befehlen")}</strong>
        <p className="muted small">{t("Schreibe {var:name} in eine Nachricht oder einen Befehl, dann wird der aktuelle Wert eingesetzt.")}</p>
      </div>
    </div>
  );
}
