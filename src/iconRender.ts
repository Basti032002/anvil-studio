// Zeichnet Item-/Block-Symbole wie im Minecraft-Inventar:
// Blockmodelle werden isometrisch (von Nordwest-oben) mit allen Quadern
// gerendert – also auch Zäune, Mauern, Treppen, Stufen usw.

export type McFace = { tex: string; uv?: [number, number, number, number]; rot?: number; tint?: boolean };
export type FaceName = "up" | "north" | "south" | "east" | "west";
export type McElement = { from: [number, number, number]; to: [number, number, number]; faces: Partial<Record<FaceName, McFace>> };
export type McIconDef = {
  kind: "flat" | "cube" | "model" | "none";
  tex?: string;
  top?: string;
  side?: string;
  front?: string;
  elements?: McElement[];
  /** display.gui.rotation, falls abweichend von [30, 225, 0] */
  gui?: [number, number, number];
};

type V3 = [number, number, number];
type P2 = [number, number];

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Kamera wie im Inventar: display.gui.rotation [neigung, drehung, 0], Standard [30, 225, 0]. */
type View = { right: V3; up: V3; fwd: V3 };
function viewFor(gui?: [number, number, number]): View {
  const pitch = ((gui?.[0] ?? 30) * Math.PI) / 180;
  // Bei 225° schaut die Kamera nach Südosten (Nord- und Westseite sichtbar)
  const yaw = (((gui?.[1] ?? 225) - 225) * Math.PI) / 180 + Math.PI / 4;
  const c = Math.cos(pitch), s = Math.sin(pitch);
  const hx = Math.cos(yaw), hz = Math.sin(yaw); // horizontale Blickrichtung
  return {
    fwd: [c * hx, -s, c * hz],
    right: [-hz, 0, hx],
    up: [s * hx, c, s * hz],
  };
}
const DEFAULT_VIEW = viewFor();
/** Höhe eines vollen Würfels in Modell-Einheiten nach der Projektion (Standardansicht) */
const CUBE_H = 16 * (Math.sin(Math.PI / 6) * Math.SQRT2 + Math.cos(Math.PI / 6));

const NORMAL: Record<FaceName, V3> = { up: [0, 1, 0], north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0] };
const FACES: FaceName[] = ["up", "north", "south", "east", "west"];

// ---- Bilder & eingefärbte Texturen ---------------------------------------

const images = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(url: string): Promise<HTMLImageElement | null> {
  let p = images.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    images.set(url, p);
  }
  return p;
}

function tintFor(tex: string): [number, number, number] {
  if (tex.includes("birch_leaves")) return [0x80, 0xa7, 0x55];
  if (tex.includes("spruce_leaves")) return [0x61, 0x99, 0x61];
  if (tex.includes("leaves") || tex.includes("vine")) return [0x48, 0xb5, 0x18];
  if (tex.includes("lily_pad")) return [0x20, 0x80, 0x30];
  return [0x91, 0xbd, 0x59]; // Gras
}

const shaded = new Map<string, HTMLCanvasElement>();
/** Oberstes Quadrat der Textur (Animationen sind Streifen), abgedunkelt und ggf. eingefärbt. */
function shadedTexture(img: HTMLImageElement, url: string, tex: string, shade: number, tint: boolean): HTMLCanvasElement {
  const key = `${url.length}:${url.slice(-48)}|${shade}|${tint ? tex : ""}`;
  const hit = shaded.get(key);
  if (hit) return hit;
  const w = img.width || 16;
  const h = Math.min(img.height || 16, w);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0, w, h, 0, 0, w, h);
  if (shade !== 1 || tint) {
    const data = g.getImageData(0, 0, w, h);
    const [tr, tg, tb] = tint ? tintFor(tex) : [255, 255, 255];
    for (let i = 0; i < data.data.length; i += 4) {
      data.data[i] = (data.data[i] * tr * shade) / 255;
      data.data[i + 1] = (data.data[i + 1] * tg * shade) / 255;
      data.data[i + 2] = (data.data[i + 2] * tb * shade) / 255;
    }
    g.putImageData(data, 0, 0);
  }
  shaded.set(key, c);
  return c;
}

