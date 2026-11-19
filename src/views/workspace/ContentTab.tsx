import { useEffect, useMemo, useState } from "react";
import { BlockDef, Content, contentApi, ItemDef, Project, Recipe } from "../../api";
import { Segmented, Toggle } from "../../components/Chrome";
import { CubeIcon, PlusIcon, SparkIcon, TrashIcon } from "../../icons";
import { toast } from "../../state";
import PixelEditor from "./PixelEditor";

const VANILLA = [
  "minecraft:stick", "minecraft:oak_planks", "#minecraft:planks", "#minecraft:logs", "minecraft:cobblestone", "minecraft:stone",
  "minecraft:iron_ingot", "minecraft:gold_ingot", "minecraft:copper_ingot", "minecraft:diamond", "minecraft:emerald", "minecraft:netherite_ingot",
  "minecraft:redstone", "minecraft:lapis_lazuli", "minecraft:coal", "minecraft:quartz", "minecraft:amethyst_shard", "minecraft:glass",
  "minecraft:string", "minecraft:leather", "minecraft:paper", "minecraft:feather", "minecraft:bone", "minecraft:slime_ball",
  "minecraft:apple", "minecraft:wheat", "minecraft:sugar", "minecraft:egg", "minecraft:glowstone_dust", "minecraft:ender_pearl",
  "#minecraft:wool", "minecraft:sand", "minecraft:clay_ball", "minecraft:obsidian",
];

const emptyRecipe = (): Recipe => ({ enabled: false, shaped: true, grid: Array(9).fill(""), count: 1 });

type Sel = { kind: "block" | "item"; index: number } | null;

