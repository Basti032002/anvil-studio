import { t } from "../../i18n";
import { useEffect, useRef } from "react";
import { DimDef } from "../../api";
import { templateOf } from "./dimensionDefaults";

// ---- kleines Rauschen (nur für die Vorschau, nicht das echte Minecraft-Gelände) ----
function hash(x: number, y: number, z: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144269504) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
function noise3(x: number, y: number, z: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz, seed);
  return (
    l(
      l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf),
      l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf),
      zf,
    ) *
      2 -
    1
  );
}
function fbm(x: number, y: number, z: number, seed: number, oct = 3) {
  let s = 0, a = 1, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += noise3(x * f, y * f, z * f, seed + i * 17) * a;
    n += a;
    a *= 0.5;
    f *= 2;
  }
  return s / n;
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
  const tp = templateOf(d);
  if (tp === "nether") return [0, 128];
  if (tp === "end" || tp === "void" || tp === "floating") return [0, 256];
  if (tp === "caves") return [-64, 128];
  return [-64, 320];
}

/** Ist an (x, y, z) fester Boden? */
function solid(d: DimDef, x: number, y: number, z: number, seed: number): boolean {
  const tp = templateOf(d);
  const land = (d.land || 0) * 80;
  let s = false;
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
    const iy = d.islandsY || yRange(d)[1] - 96;
    const band = Math.max(0, 1 - Math.abs(y - iy) / 20);
    s = band > 0 && fbm(x / 40, y / 14, z / 40, seed + 11) * band > 0.45 - 0.3 * (d.islandsAmount || 0.5);
  }
  return s;
}

