import { t } from "../../i18n";
import { TerrainBuilder, TerrainLayer, TerrainShape, TGraph, TNode } from "../../api";

// ---- Baukasten ------------------------------------------------------------------

export const SHAPES: { id: TerrainShape; label: () => string; path: string }[] = [
  { id: "hills", label: () => t("Hügelig"), path: "M4 16 C 12 6, 20 6, 28 14 S 44 22, 52 10" },
  { id: "flat", label: () => t("Flach"), path: "M4 14 L 52 14" },
  { id: "mountains", label: () => t("Gebirge"), path: "M4 20 L 14 6 L 22 16 L 30 4 L 40 18 L 46 10 L 52 16" },
  { id: "islands", label: () => t("Inseln"), path: "M4 18 L 12 18 C 15 10, 21 10, 24 18 L 32 18 C 35 12, 41 12, 44 18 L 52 18" },
  { id: "canyons", label: () => t("Canyons"), path: "M4 8 L 20 8 L 24 20 L 32 20 L 36 8 L 52 8" },
  { id: "terraces", label: () => t("Terrassen"), path: "M4 20 L 14 20 L 14 15 L 24 15 L 24 10 L 34 10 L 34 15 L 44 15 L 44 20 L 52 20" },
];

export const LAYERS: { kind: TerrainLayer["kind"]; label: () => string; desc: () => string }[] = [
  { kind: "continents", label: () => t("Kontinente"), desc: () => t("große Land- und Meeresflächen") },
  { kind: "erosion", label: () => t("Erosion"), desc: () => t("flache Ebenen gegen zerklüftete Hänge") },
  { kind: "peaks", label: () => t("Gipfel & Täler"), desc: () => t("Bergketten und tiefe Täler") },
  { kind: "roughness", label: () => t("Rauheit"), desc: () => t("kleine Unebenheiten auf der Oberfläche") },
  { kind: "overhangs", label: () => t("Überhänge (3D)"), desc: () => t("Klippen, Bögen und Überhänge") },
];

export function defaultBuilder(shape: TerrainShape = "hills"): TerrainBuilder {
  const base: Record<TerrainShape, Partial<TerrainBuilder>> = {
    hills: { base: 72, diff: 80, size: 300, ocean: 0.3 },
    flat: { base: 68, diff: 12, size: 400, ocean: 0.15 },
    mountains: { base: 90, diff: 180, size: 350, ocean: 0.2 },
    islands: { base: 50, diff: 60, size: 260, ocean: 0.7 },
    canyons: { base: 90, diff: 70, size: 220, ocean: 0.1 },
    terraces: { base: 80, diff: 90, size: 300, ocean: 0.25 },
  };
  return {
    shape,
    base: 72,
    diff: 80,
    size: 300,
    ocean: 0.3,
    layers: [
      { kind: "continents", on: true, strength: 0.6 },
      { kind: "erosion", on: true, strength: 0.45 },
      { kind: "peaks", on: true, strength: shape === "mountains" ? 0.7 : 0.35 },
      { kind: "roughness", on: true, strength: 0.25 },
      { kind: "overhangs", on: false, strength: 0.15 },
    ],
    ...base[shape],
  };
}

