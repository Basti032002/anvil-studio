import { t } from "../../i18n";
import { Blueprint, Content, DimDef, Project } from "../../api";
import { OwnEntry } from "../../components/ItemPicker";
import { Segmented } from "../../components/Chrome";
import { BlueprintIcon, CopyIcon, GlobeIcon, TrashIcon } from "../../icons";
import { Field, ItemField } from "./ContentForms";
import { makeNode } from "./blueprints";

export const BIOMES = [
  "plains", "forest", "birch_forest", "dark_forest", "taiga", "snowy_plains", "desert", "savanna", "jungle", "badlands", "swamp",
  "mushroom_fields", "cherry_grove", "meadow", "ice_spikes", "ocean", "beach", "flower_forest", "bamboo_jungle", "deep_dark",
];

export const newDimension = (id: string, preset: "overworld" | "lava" | "night" = "overworld"): DimDef => ({
  id,
  nameDe: preset === "lava" ? t("Lava-Welt") : preset === "night" ? t("Schattenwelt") : t("Neue Dimension"),
  nameEn: preset === "lava" ? "Lava World" : preset === "night" ? "Shadow World" : "New Dimension",
  topBlock: preset === "lava" ? "minecraft:blackstone" : preset === "night" ? "minecraft:mycelium" : "",
  fillBlock: preset === "lava" ? "minecraft:basalt" : "",
  stoneBlock: preset === "lava" ? "minecraft:netherrack" : preset === "night" ? "minecraft:deepslate" : "",
  fluid: preset === "lava" ? "lava" : "water",
  biome: preset === "lava" ? "minecraft:badlands" : "overworld",
  time: preset === "night" ? "night" : "normal",
  sky: preset === "lava" ? "nether" : "overworld",
  ambientLight: preset === "lava" ? 0.1 : 0,
  seaLevel: preset === "lava" ? 32 : 63,
});

/** Blueprint: Rechtsklick auf einen Block → hin und zurück reisen */
export function travelBlueprint(dim: DimDef, block: string): Blueprint {
  const ev = makeNode("ev_click_block", 60, 80);
  ev.props = { target: block };
  const fx = makeNode("particle", 360, 80);
  fx.props = { particle: "minecraft:portal", count: "80" };
  const snd = makeNode("sound", 660, 80);
  snd.props = { sound: "minecraft:block.portal.travel" };
  const go = makeNode("travel", 960, 80);
  go.props = { dim: dim.id, mode: "toggle" };
  return {
    name: t("Reise nach {name}", { name: dim.nameDe || dim.id }),
    enabled: true,
    nodes: [ev, fx, snd, go],
    links: [
      { from: ev.id, out: "next", to: fx.id },
      { from: fx.id, out: "next", to: snd.id },
      { from: snd.id, out: "next", to: go.id },
    ],
  };
}

