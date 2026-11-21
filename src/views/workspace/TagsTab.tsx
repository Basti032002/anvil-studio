import { useEffect, useMemo, useState } from "react";
import { useUndoable } from "../../undo";
import { t } from "../../i18n";
import { Content, contentApi, Project, TagDef, TagRegistry } from "../../api";
import { confirmDialog } from "../../components/Overlay";
import { CloseIcon, CubeIcon, GemIcon, GlobeIcon, InfoIcon, PawIcon, PlusIcon, SaveIcon, SearchIcon, TagIcon, TrashIcon } from "../../icons";
import { toast } from "../../state";
import { getDraft, setDraft } from "./draft";

export const TAG_REGS: { id: TagRegistry; label: string; icon: React.ReactNode }[] = [
  { id: "block", label: t("Blöcke"), icon: <CubeIcon size={14} /> },
  { id: "item", label: t("Items"), icon: <GemIcon size={14} /> },
  { id: "entity_type", label: t("Kreaturen"), icon: <PawIcon size={14} /> },
  { id: "worldgen/biome", label: t("Biome"), icon: <GlobeIcon size={14} /> },
];

/** Bekannte Tags mit Erklärung (Vorschläge) */
export const KNOWN_TAGS: { reg: TagRegistry; id: string; label: string }[] = [
  { reg: "block", id: "minecraft:mineable/pickaxe", label: t("Mit Spitzhacke schnell abbaubar") },
  { reg: "block", id: "minecraft:mineable/axe", label: t("Mit Axt schnell abbaubar") },
  { reg: "block", id: "minecraft:mineable/shovel", label: t("Mit Schaufel schnell abbaubar") },
  { reg: "block", id: "minecraft:mineable/hoe", label: t("Mit Hacke schnell abbaubar") },
  { reg: "block", id: "minecraft:needs_stone_tool", label: t("Braucht mindestens Steinwerkzeug") },
  { reg: "block", id: "minecraft:needs_iron_tool", label: t("Braucht mindestens Eisenwerkzeug") },
  { reg: "block", id: "minecraft:needs_diamond_tool", label: t("Braucht mindestens Diamantwerkzeug") },
  { reg: "block", id: "minecraft:beacon_base_blocks", label: t("Sockel für Leuchtfeuer") },
  { reg: "block", id: "minecraft:climbable", label: t("Man kann daran klettern") },
  { reg: "block", id: "minecraft:logs", label: t("Zählt als Baumstamm") },
  { reg: "block", id: "minecraft:planks", label: t("Zählt als Bretter") },
  { reg: "block", id: "minecraft:leaves", label: t("Zählt als Laub") },
  { reg: "block", id: "minecraft:dirt", label: t("Zählt als Erde (Pflanzen wachsen)") },
  { reg: "block", id: "minecraft:infiniburn_overworld", label: t("Brennt endlos") },
  { reg: "block", id: "minecraft:soul_fire_base_blocks", label: t("Erzeugt Seelenfeuer") },
  { reg: "block", id: "minecraft:dragon_immune", label: t("Enderdrache zerstört ihn nicht") },
  { reg: "block", id: "minecraft:wither_immune", label: t("Wither zerstört ihn nicht") },
  { reg: "block", id: "minecraft:enderman_holdable", label: t("Endermen können ihn tragen") },
  { reg: "block", id: "minecraft:guarded_by_piglins", label: t("Piglins bewachen ihn") },
  { reg: "item", id: "minecraft:beacon_payment_items", label: t("Bezahlung für Leuchtfeuer") },
  { reg: "item", id: "minecraft:piglin_loved", label: t("Piglins lieben es") },
  { reg: "item", id: "minecraft:trim_materials", label: t("Material für Rüstungsbesatz") },
  { reg: "item", id: "minecraft:coals", label: t("Zählt als Kohle") },
  { reg: "item", id: "minecraft:logs", label: t("Zählt als Baumstamm") },
  { reg: "item", id: "minecraft:planks", label: t("Zählt als Bretter") },
  { reg: "item", id: "minecraft:arrows", label: t("Zählt als Pfeil") },
  { reg: "item", id: "minecraft:fishes", label: t("Zählt als Fisch") },
  { reg: "item", id: "minecraft:swords", label: t("Zählt als Schwert") },
  { reg: "item", id: "minecraft:pickaxes", label: t("Zählt als Spitzhacke") },
  { reg: "entity_type", id: "minecraft:undead", label: t("Untot (Heilung schadet)") },
  { reg: "entity_type", id: "minecraft:arthropod", label: t("Gliederfüßer (Nemesis der Gliederfüßer)") },
  { reg: "entity_type", id: "minecraft:skeletons", label: t("Zählt als Skelett") },
  { reg: "entity_type", id: "minecraft:raiders", label: t("Gehört zu Überfällen") },
  { reg: "entity_type", id: "minecraft:fall_damage_immune", label: t("Kein Fallschaden") },
  { reg: "entity_type", id: "minecraft:freeze_immune_entity_types", label: t("Friert nicht im Pulverschnee") },
  { reg: "entity_type", id: "minecraft:can_breathe_under_water", label: t("Kann unter Wasser atmen") },
  { reg: "worldgen/biome", id: "minecraft:is_overworld", label: t("Gehört zur Oberwelt") },
  { reg: "worldgen/biome", id: "minecraft:is_forest", label: t("Ist ein Wald") },
  { reg: "worldgen/biome", id: "minecraft:is_ocean", label: t("Ist ein Ozean") },
  { reg: "worldgen/biome", id: "minecraft:is_mountain", label: t("Ist ein Gebirge") },
  { reg: "worldgen/biome", id: "minecraft:is_nether", label: t("Gehört zum Nether") },
  { reg: "worldgen/biome", id: "minecraft:has_structure/village_plains", label: t("Hier entstehen Ebenen-Dörfer") },
  { reg: "item", id: "c:gems", label: t("Edelsteine (für andere Mods)") },
  { reg: "item", id: "c:ingots", label: t("Barren (für andere Mods)") },
  { reg: "block", id: "c:storage_blocks", label: t("Speicherblöcke (für andere Mods)") },
  { reg: "block", id: "c:ores", label: t("Erze (für andere Mods)") },
];

