import { useState } from "react";
import { ArmorSlot, BlockDef, ItemDef, OreDef, Project, ToolType } from "../../api";
import { useCatalog } from "../../catalog";
import { Segmented, Toggle } from "../../components/Chrome";
import ItemPicker, { OwnEntry, resolveItem } from "../../components/ItemPicker";
import McIcon from "../../components/McIcon";
import { BoxIcon, ChestplateIcon, CloseIcon, GemIcon, GlobeIcon, LayersIcon, PickaxeIcon, PlusIcon, SwordIcon } from "../../icons";
import { armorPreset, ArmorTier, SHAPES, shapeIcon, SLOT_LABEL, Tier, TOOL_LABEL, toolPreset } from "./contentDefaults";

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
export function ItemField({ project, own, value, onChange, placeholder }: { project: Project; own: OwnEntry[]; value: string; onChange: (v: string) => void; placeholder: string }) {
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
          <button type="button" className="icon-btn" aria-label="Entfernen" data-tip="Entfernen" onClick={() => onChange("")}>
            <CloseIcon size={12} />
          </button>
        )}
      </div>
      {open && (
        <ItemPicker
          mcVersion={project.mcVersion}
          modId={project.modId}
          own={own}
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

export function BlockExtras({
  project,
  block,
  own,
  texture,
  onChange,
}: {
  project: Project;
  block: BlockDef;
  own: OwnEntry[];
  texture?: string;
  onChange: (patch: Partial<BlockDef>) => void;
}) {
  const ore = block.ore;
  const setOre = (patch: Partial<OreDef>) => onChange({ ore: { ...ore, ...patch } });
  const key = `own:${block.id}`;
  const textures = texture ? { [key]: texture } : undefined;
  const toggleShape = (s: (typeof SHAPES)[number]["id"]) =>
    onChange({ shapes: block.shapes.includes(s) ? block.shapes.filter((x) => x !== s) : [...block.shapes, s] });

  return (
    <>
      <div className="sub-section">
        <SectionHead icon={<LayersIcon size={16} />} title="Weitere Formen" sub="Aus demselben Material – mit Rezept, Tags und Modellen" />
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

      <div className="sub-section">
        <SectionHead
          icon={<GemIcon size={16} />}
          title="Erz & Weltgenerierung"
          sub="Der Block erscheint in neuen Chunks unter der Erde"
          right={<Toggle label="Erz" checked={ore.enabled} onChange={(v) => setOre({ enabled: v })} />}
        />
        {ore.enabled && (
          <div className="form-grid">
            <Field label="Lässt fallen" hint="leer = sich selbst" span>
              <ItemField project={project} own={own} value={ore.drop} onChange={(v) => setOre({ drop: v })} placeholder="Sich selbst (wie Eisenerz vor 1.17)" />
            </Field>
            {ore.drop && (
              <>
                <Field label="Anzahl min.">
                  <Num value={ore.dropMin} min={1} max={64} onChange={(v) => setOre({ dropMin: v })} />
                </Field>
                <Field label="Anzahl max." hint="Glück erhöht zusätzlich">
                  <Num value={ore.dropMax} min={1} max={64} onChange={(v) => setOre({ dropMax: v })} />
                </Field>
              </>
            )}
            <Field label="Erfahrung min.">
              <Num value={ore.xpMin} min={0} max={100} onChange={(v) => setOre({ xpMin: v })} />
            </Field>
            <Field label="Erfahrung max." hint="Diamant 3–7">
              <Num value={ore.xpMax} min={0} max={100} onChange={(v) => setOre({ xpMax: v })} />
            </Field>
            <div className="field span-2">
              <span className="field-label">
                <GlobeIcon size={13} /> Dimension
              </span>
              <Segmented
                label="Dimension"
                value={ore.dimension}
                onChange={(v) => setOre({ dimension: v as OreDef["dimension"], ...(v === "nether" ? { minY: 10, maxY: 117 } : v === "end" ? { minY: 0, maxY: 80 } : {}) })}
                options={[
                  { value: "overworld", label: "Oberwelt" },
                  { value: "nether", label: "Nether" },
                  { value: "end", label: "Ende" },
                ]}
              />
            </div>
            {ore.dimension === "overworld" && (
              <div className="span-2 toggle-row" style={{ flexDirection: "row" }}>
                <Toggle label="Tiefenschiefer-Variante" checked={ore.deepslate} onChange={(v) => setOre({ deepslate: v })} />
                <span>
                  Tiefenschiefer-Variante <span className="muted small">· deepslate_{block.id}, erscheint unter Y 0</span>
                </span>
              </div>
            )}
            <Field label={`Adergröße · ${ore.veinSize}`} hint="Diamant 8 · Eisen 9 · Kohle 17">
              <input type="range" className="range full" min={1} max={32} value={ore.veinSize} onChange={(e) => setOre({ veinSize: Number(e.target.value) })} />
            </Field>
            <Field label={`Adern pro Chunk · ${ore.veinsPerChunk}`} hint="Diamant 7 · Eisen 10">
              <input type="range" className="range full" min={1} max={40} value={ore.veinsPerChunk} onChange={(e) => setOre({ veinsPerChunk: Number(e.target.value) })} />
            </Field>
            <Field label="Höhe von (Y)">
              <Num value={ore.minY} min={-64} max={320} onChange={(v) => setOre({ minY: v })} />
            </Field>
            <Field label="Höhe bis (Y)">
              <Num value={ore.maxY} min={-64} max={320} onChange={(v) => setOre({ maxY: v })} />
            </Field>
            <div className="span-2 muted small">Tipp: Erze erscheinen nur in neu erzeugten Chunks. Zum Testen am besten eine neue Welt anlegen.</div>
          </div>
        )}
      </div>
    </>
  );
}

// ---- Item: Art, Werkzeug, Rüstung -------------------------------------------

export function ItemKindSwitch({ item, onChange }: { item: ItemDef; onChange: (patch: Partial<ItemDef>) => void }) {
  return (
    <div className="kind-switch span-2">
      {(
        [
          { k: "basic", label: "Item", icon: <BoxIcon size={16} /> },
          { k: "tool", label: "Werkzeug / Waffe", icon: <PickaxeIcon size={16} /> },
          { k: "armor", label: "Rüstung", icon: <ChestplateIcon size={16} /> },
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
      <SectionHead icon={<SwordIcon size={16} />} title="Werkzeug" sub="Werte wie im Tooltip – Vorlagen setzen sie wie bei Vanilla" />
      <div className="form-grid">
        <Field label="Art">
          <select className="input" value={item.toolType} onChange={(e) => onChange(toolPreset(e.target.value as ToolType, item.toolTier as Tier))}>
            {(Object.keys(TOOL_LABEL) as ToolType[]).map((t) => (
              <option key={t} value={t}>
                {TOOL_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stufe" hint="wie stark – setzt alle Werte">
          <select className="input" value={item.toolTier} onChange={(e) => onChange(toolPreset(item.toolType, e.target.value as Tier))}>
            <option value="wood">Holz</option>
            <option value="stone">Stein</option>
            <option value="iron">Eisen</option>
            <option value="diamond">Diamant</option>
            <option value="netherite">Netherit</option>
          </select>
        </Field>
        <Field label="Angriffsschaden" hint="Herzen × 2">
          <Num value={item.attackDamage} min={1} max={100} step={0.5} onChange={(v) => onChange({ attackDamage: v })} />
        </Field>
        <Field label="Angriffstempo" hint="Schwert 1,6">
          <Num value={item.attackSpeed} min={0.1} max={20} step={0.1} onChange={(v) => onChange({ attackSpeed: v })} />
        </Field>
        <Field label="Haltbarkeit" hint="Eisen 250 · Diamant 1561">
          <Num value={item.durability} min={1} max={100000} onChange={(v) => onChange({ durability: v })} />
        </Field>
        <Field label="Abbautempo" hint="Eisen 6 · Diamant 8">
          <Num value={item.miningSpeed} min={0.1} max={100} step={0.5} onChange={(v) => onChange({ miningSpeed: v })} />
        </Field>
        <Field label="Verzauberbarkeit" hint="höher = bessere Verzauberungen">
          <Num value={item.enchantability} min={1} max={50} onChange={(v) => onChange({ enchantability: v })} />
        </Field>
        <Field label="Reparieren am Amboss mit">
          <ItemField project={project} own={own} value={item.repairItem} onChange={(v) => onChange({ repairItem: v })} placeholder="Kein Reparatur-Item" />
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
        title="Rüstung"
        sub="Teile mit gleichem Material bilden ein Set"
        right={
          missingSlots.length > 0 && (
            <button type="button" className="btn small" onClick={onCreateSet}>
              <PlusIcon size={13} /> Fehlende Teile ({missingSlots.map((s) => SLOT_LABEL[s]).join(", ")})
            </button>
          )
        }
      />
      <div className="form-grid">
        <Field label="Teil">
          <select className="input" value={item.armorSlot} onChange={(e) => onChange({ armorSlot: e.target.value as ArmorSlot })}>
            {(Object.keys(SLOT_LABEL) as ArmorSlot[]).map((s) => (
              <option key={s} value={s}>
                {SLOT_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Material" hint="ID, z. B. ruby">
          <input className="input mono" value={item.armorMaterial} onChange={(e) => onChange({ armorMaterial: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
        </Field>
        <div className="field span-2">
          <span className="field-label">Vorlage</span>
          <div className="row gap-6">
            {(["iron", "diamond", "netherite"] as ArmorTier[]).map((t) => (
              <button key={t} type="button" className="btn small" onClick={() => onChange(armorPreset(t, item.armorSlot))}>
                <ChestplateIcon size={13} /> {t === "iron" ? "Wie Eisen" : t === "diamond" ? "Wie Diamant" : "Wie Netherit"}
              </button>
            ))}
          </div>
        </div>
        <Field label={`Rüstungspunkte · ${item.defense / 2} Brustplatten`}>
          <input type="range" className="range full" min={0} max={20} value={item.defense} onChange={(e) => onChange({ defense: Number(e.target.value) })} />
        </Field>
        <Field label="Härte" hint="Diamant 2 · Netherit 3">
          <Num value={item.toughness} min={0} max={20} step={0.5} onChange={(v) => onChange({ toughness: v })} />
        </Field>
        <Field label="Rückstoßresistenz" hint="0 bis 1">
          <Num value={item.knockbackResistance} min={0} max={1} step={0.05} onChange={(v) => onChange({ knockbackResistance: v })} />
        </Field>
        <Field label="Haltbarkeits-Faktor" hint="Eisen 15 · Diamant 33">
          <Num value={item.durability} min={1} max={200} onChange={(v) => onChange({ durability: v })} />
        </Field>
        <Field label="Verzauberbarkeit">
          <Num value={item.enchantability} min={1} max={50} onChange={(v) => onChange({ enchantability: v })} />
        </Field>
        <Field label="Reparieren am Amboss mit">
          <ItemField project={project} own={own} value={item.repairItem} onChange={(v) => onChange({ repairItem: v })} placeholder="Kein Reparatur-Item" />
        </Field>
        <div className="span-2 muted small">
          Härte, Rückstoß, Haltbarkeit und Reparatur gelten für das ganze Set (Werte vom ersten Teil). Die getragene Rüstung bekommt eine einfarbige
          Platzhalter-Textur, die du später ersetzen kannst.
        </div>
      </div>
    </div>
  );
}
