import { t } from "../../i18n";
import ModelEditor, { MODEL_PRESETS, ModelPreview, useTexFor } from "./ModelEditor";
import { useState } from "react";
import { ArmorSlot, BlockDef, ItemDef, OreDef, Project, ToolType, GuiDef } from "../../api";
import { useCatalog } from "../../catalog";
import { Segmented, Toggle } from "../../components/Chrome";
import ItemPicker, { OwnEntry, resolveItem } from "../../components/ItemPicker";
import McIcon from "../../components/McIcon";
import { WorkbenchRecipes, MachineEditor } from "./StationEditors";
import { BoxIcon, ChestIcon, GearIcon, HammerIcon, ChestplateIcon, CloseIcon, CubeIcon, GemIcon, GlobeIcon, LampIcon, LayersIcon, PickaxeIcon, PlusIcon, SwordIcon } from "../../icons";
import { armorPreset, ArmorTier, SHAPES, shapeIcon, SLOT_LABEL, Tier, TOOL_LABEL, toolPreset } from "./contentDefaults";

/** Unterreiter in einem Editor */
export function SubTabs({ tabs, value, onChange }: { tabs: [string, string][]; value: string; onChange: (v: string) => void }) {
  const active = tabs.some(([k]) => k === value) ? value : tabs[0][0];
  return (
    <div className="sub-tabs" role="tablist">
      {tabs.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={active === k} className={active === k ? "sub-tab active" : "sub-tab"} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Name des Inhalts: Englisch immer, Deutsch nur wenn als Sprache hinzugefügt */
export function NameFields({ en, de, german, onEn, onDe }: { en: string; de: string; german: boolean; onEn: (v: string) => void; onDe: (v: string) => void }) {
  return (
    <>
      <Field label={german ? t("Name (Englisch)") : t("Name")}>
        <input className="input" value={en} onChange={(e) => onEn(e.target.value)} />
      </Field>
      {german && (
        <Field label={t("Name (Deutsch)")}>
          <input className="input" value={de} onChange={(e) => onDe(e.target.value)} />
        </Field>
      )}
    </>
  );
}

export function Field({ label, hint, children, span }: { label: string; hint?: string; children: React.ReactNode; span?: boolean }) {
  return (
    <label className={span ? "field span-2" : "field"}>
      <span className="field-label">
        {label} {hint && <span className="muted normal">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Num({ value, onChange, min, max, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return <input className="input" type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />;
}

/** Auswahl eines Items über den Katalog (mit Symbol). */
export function ItemField({
  project,
  own,
  value,
  onChange,
  placeholder,
  blocksOnly,
}: {
  project: Project;
  own: OwnEntry[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  blocksOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { catalog } = useCatalog(project.mcVersion, !!value || open);
  const info = resolveItem(value, catalog, own, project.modId);
  return (
    <>
      <div className="item-field">
        <button type="button" className="item-field-btn" onClick={() => setOpen(true)}>
          {value ? <McIcon icon={info.icon} textures={info.textures} size={22} fallback={info.name} /> : <PlusIcon size={14} />}
          <span className={value ? "" : "muted"}>{value ? info.name : placeholder}</span>
          {value && <span className="mono muted small">{value}</span>}
        </button>
        {value && (
          <button type="button" className="icon-btn" aria-label={t("Entfernen")} data-tip={t("Entfernen")} onClick={() => onChange("")}>
            <CloseIcon size={12} />
          </button>
        )}
      </div>
      {open && (
        <ItemPicker
          mcVersion={project.mcVersion}
          modId={project.modId}
          own={own}
          blocksOnly={blocksOnly}
          onClose={() => setOpen(false)}
          onPick={(id) => {
            onChange(id);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function SectionHead({ icon, title, sub, right }: { icon: React.ReactNode; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="sub-head">
      <span className="sub-icon">{icon}</span>
      <div className="grow">
        <div className="panel-title-lg">{title}</div>
        {sub && <div className="muted small">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// ---- Block: Formen & Erz ----------------------------------------------------

export type BlockPart = "function" | "model" | "shapes" | "ore";

export function BlockExtras({
  project,
  block,
  own,
  texture,
  onChange,
  part,
  guis = [],
}: {
  project: Project;
  block: BlockDef;
  own: OwnEntry[];
  texture?: string;
  onChange: (patch: Partial<BlockDef>) => void;
  /** nur einen Bereich zeigen (Unterreiter) */
  part?: BlockPart;
  /** Oberflächen aus dem GUI-Editor */
  guis?: GuiDef[];
}) {
  const [modelOpen, setModelOpen] = useState(false);
  const texFor = useTexFor(project, block, own, texture);
  const ore = block.ore;
  const setOre = (patch: Partial<OreDef>) => onChange({ ore: { ...ore, ...patch } });
  const key = `own:${block.id}`;
  const textures = texture ? { [key]: texture } : undefined;
  const toggleShape = (s: (typeof SHAPES)[number]["id"]) =>
    onChange({ shapes: block.shapes.includes(s) ? block.shapes.filter((x) => x !== s) : [...block.shapes, s] });

  const show = (x: BlockPart) => !part || part === x;
  return (
    <>
      {show("function") && (
      <div className="sub-section">
        <SectionHead icon={<LampIcon size={16} />} title={t("Funktion")} sub={t("Was der Block kann")} />
        <div className="kind-switch">
          {(
            [
              { k: "normal", label: t("Normaler Block"), icon: <CubeIcon size={16} /> },
              { k: "lamp", label: t("Redstone-Lampe"), icon: <LampIcon size={16} /> },
              { k: "storage", label: t("Lager-Truhe"), icon: <ChestIcon size={16} /> },
              { k: "workbench", label: t("Werkbank"), icon: <HammerIcon size={16} /> },
              { k: "machine", label: t("Maschine"), icon: <GearIcon size={16} /> },
            ] as const
          ).map((x) => (
            <button
              key={x.k}
              type="button"
              className={block.kind === x.k ? "kind-card active" : "kind-card"}
              aria-pressed={block.kind === x.k}
              onClick={() => onChange({ kind: x.k, ...(x.k !== "normal" && block.ore.enabled ? { ore: { ...block.ore, enabled: false } } : {}) })}
            >
              {x.icon}
              <span>{x.label}</span>
            </button>
          ))}
        </div>
        {block.kind === "lamp" && <div className="muted small">{t("Leuchtet, sobald Redstone-Strom anliegt. Die Leuchtkraft oben gilt im eingeschalteten Zustand (0 = 15). Nach dem Speichern kannst du rechts eine eigene Textur für „an“ malen.")}</div>}
        {block.kind === "workbench" && <WorkbenchRecipes project={project} block={block} own={own} onChange={onChange} />}
        {block.kind === "machine" && <MachineEditor project={project} block={block} own={own} onChange={onChange} guis={guis} />}
        {block.kind === "storage" && (
          <Field label={t("Reihen · {rows} × 9 = {slots} Plätze", { rows: block.rows, slots: block.rows * 9 })} hint={t("Truhe 3 · Doppeltruhe 6")}>
            <input type="range" className="range full" min={1} max={6} value={block.rows} onChange={(e) => onChange({ rows: Number(e.target.value) })} />
          </Field>
        )}
      </div>
      )}

      {show("model") && block.kind === "normal" && !block.ore.enabled && (
        <div className="sub-section">
          <SectionHead icon={<CubeIcon size={16} />} title={t("3D-Form")} sub={t("Eigene Form aus Quadern statt eines vollen Würfels")} />
          <div className="model-inline">
            {block.model.length > 0 ? (
              <>
                <ModelPreview cuboids={block.model} texFor={texFor} size={120} interactive={false} />
                <div className="grow">
                  <div>{t("{n} Quader", { n: block.model.length })}{block.rotate ? ` · ${t("dreht sich zum Spieler")}` : ""}</div>
                  <div className="row gap-6" style={{ marginTop: 8 }}>
                    <button type="button" className="btn small primary" onClick={() => setModelOpen(true)}>
                      {t("Modell bearbeiten")}
                    </button>
                    <button type="button" className="btn small" onClick={() => onChange({ model: [], rotate: false })}>
                      {t("Zurück zum Würfel")}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <span className="muted small grow">{t("Für Tische, Säulen, Laternen und alles, was kein voller Block ist.")}</span>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    onChange({ model: structuredClone(MODEL_PRESETS[2].cuboids) });
                    setModelOpen(true);
                  }}
                >
                  {t("3D-Modell erstellen")}
                </button>
              </>
            )}
          </div>
          {modelOpen && <ModelEditor project={project} block={block} own={own} texture={texture} onChange={onChange} onClose={() => setModelOpen(false)} />}
        </div>
      )}

      {show("model") && block.kind === "normal" && block.ore.enabled && <p className="muted">{t("Erze sind immer volle Würfel.")}</p>}
      {show("model") && block.kind !== "normal" && <p className="muted">{t("Eigene 3D-Formen gibt es für normale Blöcke. Truhen, Lampen, Werkbänke und Maschinen sind volle Würfel.")}</p>}

      {show("shapes") && (
      <div className="sub-section">
        <SectionHead icon={<LayersIcon size={16} />} title={t("Weitere Formen")} sub={t("Aus demselben Material – mit Rezept, Tags und Modellen")} />
        <div className="shape-grid">
          {SHAPES.map((s) => {
            const on = block.shapes.includes(s.id);
            return (
              <button key={s.id} type="button" className={on ? "shape-card on" : "shape-card"} aria-pressed={on} onClick={() => toggleShape(s.id)}>
                <McIcon icon={shapeIcon(s.id, key)} textures={textures} size={44} fallback={s.label} />
                <span className="shape-name">{s.label}</span>
                <span className="mono muted tiny">
                  {block.id}_{s.id}
                </span>
                <span className="shape-check" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
      )}

      {show("ore") && block.kind === "normal" && <div className="sub-section">
        <SectionHead
          icon={<GemIcon size={16} />}
          title={t("Erz & Weltgenerierung")}
          sub={t("Der Block erscheint in neuen Chunks unter der Erde")}
          right={<Toggle label={t("Erz")} checked={ore.enabled} onChange={(v) => setOre({ enabled: v })} />}
        />
        {ore.enabled && (
          <div className="form-grid">
            <Field label={t("Lässt fallen")} hint={t("leer = sich selbst")} span>
              <ItemField project={project} own={own} value={ore.drop} onChange={(v) => setOre({ drop: v })} placeholder={t("Sich selbst (wie Eisenerz vor 1.17)")} />
            </Field>
            {ore.drop && (
              <>
                <Field label={t("Anzahl min.")}>
                  <Num value={ore.dropMin} min={1} max={64} onChange={(v) => setOre({ dropMin: v })} />
                </Field>
                <Field label={t("Anzahl max.")} hint={t("Glück erhöht zusätzlich")}>
                  <Num value={ore.dropMax} min={1} max={64} onChange={(v) => setOre({ dropMax: v })} />
                </Field>
              </>
            )}
            <Field label={t("Erfahrung min.")}>
              <Num value={ore.xpMin} min={0} max={100} onChange={(v) => setOre({ xpMin: v })} />
            </Field>
            <Field label={t("Erfahrung max.")} hint={t("Diamant 3–7")}>
              <Num value={ore.xpMax} min={0} max={100} onChange={(v) => setOre({ xpMax: v })} />
            </Field>
            <div className="field span-2">
              <span className="field-label">
                <GlobeIcon size={13} />{" "}{t("Dimension")}
              </span>
              <Segmented
                label={t("Dimension")}
                value={ore.dimension}
                onChange={(v) => setOre({ dimension: v as OreDef["dimension"], ...(v === "nether" ? { minY: 10, maxY: 117 } : v === "end" ? { minY: 0, maxY: 80 } : {}) })}
                options={[
                  { value: "overworld", label: t("Oberwelt") },
                  { value: "nether", label: t("Nether") },
                  { value: "end", label: t("Ende") },
                ]}
              />
            </div>
            {ore.dimension === "overworld" && (
              <div className="span-2 toggle-row" style={{ flexDirection: "row" }}>
                <Toggle label={t("Tiefenschiefer-Variante")} checked={ore.deepslate} onChange={(v) => setOre({ deepslate: v })} />
                <span>
                  {t("Tiefenschiefer-Variante")} <span className="muted small">· {t("deepslate_{id}, erscheint unter Y 0", { id: block.id })}</span>
                </span>
              </div>
            )}
            <Field label={t("Adergröße · {veinSize}", { veinSize: ore.veinSize })} hint={t("Diamant 8 · Eisen 9 · Kohle 17")}>
              <input type="range" className="range full" min={1} max={32} value={ore.veinSize} onChange={(e) => setOre({ veinSize: Number(e.target.value) })} />
            </Field>
            <Field label={t("Adern pro Chunk · {veinsPerChunk}", { veinsPerChunk: ore.veinsPerChunk })} hint={t("Diamant 7 · Eisen 10")}>
              <input type="range" className="range full" min={1} max={40} value={ore.veinsPerChunk} onChange={(e) => setOre({ veinsPerChunk: Number(e.target.value) })} />
            </Field>
            <Field label={t("Höhe von (Y)")}>
              <Num value={ore.minY} min={-64} max={320} onChange={(v) => setOre({ minY: v })} />
            </Field>
            <Field label={t("Höhe bis (Y)")}>
              <Num value={ore.maxY} min={-64} max={320} onChange={(v) => setOre({ maxY: v })} />
            </Field>
            <div className="span-2 muted small">{t("Tipp: Erze erscheinen nur in neu erzeugten Chunks. Zum Testen am besten eine neue Welt anlegen.")}</div>
          </div>
        )}
      </div>}
      {show("ore") && block.kind !== "normal" && <p className="muted">{t("Nur normale Blöcke können als Erz in der Welt erzeugt werden.")}</p>}
    </>
  );
}

// ---- Item: Art, Werkzeug, Rüstung -------------------------------------------

export function ItemKindSwitch({ item, onChange }: { item: ItemDef; onChange: (patch: Partial<ItemDef>) => void }) {
  return (
    <div className="kind-switch span-2">
      {(
        [
          { k: "basic", label: t("Item"), icon: <BoxIcon size={16} /> },
          { k: "tool", label: t("Werkzeug / Waffe"), icon: <PickaxeIcon size={16} /> },
          { k: "armor", label: t("Rüstung"), icon: <ChestplateIcon size={16} /> },
        ] as const
      ).map((x) => (
        <button
          key={x.k}
          type="button"
          className={item.kind === x.k ? "kind-card active" : "kind-card"}
          aria-pressed={item.kind === x.k}
          onClick={() => {
            if (item.kind === x.k) return;
            if (x.k === "tool") onChange({ kind: "tool", ...toolPreset(item.toolType ?? "sword", (item.toolTier as Tier) ?? "iron") });
            else if (x.k === "armor") onChange({ kind: "armor", ...armorPreset("iron", item.armorSlot ?? "helmet"), armorMaterial: item.armorMaterial || item.id.replace(/_(helmet|chestplate|leggings|boots)$/, "") });
            else onChange({ kind: "basic", stackSize: 64 });
          }}
        >
          {x.icon}
          <span>{x.label}</span>
        </button>
      ))}
    </div>
  );
}

export function ToolForm({ project, item, own, onChange }: { project: Project; item: ItemDef; own: OwnEntry[]; onChange: (patch: Partial<ItemDef>) => void }) {
  return (
    <div className="sub-section">
      <SectionHead icon={<SwordIcon size={16} />} title={t("Werkzeug")} sub={t("Werte wie im Tooltip – Vorlagen setzen sie wie bei Vanilla")} />
      <div className="form-grid">
        <Field label={t("Art")}>
          <select className="input" value={item.toolType} onChange={(e) => onChange(toolPreset(e.target.value as ToolType, item.toolTier as Tier))}>
            {(Object.keys(TOOL_LABEL) as ToolType[]).map((t) => (
              <option key={t} value={t}>
                {TOOL_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Werkzeugstufe")} hint={t("wie stark – setzt alle Werte")}>
          <select className="input" value={item.toolTier} onChange={(e) => onChange(toolPreset(item.toolType, e.target.value as Tier))}>
            <option value="wood">{t("Holz")}</option>
            <option value="stone">{t("Stein")}</option>
            <option value="iron">{t("Eisen")}</option>
            <option value="diamond">{t("Diamant")}</option>
            <option value="netherite">{t("Netherit")}</option>
          </select>
        </Field>
        <Field label={t("Angriffsschaden")} hint={t("Herzen × 2")}>
          <Num value={item.attackDamage} min={1} max={100} step={0.5} onChange={(v) => onChange({ attackDamage: v })} />
        </Field>
        <Field label={t("Angriffstempo")} hint={t("Schwert 1,6")}>
          <Num value={item.attackSpeed} min={0.1} max={20} step={0.1} onChange={(v) => onChange({ attackSpeed: v })} />
        </Field>
        <Field label={t("Haltbarkeit")} hint={t("Eisen 250 · Diamant 1561")}>
          <Num value={item.durability} min={1} max={100000} onChange={(v) => onChange({ durability: v })} />
        </Field>
        <Field label={t("Abbautempo")} hint={t("Eisen 6 · Diamant 8")}>
          <Num value={item.miningSpeed} min={0.1} max={100} step={0.5} onChange={(v) => onChange({ miningSpeed: v })} />
        </Field>
        <Field label={t("Verzauberbarkeit")} hint={t("höher = bessere Verzauberungen")}>
          <Num value={item.enchantability} min={1} max={50} onChange={(v) => onChange({ enchantability: v })} />
        </Field>
        <Field label={t("Reparieren am Amboss mit")}>
          <ItemField project={project} own={own} value={item.repairItem} onChange={(v) => onChange({ repairItem: v })} placeholder={t("Kein Reparatur-Item")} />
        </Field>
      </div>
    </div>
  );
}

export function ArmorForm({
  project,
  item,
  own,
  onChange,
  onCreateSet,
  missingSlots,
}: {
  project: Project;
  item: ItemDef;
  own: OwnEntry[];
  onChange: (patch: Partial<ItemDef>) => void;
  onCreateSet: () => void;
  missingSlots: ArmorSlot[];
}) {
  return (
    <div className="sub-section">
      <SectionHead
        icon={<ChestplateIcon size={16} />}
        title={t("Rüstung")}
        sub={t("Teile mit gleichem Material bilden ein Set")}
        right={
          missingSlots.length > 0 && (
            <button type="button" className="btn small" onClick={onCreateSet}>
              <PlusIcon size={13} />{" "}{t("Fehlende Teile ({list})", { list: missingSlots.map((s) => SLOT_LABEL[s]).join(", ") })}
            </button>
          )
        }
      />
      <div className="form-grid">
        <Field label={t("Teil")}>
          <select className="input" value={item.armorSlot} onChange={(e) => onChange({ armorSlot: e.target.value as ArmorSlot })}>
            {(Object.keys(SLOT_LABEL) as ArmorSlot[]).map((s) => (
              <option key={s} value={s}>
                {SLOT_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Material")} hint={t("ID, z. B. ruby")}>
          <input className="input mono" value={item.armorMaterial} onChange={(e) => onChange({ armorMaterial: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
        </Field>
        <div className="field span-2">
          <span className="field-label">{t("Vorlage")}</span>
          <div className="row gap-6">
            {(["iron", "diamond", "netherite"] as ArmorTier[]).map((tier) => (
              <button key={tier} type="button" className="btn small" onClick={() => onChange(armorPreset(tier, item.armorSlot))}>
                <ChestplateIcon size={13} /> {tier === "iron" ? t("Wie Eisen") : tier === "diamond" ? t("Wie Diamant") : t("Wie Netherit")}
              </button>
            ))}
          </div>
        </div>
        <Field label={t("Rüstungspunkte · {v0} Brustplatten", { v0: item.defense / 2 })}>
          <input type="range" className="range full" min={0} max={20} value={item.defense} onChange={(e) => onChange({ defense: Number(e.target.value) })} />
        </Field>
        <Field label={t("Härte")} hint={t("Diamant 2 · Netherit 3")}>
          <Num value={item.toughness} min={0} max={20} step={0.5} onChange={(v) => onChange({ toughness: v })} />
        </Field>
        <Field label={t("Rückstoßresistenz")} hint={t("0 bis 1")}>
          <Num value={item.knockbackResistance} min={0} max={1} step={0.05} onChange={(v) => onChange({ knockbackResistance: v })} />
        </Field>
        <Field label={t("Haltbarkeits-Faktor")} hint={t("Eisen 15 · Diamant 33")}>
          <Num value={item.durability} min={1} max={200} onChange={(v) => onChange({ durability: v })} />
        </Field>
        <Field label={t("Verzauberbarkeit")}>
          <Num value={item.enchantability} min={1} max={50} onChange={(v) => onChange({ enchantability: v })} />
        </Field>
        <Field label={t("Reparieren am Amboss mit")}>
          <ItemField project={project} own={own} value={item.repairItem} onChange={(v) => onChange({ repairItem: v })} placeholder={t("Kein Reparatur-Item")} />
        </Field>
        <div className="span-2 muted small">
          {t("Härte, Rückstoß, Haltbarkeit und Reparatur gelten für das ganze Set (Werte vom ersten Teil). Die getragene Rüstung bekommt eine einfarbige Platzhalter-Textur, die du später ersetzen kannst.")}
        </div>
      </div>
    </div>
  );
}