let seq = 0;
const nid = (p: string) => `${p}${(++seq).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/** Baukasten → Formel (dieselbe, die der Knoten-Modus zeigt) */
export function builderToGraph(b: TerrainBuilder, minY: number, maxY: number): TGraph {
  const nodes: TNode[] = [];
  const links: TGraph["links"] = [];
  const add = (id: string, kind: string, x: number, y: number, props: Record<string, string | number> = {}) => {
    nodes.push({ id, kind, x, y, props });
    return id;
  };
  const link = (from: string, to: string, port: string) => links.push({ from, to, port });
  const layer = (k: TerrainLayer["kind"]) => b.layers.find((l) => l.kind === k && l.on);
  const parts: string[] = [];
  let row = 0;
  const cont = layer("continents");
  if (cont) {
    const n = add("kontinente", "noise", 20, 20 + row * 150, { size: Math.round(b.size * 2.7), octaves: 4, strength: +(cont.strength * 1.6).toFixed(3), label: t("Kontinente") });
    const c = add("kurve", "curve", 280, 20 + row * 150, { shape: "s" });
    link(n, c, "in");
    parts.push(c);
    row++;
  }
  const ero = layer("erosion");
  if (ero) {
    parts.push(add("erosion", "noise", 20, 20 + row * 150, { size: Math.round(b.size * 1.6), octaves: 3, strength: +(ero.strength * 0.9).toFixed(3), label: t("Erosion") }));
    row++;
  }
  const peaks = layer("peaks");
  if (peaks) {
    const n = add("gipfel", "noise", 20, 20 + row * 150, { size: Math.round(b.size * 0.75), octaves: 6, label: t("Gipfel") });
    const c = add("grat", "curve", 280, 20 + row * 150, { shape: "ridge" });
    const m = add("gipfel_mal", "math", 520, 20 + row * 150, { op: "mul", b: +(peaks.strength * 1.8).toFixed(3) });
    link(n, c, "in");
    link(c, m, "a");
    parts.push(m);
    row++;
  }
  const rough = layer("roughness");
  if (rough) {
    parts.push(add("rauheit", "noise", 20, 20 + row * 150, { size: Math.max(8, Math.round(b.size * 0.06)), octaves: 3, strength: +(rough.strength * 0.5).toFixed(3), label: t("Rauheit") }));
    row++;
  }
  // Summe aller Ebenen + Meeresanteil
  let sum = add("meer", "const", 20, 20 + row * 150, { value: +(-(b.ocean - 0.3) * 1.6 + 0.2).toFixed(3), label: t("Ozean-Anteil") });
  row++;
  parts.forEach((p, i) => {
    const s = add(`summe${i}`, "math", 760, 20 + i * 90, { op: "add" });
    link(sum, s, "a");
    link(p, s, "b");
    sum = s;
  });
  // Grundform
  const shapeCurve: Record<TerrainShape, Record<string, string | number>> = {
    hills: { shape: "s" },
    flat: { shape: "linear", low: -0.2, high: 0.2 },
    mountains: { shape: "exp" },
    islands: { shape: "exp", low: -1, high: 0.8 },
    canyons: { shape: "canyon" },
    terraces: { shape: "steps", points: 6 },
  };
  const form = add("grundform", "curve", 1000, 40, { ...shapeCurve[b.shape], label: t("Grundform") });
  link(sum, form, "in");
  const scale = add("hoehe", "math", 1240, 40, { op: "mul", b: +(b.diff / 24).toFixed(3), label: t("Höhenunterschied") });
  link(form, scale, "a");
  const y = add("y", "ygrad", 1000, 240, { bottom: +((b.base - minY) / 24).toFixed(3), top: +((b.base - maxY) / 24).toFixed(3), label: t("Grundhöhe") });
  let total = add("gelaende", "math", 1480, 120, { op: "add" });
  link(scale, total, "a");
  link(y, total, "b");
  const over = layer("overhangs");
  if (over) {
    const n = add("klippen", "noise", 1240, 400, { size: Math.max(16, Math.round(b.size * 0.2)), octaves: 3, dim: "3d", strength: +(over.strength * 3).toFixed(3), label: t("3D-Klippen") });
    const s = add("mit_klippen", "math", 1720, 200, { op: "add" });
    link(total, s, "a");
    link(n, s, "b");
    total = s;
  }
  const out = add("ergebnis", "output", 1960, 160);
  link(total, out, "in");
  return { nodes, links };
}

// ---- Knoten-Modus ---------------------------------------------------------------

export type PropSpec = { key: string; label: () => string; type: "number" | "select"; def: number | string; options?: [string, () => string][]; step?: number };
export type NodeSpec = { kind: string; label: () => string; color: string; inputs: [string, () => string][]; props: PropSpec[] };

export const NODE_SPECS: NodeSpec[] = [
  {
    kind: "noise",
    label: () => t("Rauschen"),
    color: "#6ea8fe",
    inputs: [],
    props: [
      { key: "size", label: () => t("Größe"), type: "number", def: 200 },
      { key: "octaves", label: () => t("Oktaven"), type: "number", def: 4 },
      { key: "strength", label: () => t("Stärke"), type: "number", def: 1, step: 0.1 },
      { key: "dim", label: () => t("Art"), type: "select", def: "2d", options: [["2d", () => t("2D (Höhe)")], ["3d", () => t("3D (Überhänge)")]] },
    ],
  },
  {
    kind: "curve",
    label: () => t("Kurve"),
    color: "#f0b44c",
    inputs: [["in", () => t("Eingang")]],
    props: [
      {
        key: "shape",
        label: () => t("Form"),
        type: "select",
        def: "s",
        options: [
          ["s", () => t("S-Kurve")],
          ["linear", () => t("Linear")],
          ["steps", () => t("Treppen")],
          ["ridge", () => t("Grat")],
          ["valley", () => t("Tal")],
          ["canyon", () => t("Schlucht")],
          ["exp", () => t("Steil oben")],
          ["plateau", () => t("Hochebene")],
        ],
      },
      { key: "points", label: () => t("Punkte"), type: "number", def: 5 },
      { key: "low", label: () => t("Unten"), type: "number", def: -1, step: 0.1 },
      { key: "high", label: () => t("Oben"), type: "number", def: 1, step: 0.1 },
    ],
  },
  {
    kind: "math",
    label: () => t("Mathe"),
    color: "#b892ff",
    inputs: [
      ["a", () => "A"],
      ["b", () => "B"],
    ],
    props: [
      {
        key: "op",
        label: () => t("Rechnung"),
        type: "select",
        def: "add",
        options: [
          ["add", () => t("Addieren")],
          ["sub", () => t("Subtrahieren")],
          ["mul", () => t("Multiplizieren")],
          ["min", () => t("Kleinster Wert")],
          ["max", () => t("Größter Wert")],
          ["abs", () => t("Betrag")],
          ["square", () => t("Quadrat")],
          ["neg", () => t("Negieren")],
        ],
      },
      { key: "b", label: () => t("B (ohne Kabel)"), type: "number", def: 1, step: 0.1 },
    ],
  },
  {
    kind: "ygrad",
    label: () => t("Y-Verlauf"),
    color: "#e0a45c",
    inputs: [],
    props: [
      { key: "top", label: () => t("oben"), type: "number", def: -1, step: 0.1 },
      { key: "bottom", label: () => t("unten"), type: "number", def: 1, step: 0.1 },
    ],
  },
  {
    kind: "distance",
    label: () => t("Abstand zur Mitte"),
    color: "#e5845c",
    inputs: [],
    props: [
      { key: "scale", label: () => t("Maßstab (Blöcke)"), type: "number", def: 1000 },
      { key: "x", label: () => "X", type: "number", def: 0 },
      { key: "z", label: () => "Z", type: "number", def: 0 },
    ],
  },
  {
    kind: "biome",
    label: () => t("Biom-Wert"),
    color: "#6cc957",
    inputs: [],
    props: [
      {
        key: "value",
        label: () => t("Wert"),
        type: "select",
        def: "continents",
        options: [
          ["continents", () => t("Kontinente")],
          ["erosion", () => t("Erosion")],
          ["ridges", () => t("Grate")],
          ["temperature", () => t("Temperatur")],
          ["humidity", () => t("Feuchtigkeit")],
        ],
      },
    ],
  },
  {
    kind: "clamp",
    label: () => t("Begrenzen"),
    color: "#9aa3b2",
    inputs: [["in", () => t("Eingang")]],
    props: [
      { key: "min", label: () => t("min."), type: "number", def: -1, step: 0.1 },
      { key: "max", label: () => t("max."), type: "number", def: 1, step: 0.1 },
    ],
  },
  {
    kind: "mix",
    label: () => t("Mischen"),
    color: "#c58af9",
    inputs: [
      ["a", () => "A"],
      ["b", () => "B"],
      ["t", () => t("Anteil")],
    ],
    props: [{ key: "t", label: () => t("Anteil (ohne Kabel)"), type: "number", def: 0.5, step: 0.05 }],
  },
  {
    kind: "random",
    label: () => t("Zufall"),
    color: "#79c0d1",
    inputs: [],
    props: [
      { key: "size", label: () => t("Größe"), type: "number", def: 2 },
      { key: "strength", label: () => t("Stärke"), type: "number", def: 0.1, step: 0.05 },
    ],
  },
  {
    kind: "const",
    label: () => t("Zahl"),
    color: "#9aa3b2",
    inputs: [],
    props: [{ key: "value", label: () => t("Wert"), type: "number", def: 0, step: 0.1 }],
  },
  { kind: "output", label: () => t("Ergebnis"), color: "#6cc957", inputs: [["in", () => t("Dichte")]], props: [] },
];

export const specOf = (kind: string) => NODE_SPECS.find((s) => s.kind === kind) ?? NODE_SPECS[0];

export function newNode(kind: string, x: number, y: number): TNode {
  const spec = specOf(kind);
  const props: Record<string, string | number> = {};
  for (const p of spec.props) props[p.key] = p.def;
  return { id: nid(kind.slice(0, 3)), kind, x, y, props };
}

// ---- Auswertung für die Vorschau (ungefähr, nicht Minecraft-genau) -------------------

function hash(x: number, y: number, z: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177 + seed * 144269504) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const smooth = (v: number) => v * v * (3 - 2 * v);
export function noise3(x: number, y: number, z: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  const l = (a: number, b: number, v: number) => a + (b - a) * v;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz, seed);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf), l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf), zf) * 2 - 1;
}
export function fbm(x: number, y: number, z: number, seed: number, oct = 3) {
  let s = 0, a = 1, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += noise3(x * f, y * f, z * f, seed + i * 17) * a;
    n += a;
    a *= 0.5;
    f *= 2;
  }
  return (s / n) * 1.6;
}
const strSeed = (s: string) => {
  let h = 7;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h & 0xffff;
};

function curvePoints(shape: string, steps: number): [number, number][] {
  switch (shape) {
    case "linear":
      return [[-1, -1], [1, 1]];
    case "steps": {
      const n = Math.max(2, Math.min(12, Math.round(steps)));
      const pts: [number, number][] = [];
      for (let k = 0; k < n; k++) {
        const v = -1 + (2 * k) / (n - 1);
        pts.push([-1 + (2 * k) / n, v], [-1 + (2 * (k + 0.7)) / n, v]);
      }
      return pts;
    }
    case "ridge":
      return [[-1, -1], [-0.3, 0.2], [0, 1], [0.3, 0.2], [1, -1]];
    case "valley":
      return [[-1, 1], [-0.3, -0.2], [0, -1], [0.3, -0.2], [1, 1]];
    case "canyon":
      return [[-1, 0.3], [-0.12, 0.3], [-0.04, -1], [0.04, -1], [0.12, 0.3], [1, 0.3]];
    case "exp":
      return [[-1, -1], [0, -0.75], [0.5, -0.2], [1, 1]];
    case "plateau":
      return [[-1, -1], [-0.2, -0.6], [0.1, 0.8], [1, 1]];
    default:
      return [[-1, -1], [-0.6, -0.9], [0, 0], [0.6, 0.9], [1, 1]];
  }
}
export function curveAt(shape: string, steps: number, v: number) {
  const pts = curvePoints(shape, steps);
  if (v <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (v <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const k = (v - x0) / (x1 - x0 || 1);
      return y0 + (y1 - y0) * (shape === "steps" || shape === "linear" ? k : smooth(k));
    }
  }
  return pts[pts.length - 1][1];
}

/** Bereitet eine Formel zur schnellen Auswertung vor: Werte, die nicht von Y abhängen, werden pro Säule gemerkt */
export function makeEvaluator(graph: TGraph, seed: number, minY: number, maxY: number) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const inputOf = (id: string, port: string) => {
    const l = graph.links.find((x) => x.to === id && x.port === port);
    return l ? byId.get(l.from) : undefined;
  };
  const yDep = new Map<string, boolean>();
  const dep = (n: TNode, depth = 0): boolean => {
    if (yDep.has(n.id)) return yDep.get(n.id)!;
    let r = n.kind === "ygrad" || n.kind === "random" || (n.kind === "noise" && n.props.dim === "3d");
    if (!r && depth < 64) for (const l of graph.links) if (l.to === n.id) { const f = byId.get(l.from); if (f && dep(f, depth + 1)) r = true; }
    yDep.set(n.id, r);
    return r;
  };
  graph.nodes.forEach((n) => dep(n));
  const out = graph.nodes.find((n) => n.kind === "output");
  let colX = NaN, colZ = NaN;
  const cache = new Map<string, number>();
  const num = (n: TNode, k: string, d: number) => {
    const v = n.props[k];
    const f = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
    return Number.isFinite(f) ? f : d;
  };
  const ev = (n: TNode | undefined, x: number, y: number, z: number, depth: number): number => {
    if (!n || depth > 64) return 0;
    const flat = !yDep.get(n.id);
    if (flat && cache.has(n.id)) return cache.get(n.id)!;
    const inp = (port: string, d: number) => {
      const f = inputOf(n.id, port);
      return f ? ev(f, x, y, z, depth + 1) : d;
    };
    let v = 0;
    switch (n.kind) {
      case "output":
        v = inp("in", -1);
        break;
      case "const":
        v = num(n, "value", 0);
        break;
      case "noise": {
        const size = Math.max(1, num(n, "size", 200));
        const s = seed + strSeed(n.id);
        v = num(n, "strength", 1) * fbm(x / size, n.props.dim === "3d" ? y / (size * 0.6) : 0, z / size, s, Math.max(1, Math.min(6, Math.round(num(n, "octaves", 4)))));
        break;
      }
      case "random":
        v = num(n, "strength", 0.1) * (hash(Math.floor(x / num(n, "size", 2)), Math.floor(y / num(n, "size", 2)), Math.floor(z / num(n, "size", 2)), seed) * 2 - 1);
        break;
      case "curve": {
        const lo = num(n, "low", -1), hi = num(n, "high", 1);
        v = lo + ((curveAt(String(n.props.shape ?? "s"), num(n, "points", 5), inp("in", 0)) + 1) / 2) * (hi - lo);
        break;
      }
      case "math": {
        const a = inp("a", num(n, "a", 0)), b = inp("b", num(n, "b", 1));
        const op = String(n.props.op ?? "add");
        v = op === "sub" ? a - b : op === "mul" ? a * b : op === "min" ? Math.min(a, b) : op === "max" ? Math.max(a, b) : op === "abs" ? Math.abs(a) : op === "square" ? a * a : op === "neg" ? -a : a + b;
        break;
      }
      case "ygrad": {
        const k = Math.max(0, Math.min(1, (y - minY) / (maxY - minY || 1)));
        v = num(n, "bottom", 1) + (num(n, "top", -1) - num(n, "bottom", 1)) * k;
        break;
      }
      case "distance":
        v = Math.hypot(x - num(n, "x", 0), z - num(n, "z", 0)) / Math.max(1, num(n, "scale", 1000));
        break;
      case "biome": {
        const sizes: Record<string, number> = { continents: 1800, erosion: 1100, ridges: 600, temperature: 2000, humidity: 2000 };
        const k = String(n.props.value ?? "continents");
        v = fbm(x / (sizes[k] ?? 1500), 0, z / (sizes[k] ?? 1500), seed + strSeed(k), 4);
        break;
      }
      case "clamp":
        v = Math.max(Math.min(num(n, "min", -1), num(n, "max", 1)), Math.min(Math.max(num(n, "min", -1), num(n, "max", 1)), inp("in", 0)));
        break;
      case "mix": {
        const a = inp("a", num(n, "a", 0)), b = inp("b", num(n, "b", 0)), tt = inp("t", num(n, "t", 0.5));
        v = a + tt * (b - a);
        break;
      }
    }
    if (flat) cache.set(n.id, v);
    return v;
  };
  return {
    /** Dichte an (x, y, z): > 0 ist fester Boden */
    density(x: number, y: number, z: number) {
      if (x !== colX || z !== colZ) {
        cache.clear();
        colX = x;
        colZ = z;
      }
      return ev(out, x, y, z, 0);
    },
  };
}
