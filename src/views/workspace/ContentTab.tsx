import { useCallback, useEffect, useMemo, useState } from "react";
import { ArmorSlot, BlockDef, Content, contentApi, ItemDef, Project, Recipe } from "../../api";
import { useCatalog } from "../../catalog";
import { Segmented, Toggle } from "../../components/Chrome";
import ItemPicker, { OwnEntry, resolveItem } from "../../components/ItemPicker";
import McIcon from "../../components/McIcon";
import { BoxIcon, ChestplateIcon, CloseIcon, CopyIcon, CubeIcon, PlusIcon, SaveIcon, SearchIcon, SparkIcon, SwordIcon, TrashIcon } from "../../icons";
import { toast } from "../../state";
import PixelEditor from "./PixelEditor";
import { ArmorForm, BlockExtras, Field, ItemKindSwitch, ToolForm } from "./ContentForms";
import { armorPreset, newBlock, newItem, normalizeBlock, normalizeItem, SLOT_EN, SLOT_LABEL, variantIds } from "./contentDefaults";

const normalize = (c: Content): Content => ({ ...c, blocks: c.blocks.map(normalizeBlock), items: c.items.map(normalizeItem), tabIcon: c.tabIcon ?? "", tabName: c.tabName ?? "" });

type Sel = { kind: "block" | "item"; index: number } | null;