// ---- Geometrie -------------------------------------------------------------

function corners(face: FaceName, f: V3, t: V3): V3[] {
  const [x1, y1, z1] = f;
  const [x2, y2, z2] = t;
  switch (face) {
    case "up":
      return [[x1, y2, z1], [x2, y2, z1], [x2, y2, z2], [x1, y2, z2]];
    case "north":
      return [[x2, y2, z1], [x1, y2, z1], [x1, y1, z1], [x2, y1, z1]];
    case "west":
      return [[x1, y2, z1], [x1, y2, z2], [x1, y1, z2], [x1, y1, z1]];
    case "south":
      return [[x1, y2, z2], [x2, y2, z2], [x2, y1, z2], [x1, y1, z2]];
    case "east":
      return [[x2, y2, z2], [x2, y2, z1], [x2, y1, z1], [x2, y1, z2]];
  }
}

function defaultUv(face: FaceName, f: V3, t: V3): [number, number, number, number] {
  switch (face) {
    case "up":
      return [f[0], f[2], t[0], t[2]];
    case "north":
      return [16 - t[0], 16 - t[1], 16 - f[0], 16 - f[1]];
    case "west":
      return [f[2], 16 - t[1], t[2], 16 - f[1]];
    case "south":
      return [f[0], 16 - t[1], t[0], 16 - f[1]];
    case "east":
      return [16 - t[2], 16 - t[1], 16 - f[2], 16 - f[1]];
  }
}

function project(p: V3, v: View, scale: number, cx: number, cy: number): P2 {
  const q: V3 = [p[0] - 8, p[1] - 8, p[2] - 8];
  return [cx + dot(q, v.right) * scale, cy - dot(q, v.up) * scale];
}

function elementsOf(icon: McIconDef): McElement[] {
  if (icon.kind === "model" && icon.elements?.length) return icon.elements;
  if (icon.kind === "cube" && icon.top && icon.side) {
    return [{ from: [0, 0, 0], to: [16, 16, 16], faces: { up: { tex: icon.top }, north: { tex: icon.front ?? icon.side }, west: { tex: icon.side } } }];
  }
  return [];
}

// ---- Rendern ---------------------------------------------------------------

const rendered = new Map<string, Promise<string | null>>();

function cacheKey(icon: McIconDef, textures: Record<string, string>): string {
  const names = new Set<string>();
  if (icon.tex) names.add(icon.tex);
  for (const e of elementsOf(icon)) for (const f of Object.values(e.faces)) if (f) names.add(f.tex);
  const sig = [...names].map((n) => `${n}:${textures[n]?.length ?? 0}:${textures[n]?.slice(-24) ?? ""}`).join(",");
  return `${icon.kind}|${JSON.stringify(icon.elements ?? [icon.top, icon.side, icon.front])}|${icon.gui ?? ""}|${sig}`;
}

/** Liefert eine PNG-Data-URL des Symbols (oder null, wenn nichts zu zeichnen ist). */
export function renderIcon(icon: McIconDef | undefined, textures: Record<string, string> | undefined, px = 96): Promise<string | null> {
  if (!icon || !textures || icon.kind === "none") return Promise.resolve(null);
  const key = `${px}|${cacheKey(icon, textures)}`;
  let p = rendered.get(key);
  if (!p) {
    p = draw(icon, textures, px).catch(() => null);
    rendered.set(key, p);
  }
  return p;
}