const AUTO_NOTE: Record<string, string> = {
  "minecraft:mineable/pickaxe": t("Anvil trägt Blöcke mit Werkzeug „Spitzhacke“ hier schon automatisch ein."),
  "minecraft:mineable/axe": t("Anvil trägt Blöcke mit Werkzeug „Axt“ hier schon automatisch ein."),
  "minecraft:mineable/shovel": t("Anvil trägt Blöcke mit Werkzeug „Schaufel“ hier schon automatisch ein."),
  "minecraft:mineable/hoe": t("Anvil trägt Blöcke mit Werkzeug „Hacke“ hier schon automatisch ein."),
  "minecraft:needs_iron_tool": t("Anvil trägt Blöcke mit dieser Werkzeugstufe hier schon automatisch ein."),
  "minecraft:needs_stone_tool": t("Anvil trägt Blöcke mit dieser Werkzeugstufe hier schon automatisch ein."),
  "minecraft:needs_diamond_tool": t("Anvil trägt Blöcke mit dieser Werkzeugstufe hier schon automatisch ein."),
  "c:ores": t("Anvil trägt deine Erze hier schon automatisch ein."),
};

const regLabel = (r: string) => TAG_REGS.find((x) => x.id === r)?.label ?? r;
const regIcon = (r: string) => TAG_REGS.find((x) => x.id === r)?.icon ?? <TagIcon size={14} />;
const known = (reg: string, id: string) => KNOWN_TAGS.find((k) => k.reg === reg && k.id === id);
const cleanPath = (s: string) => s.toLowerCase().replace(/[^a-z0-9_./-]/g, "_").replace(/\/{2,}/g, "/");
const key = (x: TagDef) => `${x.registry}|${x.id}`;

/** Eigene Inhalte, die in einen Tag dieser Art passen */
function ownEntries(c: Content, modid: string, reg: TagRegistry): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const name = (x: { nameEn?: string; nameDe?: string; id: string }) => x.nameEn || x.nameDe || x.id;
  if (reg === "block" || reg === "item") {
    for (const b of c.blocks) {
      out.push({ id: `${modid}:${b.id}`, label: name(b) });
      for (const s of b.shapes ?? []) out.push({ id: `${modid}:${b.id}_${s}`, label: `${name(b)} (${s})` });
    }
  }
  if (reg === "item") for (const i of c.items) out.push({ id: `${modid}:${i.id}`, label: name(i) });
  if (reg === "entity_type") for (const m of c.mobs) out.push({ id: `${modid}:${m.id}`, label: name(m) });
  if (reg === "worldgen/biome") for (const d of c.dimensions) for (const b of d.biomes ?? []) out.push({ id: `${modid}:${d.id}_${b.id}`, label: `${b.nameEn || b.nameDe || b.id} (${d.nameEn || d.nameDe || d.id})` });
  return out;
}