/** Querschnitt (Seitenansicht) */
function drawSection(ctx: CanvasRenderingContext2D, d: DimDef, w: number, h: number) {
  const [y0, y1] = yRange(d);
  const tp = templateOf(d);
  const img = ctx.createImageData(w, h);
  const top = rgb(blockColor(d.topBlock, tp === "nether" ? "netherrack" : tp === "end" ? "end_stone" : "grass_block"));
  const fill = rgb(blockColor(d.fillBlock, tp === "nether" ? "netherrack" : tp === "end" ? "end_stone" : "dirt"));
  const stoneC = rgb(blockColor(d.stoneBlock, tp === "nether" ? "netherrack" : tp === "end" || tp === "void" ? "end_stone" : "stone"));
  const deepC = rgb(blockColor(d.deepBlock || d.stoneBlock, tp === "nether" ? "netherrack" : tp === "end" ? "end_stone" : "deepslate"));
  const fluid = d.fluid === "none" || tp === "end" || tp === "void" ? null : rgb(COLORS[d.fluid === "lava" ? "lava" : "water"]);
  const skyTop = d.skyColor ? rgb(d.skyColor) : tp === "nether" ? [60, 20, 20] : tp === "end" || tp === "void" ? [20, 14, 30] : [120, 167, 255];
  const ores = (d.ores ?? []).map((o) => ({ ...o, c: rgb(blockColor(o.block, "stone")) }));
  const seed = 7;
  const z = 0;
  for (let px = 0; px < w; px++) {
    const x = (px - w / 2) * 2;
    let depth = -1;
    for (let py = 0; py < h; py++) {
      const y = Math.round(y1 - ((py + 0.5) / h) * (y1 - y0));
      const s = solid(d, x, y, z, seed);
      let c: number[];
      if (s) {
        depth = depth < 0 ? 0 : depth + 1;
        const bed = !d.noBedrock && (y <= y0 + 1 || ((tp === "nether" || tp === "caves") && y >= y1 - 2));
        if (bed) c = [40, 40, 40];
        else if (depth === 0 && tp !== "nether" && tp !== "end" && tp !== "caves") c = top;
        else if (depth <= 2 && tp !== "end" && tp !== "caves") c = depth === 0 ? top : fill;
        else c = y < 0 && tp !== "nether" ? deepC : stoneC;
        if (depth > 2) {
          for (const o of ores) {
            if (y >= Math.min(o.minY, o.maxY) && y <= Math.max(o.minY, o.maxY) && hash(Math.floor(px / 2), Math.floor(py / 2), o.size, 99 + ores.indexOf(o)) < Math.min(0.04, 0.0008 * o.count * Math.sqrt(o.size))) {
              c = o.c;
              break;
            }
          }
        }
      } else {
        depth = -1;
        if (fluid && y <= d.seaLevel && tp !== "floating" && tp !== "caves") c = fluid;
        else {
          const k = py / h;
          c = [skyTop[0] * (1 - k * 0.4), skyTop[1] * (1 - k * 0.4), skyTop[2] * (1 - k * 0.3)];
          if (tp === "nether" || tp === "caves") c = [skyTop[0] * 0.5, skyTop[1] * 0.5, skyTop[2] * 0.5];
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

/** Karte (Draufsicht) mit Biomen */
function drawMap(ctx: CanvasRenderingContext2D, d: DimDef, w: number, h: number) {
  const tp = templateOf(d);
  const img = ctx.createImageData(w, h);
  const biomes = d.biomeMode === "own" ? (d.biomes ?? []) : [];
  const vanilla = tp === "nether" ? ["nether_wastes", "crimson_forest", "warped_forest", "soul_sand_valley", "basalt_deltas"] : tp === "end" ? ["the_end"] : ["plains", "forest", "desert", "taiga", "snowy_plains", "jungle", "savanna"];
  const list = biomes.length ? biomes.map((b) => b.base || "plains") : vanilla;
  const size = d.biomeSize || 1;
  const fluid = rgb(COLORS[d.fluid === "lava" ? "lava" : "water"]);
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const x = (px - w / 2) * 4, z = (py - h / 2) * 4;
      const temp = fbm(x / (420 * size), 0, z / (420 * size), 31, 2);
      const bi = Math.min(list.length - 1, Math.max(0, Math.floor(((temp * 1.6 + 1) / 2) * list.length)));
      let c = rgb(BASE_COLORS[list[bi]] ?? hashColor(list[bi]));
      const own = biomes[bi];
      if (own?.topBlock) c = rgb(blockColor(own.topBlock, "grass_block"));
      let shade = 1;
      if (tp === "overworld" || tp === "amplified") {
        const amp = tp === "amplified" ? 160 : 70;
        const hh = d.seaLevel + 8 + amp * fbm(x / 160, 0, z / 160, 7, 4) + 8 * fbm(x / 30, 0, z / 30, 12) + (d.land || 0) * 80;
        if (hh < d.seaLevel && d.fluid !== "none") c = fluid;
        shade = 0.75 + Math.max(-0.2, Math.min(0.35, (hh - d.seaLevel) / 120));
      } else if (tp === "end" || tp === "floating" || tp === "void") {
        let any = false;
        for (let y = 20; y < 220 && !any; y += 12) any = solid(d, x, y, z, 7);
        if (!any) c = [18, 14, 26];
      } else if (tp === "nether" || tp === "caves") shade = 0.7;
      const i = (py * w + px) * 4;
      img.data[i] = c[0] * shade;
      img.data[i + 1] = c[1] * shade;
      img.data[i + 2] = c[2] * shade;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = "rgba(255,255,255,.7)";
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
}

export default function DimPreview({ dim }: { dim: DimDef }) {
  const map = useRef<HTMLCanvasElement>(null);
  const sec = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(dim);
  useEffect(() => {
    const id = window.setTimeout(() => {
      const m = map.current?.getContext("2d");
      const s = sec.current?.getContext("2d");
      if (m) drawMap(m, dim, 220, 140);
      if (s) drawSection(s, dim, 220, 150);
    }, 60);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const [y0, y1] = yRange(dim);
  return (
    <div className="panel dim-preview">
      <div className="panel-title-lg">{t("Vorschau")}</div>
      <div className="dim-preview-label muted small">{t("Karte")}</div>
      <canvas ref={map} width={220} height={140} className="dim-canvas" />
      <div className="dim-preview-label muted small">
        {t("Querschnitt entlang der gestrichelten Linie")} · Y {y0} – {y1}
      </div>
      <canvas ref={sec} width={220} height={150} className="dim-canvas" />
      <div className="muted small">{t("Ungefähre Vorschau – die echte Welt sieht im Detail anders aus.")}</div>
    </div>
  );
}
