import { t } from "../../i18n";
import { useEffect, useRef } from "react";
import { PlayIcon, RefreshIcon } from "../../icons";
import { DimDef } from "../../api";
import { templateOf } from "./dimensionDefaults";
import { fbm, makeEvaluator } from "./terrain";

function hash(x: number, y: number, z: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144269504) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// ---- Farben -------------------------------------------------------------------
const COLORS: Record<string, string> = {
  grass_block: "#5d9e3c", dirt: "#7a5535", stone: "#7d7d7d", deepslate: "#4a4a50", bedrock: "#2a2a2a", sand: "#dccf9a", sandstone: "#d2c389",
  red_sand: "#b85f25", gravel: "#857d7a", clay: "#9fa4b0", snow_block: "#f0f6f6", ice: "#93b7f5", netherrack: "#6e2b2b", soul_sand: "#51402f",
  soul_soil: "#4b3a2c", crimson_nylium: "#8b1f22", warped_nylium: "#2b7265", basalt: "#4d4d55", blackstone: "#2c252b", end_stone: "#dcdf9e",
  mycelium: "#6f6268", podzol: "#5c4120", calcite: "#dfe0dc", tuff: "#6c6d66", obsidian: "#160f22", terracotta: "#975a40", moss_block: "#5a7a2c",
  coal_ore: "#262626", iron_ore: "#d8af93", copper_ore: "#e07b4f", gold_ore: "#f4d03f", redstone_ore: "#d11", lapis_ore: "#2445a8",
  diamond_ore: "#4ee4d8", emerald_ore: "#17c04c", nether_quartz_ore: "#eee6de", nether_gold_ore: "#f2b72f", ancient_debris: "#6a4a3f",
  water: "#3f76e4", lava: "#e8641c", amethyst_block: "#8d60c8", glowstone: "#fbd86a",
};
const BASE_COLORS: Record<string, string> = {
  plains: "#8db360", forest: "#4d8a3a", birch_forest: "#69a85a", dark_forest: "#3b5a22", taiga: "#3f6b55", snowy_plains: "#e8f1f2", desert: "#e2d58e",
  savanna: "#b0a45c", jungle: "#3e9e2c", badlands: "#c06a35", swamp: "#4c6b3a", mushroom_fields: "#8a6c86", cherry_grove: "#e7a6c7",
  ocean: "#2f5bbd", lush_caves: "#6aa84f", deep_dark: "#1b2730", dripstone_caves: "#8b6a4c", nether_wastes: "#7a2d2d", crimson_forest: "#9b2525",
  warped_forest: "#2a7d70", soul_sand_valley: "#5b4636", basalt_deltas: "#4a4a52", the_end: "#cfd296", end_highlands: "#c4c785", small_end_islands: "#b0b37a",
};
function hashColor(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(h) % 360} 45% 50%)`;
}
export function blockColor(id: string, fallback: string) {
  const k = (id || fallback).replace(/^minecraft:/, "").replace(/^#.*/, fallback);
  if (COLORS[k]) return COLORS[k];
  if (k.includes("ore")) return hashColor(k);
  return k.includes(":") || !COLORS[k] ? hashColor(k) : COLORS[k];
}
function rgb(c: string): [number, number, number] {
  if (c.startsWith("#")) {
    const h = c.length === 4 ? c.slice(1).split("").map((x) => x + x).join("") : c.slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = c.match(/hsl\((\d+) (\d+)% (\d+)%\)/);
  if (!m) return [128, 128, 128];
  const hh = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100;
  const f = (n: number) => {
    const k = (n + hh * 12) % 12;
    return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/** Höhenbereich der Vorlage */
export function yRange(d: DimDef): [number, number] {
  if ((d.maxY ?? 0) > (d.minY ?? 0)) return [d.minY ?? 0, d.maxY ?? 0];
  const tp = templateOf(d);
  if (tp === "nether") return [0, 128];
  if (tp === "end" || tp === "void" || tp === "floating") return [0, 256];
  if (tp === "caves") return [-64, 128];
  return [-64, 320];
}

export function islandsRange(d: DimDef): [number, number] {
  const [y0, y1] = yRange(d);
  let lo: number, hi: number;
  if ((d.islandsMaxY ?? 0) > (d.islandsMinY ?? 0)) [lo, hi] = [d.islandsMinY!, d.islandsMaxY!];
  else {
    const y = d.islandsY || y1 - 96;
    [lo, hi] = [y - 24, y + 24];
  }
  lo = Math.max(y0 + 8, Math.min(y1 - 16, lo));
  hi = Math.max(y0 + 16, Math.min(y1 - 8, hi));
  return [Math.min(lo, hi - 8), hi];
}

/** Ist an (x, y, z) fester Boden? */
type Ev = ReturnType<typeof makeEvaluator> | null;
function solid(d: DimDef, x: number, y: number, z: number, seed: number, ev: Ev): boolean {
  const tp = templateOf(d);
  const land = (d.land || 0) * 80;
  let s = false;
  if (ev && tp !== "flat" && tp !== "void") {
    let dens = ev.density(x, y, z) + (d.land || 0);
    if (!d.noNoiseCaves && dens > 1.6 && fbm(x / 28, y / 14, z / 28, seed + 9, 2) > 0.55) dens = -1;
    s = dens > 0;
  } else
  switch (tp) {
    case "overworld":
    case "amplified": {
      const amp = tp === "amplified" ? 160 : 70;
      const h = d.seaLevel + 8 + amp * fbm(x / 160, 0, z / 160, seed, 4) + 8 * fbm(x / 30, 0, z / 30, seed + 5) + land;
      s = y < h;
      if (s && !d.noNoiseCaves && y < h - 6 && fbm(x / 28, y / 14, z / 28, seed + 9) > 0.32) s = false;
      break;
    }
    case "flat":
      s = y <= d.seaLevel;
      break;
    case "nether": {
      const e = Math.pow(Math.abs(y - 64) / 64, 3) * 1.6;
      s = fbm(x / 45, y / 28, z / 45, seed, 3) - 0.2 + e + land / 80 > 0;
      break;
    }
    case "end": {
      const r = Math.hypot(x, z);
      const main = r < 90 && y > 30 && y < 66 - (r / 90) * 10 && y > 66 - (1 - r / 90) * 40;
      const outer = r > 200 && y > 40 && y < 70 && fbm(x / 70, y / 18, z / 70, seed + 3) + (land / 80) > 0.28;
      s = main || outer;
      break;
    }
    case "floating": {
      const band = Math.max(0, 1 - Math.abs(y - 128) / 70);
      s = fbm(x / 55, y / 22, z / 55, seed + 4) * band + land / 80 > 0.16;
      break;
    }
    case "caves":
      s = !(fbm(x / 30, y / 16, z / 30, seed + 2) - land / 80 > 0.22) || y < -60 || y > 124;
      break;
    case "void":
      s = false;
  }
  if (!s && d.islands) {
    const [lo, hi] = islandsRange(d);
    if (y >= lo && y <= hi) {
      const fade = Math.max(4, Math.min(24, (hi - lo) / 4));
      const band = Math.min(1, (y - lo) / fade, (hi - y) / fade);
      const size = d.islandsSizeMax ? ((d.islandsSizeMin || 20) + d.islandsSizeMax) / 2 : 40;
      const thick = d.islandsThickness || 12;
      let n = fbm(x / (size * 1.2), y / (thick * 1.2), z / (size * 1.2), seed + 11, 3) * 0.8;
      if (d.islandsRough) n += d.islandsRough * 0.35 * fbm(x / 6, y / 6, z / 6, seed + 12, 2);
      s = band * (n + 0.25 + 0.6 * (d.islandsAmount || 0.5)) - 1 > 0;
    }
  }
  return s;
}

function evaluatorFor(d: DimDef, seed: number): Ev {
  if (d.terrainMode !== "builder" && d.terrainMode !== "nodes") return null;
  const g = d.terrainMode === "nodes" ? d.graph : d.builderGraph;
  if (!g || !g.nodes.some((n) => n.kind === "output")) return null;
  const [y0, y1] = yRange(d);
  return makeEvaluator(g, seed, y0, y1);
}

const MAP_BLOCKS = 640;

/** Querschnitt (Seitenansicht) */
function drawSection(ctx: CanvasRenderingContext2D, d: DimDef, w: number, h: number, seed: number, ev: Ev) {
  const [y0, y1] = yRange(d);
  const tp = templateOf(d);
  const img = ctx.createImageData(w, h);
  const top = rgb(blockColor(d.topBlock, tp === "nether" ? "netherrack" : tp === "end" ? "end_stone" : "grass_block"));
  const fill = rgb(blockColor(d.fillBlock, tp === "nether" ? "netherrack" : tp === "end" ? "end_stone" : "dirt"));
  const islandTop = d.islandsTop ? rgb(blockColor(d.islandsTop, "grass_block")) : top;
  const stoneC = rgb(blockColor(d.stoneBlock, tp === "nether" ? "netherrack" : tp === "end" || tp === "void" ? "end_stone" : "stone"));
  const deepC = rgb(blockColor(d.deepBlock || d.stoneBlock, tp === "nether" ? "netherrack" : tp === "end" ? "end_stone" : "deepslate"));
  const fluid = d.fluid === "none" || tp === "end" || tp === "void" ? null : rgb(COLORS[d.fluid === "lava" ? "lava" : "water"]);
  const skyTop = d.skyColor ? rgb(d.skyColor) : tp === "nether" ? [60, 20, 20] : tp === "end" || tp === "void" ? [20, 14, 30] : [150, 196, 255];
  const ores = (d.ores ?? []).filter((o) => !o.disabled).map((o, i) => ({ ...o, i, c: rgb(blockColor(o.block, "stone")) }));
  const [ilo] = islandsRange(d);
  const z = 0;
  const step = MAP_BLOCKS / w;
  for (let px = 0; px < w; px++) {
    const x = Math.round((px - w / 2) * step);
    let depth = -1;
    for (let py = 0; py < h; py++) {
      const y = Math.round(y1 - ((py + 0.5) / h) * (y1 - y0));
      const s = solid(d, x, y, z, seed, ev);
      let c: number[];
      if (s) {
        depth = depth < 0 ? 0 : depth + 1;
        const bed = !d.noBedrock && (y <= y0 + 2 || ((tp === "nether" || tp === "caves") && y >= y1 - 3));
        const isl = d.islands && y >= ilo;
        if (bed) c = [40, 40, 40];
        else if (depth === 0 && tp !== "nether" && tp !== "end" && tp !== "caves") c = isl ? islandTop : top;
        else if (depth <= 1 && tp !== "end" && tp !== "caves") c = fill;
        else c = y < 0 && tp !== "nether" ? deepC : stoneC;
        if (depth > 1) {
          for (const o of ores) {
            if (y >= Math.min(o.minY, o.maxY) && y <= Math.max(o.minY, o.maxY) && hash(px, py, o.size, 99 + o.i) < Math.min(0.06, 0.0015 * o.count * Math.sqrt(o.size))) {
              c = o.c;
              break;
            }
          }
        }
      } else {
        depth = -1;
        if (fluid && y <= d.seaLevel && tp !== "floating" && tp !== "caves" && !(d.islands && y >= ilo)) c = fluid;
        else {
          const k = py / h;
          c = [skyTop[0] * (1 - k * 0.25), skyTop[1] * (1 - k * 0.2), skyTop[2] * (1 - k * 0.1)];
          if (tp === "nether" || tp === "caves") c = [skyTop[0] * 0.45, skyTop[1] * 0.45, skyTop[2] * 0.45];
        }
      }
      const i = (py * w + px) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Karte (Draufsicht) */
function drawMap(ctx: CanvasRenderingContext2D, d: DimDef, w: number, seed: number, ev: Ev) {
  const tp = templateOf(d);
  const h = w;
  const img = ctx.createImageData(w, h);
  const [y0, y1] = yRange(d);
  const biomes = d.biomeMode === "own" ? (d.biomes ?? []) : [];
  const vanilla = tp === "nether" ? ["nether_wastes", "crimson_forest", "warped_forest", "soul_sand_valley", "basalt_deltas"] : tp === "end" ? ["the_end"] : ["plains", "forest", "desert", "taiga", "snowy_plains", "jungle", "savanna"];
  const list = biomes.length ? biomes.map((b) => b.base || "plains") : vanilla;
  const size = d.biomeSize || 1;
  const water = rgb(COLORS[d.fluid === "lava" ? "lava" : "water"]);
  const step = MAP_BLOCKS / w;
  const cave = tp === "nether" || tp === "caves";
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const x = Math.round((px - w / 2) * step), z = Math.round((py - h / 2) * step);
      const temp = fbm(x / (420 * size), 0, z / (420 * size), 31, 2) / 1.6;
      const bi = Math.min(list.length - 1, Math.max(0, Math.floor(((temp * 1.6 + 1) / 2) * list.length)));
      let c = rgb(BASE_COLORS[list[bi]] ?? "#8db360");
      const own = biomes[bi];
      if (own?.topBlock) c = rgb(blockColor(own.topBlock, "grass_block"));
      else if (d.topBlock && !cave) c = rgb(blockColor(d.topBlock, "grass_block"));
      // Oberfläche suchen
      let surf = -9999;
      const from = cave ? Math.min(y1 - 8, d.seaLevel + 40) : y1;
      for (let y = from; y >= y0; y -= 4)
        if (solid(d, x, y, z, seed, ev)) {
          surf = y;
          break;
        }
      if (surf === -9999) c = tp === "end" || tp === "void" || tp === "floating" ? [18, 14, 26] : d.fluid !== "none" ? water : [18, 14, 26];
      else if (surf < d.seaLevel && d.fluid !== "none" && !cave) c = surf < d.seaLevel - 12 ? [water[0] * 0.75, water[1] * 0.75, water[2] * 0.8] : water;
      else if (d.islands && surf >= islandsRange(d)[0]) {
        const ic = d.islandsTop ? rgb(blockColor(d.islandsTop, "grass_block")) : c;
        c = [ic[0] * 0.85, ic[1] * 0.85, ic[2] * 0.85];
      } else if (!cave && tp !== "end") {
        const above = surf - d.seaLevel;
        if (above <= 2 && d.fluid === "water") c = rgb(COLORS.sand);
        else if (above > 135) c = [240, 244, 246];
        else if (above > 95) c = [125, 125, 125];
      }
      const i = (py * w + px) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
}

export default function DimPreview({ dim, seed, onSeed, onViewInGame }: { dim: DimDef; seed: number; onSeed: (s: number) => void; onViewInGame?: () => void }) {
  const map = useRef<HTMLCanvasElement>(null);
  const sec = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(dim) + seed;
  useEffect(() => {
    const id = window.setTimeout(() => {
      const ev = evaluatorFor(dim, seed);
      const s = sec.current?.getContext("2d");
      if (s) drawSection(s, dim, 160, 96, seed, ev);
      const m = map.current?.getContext("2d");
      if (m) drawMap(m, dim, 80, seed, evaluatorFor(dim, seed));
    }, 120);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const [y0, y1] = yRange(dim);
  return (
    <aside className="dim-preview">
      <div className="dim-preview-head">
        <div className="panel-title-lg grow">{t("Live-Vorschau")}</div>
        <span className="dim-seed mono">
          {t("Seed")} {seed}
        </span>
        <button className="icon-btn" onClick={() => onSeed(Math.floor(Math.random() * 99999))} aria-label={t("Neuer Seed")} data-tip={t("Neuer Seed")}>
          <RefreshIcon size={14} />
        </button>
      </div>
      <canvas ref={map} width={80} height={80} className="dim-canvas dim-map" />
      <div className="muted small">
        {t("Von oben")} · {MAP_BLOCKS} × {MAP_BLOCKS} {t("Blöcke")}
      </div>
      <canvas ref={sec} width={160} height={96} className="dim-canvas dim-section" />
      <div className="muted small">
        {t("Querschnitt")} · Y {y0} {t("bis")} {y1}
      </div>
      {onViewInGame && (
        <button className="btn primary full" onClick={onViewInGame}>
          <PlayIcon size={13} /> {t("In Minecraft ansehen")}
        </button>
      )}
      <div className="muted small">{t("Ungefähre Vorschau – die echte Welt sieht im Detail anders aus.")}</div>
    </aside>
  );
}