export default function ContentTab({ project }: { project: Project }) {
  const [content, setContent] = useState<Content | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [sel, setSel] = useState<Sel>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [textures, setTextures] = useState<Record<string, string>>({});

  const loadTextures = useCallback(
    async (c: Content) => {
      const entries = await Promise.all([
        ...c.generatedBlocks.map(async (id) => [id, await contentApi.textureGet(project.id, "block", id).catch(() => null)] as const),
        ...c.generatedItems.map(async (id) => [id, await contentApi.textureGet(project.id, "item", id).catch(() => null)] as const),
      ]);
      setTextures(Object.fromEntries(entries.filter(([, b]) => b).map(([id, b]) => [id, `data:image/png;base64,${b}`])));
    },
    [project.id],
  );

  useEffect(() => {
    contentApi
      .load(project.id)
      .then((raw) => {
        const c = normalize(raw);
        setContent(c);
        setSaved(JSON.stringify(c));
        loadTextures(c);
        if (c.blocks.length) setSel({ kind: "block", index: 0 });
        else if (c.items.length) setSel({ kind: "item", index: 0 });
      })
      .catch((e) => toast(String(e), "error"));
  }, [project.id, loadTextures]);

  const dirty = content ? JSON.stringify(content) !== saved : false;
  const savedContent = useMemo(() => (saved ? (JSON.parse(saved) as Content) : null), [saved]);
  const savedIds = useMemo(() => [...(savedContent?.generatedBlocks ?? []), ...(savedContent?.generatedItems ?? [])], [savedContent]);

  async function save() {
    if (!content) return;
    setBusy(true);
    try {
      const r = await contentApi.save(project.id, content);
      const c = normalize(r.content);
      setContent(c);
      setSaved(JSON.stringify(c));
      loadTextures(c);
      if (r.registration === "ok" || r.registration === "added") {
        setHint(null);
        toast(r.registration === "added" ? "Gespeichert – die Hauptklasse wurde einmalig ergänzt." : "Gespeichert, Code und Dateien erzeugt.", "success");
      } else {
        setHint(r.registration);
        toast("Gespeichert – ein Schritt fehlt noch (siehe Hinweis).", "info");
      }
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const allIds = useMemo(() => (content ? [...content.blocks.flatMap((b) => variantIds(b).map((v) => v.id)), ...content.items.map((i) => i.id)] : []), [content]);
  const own: OwnEntry[] = useMemo(
    () =>
      content
        ? [
            ...content.blocks.flatMap((b) =>
              variantIds(b).map((v) => ({ id: v.id, name: v.name, kind: "block" as const, texture: textures[b.id], shape: v.shape })),
            ),
            ...content.items.map((i) => ({ id: i.id, name: i.nameDe || i.nameEn || i.id, kind: "item" as const, texture: textures[i.id] })),
          ]
        : [],
    [content, textures],
  );

  function uniqueId(base: string) {
    let id = base;
    let n = 2;
    while (allIds.includes(id)) id = `${base}_${n++}`;
    return id;
  }

  function addBlock(from?: BlockDef) {
    if (!content) return;
    const b: BlockDef = from
      ? { ...structuredClone(from), id: uniqueId(`${from.id}_kopie`), nameDe: `${from.nameDe} (Kopie)`, nameEn: `${from.nameEn} (Copy)` }
      : newBlock(uniqueId("neuer_block"));
    setContent({ ...content, blocks: [...content.blocks, b] });
    setSel({ kind: "block", index: content.blocks.length });
    setFilter("");
  }

  function addItem(from?: ItemDef, kind: ItemDef["kind"] = "basic") {
    if (!content) return;
    const base = kind === "tool" ? "neues_werkzeug" : kind === "armor" ? "neue_ruestung" : "neues_item";
    const i: ItemDef = from
      ? { ...structuredClone(from), id: uniqueId(`${from.id}_kopie`), nameDe: `${from.nameDe} (Kopie)`, nameEn: `${from.nameEn} (Copy)` }
      : newItem(uniqueId(base), kind);
    setContent({ ...content, items: [...content.items, i] });
    setSel({ kind: "item", index: content.items.length });
    setFilter("");
  }

  function createArmorSet(from: ItemDef) {
    if (!content) return;
    const mat = from.armorMaterial || "material";
    const have = content.items.filter((i) => i.kind === "armor" && i.armorMaterial === mat).map((i) => i.armorSlot);
    const matName = (from.nameDe || mat).replace(/[- ]?(Helm|Brustpanzer|Hose|Stiefel)$/i, "").trim() || mat;
    const matEn = (from.nameEn || mat).replace(/[- ]?(Helmet|Chestplate|Leggings|Boots)$/i, "").trim() || mat;
    const ids = new Set(allIds);
    const added: ItemDef[] = [];
    for (const slot of ["helmet", "chestplate", "leggings", "boots"] as ArmorSlot[]) {
      if (have.includes(slot)) continue;
      let id = `${mat}_${slot}`;
      let n = 2;
      while (ids.has(id)) id = `${mat}_${slot}_${n++}`;
      ids.add(id);
      added.push({
        ...structuredClone(from),
        id,
        nameDe: `${matName}-${SLOT_LABEL[slot]}`,
        nameEn: `${matEn} ${SLOT_EN[slot]}`,
        armorSlot: slot,
        defense: armorPreset("iron", slot).defense! + Math.max(0, from.defense - armorPreset("iron", from.armorSlot).defense!),
        recipe: { ...from.recipe, enabled: false },
      });
    }
    setContent({ ...content, items: [...content.items, ...added] });
    toast(`${added.length} Rüstungsteile hinzugefügt.`, "success");
  }

  function remove() {
    if (!content || !sel) return;
    const name = sel.kind === "block" ? content.blocks[sel.index].id : content.items[sel.index].id;
    if (!confirm(`„${name}“ entfernen? Die erzeugten Dateien werden beim Speichern gelöscht, die Textur bleibt erhalten.`)) return;
    if (sel.kind === "block") setContent({ ...content, blocks: content.blocks.filter((_, i) => i !== sel.index) });
    else setContent({ ...content, items: content.items.filter((_, i) => i !== sel.index) });
    setSel(null);
  }

  if (!content) return <div className="content-loading muted">Lade Inhalte …</div>;

  const block = sel?.kind === "block" ? content.blocks[sel.index] : undefined;
  const item = sel?.kind === "item" ? content.items[sel.index] : undefined;
  const current = block ?? item;
  const q = filter.trim().toLowerCase();
  const matches = (d: { id: string; nameDe: string; nameEn: string }) => !q || `${d.id} ${d.nameDe} ${d.nameEn}`.toLowerCase().includes(q);

  const updBlock = (patch: Partial<BlockDef>) => setContent({ ...content, blocks: content.blocks.map((b, i) => (i === sel!.index ? { ...b, ...patch } : b)) });
  const updItem = (patch: Partial<ItemDef>) => setContent({ ...content, items: content.items.map((b, i) => (i === sel!.index ? { ...b, ...patch } : b)) });

  const entryIcon = (kind: "block" | "item", id: string, name: string) => {
    const key = `own:${id}`;
    return (
      <McIcon
        icon={kind === "block" ? { kind: "cube", top: key, side: key } : { kind: "flat", tex: key }}
        textures={textures[id] ? { [key]: textures[id] } : undefined}
        size={24}
        fallback={name}
      />
    );
  };

  return (
    <div className="content">
      <aside className="content-list">
        <div className="content-list-search">
          <div className="search">
            <SearchIcon size={13} />
            <label htmlFor="cfilter" className="sr-only">
              Inhalte durchsuchen
            </label>
            <input id="cfilter" placeholder="Inhalte durchsuchen …" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
        </div>
        <div className="content-list-scroll">
          <div className="content-list-head">
            <span>Blöcke · {content.blocks.length}</span>
            <button className="icon-btn" onClick={() => addBlock()} aria-label="Block hinzufügen" data-tip="Block hinzufügen">
              <PlusIcon size={15} />
            </button>
          </div>
          {content.blocks.map((b, i) =>
            matches(b) ? (
              <button key={`b${i}`} className={sel?.kind === "block" && sel.index === i ? "entry active" : "entry"} onClick={() => setSel({ kind: "block", index: i })}>
                {entryIcon("block", b.id, b.nameDe || b.id)}
                <span className="entry-text">
                  <span className="entry-name">{b.nameDe || b.id}</span>
                  <span className="entry-id">{b.id}</span>
                </span>
                {(b.ore.enabled || b.shapes.length > 0) && (
                  <span className="entry-badges">
                    {b.ore.enabled && <span className="badge-mini">Erz</span>}
                    {b.shapes.length > 0 && <span className="badge-mini">+{b.shapes.length}</span>}
                  </span>
                )}
              </button>
            ) : null,
          )}
          {content.blocks.length === 0 && <p className="muted small pad">Noch keine Blöcke.</p>}
          <div className="content-list-head">
            <span>Items · {content.items.length}</span>
            <span className="row gap-2">
              <button className="icon-btn" onClick={() => addItem(undefined, "tool")} aria-label="Werkzeug hinzufügen" data-tip="Werkzeug / Waffe">
                <SwordIcon size={15} />
              </button>
              <button className="icon-btn" onClick={() => addItem(undefined, "armor")} aria-label="Rüstung hinzufügen" data-tip="Rüstung">
                <ChestplateIcon size={15} />
              </button>
              <button className="icon-btn" onClick={() => addItem()} aria-label="Item hinzufügen" data-tip="Item">
                <PlusIcon size={15} />
              </button>
            </span>
          </div>
          {content.items.map((it, i) =>
            matches(it) ? (
              <button key={`i${i}`} className={sel?.kind === "item" && sel.index === i ? "entry active" : "entry"} onClick={() => setSel({ kind: "item", index: i })}>
                {entryIcon("item", it.id, it.nameDe || it.id)}
                <span className="entry-text">
                  <span className="entry-name">{it.nameDe || it.id}</span>
                  <span className="entry-id">{it.id}</span>
                </span>
                {it.kind !== "basic" && <span className="entry-badges">{it.kind === "tool" ? <SwordIcon size={12} /> : <ChestplateIcon size={12} />}</span>}
              </button>
            ) : null,
          )}
          {content.items.length === 0 && <p className="muted small pad">Noch keine Items.</p>}
        </div>
        <div className="content-save">
          <button className={busy ? "btn primary full loading" : "btn primary full"} disabled={busy || (!dirty && content.generatorVersion > 0)} onClick={save}>
            <SaveIcon size={14} /> {dirty ? "Speichern & Code erzeugen" : "Alles gespeichert"}
          </button>
          <div className="muted small center">Strg S</div>
        </div>
      </aside>

      <section className="content-editor">
        {hint && (
          <div className="callout warn">
            <div>
              <div className="callout-title">Einmaliger Schritt nötig</div>
              <div className="small mono" style={{ userSelect: "text" }}>
                {hint}
              </div>
            </div>
          </div>
        )}
        {!current ? (
          <div className="content-empty">
            <div className="empty-icon">
              <CubeIcon size={26} />
            </div>
            <h2>Blöcke &amp; Items ohne Code</h2>
            <p className="muted">
              Lege Inhalte per Formular an. Beim Speichern erzeugt Anvil Studio Java-Code, Modelle, Loot-Tabellen, Rezepte und Übersetzungen – passend für
              Minecraft {project.mcVersion}.
            </p>
            <div className="row center">
              <button className="btn primary" onClick={() => addBlock()}>
                <PlusIcon size={15} /> Block
              </button>
              <button className="btn" onClick={() => addItem()}>
                <BoxIcon size={15} /> Item
              </button>
              <button className="btn" onClick={() => addItem(undefined, "tool")}>
                <SwordIcon size={15} /> Werkzeug
              </button>
              <button className="btn" onClick={() => addItem(undefined, "armor")}>
                <ChestplateIcon size={15} /> Rüstung
              </button>
            </div>
          </div>
        ) : (
          <div className="editor-grid" key={`${sel!.kind}-${sel!.index}`}>
            <div className="panel form-panel">
              <div className="panel-head">
                <div className="row">
                  {entryIcon(sel!.kind, current.id, current.nameDe)}
                  <div className="panel-title-lg">{block ? (block.ore.enabled ? "Erz" : "Block") : item!.kind === "tool" ? "Werkzeug" : item!.kind === "armor" ? "Rüstung" : "Item"}</div>
                </div>
                <div className="row gap-6">
                  <button className="icon-btn" onClick={() => (block ? addBlock(block) : addItem(item))} aria-label="Duplizieren" data-tip="Duplizieren">
                    <CopyIcon size={15} />
                  </button>
                  <button className="icon-btn danger" onClick={remove} aria-label="Entfernen" data-tip="Entfernen">
                    <TrashIcon size={15} />
                  </button>
                </div>
              </div>
              <div className="form-grid">
                <Field label="ID" hint={savedIds.includes(current.id) ? "ändern löscht die alten Dateien" : "Kleinbuchstaben, _"}>
                  <input
                    className="input mono"
                    value={current.id}
                    onChange={(e) => {
                      const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_");
                      block ? updBlock({ id: v }) : updItem({ id: v });
                    }}
                  />
                </Field>
                <Field label="Vollständige ID">
                  <input className="input mono" readOnly value={`${project.modId}:${current.id}`} />
                </Field>
                <Field label="Name (Deutsch)">
                  <input className="input" value={current.nameDe} onChange={(e) => (block ? updBlock({ nameDe: e.target.value }) : updItem({ nameDe: e.target.value }))} />
                </Field>
                <Field label="Name (Englisch)">
                  <input className="input" value={current.nameEn} onChange={(e) => (block ? updBlock({ nameEn: e.target.value }) : updItem({ nameEn: e.target.value }))} />
                </Field>

                {block && (
                  <>
                    <Field label="Material & Klang">
                      <select className="input" value={block.material} onChange={(e) => updBlock({ material: e.target.value as BlockDef["material"] })}>
                        <option value="stone">Stein</option>
                        <option value="wood">Holz</option>
                        <option value="metal">Metall</option>
                        <option value="glass">Glas (durchsichtig)</option>
                        <option value="grass">Gras/Pflanze</option>
                        <option value="sand">Sand</option>
                        <option value="gravel">Kies</option>
                        <option value="wool">Wolle</option>
                      </select>
                    </Field>
                    <Field label={`Leuchtkraft · ${block.light}`}>
                      <input type="range" className="range full" min={0} max={15} value={block.light} onChange={(e) => updBlock({ light: Number(e.target.value) })} />
                    </Field>
                    <Field label="Härte" hint="Stein 1,5 · Eisenerz 3 · Obsidian 50">
                      <input className="input" type="number" min={0} step={0.5} value={block.hardness} onChange={(e) => updBlock({ hardness: Number(e.target.value) })} />
                    </Field>
                    <Field label="Explosionsresistenz" hint="Stein 6 · Obsidian 1200">
                      <input className="input" type="number" min={0} step={1} value={block.resistance} onChange={(e) => updBlock({ resistance: Number(e.target.value) })} />
                    </Field>
                    <Field label="Abbauen mit">
                      <select className="input" value={block.tool} onChange={(e) => updBlock({ tool: e.target.value as BlockDef["tool"] })}>
                        <option value="none">Beliebig (droppt immer)</option>
                        <option value="pickaxe">Spitzhacke</option>
                        <option value="axe">Axt</option>
                        <option value="shovel">Schaufel</option>
                        <option value="hoe">Hacke</option>
                      </select>
                    </Field>
                    <Field label="Mindestens">
                      <select className="input" value={block.tier} disabled={block.tool === "none"} onChange={(e) => updBlock({ tier: e.target.value as BlockDef["tier"] })}>
                        <option value="wood">Holz</option>
                        <option value="stone">Stein</option>
                        <option value="iron">Eisen</option>
                        <option value="diamond">Diamant</option>
                      </select>
                    </Field>
                  </>
                )}

                {item && <ItemKindSwitch item={item} onChange={updItem} />}
                {item && item.kind === "basic" && (
                  <>
                    <Field label="Stapelgröße">
                      <select className="input" value={item.stackSize} onChange={(e) => updItem({ stackSize: Number(e.target.value) })}>
                        <option value={64}>64</option>
                        <option value={16}>16</option>
                        <option value={1}>1 (nicht stapelbar)</option>
                      </select>
                    </Field>
                    <div className="span-2 toggle-row" style={{ flexDirection: "row" }}>
                      <Toggle label="Essbar" checked={item.food} onChange={(v) => updItem({ food: v })} />
                      <span>Essbar</span>
                    </div>
                    {item.food && (
                      <>
                        <Field label={`Hunger · ${item.nutrition / 2} Keulen`}>
                          <input type="range" className="range full" min={1} max={20} value={item.nutrition} onChange={(e) => updItem({ nutrition: Number(e.target.value) })} />
                        </Field>
                        <Field label="Sättigung" hint="Apfel 0,3 · Steak 0,8">
                          <input className="input" type="number" min={0} max={2} step={0.1} value={item.saturation} onChange={(e) => updItem({ saturation: Number(e.target.value) })} />
                        </Field>
                      </>
                    )}
                  </>
                )}
                {item && (
                  <Field label="Seltenheit" hint="Farbe des Namens">
                    <select className="input" value={item.rarity} onChange={(e) => updItem({ rarity: e.target.value as ItemDef["rarity"] })}>
                      <option value="common">Gewöhnlich (weiß)</option>
                      <option value="uncommon">Ungewöhnlich (gelb)</option>
                      <option value="rare">Selten (türkis)</option>
                      <option value="epic">Episch (lila)</option>
                    </select>
                  </Field>
                )}
              </div>

              {block && <BlockExtras project={project} block={block} own={own} texture={textures[block.id]} onChange={updBlock} />}
              {item?.kind === "tool" && <ToolForm project={project} item={item} own={own} onChange={updItem} />}
              {item?.kind === "armor" && (
                <ArmorForm
                  project={project}
                  item={item}
                  own={own}
                  onChange={updItem}
                  onCreateSet={() => createArmorSet(item)}
                  missingSlots={(["helmet", "chestplate", "leggings", "boots"] as ArmorSlot[]).filter(
                    (sl) => !content.items.some((x) => x.kind === "armor" && x.armorMaterial === item.armorMaterial && x.armorSlot === sl),
                  )}
                />
              )}

              <RecipeEditor
                project={project}
                recipe={current.recipe}
                own={own}
                resultId={`${project.modId}:${current.id}`}
                onChange={(recipe) => (block ? updBlock({ recipe }) : updItem({ recipe }))}
              />
            </div>

            <div className="panel texture-panel">
              <div className="panel-title-lg">Textur</div>
              {savedIds.includes(current.id) ? (
                <PixelEditor
                  projectId={project.id}
                  kind={sel!.kind}
                  id={current.id}
                  onSaved={(dataUrl) => setTextures((t) => ({ ...t, [current.id]: dataUrl }))}
                />
              ) : (
                <div className="texture-wait">
                  <SparkIcon size={20} />
                  <p className="muted small">Speichere zuerst, dann kannst du die Textur malen.</p>
                  <button className="btn small primary" onClick={save} disabled={busy}>
                    <SaveIcon size={14} /> Jetzt speichern
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function RecipeEditor({
  project,
  recipe,
  own,
  resultId,
  onChange,
}: {
  project: Project;
  recipe: Recipe;
  own: OwnEntry[];
  resultId: string;
  onChange: (r: Recipe) => void;
}) {
  const grid = recipe.grid?.length === 9 ? recipe.grid : Array(9).fill("");
  const kind = recipe.kind ?? "crafting";
  const [picking, setPicking] = useState<number | null>(null);
  const { catalog } = useCatalog(project.mcVersion, recipe.enabled);
  const mode = kind === "smelting" ? "smelting" : recipe.shaped ? "shaped" : "shapeless";
  const cells = kind === "smelting" ? [0] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const resultInfo = resolveItem(resultId, catalog, own, project.modId);

  const setCell = (i: number, v: string) => {
    const g = [...grid];
    g[i] = v;
    onChange({ ...recipe, grid: g });
  };

  return (
    <div className="recipe">
      <div className="recipe-head">
        <Toggle label="Rezept" checked={recipe.enabled} onChange={(v) => onChange({ ...recipe, enabled: v, grid, kind })} />
        <span className="panel-title-lg">Rezept</span>
        {recipe.enabled && (
          <Segmented
            label="Rezeptart"
            value={mode}
            onChange={(v) => onChange({ ...recipe, grid, kind: v === "smelting" ? "smelting" : "crafting", shaped: v !== "shapeless" })}
            options={[
              { value: "shaped", label: "Werkbank" },
              { value: "shapeless", label: "Ohne Form" },
              { value: "smelting", label: "Ofen" },
            ]}
          />
        )}
      </div>
      {recipe.enabled && (
        <div className="recipe-body">
          <div className={kind === "smelting" ? "craft-grid one" : "craft-grid"}>
            {cells.map((i) => {
              const id = grid[i];
              const info = resolveItem(id, catalog, own, project.modId);
              return (
                <button
                  key={i}
                  type="button"
                  className={id ? "slot-btn filled" : "slot-btn"}
                  title={id ? `${info.name}\n${id}` : "Item wählen"}
                  aria-label={id ? `Feld ${i + 1}: ${info.name}` : `Feld ${i + 1}: leer`}
                  onClick={() => setPicking(i)}
                >
                  {id ? (
                    <McIcon icon={info.icon} textures={info.textures} size={34} fallback={info.name} />
                  ) : (
                    <span className="slot-plus">
                      <PlusIcon size={14} />
                    </span>
                  )}
                  {id && (
                    <span
                      role="button"
                      className="slot-clear"
                      aria-label="Leeren"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCell(i, "");
                      }}
                    >
                      <CloseIcon size={9} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="craft-result">
            <svg className="craft-arrow" width="28" height="20" viewBox="0 0 28 20" aria-hidden="true">
              <path d="M2 10h22M17 3l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="result-slot" title={resultInfo.name}>
              <McIcon icon={resultInfo.icon} textures={resultInfo.textures} size={40} fallback={resultInfo.name} />
              {kind !== "smelting" && recipe.count > 1 && <span className="result-count">{recipe.count}</span>}
            </div>
          </div>
          <div className="recipe-options">
            {kind === "smelting" ? (
              <>
                <Field label="Erfahrung">
                  <input className="input" type="number" min={0} step={0.1} value={recipe.experience ?? 0.1} onChange={(e) => onChange({ ...recipe, experience: Number(e.target.value) })} />
                </Field>
                <Field label="Dauer (Sekunden)">
                  <input
                    className="input"
                    type="number"
                    min={1}
                    step={1}
                    value={Math.round((recipe.cookingTime ?? 200) / 20)}
                    onChange={(e) => onChange({ ...recipe, cookingTime: Math.max(1, Number(e.target.value)) * 20 })}
                  />
                </Field>
              </>
            ) : (
              <Field label="Anzahl">
                <input className="input" type="number" min={1} max={64} value={recipe.count} onChange={(e) => onChange({ ...recipe, count: Number(e.target.value) })} />
              </Field>
            )}
          </div>
        </div>
      )}
      {picking !== null && (
        <ItemPicker
          mcVersion={project.mcVersion}
          modId={project.modId}
          own={own}
          onClose={() => setPicking(null)}
          onPick={(id) => {
            setCell(picking, id);
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}