export default function DimensionEditor({
  project,
  content,
  dim,
  own,
  onChange,
  onDuplicate,
  onRemove,
  onAddBlueprint,
}: {
  project: Project;
  content: Content;
  dim: DimDef;
  own: OwnEntry[];
  onChange: (d: DimDef) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onAddBlueprint: (b: Blueprint) => void;
}) {
  const ownBlocks = own.filter((o) => o.kind === "block");
  const set = (patch: Partial<DimDef>) => onChange({ ...dim, ...patch });
  const hasTravel = content.blueprints.some((b) => b.nodes.some((n) => n.kind === "travel" && n.props.dim === dim.id));
  const blockField = (key: "topBlock" | "fillBlock" | "stoneBlock", label: string, hint: string, def: string) => (
    <Field label={label} hint={hint}>
      <ItemField project={project} own={ownBlocks} blocksOnly value={dim[key]} onChange={(v) => set({ [key]: v })} placeholder={t("Standard: {block}", { block: def })} />
    </Field>
  );

  return (
    <div className="panel form-panel logic-panel">
      <div className="panel-head">
        <div className="row">
          <span className="sub-icon">
            <GlobeIcon size={16} />
          </span>
          <div>
            <div className="panel-title-lg">{t("Dimension")}</div>
            <div className="muted small">{t("Gelände wie die Oberwelt – mit deinen eigenen Blöcken.")}</div>
          </div>
        </div>
        <div className="row gap-6">
          <button className="icon-btn" onClick={onDuplicate} aria-label={t("Duplizieren")} data-tip={t("Duplizieren")}>
            <CopyIcon size={15} />
          </button>
          <button className="icon-btn danger" onClick={onRemove} aria-label={t("Entfernen")} data-tip={t("Entfernen")}>
            <TrashIcon size={15} />
          </button>
        </div>
      </div>

      <div className="form-grid">
        <Field label={t("ID")} hint={t("Kleinbuchstaben, _")}>
          <input className="input mono" value={dim.id} onChange={(e) => set({ id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
        </Field>
        <Field label={t("Vollständige ID")}>
          <input className="input mono" readOnly value={`${project.modId}:${dim.id}`} />
        </Field>
        <Field label={t("Name (Deutsch)")}>
          <input className="input" value={dim.nameDe} onChange={(e) => set({ nameDe: e.target.value })} />
        </Field>
        <Field label={t("Name (Englisch)")}>
          <input className="input" value={dim.nameEn} onChange={(e) => set({ nameEn: e.target.value })} />
        </Field>
      </div>

      <div className="sub-head">
        <div className="panel-title-lg">{t("Blöcke")}</div>
      </div>
      <div className="form-grid">
        {blockField("topBlock", t("Oberfläche"), t("ersetzt Grasblöcke"), "grass_block")}
        {blockField("fillBlock", t("Darunter"), t("ersetzt Erde"), "dirt")}
        {blockField("stoneBlock", t("Gestein"), t("ersetzt Stein und Tiefenschiefer"), "stone")}
        <Field label={t("Flüssigkeit")} hint={t("Meere und Seen")}>
          <Segmented
            label={t("Flüssigkeit")}
            value={dim.fluid}
            onChange={(v) => set({ fluid: v })}
            options={[
              { value: "water", label: t("Wasser") },
              { value: "lava", label: t("Lava") },
              { value: "none", label: t("Keine") },
            ]}
          />
        </Field>
        <Field label={t("Meeresspiegel")} hint={t("Höhe der Meere, Oberwelt: 63")}>
          <input className="input" type="number" min={-60} max={250} value={dim.seaLevel} onChange={(e) => set({ seaLevel: Number(e.target.value) })} />
        </Field>
      </div>

      <div className="sub-head">
        <div className="panel-title-lg">{t("Biome & Himmel")}</div>
      </div>
      <div className="form-grid">
        <Field label={t("Biome")} hint={t("Bäume, Pflanzen und Tiere kommen aus den Biomen")}>
          <select className="input" value={dim.biome} onChange={(e) => set({ biome: e.target.value })}>
            <option value="overworld">{t("Alle Oberwelt-Biome")}</option>
            {BIOMES.map((b) => (
              <option key={b} value={`minecraft:${b}`}>
                {t("Nur: {biome}", { biome: b.replace(/_/g, " ") })}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Tageszeit")}>
          <Segmented
            label={t("Tageszeit")}
            value={dim.time}
            onChange={(v) => set({ time: v })}
            options={[
              { value: "normal", label: t("Normal") },
              { value: "day", label: t("Immer Tag") },
              { value: "night", label: t("Immer Nacht") },
            ]}
          />
        </Field>
        <Field label={t("Himmel")}>
          <Segmented
            label={t("Himmel")}
            value={dim.sky}
            onChange={(v) => set({ sky: v })}
            options={[
              { value: "overworld", label: t("Oberwelt") },
              { value: "nether", label: t("Nether") },
              { value: "end", label: t("End") },
            ]}
          />
        </Field>
        <Field label={t("Grundhelligkeit")} hint={`${Math.round(dim.ambientLight * 100)} %`}>
          <input type="range" min={0} max={1} step={0.05} value={dim.ambientLight} onChange={(e) => set({ ambientLight: Number(e.target.value) })} />
        </Field>
      </div>

      <div className="callout">
        <BlueprintIcon size={18} />
        <div className="grow">
          <div className="callout-title">{t("Wie kommt man hin?")}</div>
          <div className="muted small">
            {hasTravel
              ? t("Ein Blueprint mit „In Dimension reisen“ führt schon hierher.")
              : t("Lege einen Blueprint an: Rechtsklick auf einen Block bringt dich hin und wieder zurück. Oder nutze den Knoten „In Dimension reisen“ in eigenen Blueprints.")}
          </div>
        </div>
        {!hasTravel && (
          <button className="btn small primary" onClick={() => onAddBlueprint(travelBlueprint(dim, ownBlocks[0]?.id ?? "minecraft:crying_obsidian"))}>
            {t("Reise-Blueprint anlegen")}
          </button>
        )}
      </div>
    </div>
  );
}