async function draw(icon: McIconDef, textures: Record<string, string>, px: number): Promise<string | null> {
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const g = canvas.getContext("2d")!;
  g.imageSmoothingEnabled = false;

  if (icon.kind === "flat") {
    const url = icon.tex && textures[icon.tex];
    const img = url ? await loadImage(url) : null;
    if (!img || !url) return null;
    const tex = shadedTexture(img, url, icon.tex!, 1, false);
    g.drawImage(tex, 0, 0, px, px);
    return canvas.toDataURL();
  }

  const elements = elementsOf(icon);
  if (!elements.length) return null;

  const view = icon.gui ? viewFor(icon.gui) : DEFAULT_VIEW;
  type Job = { depth: number; face: FaceName; el: McElement; spec: McFace; img: HTMLImageElement; url: string; shade: number };
  const jobs: Job[] = [];
  for (const el of elements) {
    for (const face of FACES) {
      const n = NORMAL[face];
      if (dot(n, view.fwd) > -1e-4) continue; // Rückseite
      const spec = el.faces[face];
      const url = spec && textures[spec.tex];
      if (!spec || !url) continue;
      const img = await loadImage(url);
      if (!img) continue;
      const cs = corners(face, el.from, el.to);
      const center: V3 = [0, 1, 2].map((i) => cs.reduce((s, c) => s + c[i], 0) / 4) as V3;
      // weiter hinten liegende Flächen zuerst zeichnen
      const shade = face === "up" ? 1 : dot(n, view.right) < 0 ? 0.8 : 0.6;
      jobs.push({ depth: dot([center[0] - 8, center[1] - 8, center[2] - 8], view.fwd), face, el, spec, img, url, shade });
    }
  }
  if (!jobs.length) return null;
  jobs.sort((a, b) => b.depth - a.depth);

  const scale = (px * 0.94) / CUBE_H;
  const cx = px / 2;
  const cy = px / 2;

  for (const j of jobs) {
    const tex = shadedTexture(j.img, j.url, j.spec.tex, j.shade, !!j.spec.tint);
    const k = tex.width / 16;
    const [u1, v1, u2, v2] = j.spec.uv ?? defaultUv(j.face, j.el.from, j.el.to);
    const uvPts: P2[] = [[u1, v1], [u2, v1], [u2, v2], [u1, v2]];
    const rot = Math.round(((j.spec.rot ?? 0) % 360) / 90);
    const cs = corners(j.face, j.el.from, j.el.to).map((c) => project(c, view, scale, cx, cy));
    const tp = (i: number): P2 => {
      const p = uvPts[(i - rot + 8) % 4];
      return [p[0] * k, p[1] * k];
    };
    const T0 = tp(0), T1 = tp(1), T3 = tp(3);
    const du: P2 = [T1[0] - T0[0], T1[1] - T0[1]];
    const dv: P2 = [T3[0] - T0[0], T3[1] - T0[1]];
    const d1: P2 = [cs[1][0] - cs[0][0], cs[1][1] - cs[0][1]];
    const d3: P2 = [cs[3][0] - cs[0][0], cs[3][1] - cs[0][1]];
    const det = du[0] * dv[1] - dv[0] * du[1];
    if (Math.abs(det) < 1e-6) continue;
    const a = (d1[0] * dv[1] - d3[0] * du[1]) / det;
    const c = (-d1[0] * dv[0] + d3[0] * du[0]) / det;
    const b = (d1[1] * dv[1] - d3[1] * du[1]) / det;
    const d = (-d1[1] * dv[0] + d3[1] * du[0]) / det;
    const e = cs[0][0] - (a * T0[0] + c * T0[1]);
    const f = cs[0][1] - (b * T0[0] + d * T0[1]);

    // Fläche minimal vergrößern, damit keine Haarlinien zwischen Flächen entstehen
    const mx = cs.reduce((s, p) => s + p[0], 0) / 4;
    const my = cs.reduce((s, p) => s + p[1], 0) / 4;
    g.save();
    g.beginPath();
    cs.forEach(([x, y], i) => {
      const len = Math.hypot(x - mx, y - my) || 1;
      const nx = x + ((x - mx) / len) * 0.35;
      const ny = y + ((y - my) / len) * 0.35;
      if (i === 0) g.moveTo(nx, ny);
      else g.lineTo(nx, ny);
    });
    g.closePath();
    g.clip();
    g.setTransform(a, b, c, d, e, f);
    g.drawImage(tex, 0, 0);
    g.restore();
  }
  return canvas.toDataURL();
}