export default function TagsTab({ project }: { project: Project }) {
  const modid = project.modId;
  const [content, setContent, contentHist] = useUndoable<Content | null>(`content:${project.id}`, null);
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState<string>("");
  const [creating, setCreating] = useState<null | { reg: TagRegistry; id: string }>(null);

  useEffect(() => {
    const d = getDraft(project.id);
    if (d) {
      contentHist.load(d.content);
      setSaved(d.saved);
      return;
    }
    contentApi
      .load(project.id)
      .then((c) => {
        contentHist.load(c);
        setSaved(JSON.stringify(c));
      })
      .catch((e) => toast(String(e), "error"));
  }, [project.id]);
  useEffect(() => {
    if (content && saved) setDraft(project.id, content, saved);
  }, [content, saved, project.id]);

  const tags = content?.tags ?? [];
  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = tags.filter((x) => !query || `${x.id} ${x.desc} ${known(x.registry, x.id)?.label ?? ""}`.toLowerCase().includes(query));
    return [
      { label: t("Eigene Tags"), items: list.filter((x) => x.id.startsWith(`${modid}:`)) },
      { label: t("Erweiterte Minecraft-Tags"), items: list.filter((x) => x.id.startsWith("minecraft:")) },
      { label: t("Andere Namensräume"), items: list.filter((x) => !x.id.startsWith(`${modid}:`) && !x.id.startsWith("minecraft:")) },
    ].filter((g) => g.items.length);
  }, [tags, q, modid]);

  if (!content) return <div className="loc-tab muted">{t("Lade …")}</div>;
  const dirty = JSON.stringify(content) !== saved;
  const cur = tags.find((x) => key(x) === active);

  const update = (k: string, p: Partial<TagDef>) => setContent((c) => (c ? { ...c, tags: (c.tags ?? []).map((x) => (key(x) === k ? { ...x, ...p } : x)) } : c));

  function create(reg: TagRegistry, id: string) {
    const tag: TagDef = { registry: reg, id, values: [], desc: "" };
    if (tags.some((x) => key(x) === key(tag))) {
      setActive(key(tag));
      setCreating(null);
      return;
    }
    setContent((c) => (c ? { ...c, tags: [...(c.tags ?? []), tag] } : c));
    setActive(key(tag));
    setCreating(null);
  }

  async function remove(x: TagDef) {
    if (!(await confirmDialog(t("„{name}“ löschen?", { name: x.id }), x.id.startsWith(`${modid}:`) ? t("Der Tag wird aus deiner Mod entfernt.") : t("Deine Ergänzungen an diesem Tag werden entfernt."), t("Löschen"), t("Abbrechen"), true))) return;
    setContent((c) => (c ? { ...c, tags: (c.tags ?? []).filter((y) => key(y) !== key(x)) } : c));
    setActive("");
  }

  async function save() {
    if (!content) return;
    setBusy(true);
    try {
      const r = await contentApi.save(project.id, content);
      contentHist.replace(r.content);
      setSaved(JSON.stringify(r.content));
      toast(t("Gespeichert – die Tag-Dateien wurden erzeugt."), "success");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tags-tab">
      <aside className="tags-side">
        <div className="tags-side-head">
          <button className="btn primary small grow" onClick={() => setCreating({ reg: "block", id: "" })}>
            <PlusIcon size={14} /> {t("Neuer Tag")}
          </button>
          <button className={busy ? "btn small loading" : "btn small"} disabled={busy || !dirty} onClick={save} data-tip={t("Speichern")} aria-label={t("Speichern")}>
            <SaveIcon size={14} />
          </button>
        </div>
        <div className="search">
          <SearchIcon size={13} />
          <input placeholder={t("Tags durchsuchen …")} aria-label={t("Tags durchsuchen")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="tags-list">
          {groups.map((g) => (
            <div key={g.label} className="tags-group">
              <div className="tags-group-label">{g.label}</div>
              {g.items.map((x) => (
                <button key={key(x)} className={key(x) === active ? "tags-item active" : "tags-item"} onClick={() => setActive(key(x))}>
                  <span className="tags-item-icon">{regIcon(x.registry)}</span>
                  <span className="tags-item-text">
                    <span className="mono">{x.id.replace(/^minecraft:/, "")}</span>
                    <span className="muted tiny">{known(x.registry, x.id)?.label ?? (x.desc || regLabel(x.registry))}</span>
                  </span>
                  <span className="count">{x.values.length}</span>
                </button>
              ))}
            </div>
          ))}
          {tags.length === 0 && <p className="muted small pad">{t("Noch keine Tags.")}</p>}
        </div>
      </aside>

      <section className="tags-main">
        {cur ? (
          <TagEditor key={key(cur)} tag={cur} content={content} modid={modid} onChange={(p) => update(key(cur), p)} onDelete={() => remove(cur)} />
        ) : (
          <TagsHome onPick={(reg, id) => create(reg, id)} existing={tags} />
        )}
      </section>

      {creating && <NewTagDialog modid={modid} onCancel={() => setCreating(null)} onCreate={create} />}
    </div>
  );
}

function TagsHome({ onPick, existing }: { onPick: (reg: TagRegistry, id: string) => void; existing: TagDef[] }) {
  return (
    <div className="tags-home">
      <div className="tags-home-head">
        <TagIcon size={28} />
        <div>
          <h1>{t("Tags")}</h1>
          <p className="muted">{t("Tags sind Gruppen von Blöcken, Items, Kreaturen oder Biomen. Minecraft nutzt sie z. B. dafür, welches Werkzeug einen Block abbaut oder was Piglins mögen. Du kannst eigene Tags anlegen und deine Inhalte zu Minecraft-Tags hinzufügen.")}</p>
        </div>
      </div>
      {TAG_REGS.map((r) => (
        <div key={r.id} className="tags-home-group">
          <div className="tags-group-label">
            {r.icon} {r.label}
          </div>
          <div className="tags-home-grid">
            {KNOWN_TAGS.filter((k) => k.reg === r.id).map((k) => {
              const has = existing.some((x) => x.registry === k.reg && x.id === k.id);
              return (
                <button key={k.id} className={has ? "tags-card has" : "tags-card"} onClick={() => onPick(k.reg, k.id)}>
                  <strong>{k.label}</strong>
                  <span className="mono muted tiny">{k.id}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function TagEditor({ tag, content, modid, onChange, onDelete }: { tag: TagDef; content: Content; modid: string; onChange: (p: Partial<TagDef>) => void; onDelete: () => void }) {
  const [input, setInput] = useState("");
  const own = ownEntries(content, modid, tag.registry);
  const free = own.filter((o) => !tag.values.includes(o.id));
  const k = known(tag.registry, tag.id);
  const otherTags = (content.tags ?? []).filter((x) => x.registry === tag.registry && x.id !== tag.id).map((x) => `#${x.id}`);
  const label = (v: string) => own.find((o) => o.id === v)?.label;

  function add(raw: string) {
    let v = raw.trim().toLowerCase();
    if (!v) return;
    const hash = v.startsWith("#");
    v = v.replace(/^#/, "");
    if (!v.includes(":")) v = `minecraft:${v}`;
    if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(v)) {
      toast(t("Ungültige ID – Beispiel: minecraft:stone"), "error");
      return;
    }
    const full = (hash ? "#" : "") + v;
    if (!tag.values.includes(full)) onChange({ values: [...tag.values, full] });
    setInput("");
  }

  return (
    <div className="tags-editor">
      <header className="tags-editor-head">
        <span className="tags-reg-chip">
          {regIcon(tag.registry)} {regLabel(tag.registry)}
        </span>
        <div className="grow">
          <h2 className="mono">{tag.id}</h2>
          {k && <p className="muted">{k.label}</p>}
        </div>
        <button className="btn small ghost" onClick={onDelete}>
          <TrashIcon size={14} /> {t("Löschen")}
        </button>
      </header>

      {AUTO_NOTE[tag.id] && (
        <div className="loc-hint">
          <InfoIcon size={14} /> {AUTO_NOTE[tag.id]}
        </div>
      )}

      <label className="field">
        <span>{t("Beschreibung")}</span>
        <input className="input" value={tag.desc} placeholder={t("Wofür ist der Tag da?")} onChange={(e) => onChange({ desc: e.target.value })} />
      </label>

      <div className="tags-values">
        <div className="tags-values-head">
          <strong>{t("Einträge")}</strong>
          <span className="muted small">{tag.values.length}</span>
        </div>
        {tag.values.length === 0 && <p className="muted small">{t("Noch leer – füge unten Einträge hinzu.")}</p>}
        <div className="tags-chips">
          {tag.values.map((v) => (
            <span key={v} className={v.startsWith("#") ? "tags-chip ref" : v.startsWith(`${modid}:`) ? "tags-chip own" : "tags-chip"}>
              {label(v) && <span>{label(v)}</span>}
              <span className="mono">{v}</span>
              <button aria-label={t("Entfernen")} onClick={() => onChange({ values: tag.values.filter((x) => x !== v) })}>
                <CloseIcon size={11} />
              </button>
            </span>
          ))}
        </div>
        <div className="tags-add">
          <input
            className="input mono grow"
            list="tags-suggest"
            value={input}
            placeholder={tag.registry === "worldgen/biome" ? "minecraft:plains" : tag.registry === "entity_type" ? "minecraft:zombie" : "minecraft:stone"}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add(input)}
          />
          <datalist id="tags-suggest">
            {[...own.map((o) => o.id), ...otherTags].map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <button className="btn small" onClick={() => add(input)} disabled={!input.trim()}>
            <PlusIcon size={14} /> {t("Hinzufügen")}
          </button>
        </div>
        <p className="muted tiny">{t("Eine ID wie minecraft:stone oder mit # einen anderen Tag, z. B. #minecraft:logs.")}</p>
      </div>

      {free.length > 0 && (
        <div className="tags-own">
          <div className="tags-values-head">
            <strong>{t("Aus deiner Mod")}</strong>
            <button className="btn small ghost" onClick={() => onChange({ values: [...tag.values, ...free.map((f) => f.id)] })}>
              {t("Alle hinzufügen")}
            </button>
          </div>
          <div className="tags-chips">
            {free.map((o) => (
              <button key={o.id} className="tags-chip add" onClick={() => onChange({ values: [...tag.values, o.id] })}>
                <PlusIcon size={11} /> {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="tags-usage muted small">
        <InfoIcon size={13} /> {t("Im Blueprint-Editor kannst du mit Bedingungen wie „Block ist im Tag“ oder „Hält Item aus Tag“ darauf prüfen.")}
      </div>
    </div>
  );
}

function NewTagDialog({ modid, onCancel, onCreate }: { modid: string; onCancel: () => void; onCreate: (reg: TagRegistry, id: string) => void }) {
  const [reg, setReg] = useState<TagRegistry>("block");
  const [ns, setNs] = useState<"own" | "minecraft" | "c">("own");
  const [path, setPath] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  const nsId = ns === "own" ? modid : ns;
  const p = path.replace(/^\/+|\/+$/g, "");
  const ok = !!p && !p.includes("..");
  const suggestions = KNOWN_TAGS.filter((k) => k.reg === reg && k.id.startsWith(`${nsId}:`));
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="vars-dialog" role="dialog" aria-label={t("Neuer Tag")}>
        <div className="vars-dialog-head">
          <TagIcon size={18} />
          <strong className="grow">{t("Neuer Tag")}</strong>
          <button className="icon-btn" onClick={onCancel} aria-label={t("Schließen")}>
            <CloseIcon size={14} />
          </button>
        </div>
        <div className="field">
          <span>{t("Art")}</span>
          <div className="vars-kinds">
            {TAG_REGS.map((r) => (
              <button key={r.id} className={reg === r.id ? "vars-kind active row" : "vars-kind row"} onClick={() => setReg(r.id)}>
                {r.icon} <strong>{r.label}</strong>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>{t("Namensraum")}</span>
          <div className="vars-scopes three">
            {(
              [
                ["own", modid, t("Eigener Tag deiner Mod")],
                ["minecraft", "minecraft", t("Minecraft-Tag erweitern")],
                ["c", "c", t("Gemeinsamer Tag für andere Mods")],
              ] as const
            ).map(([id, label, desc]) => (
              <button key={id} className={ns === id ? "vars-kind active" : "vars-kind"} onClick={() => setNs(id)}>
                <strong className="mono">{label}:</strong>
                <span className="muted tiny">{desc}</span>
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>{t("Name")}</span>
          <div className="tags-id-input">
            <span className="mono muted">{nsId}:</span>
            <input autoFocus className="input mono grow" list="tags-new-suggest" value={path} placeholder={ns === "own" ? "edelsteine" : "mineable/pickaxe"} onChange={(e) => setPath(cleanPath(e.target.value.replace(/^[a-z0-9_.-]+:/, "")))} onKeyDown={(e) => e.key === "Enter" && ok && onCreate(reg, `${nsId}:${p}`)} />
          </div>
          <datalist id="tags-new-suggest">
            {suggestions.map((s) => (
              <option key={s.id} value={s.id.split(":")[1]} label={s.label} />
            ))}
          </datalist>
        </label>
        {suggestions.length > 0 && (
          <div className="tags-chips">
            {suggestions.slice(0, 12).map((s) => (
              <button key={s.id} className="tags-chip add" onClick={() => setPath(s.id.split(":")[1])}>
                {s.label}
              </button>
            ))}
          </div>
        )}
        <div className="vars-dialog-foot">
          <button className="btn" onClick={onCancel}>
            {t("Abbrechen")}
          </button>
          <button className="btn primary" disabled={!ok} onClick={() => onCreate(reg, `${nsId}:${p}`)}>
            <PlusIcon size={14} /> {t("Anlegen")}
          </button>
        </div>
      </div>
    </div>
  );
}
