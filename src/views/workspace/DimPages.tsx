import { t } from "../../i18n";
import { useState } from "react";
import { DimDef, DimOre, Project, TerrainBuilder, TerrainLayer } from "../../api";
import { OwnEntry } from "../../components/ItemPicker";
import { Segmented, Toggle } from "../../components/Chrome";
import { BranchIcon, CloseIcon, PlusIcon, TrashIcon, WeatherIcon } from "../../icons";
import { ItemField } from "./ContentForms";
import { blockColor, yRange } from "./DimPreview";
import { ORE_PRESETS } from "./dimensionDefaults";
import { builderToGraph, defaultBuilder, LAYERS, SHAPES } from "./terrain";

// ---- kleine Bausteine -----------------------------------------------------------

export function Slider({
  label,
  value,
  text,
  min,
  max,
  step = 1,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  text: string;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const pct = ((value - min) / (max - min || 1)) * 100;
  return (
    <label className={disabled ? "dx-slider disabled" : "dx-slider"}>
      <span className="dx-slider-head">
        <span>{label}</span>
        <span className="mono muted">{text}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ ["--pct" as string]: `${Math.max(0, Math.min(100, pct))}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function RangeSlider({
  label,
  lo,
  hi,
  text,
  min,
  max,
  step = 1,
  onChange,
  disabled,
}: {
  label: string;
  lo: number;
  hi: number;
  text: string;
  min: number;
  max: number;
  step?: number;
  onChange: (lo: number, hi: number) => void;
  disabled?: boolean;
}) {
  const p = (v: number) => ((v - min) / (max - min || 1)) * 100;
  return (
    <div className={disabled ? "dx-slider disabled" : "dx-slider"}>
      <span className="dx-slider-head">
        <span>{label}</span>
        <span className="mono muted">{text}</span>
      </span>
      <div className="dx-range" style={{ ["--a" as string]: `${p(lo)}%`, ["--b" as string]: `${p(hi)}%` }}>
        <input type="range" min={min} max={max} step={step} value={lo} disabled={disabled} aria-label={`${label} min.`} onChange={(e) => onChange(Math.min(Number(e.target.value), hi - step), hi)} />
        <input type="range" min={min} max={max} step={step} value={hi} disabled={disabled} aria-label={`${label} max.`} onChange={(e) => onChange(lo, Math.max(Number(e.target.value), lo + step))} />
      </div>
    </div>
  );
}

export function PageHead({ title, desc, action }: { title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="dx-head">
      <div className="grow">
        <h2 className="dx-title">{title}</h2>
        <div className="dx-desc">{desc}</div>
      </div>
      {action}
    </div>
  );
}

const fmtY = (v: number) => `Y ${v < 0 ? "−" + Math.abs(v) : v}`;

// ---- Gelände --------------------------------------------------------------------

export function TerrainPage({ dim, set, onNodes }: { dim: DimDef; set: (p: Partial<DimDef>) => void; onNodes: () => void }) {
  const [y0, y1] = yRange(dim);
  const mode = dim.terrainMode || "";
  const b: TerrainBuilder = dim.terrain && mode ? dim.terrain : { ...defaultBuilder("hills"), base: Math.max(dim.seaLevel + 9, 40) };
  const builder = mode === "builder";
  const update = (patch: Partial<TerrainBuilder>, bounds?: [number, number]) => {
    const nb = { ...b, ...patch };
    const [lo, hi] = bounds ?? [y0, y1];
    set({ terrain: nb, terrainMode: "builder", builderGraph: builderToGraph(nb, lo, hi), minY: lo, maxY: hi });
  };
  const setLayer = (kind: TerrainLayer["kind"], patch: Partial<TerrainLayer>) => update({ layers: b.layers.map((l) => (l.kind === kind ? { ...l, ...patch } : l)) });
  const missing = LAYERS.filter((l) => !b.layers.some((x) => x.kind === l.kind));
  const [addOpen, setAddOpen] = useState(false);
  return (
    <>
      <PageHead title={t("Gelände")} desc={t("Die Grundform deiner Welt. Rechts siehst du sofort, wie sie aussieht.")} />
      <div className="dx-label">{t("Grundform")}</div>
      <div className="dx-shapes">
        <button className={!builder ? "dx-shape active" : "dx-shape"} onClick={() => set({ terrainMode: "" })} data-tip={t("Die Gelände-Form der gewählten Vorlage")}>
          <svg viewBox="0 0 56 26" width="56" height="26">
            <path d="M4 18 C 10 8, 16 20, 22 12 S 34 6, 40 16 S 50 10, 52 12" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" />
          </svg>
          <span>{t("Vorlage")}</span>
        </button>
        {SHAPES.map((s) => (
          <button
            key={s.id}
            className={builder && b.shape === s.id ? "dx-shape active" : "dx-shape"}
            onClick={() => {
              const d = defaultBuilder(s.id);
              update({ shape: s.id, base: d.base, diff: d.diff, size: d.size, ocean: d.ocean });
            }}
          >
            <svg viewBox="0 0 56 26" width="56" height="26">
              <path d={s.path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
            <span>{s.label()}</span>
          </button>
        ))}
      </div>
      <div className="dx-grid2">
        <Slider label={t("Meeresspiegel")} value={dim.seaLevel} text={fmtY(dim.seaLevel)} min={y0} max={Math.min(y1, 250)} onChange={(v) => set({ seaLevel: v })} />
        <Slider label={t("Grundhöhe")} value={b.base} text={fmtY(b.base)} min={y0} max={y1} onChange={(v) => update({ base: v })} disabled={!builder} />
        <Slider label={t("Höhenunterschied")} value={b.diff} text={t("± {n} Blöcke", { n: b.diff })} min={4} max={300} step={2} onChange={(v) => update({ diff: v })} disabled={!builder} />
        <Slider label={t("Größe der Landschaft")} value={b.size} text={t("Hügel alle ~{n} Blöcke", { n: b.size })} min={40} max={1500} step={10} onChange={(v) => update({ size: v })} disabled={!builder} />
        <Slider label={t("Ozean-Anteil")} value={Math.round(b.ocean * 100)} text={`${Math.round(b.ocean * 100)} %`} min={0} max={100} onChange={(v) => update({ ocean: v / 100 })} disabled={!builder} />
        <RangeSlider
          label={t("Weltgrenzen")}
          lo={y0}
          hi={y1}
          text={`${fmtY(y0)} ${t("bis")} ${y1}`}
          min={-256}
          max={640}
          step={16}
          onChange={(lo, hi) => (builder ? update({}, [lo, hi]) : set({ minY: lo, maxY: hi }))}
        />
      </div>
      {!builder && (
        <>
          <Slider
            label={t("Landmenge")}
            value={dim.land}
            text={dim.land === 0 ? t("wie die Vorlage") : dim.land > 0 ? t("mehr Land, höhere Berge") : t("weniger Land, mehr Wasser oder Luft")}
            min={-0.4}
            max={0.4}
            step={0.02}
            onChange={(v) => set({ land: v })}
          />
          <div className="muted small">{t("Mit „Vorlage“ bleibt die Gelände-Form der gewählten Vorlage. Wähle eine Grundform, um Höhe, Größe und Ebenen selbst einzustellen.")}</div>
        </>
      )}
      {builder && (
        <>
          <div className="dx-row-between">
            <div className="dx-label">
              {t("Ebenen")} <span className="muted">· {t("werden übereinandergelegt")}</span>
            </div>
            <div className="dx-pop-wrap">
              <button className="btn small" disabled={missing.length === 0} onClick={() => setAddOpen(!addOpen)}>
                <PlusIcon size={13} /> {t("Ebene hinzufügen")}
              </button>
              {addOpen && missing.length > 0 && (
                <div className="dx-pop">
                  {missing.map((l) => (
                    <button
                      key={l.kind}
                      onClick={() => {
                        update({ layers: [...b.layers, { kind: l.kind, on: true, strength: 0.3 }] });
                        setAddOpen(false);
                      }}
                    >
                      {l.label()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="dx-layers">
            {LAYERS.filter((l) => b.layers.some((x) => x.kind === l.kind)).map((l) => {
              const layer = b.layers.find((x) => x.kind === l.kind)!;
              return (
                <div className={layer.on ? "dx-layer" : "dx-layer off"} key={l.kind}>
                  <Toggle checked={layer.on} onChange={(v) => setLayer(l.kind, { on: v })} label={l.label()} />
                  <span className="dx-layer-name">{l.label()}</span>
                  <span className="dx-layer-desc muted grow">{l.desc()}</span>
                  <div className="dx-layer-slider">
                    <Slider label={t("Stärke")} value={Math.round(layer.strength * 100)} text={`${Math.round(layer.strength * 100)} %`} min={0} max={100} onChange={(v) => setLayer(l.kind, { strength: v / 100 })} />
                  </div>
                  <button className="icon-btn dx-layer-x" onClick={() => update({ layers: b.layers.filter((x) => x.kind !== l.kind) })} aria-label={t("Entfernen")}>
                    <CloseIcon size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
      <div className="dx-callout">
        <BranchIcon size={16} />
        <div className="grow">
          {t("Noch mehr Kontrolle? Im")} <b>{t("Knoten-Modus")}</b> {t("baust du die Geländeformel selbst aus Rauschen, Kurven und Mathe.")}
        </div>
        <button className="link-btn" onClick={onNodes}>
          {t("Zum Knoten-Modus")}
        </button>
      </div>
    </>
  );
}

// ---- Erze -----------------------------------------------------------------------

const DISTS: { value: string; label: () => string }[] = [
  { value: "uniform", label: () => t("Gleichmäßig") },
  { value: "triangle", label: () => t("Dreieck") },
  { value: "bottom", label: () => t("Nur unten") },
  { value: "top", label: () => t("Nur oben") },
];

/** Häufigkeit je Höhe (0 … 1) für das Diagramm */
function distWeights(o: DimOre, ys: number[]) {
  const lo = Math.min(o.minY, o.maxY), hi = Math.max(o.minY, o.maxY);
  const mid = (lo + hi) / 2;
  return ys.map((y) => {
    if (y < lo || y > hi) return 0;
    const k = (y - lo) / (hi - lo || 1);
    switch (o.distribution) {
      case "triangle":
        return 1 - Math.abs(y - mid) / ((hi - lo) / 2 || 1);
      case "bottom":
        return Math.pow(1 - k, 2);
      case "top":
        return y >= mid ? 1 : 0;
      default:
        return 1;
    }
  });
}

export function OresPage({ project, dim, own, set }: { project: Project; dim: DimDef; own: OwnEntry[]; set: (p: Partial<DimDef>) => void }) {
  const [selIdx, setSelIdx] = useState(0);
  const ores = dim.ores;
  const ownBlocks = own.filter((o) => o.kind === "block");
  const upd = (i: number, patch: Partial<DimOre>) => set({ ores: ores.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const sel = ores[Math.min(selIdx, ores.length - 1)];
  const si = Math.min(selIdx, ores.length - 1);
  const isOwn = (id: string) => id.startsWith(`${project.modId}:`) || ownBlocks.some((b) => b.id === id || `${project.modId}:${b.id}` === id);
  const nameOf = (id: string) => {
    const o = ownBlocks.find((b) => b.id === id || `${project.modId}:${b.id}` === id);
    if (o) return o.name;
    const k = id.replace(/^.*:/, "").replace(/_/g, " ");
    return k.charAt(0).toUpperCase() + k.slice(1);
  };
  const [y0, y1] = yRange(dim);
  const ys = Array.from({ length: 24 }, (_, i) => y0 + ((i + 0.5) / 24) * (y1 - y0));
  const weights = sel ? distWeights(sel, ys) : [];
  const peak = sel ? ys[weights.indexOf(Math.max(...weights))] : 0;
  const stoneName = dim.stoneBlock ? nameOf(dim.stoneBlock) : t("Stein");
  return (
    <>
      <PageHead
        title={t("Erze")}
        desc={t("Welche Erze in dieser Welt vorkommen, wie tief und wie oft. Eigene und Vanilla-Erze.")}
        action={
          <button
            className="btn primary small"
            onClick={() => {
              set({ ores: [...ores, { block: ownBlocks[0] ? `${project.modId}:${ownBlocks[0].id}` : "minecraft:iron_ore", deepBlock: "", size: 8, count: 6, minY: -40, maxY: 20, distribution: "triangle" }] });
              setSelIdx(ores.length);
            }}
          >
            <PlusIcon size={13} /> {t("Erz hinzufügen")}
          </button>
        }
      />
      {dim.biomeMode !== "own" && <div className="callout warn small">{t("Erze gelten nur für eigene Biome – stelle unter „Biome“ auf „Eigene Biome“ um.")}</div>}
      <div className="dx-table">
        <div className="dx-tr dx-th">
          <span>{t("Erz")}</span>
          <span>{t("Höhe")}</span>
          <span>{t("Adergröße")}</span>
          <span>{t("Adern / Chunk")}</span>
          <span>{t("Aktiv")}</span>
        </div>
        {ores.map((o, i) => (
          <div key={i} className={i === si ? "dx-tr sel" : "dx-tr"} onClick={() => setSelIdx(i)}>
            <span className="dx-ore-name">
              <span className="dx-swatch" style={{ background: blockColor(o.block, "stone") }} />
              {nameOf(o.block)} <span className="muted small">{isOwn(o.block) ? t("eigenes") : "Vanilla"}</span>
            </span>
            <span>
              {fmtY(Math.min(o.minY, o.maxY))} {t("bis")} {Math.max(o.minY, o.maxY)}
            </span>
            <span>{o.size}</span>
            <span>{o.count}</span>
            <span className="dx-active" onClick={(e) => e.stopPropagation()}>
              <Toggle checked={!o.disabled} onChange={(v) => upd(i, { disabled: !v })} label={t("Aktiv")} />
              <span className="muted small">{t("aktiv")}</span>
            </span>
          </div>
        ))}
        {ores.length === 0 && <div className="dx-tr muted">{t("Noch keine Erze.")}</div>}
      </div>
      <div className="row wrap">
        {ORE_PRESETS.map((p) => (
          <button key={p.id} className="btn small ghost" onClick={() => set({ ores: p.ores().map((o) => ({ ...o, distribution: "triangle" })) })}>
            {t("Vorlage: {name}", { name: p.label() })}
          </button>
        ))}
      </div>
      {sel && (
        <div className="dx-card dx-ore-detail">
          <div className="dx-ore-left">
            <div className="dx-row-between">
              <div className="dx-card-title">{nameOf(sel.block)}</div>
              <button className="icon-btn danger" onClick={() => set({ ores: ores.filter((_, j) => j !== si) })} aria-label={t("Entfernen")} data-tip={t("Entfernen")}>
                <TrashIcon size={14} />
              </button>
            </div>
            <ItemField project={project} own={ownBlocks} blocksOnly value={sel.block} onChange={(v) => upd(si, { block: v })} placeholder={t("Erz")} />
            <div className="dx-label">{t("Verteilung")}</div>
            <Segmented label={t("Verteilung")} value={sel.distribution || "uniform"} onChange={(v) => upd(si, { distribution: v })} options={DISTS.map((d) => ({ value: d.value, label: d.label() }))} />
            <RangeSlider label={t("Höhe")} lo={Math.min(sel.minY, sel.maxY)} hi={Math.max(sel.minY, sel.maxY)} text={`${fmtY(Math.min(sel.minY, sel.maxY))} ${t("bis")} ${Math.max(sel.minY, sel.maxY)}`} min={y0} max={y1} onChange={(lo, hi) => upd(si, { minY: lo, maxY: hi })} />
            <Slider label={t("Adergröße")} value={sel.size} text={t("{n} Blöcke", { n: sel.size })} min={1} max={64} onChange={(v) => upd(si, { size: v })} />
            <Slider label={t("Adern pro Chunk")} value={sel.count} text={String(sel.count)} min={0.1} max={64} step={0.1} onChange={(v) => upd(si, { count: v >= 1 ? Math.round(v) : Math.round(v * 10) / 10 })} />
            <div className="dx-label">{t("Ersetzt")}</div>
            <div className="dx-chips">
              <span className="dx-chip">{stoneName}</span>
              <span className="dx-chip">
                {dim.deepBlock ? nameOf(dim.deepBlock) : t("Tiefenschiefer")} → {sel.deepBlock ? nameOf(sel.deepBlock) : nameOf(sel.block)}
              </span>
              {(sel.extra ?? []).map((x, k) => (
                <span key={k} className="dx-chip">
                  {x.target ? nameOf(x.target) : "?"} → {x.ore ? nameOf(x.ore) : nameOf(sel.block)}
                  <button className="dx-chip-x" onClick={() => upd(si, { extra: (sel.extra ?? []).filter((_, j) => j !== k) })} aria-label={t("Entfernen")}>
                    ×
                  </button>
                </span>
              ))}
              <button className="dx-chip add" onClick={() => upd(si, { extra: [...(sel.extra ?? []), { target: "minecraft:andesite", ore: "" }] })}>
                + {t("Block")}
              </button>
            </div>
            <div className="dx-sub-fields">
              <label className="dx-mini">
                <span>{t("Im tiefen Gestein")}</span>
                <ItemField project={project} own={ownBlocks} blocksOnly value={sel.deepBlock} onChange={(v) => upd(si, { deepBlock: v })} placeholder={t("gleich")} />
              </label>
              {(sel.extra ?? []).map((x, k) => (
                <label key={k} className="dx-mini">
                  <span>{t("Weiterer Block {n}", { n: k + 1 })}</span>
                  <div className="dx-mini-row">
                    <ItemField project={project} own={ownBlocks} blocksOnly value={x.target} onChange={(v) => upd(si, { extra: (sel.extra ?? []).map((y, j) => (j === k ? { ...y, target: v } : y)) })} placeholder={t("ersetzt")} />
                    <ItemField project={project} own={ownBlocks} blocksOnly value={x.ore} onChange={(v) => upd(si, { extra: (sel.extra ?? []).map((y, j) => (j === k ? { ...y, ore: v } : y)) })} placeholder={t("gleiches Erz")} />
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="dx-ore-right">
            <div className="dx-label">{t("Höhenverteilung")}</div>
            <div className="dx-hist">
              {weights.map((w, i) => (
                <span key={i} style={{ height: `${Math.max(4, w * 100)}%`, opacity: w > 0 ? 1 : 0.25 }} className={w > 0 ? "on" : ""} />
              ))}
            </div>
            <div className="muted small">
              {t("Am häufigsten bei {y}", { y: fmtY(Math.round(peak)) })} · {t("Nur in Biomen:")}
            </div>
            <div className="dx-chips">
              {dim.biomes.map((b) => {
                const on = (sel.biomes ?? []).includes(b.id);
                return (
                  <button key={b.id} className={on ? "dx-chip on" : "dx-chip"} onClick={() => upd(si, { biomes: on ? (sel.biomes ?? []).filter((x) => x !== b.id) : [...(sel.biomes ?? []), b.id] })}>
                    {b.nameDe || b.id}
                  </button>
                );
              })}
              <button className={(sel.biomes ?? []).length === 0 ? "dx-chip on" : "dx-chip"} onClick={() => upd(si, { biomes: [] })}>
                {t("alle")}
              </button>
            </div>
            <div className="dx-toggle-row">
              <Toggle checked={!!sel.hidden} onChange={(v) => upd(si, { hidden: v })} label={t("Luft-Kontakt verringern (versteckter)")} />
              <span>{t("Luft-Kontakt verringern (versteckter)")}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---- Schwebende Inseln ----------------------------------------------------------

const level = (v: number, words: string[]) => words[Math.min(words.length - 1, Math.floor(v * words.length))];

export function IslandsPage({ project, dim, own, set }: { project: Project; dim: DimDef; own: OwnEntry[]; set: (p: Partial<DimDef>) => void }) {
  const [y0, y1] = yRange(dim);
  const lo = (dim.islandsMaxY ?? 0) > (dim.islandsMinY ?? 0) ? dim.islandsMinY! : Math.max(y0 + 16, y1 - 160);
  const hi = (dim.islandsMaxY ?? 0) > (dim.islandsMinY ?? 0) ? dim.islandsMaxY! : Math.max(lo + 16, y1 - 100);
  const smin = dim.islandsSizeMin || 20, smax = dim.islandsSizeMax || 60;
  const on = dim.islands;
  return (
    <>
      <PageHead title={t("Schwebende Inseln")} desc={t("Inseln am Himmel – in jeder Vorlage. Rechts siehst du sie im Querschnitt.")} />
      <div className="dx-card">
        <div className="dx-row-between">
          <div className="dx-card-title row">
            <WeatherIcon size={16} /> {t("Schwebende Inseln")}
          </div>
          <span className="row">
            <Toggle checked={on} onChange={(v) => set({ islands: v, islandsMinY: lo, islandsMaxY: hi, islandsSizeMin: smin, islandsSizeMax: smax })} label={t("Schwebende Inseln")} />
            <span className="muted">{on ? t("an") : t("aus")}</span>
          </span>
        </div>
        <div className="dx-grid3">
          <RangeSlider label={t("Höhe")} lo={lo} hi={hi} text={`Y ${lo} – ${hi}`} min={y0} max={y1} step={4} disabled={!on} onChange={(a, b) => set({ islandsMinY: a, islandsMaxY: b })} />
          <RangeSlider label={t("Größe")} lo={smin} hi={smax} text={t("{a} – {b} Blöcke", { a: smin, b: smax })} min={8} max={200} step={4} disabled={!on} onChange={(a, b) => set({ islandsSizeMin: a, islandsSizeMax: b })} />
          <Slider
            label={t("Häufigkeit")}
            value={dim.islandsAmount}
            text={level(dim.islandsAmount, [t("sehr selten"), t("selten"), t("mittel"), t("häufig"), t("sehr häufig")])}
            min={0.05}
            max={1}
            step={0.05}
            disabled={!on}
            onChange={(v) => set({ islandsAmount: v })}
          />
          <Slider label={t("Dicke")} value={dim.islandsThickness || 12} text={t("{n} Blöcke", { n: dim.islandsThickness || 12 })} min={3} max={64} disabled={!on} onChange={(v) => set({ islandsThickness: v })} />
          <Slider
            label={t("Zerklüftung")}
            value={dim.islandsRough ?? 0.5}
            text={level(dim.islandsRough ?? 0.5, [t("glatt"), t("gering"), t("mittel"), t("stark")])}
            min={0}
            max={1}
            step={0.05}
            disabled={!on}
            onChange={(v) => set({ islandsRough: v })}
          />
          <div className="dx-slider">
            <span className="dx-slider-head">
              <span>{t("Oberfläche")}</span>
            </span>
            <ItemField project={project} own={own.filter((o) => o.kind === "block")} blocksOnly value={dim.islandsTop ?? ""} onChange={(v) => set({ islandsTop: v })} placeholder={t("wie das Gelände")} />
            <div className="dx-toggle-row">
              <Toggle checked={!!dim.islandsWaterfalls} onChange={(v) => set({ islandsWaterfalls: v })} label={t("Wasserfälle")} />
              <span>{dim.islandsWaterfalls ? t("Wasserfälle an") : t("Wasserfälle aus")}</span>
            </div>
          </div>
        </div>
      </div>
      {templateIsFloating(dim) && <div className="muted small">{t("Die Vorlage „Schwebende Inseln“ besteht schon nur aus Inseln.")}</div>}
    </>
  );
}

const templateIsFloating = (d: DimDef) => d.template === "floating";
