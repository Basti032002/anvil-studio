import { t } from "../../i18n";
import { useState } from "react";
import { Blueprint, Content, DimBiome, DimDef, DimSpawn, Project } from "../../api";
import { OwnEntry } from "../../components/ItemPicker";
import { Segmented, Toggle } from "../../components/Chrome";
import { ArrowLeftIcon, BlueprintIcon, BoxIcon, BucketIcon, CopyIcon, GemIcon, GlobeIcon, LayersIcon, MountainsIcon, PawIcon, PickaxeIcon, RocketIcon, SparkIcon, SunIcon, TrashIcon, WeatherIcon } from "../../icons";
import { Field, ItemField, NameFields } from "./ContentForms";
import { ENTITIES, makeNode } from "./blueprints";
import DimPreview, { yRange } from "./DimPreview";
import { IslandsPage, OresPage, PageHead, TerrainPage } from "./DimPages";
import TerrainNodes from "./TerrainNodes";
import { builderToGraph, defaultBuilder } from "./terrain";
import { BASES, SPAWN_CATEGORIES, STRUCTURES, TEMPLATES as DIM_TEMPLATES, templateDefaults, templateOf, withDefaults } from "./dimensionDefaults";

export { newDimension } from "./dimensionDefaults";

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
    name: t("Reise nach {name}", { name: dim.nameEn || dim.nameDe || dim.id }),
    enabled: true,
    nodes: [ev, fx, snd, go],
    links: [
      { from: ev.id, out: "next", to: fx.id },
      { from: fx.id, out: "next", to: snd.id },
      { from: snd.id, out: "next", to: go.id },
    ],
  };
}

const VANILLA_BIOMES = [
  "plains", "forest", "birch_forest", "dark_forest", "taiga", "snowy_plains", "desert", "savanna", "jungle", "badlands", "swamp",
  "mushroom_fields", "cherry_grove", "meadow", "ice_spikes", "ocean", "beach", "flower_forest", "bamboo_jungle", "deep_dark",
];

type Step = "start" | "terrain" | "blocks" | "biomes" | "caves" | "ores" | "islands" | "structures" | "fluids" | "sky" | "mobs" | "travel";

function Check({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="dim-check">
      <Toggle checked={checked} onChange={onChange} label={label} />
      <div className="grow">
        <div>{label}</div>
        {hint && <div className="muted small">{hint}</div>}
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label} hint={value ? value : t("wie das Vorbild-Biom")}>
      <div className="row gap-s">
        <input type="color" className="dim-color" value={value || "#808080"} onChange={(e) => onChange(e.target.value)} />
        {value && (
          <button className="btn small ghost" onClick={() => onChange("")}>
            {t("Zurücksetzen")}
          </button>
        )}
      </div>
    </Field>
  );
}

const MONSTERS = ["zombie", "skeleton", "creeper", "spider", "enderman", "witch", "slime", "blaze", "ghast", "phantom", "drowned", "husk", "pillager", "ravager", "warden"];