export default function ContentTab({ project }: { project: Project }) {
  const [content, setContent] = useState<Content | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [sel, setSel] = useState<Sel>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    contentApi
      .load(project.id)
      .then((c) => {
        setContent(c);
        setSaved(JSON.stringify(c));
        if (c.blocks.length) setSel({ kind: "block", index: 0 });
        else if (c.items.length) setSel({ kind: "item", index: 0 });
      })
      .catch((e) => toast(String(e), "error"));
  }, [project.id]);

  const dirty = content ? JSON.stringify(content) !== saved : false;

  async function save() {
    if (!content) return;
    setBusy(true);
    try {
      const r = await contentApi.save(project.id, content);
      setContent(r.content);
      setSaved(JSON.stringify(r.content));
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

  // Strg+S speichert
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

  const allIds = useMemo(() => (content ? [...content.blocks.map((b) => b.id), ...content.items.map((i) => i.id)] : []), [content]);

  function uniqueId(base: string) {
    let id = base;
    let n = 2;
    while (allIds.includes(id)) id = `${base}_${n++}`;
    return id;
  }

  function addBlock() {
    if (!content) return;
    const b: BlockDef = {
      id: uniqueId("neuer_block"), nameDe: "Neuer Block", nameEn: "New Block", material: "stone", hardness: 1.5, resistance: 6,
      light: 0, tool: "pickaxe", tier: "wood", recipe: emptyRecipe(),
    };
    setContent({ ...content, blocks: [...content.blocks, b] });
    setSel({ kind: "block", index: content.blocks.length });
  }

  function addItem() {
    if (!content) return;
    const i: ItemDef = {
      id: uniqueId("neues_item"), nameDe: "Neues Item", nameEn: "New Item", stackSize: 64, rarity: "common", food: false,
      nutrition: 4, saturation: 0.3, recipe: emptyRecipe(),
    };
    setContent({ ...content, items: [...content.items, i] });
    setSel({ kind: "item", index: content.items.length });
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
  const savedIds = (JSON.parse(saved || "{}") as Content).generatedBlocks?.concat((JSON.parse(saved || "{}") as Content).generatedItems ?? []) ?? [];

  const updBlock = (patch: Partial<BlockDef>) =>
    setContent({ ...content, blocks: content.blocks.map((b, i) => (i === sel!.index ? { ...b, ...patch } : b)) });
  const updItem = (patch: Partial<ItemDef>) =>
    setContent({ ...content, items: content.items.map((b, i) => (i === sel!.index ? { ...b, ...patch } : b)) });

  const suggestions = [...allIds.map((id) => `${project.modId}:${id}`), ...VANILLA];

  return (
    <div className="content">
      <aside className="content-list">
        <div className="content-list-head">
          <span>Blöcke</span>
          <button className="icon-btn" onClick={addBlock} aria-label="Block hinzufügen" data-tip="Block hinzufügen">
            <PlusIcon size={15} />
          </button>
        </div>
        {content.blocks.map((b, i) => (
          <button key={`b${i}`} className={sel?.kind === "block" && sel.index === i ? "entry active" : "entry"} onClick={() => setSel({ kind: "block", index: i })}>
            <span className="entry-icon block" />
            <span className="entry-name">{b.nameDe || b.id}</span>
            <span className="entry-id mono">{b.id}</span>
          </button>
        ))}
        {content.blocks.length === 0 && <p className="muted small pad">Noch keine Blöcke.</p>}
        <div className="content-list-head">
          <span>Items</span>
          <button className="icon-btn" onClick={addItem} aria-label="Item hinzufügen" data-tip="Item hinzufügen">
            <PlusIcon size={15} />
          </button>
        </div>
        {content.items.map((it, i) => (
          <button key={`i${i}`} className={sel?.kind === "item" && sel.index === i ? "entry active" : "entry"} onClick={() => setSel({ kind: "item", index: i })}>
            <span className="entry-icon item" />
            <span className="entry-name">{it.nameDe || it.id}</span>
            <span className="entry-id mono">{it.id}</span>
          </button>
        ))}
        {content.items.length === 0 && <p className="muted small pad">Noch keine Items.</p>}
        <div className="content-save">
          <button className={busy ? "btn primary full loading" : "btn primary full"} disabled={busy || (!dirty && content.generatorVersion > 0)} onClick={save}>
            {dirty ? "Speichern & Code erzeugen" : "Alles gespeichert"}
          </button>
          <div className="muted small center">Strg S</div>
        </div>
      </aside>

      <section className="content-editor">
        {hint && (
          <div className="callout warn">
            <div>
              <div className="callout-title">Einmaliger Schritt nötig</div>
              <div className="small mono" style={{ userSelect: "text" }}>{hint}</div>
            </div>
          </div>
        )}
        {!block && !item ? (
          <div className="content-empty">
            <div className="empty-icon">
              <CubeIcon size={28} />
            </div>
            <h2>Blöcke &amp; Items ohne Code</h2>
            <p className="muted">
              Lege Inhalte per Formular an. Beim Speichern erzeugt Anvil Studio Java-Code, Modelle, Loot-Tabellen, Rezepte und Übersetzungen – passend für
              Minecraft {project.mcVersion}.
            </p>
            <div className="row center">
              <button className="btn primary" onClick={addBlock}>
                <PlusIcon size={15} /> Block
              </button>
              <button className="btn" onClick={addItem}>
                <PlusIcon size={15} /> Item
              </button>
            </div>
          </div>
        ) : (
          <div className="editor-grid" key={`${sel!.kind}-${sel!.index}`}>
            <div className="panel form-panel">
              <div className="panel-head">
                <div className="panel-title-lg">{sel!.kind === "block" ? "Block" : "Item"}</div>
                <button className="icon-btn danger" onClick={remove} aria-label="Entfernen" data-tip="Entfernen">
                  <TrashIcon size={15} />
                </button>
              </div>
              <div className="form-grid">
                <Field label="ID" hint={savedIds.includes((block ?? item)!.id) ? "ändern löscht die alten Dateien" : "Kleinbuchstaben, _"}>
                  <input
                    className="input mono"
                    value={(block ?? item)!.id}
                    onChange={(e) => {
                      const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_");
                      block ? updBlock({ id: v }) : updItem({ id: v });
                    }}
                  />
                </Field>
                <Field label="Vollständige ID">
                  <input className="input mono" readOnly value={`${project.modId}:${(block ?? item)!.id}`} />
                </Field>
                <Field label="Name (Deutsch)">
                  <input className="input" value={(block ?? item)!.nameDe} onChange={(e) => (block ? updBlock({ nameDe: e.target.value }) : updItem({ nameDe: e.target.value }))} />
                </Field>
                <Field label="Name (Englisch)">
                  <input className="input" value={(block ?? item)!.nameEn} onChange={(e) => (block ? updBlock({ nameEn: e.target.value }) : updItem({ nameEn: e.target.value }))} />
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

                {item && (
                  <>
                    <Field label="Stapelgröße">
                      <select className="input" value={item.stackSize} onChange={(e) => updItem({ stackSize: Number(e.target.value) })}>
                        <option value={64}>64</option>
                        <option value={16}>16</option>
                        <option value={1}>1 (nicht stapelbar)</option>
                      </select>
                    </Field>
                    <Field label="Seltenheit" hint="Farbe des Namens">
                      <select className="input" value={item.rarity} onChange={(e) => updItem({ rarity: e.target.value as ItemDef["rarity"] })}>
                        <option value="common">Gewöhnlich (weiß)</option>
                        <option value="uncommon">Ungewöhnlich (gelb)</option>
                        <option value="rare">Selten (türkis)</option>
                        <option value="epic">Episch (lila)</option>
                      </select>
                    </Field>
                    <div className="span-2 toggle-row">
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
              </div>

              <RecipeEditor
                recipe={(block ?? item)!.recipe}
                suggestions={suggestions}
                onChange={(recipe) => (block ? updBlock({ recipe }) : updItem({ recipe }))}
              />
            </div>

            <div className="panel texture-panel">
              <div className="panel-title-lg">Textur</div>
              {savedIds.includes((block ?? item)!.id) ? (
                <PixelEditor projectId={project.id} kind={sel!.kind} id={(block ?? item)!.id} />
              ) : (
                <div className="texture-wait">
                  <SparkIcon size={20} />
                  <p className="muted small">Speichere zuerst, dann kannst du die Textur malen.</p>
                  <button className="btn small primary" onClick={save} disabled={busy}>
                    Jetzt speichern
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">
        {label} {hint && <span className="muted normal">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function RecipeEditor({ recipe, suggestions, onChange }: { recipe: Recipe; suggestions: string[]; onChange: (r: Recipe) => void }) {
  const grid = recipe.grid.length === 9 ? recipe.grid : Array(9).fill("");
  return (
    <div className="recipe">
      <div className="recipe-head">
        <Toggle label="Rezept" checked={recipe.enabled} onChange={(v) => onChange({ ...recipe, enabled: v, grid })} />
        <span className="panel-title-lg">Rezept</span>
        {recipe.enabled && (
          <Segmented
            label="Rezeptart"
            value={recipe.shaped ? "shaped" : "shapeless"}
            onChange={(v) => onChange({ ...recipe, shaped: v === "shaped" })}
            options={[
              { value: "shaped", label: "Mit Form" },
              { value: "shapeless", label: "Ohne Form" },
            ]}
          />
        )}
      </div>
      {recipe.enabled && (
        <div className="recipe-body">
          <datalist id="item-suggestions">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <div className="craft-grid">
            {grid.map((cell, i) => (
              <input
                key={i}
                className={cell ? "craft-cell filled mono" : "craft-cell mono"}
                list="item-suggestions"
                value={cell}
                placeholder="leer"
                title={cell || undefined}
                aria-label={`Feld ${i + 1}`}
                onChange={(e) => {
                  const g = [...grid];
                  g[i] = e.target.value.trim().toLowerCase();
                  onChange({ ...recipe, grid: g });
                }}
              />
            ))}
          </div>
          <span className="craft-arrow">→</span>
          <div className="craft-result">
            <div className="field-label">Anzahl</div>
            <input className="input" type="number" min={1} max={64} value={recipe.count} onChange={(e) => onChange({ ...recipe, count: Number(e.target.value) })} />
          </div>
        </div>
      )}
    </div>
  );
}