export default function DimensionEditor({
  project,
  content,
  dim: rawDim,
  own,
  onChange,
  onDuplicate,
  onRemove,
  onAddBlueprint,
  onBack,
  footer,
  onViewInGame,
}: {
  project: Project;
  content: Content;
  dim: DimDef;
  own: OwnEntry[];
  onChange: (d: DimDef) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onAddBlueprint: (b: Blueprint) => void;
  onBack: () => void;
  footer?: React.ReactNode;
  onViewInGame?: () => void;
}) {
  const dim = withDefaults(rawDim);
  const tp = templateOf(dim);
  const ownBlocks = own.filter((o) => o.kind === "block");
  const set = (patch: Partial<DimDef>) => onChange({ ...dim, ...patch });
  const hasTravel = content.blueprints.some((b) => b.nodes.some((n) => n.kind === "travel" && n.props.dim === dim.id));
  const ownBiomes = dim.biomeMode === "own";
  const [step, setStep] = useState<Step>("terrain");
  const [seed, setSeed] = useState(4711);
  const nodesMode = dim.terrainMode === "nodes";
  const toNodes = () => {
    const [lo, hi] = yRange(dim);
    let graph = dim.graph && dim.graph.nodes.length ? dim.graph : undefined;
    if (!graph) graph = dim.builderGraph && dim.builderGraph.nodes.length ? structuredClone(dim.builderGraph) : builderToGraph(dim.terrain ?? defaultBuilder("hills"), lo, hi);
    set({ terrainMode: "nodes", graph, minY: lo, maxY: hi });
    setStep("terrain");
  };
  const toBuilder = () => {
    const [lo, hi] = yRange(dim);
    const b = dim.terrain ?? defaultBuilder("hills");
    set({ terrainMode: "builder", terrain: b, builderGraph: builderToGraph(b, lo, hi), minY: lo, maxY: hi });
  };
  const blockInput = (value: string, onCh: (v: string) => void, placeholder: string) => (
    <ItemField project={project} own={ownBlocks} blocksOnly value={value} onChange={onCh} placeholder={placeholder} />
  );
  const onlyOwn = !ownBiomes && (
    <div className="callout">
      <GlobeIcon size={18} />
      <div className="grow muted small">{t("Das geht nur mit eigenen Biomen – stelle unter „Biome“ auf „Eigene Biome“ um.")}</div>
      <button className="btn small" onClick={() => set({ biomeMode: "own", biomes: dim.biomes.length ? dim.biomes : (templateDefaults(tp).biomes ?? []) })}>
        {t("Eigene Biome")}
      </button>
    </div>
  );
  const entityOpts = [
    ...content.mobs.map((m) => ({ id: `${project.modId}:${m.id}`, label: `${m.nameEn || m.nameDe || m.id} (${t("eigene")})` })),
    ...ENTITIES.filter((e) => !["tnt", "firework_rocket", "experience_orb", "lightning_bolt", "ender_dragon", "wither"].includes(e)).map((e) => ({ id: `minecraft:${e}`, label: e.replace(/_/g, " ") })),
  ];

  const categoryOf = (entity: string) => {
    const name = entity.replace(/^.*:/, "");
    const mob = content.mobs.find((m) => `${project.modId}:${m.id}` === entity);
    if (mob) return ["zombie", "spider", "creeper"].includes(mob.model) ? "monster" : "creature";
    if (MONSTERS.includes(name)) return "monster";
    if (name === "dolphin" || name === "axolotl") return "water_creature";
    return "creature";
  };

  const steps: [Step, string, React.ReactNode, boolean][] = [
    ["terrain", t("Gelände"), <MountainsIcon size={15} />, !!dim.terrainMode],
    ["blocks", t("Schichten & Blöcke"), <LayersIcon size={15} />, !!(dim.topBlock || dim.fillBlock || dim.stoneBlock || dim.deepBlock)],
    ["biomes", t("Biome"), <GlobeIcon size={15} />, ownBiomes],
    ["caves", t("Höhlen & Schluchten"), <PickaxeIcon size={15} />, !(dim.noNoiseCaves && dim.noCaves && dim.noCanyons)],
    ["ores", t("Erze"), <GemIcon size={15} />, dim.ores.some((o) => !o.disabled)],
    ["islands", t("Schwebende Inseln"), <WeatherIcon size={15} />, dim.islands],
    ["structures", t("Strukturen & Pflanzen"), <BoxIcon size={15} />, dim.structures.length > 0],
    ["fluids", t("Flüssigkeiten"), <BucketIcon size={15} />, dim.fluid !== "none"],
    ["sky", t("Himmel & Licht"), <SunIcon size={15} />, !!(dim.skyColor || dim.fogColor || dim.time !== "normal")],
    ["mobs", t("Kreaturen"), <PawIcon size={15} />, dim.spawns.length > 0],
  ];
  const extraSteps: [Step, string, React.ReactNode][] = [
    ["start", t("Name & Vorlage"), <SparkIcon size={15} />],
    ["travel", t("Anreise"), <RocketIcon size={15} />],
  ];
  const tplLabel = DIM_TEMPLATES.find((x) => x.id === tp)?.label();

  return (
    <div className="dimx">
      <aside className="dimx-nav">
        <button className="dimx-back" onClick={onBack}>
          <ArrowLeftIcon size={13} /> {t("Inhalte")}
        </button>
        <div className="dimx-id">
          <span className="dimx-icon">
            <GlobeIcon size={18} />
          </span>
          <div className="grow dimx-id-text">
            <div className="dimx-name">{dim.nameEn || dim.nameDe || dim.id}</div>
            <div className="muted small">
              {t("Dimension")} · {t("Vorlage {name}", { name: tplLabel ?? "" })}
            </div>
          </div>
          <button className="icon-btn" onClick={onDuplicate} aria-label={t("Duplizieren")} data-tip={t("Duplizieren")}>
            <CopyIcon size={14} />
          </button>
          <button className="icon-btn danger" onClick={onRemove} aria-label={t("Entfernen")} data-tip={t("Entfernen")}>
            <TrashIcon size={14} />
          </button>
        </div>
        <div className="dimx-mode">
          <button className={!nodesMode ? "on" : ""} onClick={() => nodesMode && toBuilder()}>
            {t("Baukasten")}
          </button>
          <button className={nodesMode ? "on" : ""} onClick={() => !nodesMode && toNodes()} disabled={tp === "flat" || tp === "void"}>
            {t("Knoten")}
          </button>
        </div>
        <nav className="dimx-steps">
          {steps.map(([k, label, icon, dot]) => (
            <button key={k} className={step === k ? "dimx-step active" : "dimx-step"} onClick={() => setStep(k)}>
              {icon}
              <span className="grow">{label}</span>
              {dot && <span className="dimx-dot" />}
            </button>
          ))}
          <div className="dimx-sep" />
          {extraSteps.map(([k, label, icon]) => (
            <button key={k} className={step === k ? "dimx-step active" : "dimx-step"} onClick={() => setStep(k)}>
              {icon}
              <span className="grow">{label}</span>
            </button>
          ))}
        </nav>
        {footer}
      </aside>
      <main className="dimx-main" key={step}>
        {step === "start" && <PageHead title={t("Name & Vorlage")} desc={t("Name, ID und die Vorlage, auf der die Welt aufbaut.")} />}
        {step === "blocks" && <PageHead title={t("Schichten & Blöcke")} desc={t("Aus welchen Blöcken die Welt besteht – von der Oberfläche bis ganz unten.")} />}
        {step === "biomes" && <PageHead title={t("Biome")} desc={t("Welche Landschaften es gibt. Eigene Biome übernehmen Pflanzen, Tiere und Farben von einem Vorbild.")} />}
        {step === "caves" && <PageHead title={t("Höhlen & Schluchten")} desc={t("Was unter der Oberfläche ausgehöhlt wird.")} />}
        {step === "structures" && <PageHead title={t("Strukturen & Pflanzen")} desc={t("Dörfer, Tempel und andere Bauwerke, dazu Gras, Blumen und Bäume.")} />}
        {step === "fluids" && <PageHead title={t("Flüssigkeiten")} desc={t("Meere, Seen und Quellen.")} />}
        {step === "sky" && <PageHead title={t("Himmel & Licht")} desc={t("Himmel, Tageszeit, Helligkeit, Wetter und Farben.")} />}
        {step === "mobs" && <PageHead title={t("Kreaturen")} desc={t("Welche Tiere und Monster hier erscheinen.")} />}
        {step === "travel" && <PageHead title={t("Anreise")} desc={t("Wie Spieler in diese Dimension kommen.")} />}

        {step === "start" && (
          <>
            <div className="form-grid">
              <Field label={t("ID")} hint={t("Kleinbuchstaben, _")}>
                <input className="input mono" value={dim.id} onChange={(e) => set({ id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
              </Field>
              <Field label={t("Vollständige ID")}>
                <input className="input mono" readOnly value={`${project.modId}:${dim.id}`} />
              </Field>
<NameFields en={dim.nameEn} de={dim.nameDe} german={(content.languages ?? []).includes("de_de")} onEn={(v) => set({ nameEn: v })} onDe={(v) => set({ nameDe: v })} />
            </div>
            <div className="muted small">{t("Eine Vorlage setzt Gelände, Blöcke, Biome, Erze und Himmel auf passende Werte. Danach kannst du alles in den Schritten anpassen.")}</div>
            <div className="dim-templates">
              {DIM_TEMPLATES.map((x) => (
                <button
                  key={x.id}
                  className={dim.template === x.id || (!dim.template && x.id === "overworld") ? "dim-template active" : "dim-template"}
                  onClick={() => set(templateDefaults(x.id))}
                >
                  <div className="dim-template-title">{x.label()}</div>
                  <div className="muted small">{x.desc()}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "terrain" &&
          (nodesMode ? (
            <>
              <PageHead title={t("Gelände · Knoten-Modus")} desc={t("Für Experten: Die Formel für die Geländeform frei zusammenstecken. Alles andere (Erze, Höhlen, Biome …) bleibt im Baukasten.")} />
              <TerrainNodes graph={dim.graph ?? { nodes: [], links: [] }} onChange={(g) => set({ graph: g })} />
            </>
          ) : (
            <TerrainPage dim={dim} set={set} onNodes={toNodes} />
          ))}

        {step === "blocks" && (
          <div className="form-grid">
            <Field label={t("Oberfläche")} hint={tp === "nether" ? t("ersetzt Nezel") : t("ersetzt Grasblöcke")}>
              {blockInput(dim.topBlock, (v) => set({ topBlock: v }), t("Standard der Vorlage"))}
            </Field>
            <Field label={t("Darunter")} hint={tp === "nether" ? t("ersetzt Seelensand und -erde") : t("ersetzt Erde")}>
              {blockInput(dim.fillBlock, (v) => set({ fillBlock: v }), t("Standard der Vorlage"))}
            </Field>
            <Field label={t("Gestein")} hint={tp === "nether" ? t("ersetzt Netherrack") : tp === "end" || tp === "void" ? t("ersetzt Endstein") : t("ersetzt Stein")}>
              {blockInput(dim.stoneBlock, (v) => set({ stoneBlock: v }), t("Standard der Vorlage"))}
            </Field>
            {!["nether", "end", "void", "flat"].includes(tp) && (
              <Field label={t("Tiefes Gestein")} hint={t("ersetzt Tiefenschiefer unter Y 0")}>
                {blockInput(dim.deepBlock, (v) => set({ deepBlock: v }), t("Standard: Tiefenschiefer"))}
              </Field>
            )}
            <div style={{ gridColumn: "1 / -1" }}>
              <Check label={t("Grundgestein")} hint={t("Unzerstörbarer Boden ganz unten (und oben im Nether)")} checked={!dim.noBedrock} onChange={(v) => set({ noBedrock: !v })} />
            </div>
          </div>
        )}

        {step === "biomes" && (
          <>
            <Segmented
              label={t("Biome")}
              value={ownBiomes ? "own" : "vanilla"}
              onChange={(v) => set(v === "own" ? { biomeMode: "own", biomes: dim.biomes.length ? dim.biomes : (templateDefaults(tp).biomes ?? []) } : { biomeMode: "vanilla" })}
              options={[
                { value: "own", label: t("Eigene Biome") },
                { value: "vanilla", label: t("Vanilla-Biome") },
              ]}
            />
            {ownBiomes ? (
              <>
                <div className="muted small">{t("Jedes Biom übernimmt Pflanzen, Tiere und Farben von einem Vorbild. Erze, Strukturen und Kreaturen stellst du in den nächsten Schritten für alle Biome ein.")}</div>
                <div className="dim-list">
                  {dim.biomes.map((b, i) => {
                    const upd = (patch: Partial<DimBiome>) => set({ biomes: dim.biomes.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                    return (
                      <div className="dim-row" key={i}>
                        <input className="input" value={b.nameEn} placeholder={t("Name")} onChange={(e) => upd({ nameEn: e.target.value, id: b.id || e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
                        <input className="input mono" value={b.id} placeholder="id" onChange={(e) => upd({ id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
                        <select
                          className="input"
                          value={b.base}
                          onChange={(e) => {
                            const base = BASES.find((x) => x.id === e.target.value);
                            upd({ base: e.target.value, topBlock: base?.top ?? "", fillBlock: base?.fill ?? "" });
                          }}
                        >
                          {BASES.map((x) => (
                            <option key={x.id} value={x.id}>
                              {t("wie {biome}", { biome: x.label() })}
                            </option>
                          ))}
                        </select>
                        {blockInput(b.topBlock, (v) => upd({ topBlock: v }), t("Oberfläche"))}
                        <button className="icon-btn danger" onClick={() => set({ biomes: dim.biomes.filter((_, j) => j !== i) })} aria-label={t("Entfernen")}>
                          <TrashIcon size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="row gap-s">
                  <button
                    className="btn small"
                    onClick={() => {
                      const used = new Set(dim.biomes.map((b) => b.id));
                      let id = "biom";
                      for (let n = 2; used.has(id); n++) id = `biom_${n}`;
                      set({ biomes: [...dim.biomes, { id, nameDe: "", nameEn: "New Biome", base: tp === "nether" ? "nether_wastes" : tp === "end" ? "the_end" : "plains", topBlock: "", fillBlock: "" }] });
                    }}
                  >
                    {t("Biom hinzufügen")}
                  </button>
                </div>
                {dim.biomes.length > 1 && (
                  <Field label={t("Biomgröße")} hint={`× ${dim.biomeSize.toFixed(2)}`}>
                    <input type="range" min={0.25} max={4} step={0.25} value={dim.biomeSize} onChange={(e) => set({ biomeSize: Number(e.target.value) })} />
                  </Field>
                )}
              </>
            ) : (
              <Field label={t("Biome")} hint={t("Bäume, Pflanzen, Tiere und Erze kommen aus den Vanilla-Biomen")}>
                <select className="input" value={dim.biome} onChange={(e) => set({ biome: e.target.value })}>
                  <option value="overworld">{t("Passend zur Vorlage")}</option>
                  <option value="nether">{t("Alle Nether-Biome")}</option>
                  <option value="end">{t("End-Biome")}</option>
                  {VANILLA_BIOMES.map((b) => (
                    <option key={b} value={`minecraft:${b}`}>
                      {t("Nur: {biome}", { biome: b.replace(/_/g, " ") })}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </>
        )}

        {step === "caves" && (
          <div className="dim-checks">
            <Check label={t("Große Höhlen")} hint={t("Käse-, Spaghetti- und Nudelhöhlen aus dem Gelände")} checked={!dim.noNoiseCaves} onChange={(v) => set({ noNoiseCaves: !v })} />
            <Check label={t("Gegrabene Höhlen")} hint={t("Klassische Höhlengänge (nur eigene Biome)")} checked={!dim.noCaves} onChange={(v) => set({ noCaves: !v })} />
            <Check label={t("Schluchten")} hint={t("Tiefe Risse im Boden (nur eigene Biome)")} checked={!dim.noCanyons} onChange={(v) => set({ noCanyons: !v })} />
            <Check label={t("Große Erzadern")} hint={t("Riesige Kupfer- und Eisenadern tief unten")} checked={!dim.noOreVeins} onChange={(v) => set({ noOreVeins: !v })} />
          </div>
        )}

        {step === "ores" && <OresPage project={project} dim={dim} own={own} set={set} />}

        {step === "islands" && <IslandsPage project={project} dim={dim} own={own} set={set} />}

        {step === "structures" && (
          <>
            {onlyOwn}
            <div className="dim-checks">
              <Check label={t("Pflanzen und Bäume")} hint={t("Gras, Blumen, Bäume und Pilze aus den Vorbild-Biomen")} checked={!dim.noPlants} onChange={(v) => set({ noPlants: !v })} />
            </div>
            <div className="panel-title-lg">{t("Eigene Strukturen")}</div>
            {(content.structures ?? []).length === 0 ? (
              <div className="muted small">{t("Noch keine eigenen Strukturen. Lege eine an: Plus → Welt → Eigene Struktur.")}</div>
            ) : (
              <div className="dim-structures">
                {(content.structures ?? []).map((st) => {
                  const key = `#${st.id}`;
                  const on = dim.structures.includes(key);
                  return (
                    <label key={key} className={on ? "dim-chip on" : "dim-chip"}>
                      <input type="checkbox" checked={on} onChange={() => set({ structures: on ? dim.structures.filter((x) => x !== key) : [...dim.structures, key] })} />
                      {st.nameEn || st.nameDe || st.id}
                    </label>
                  );
                })}
              </div>
            )}
            <div className="panel-title-lg">{t("Vanilla-Strukturen")}</div>
            <div className="dim-structures">
              {STRUCTURES.map((s) => {
                const on = dim.structures.includes(s.id);
                return (
                  <label key={s.id} className={on ? "dim-chip on" : "dim-chip"}>
                    <input type="checkbox" checked={on} onChange={() => set({ structures: on ? dim.structures.filter((x) => x !== s.id) : [...dim.structures, s.id] })} />
                    {s.label()}
                  </label>
                );
              })}
            </div>
            <div className="muted small">{t("Manche Strukturen brauchen passendes Gelände, z. B. Ozeanmonumente viel Wasser.")}</div>
          </>
        )}

        {step === "fluids" && (
          <div className="form-grid">
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
            {tp !== "flat" && (
              <Field label={t("Meeresspiegel")} hint={t("Höhe der Meere, Oberwelt: 63")}>
                <input className="input" type="number" min={-64} max={250} value={dim.seaLevel} onChange={(e) => set({ seaLevel: Number(e.target.value) })} />
              </Field>
            )}
            <div style={{ gridColumn: "1 / -1" }} className="dim-checks">
              <Check label={t("Seen")} hint={t("Lava- und Wasserseen (nur eigene Biome)")} checked={!dim.noLakes} onChange={(v) => set({ noLakes: !v })} />
              <Check label={t("Quellen")} hint={t("Einzelne Wasser- und Lavaquellen an Wänden (nur eigene Biome)")} checked={!dim.noSprings} onChange={(v) => set({ noSprings: !v })} />
            </div>
          </div>
        )}

        {step === "sky" && (
          <div className="form-grid">
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
            <Field label={t("Grundhelligkeit")} hint={`${Math.round(dim.ambientLight * 100)} %`}>
              <input type="range" min={0} max={1} step={0.05} value={dim.ambientLight} onChange={(e) => set({ ambientLight: Number(e.target.value) })} />
            </Field>
            <Field label={t("Wetter")}>
              <select className="input" value={dim.weather} onChange={(e) => set({ weather: e.target.value as DimDef["weather"] })} disabled={!ownBiomes}>
                <option value="">{t("wie das Vorbild-Biom")}</option>
                <option value="none">{t("Nie Niederschlag")}</option>
                <option value="rain">{t("Regen")}</option>
                <option value="snow">{t("Schnee")}</option>
              </select>
            </Field>
            {ownBiomes ? (
              <>
                <ColorField label={t("Himmelsfarbe")} value={dim.skyColor} onChange={(v) => set({ skyColor: v })} />
                <ColorField label={t("Nebelfarbe")} value={dim.fogColor} onChange={(v) => set({ fogColor: v })} />
                <ColorField label={t("Wasserfarbe")} value={dim.waterColor} onChange={(v) => set({ waterColor: v })} />
                <ColorField label={t("Grasfarbe")} value={dim.grassColor} onChange={(v) => set({ grassColor: v })} />
                <ColorField label={t("Laubfarbe")} value={dim.foliageColor} onChange={(v) => set({ foliageColor: v })} />
              </>
            ) : (
              <div style={{ gridColumn: "1 / -1" }}>{onlyOwn}</div>
            )}
          </div>
        )}

        {step === "mobs" && (
          <>
            {onlyOwn}
            <div className="dim-checks">
              <Check label={t("Kreaturen der Vorbild-Biome")} hint={t("Tiere und Monster wie im Vorbild")} checked={!dim.noBaseSpawns} onChange={(v) => set({ noBaseSpawns: !v })} />
            </div>
            <div className="dim-list">
              {dim.spawns.map((s, i) => {
                const upd = (patch: Partial<DimSpawn>) => set({ spawns: dim.spawns.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                return (
                  <div className="dim-row dim-spawn" key={i}>
                    <select className="input" value={s.entity} onChange={(e) => upd({ entity: e.target.value, category: categoryOf(e.target.value) })}>
                      {entityOpts.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <select className="input" value={s.category} onChange={(e) => upd({ category: e.target.value })}>
                      {SPAWN_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label()}
                        </option>
                      ))}
                    </select>
                    <input className="input" type="number" min={1} value={s.weight} onChange={(e) => upd({ weight: Number(e.target.value) })} data-tip={t("Häufigkeit")} />
                    <input className="input" type="number" min={1} value={s.min} onChange={(e) => upd({ min: Number(e.target.value) })} data-tip={t("Gruppe min.")} />
                    <input className="input" type="number" min={1} value={s.max} onChange={(e) => upd({ max: Number(e.target.value) })} data-tip={t("Gruppe max.")} />
                    <button className="icon-btn danger" onClick={() => set({ spawns: dim.spawns.filter((_, j) => j !== i) })} aria-label={t("Entfernen")}>
                      <TrashIcon size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="row gap-s">
              <button
                className="btn small"
                onClick={() => {
                  const mob = content.mobs[0];
                  set({ spawns: [...dim.spawns, { entity: mob ? `${project.modId}:${mob.id}` : "minecraft:sheep", category: mob && ["zombie", "spider", "creeper"].includes(mob.model) ? "monster" : "creature", weight: 20, min: 1, max: 3 }] });
                }}
              >
                {t("Kreatur hinzufügen")}
              </button>
            </div>
            <div className="muted small">{t("Häufigkeit: je höher, desto öfter im Vergleich zu den anderen. Gruppe: wie viele zusammen erscheinen.")}</div>
          </>
        )}

        {step === "travel" && (
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
        )}
      </main>
      <DimPreview dim={dim} seed={seed} onSeed={setSeed} onViewInGame={onViewInGame} />
    </div>
  );
}
