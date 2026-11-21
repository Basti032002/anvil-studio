import { useEffect, useState, type CSSProperties } from "react";
import { LibTex, texLibApi } from "../../api";

// ---- Bibliothek (gemeinsamer Zwischenspeicher je Projekt) ----

const cache = new Map<string, LibTex[]>();
const EVENT = "anvil:libtex";

export function refreshLib(projectId: string) {
  return texLibApi
    .list(projectId)
    .then((l) => {
      cache.set(projectId, l);
      window.dispatchEvent(new CustomEvent(EVENT, { detail: projectId }));
      return l;
    })
    .catch(() => cache.get(projectId) ?? []);
}

export function useLib(projectId: string): LibTex[] {
  const [list, setList] = useState<LibTex[]>(() => cache.get(projectId) ?? []);
  useEffect(() => {
    const on = (e: Event) => (e as CustomEvent<string>).detail === projectId && setList(cache.get(projectId) ?? []);
    window.addEventListener(EVENT, on);
    if (!cache.has(projectId)) refreshLib(projectId);
    else setList(cache.get(projectId)!);
    return () => window.removeEventListener(EVENT, on);
  }, [projectId]);
  return list;
}

/** Eintrag sofort im Zwischenspeicher ersetzen (ohne neu zu laden) */
export function putLib(projectId: string, t: LibTex) {
  const list = (cache.get(projectId) ?? []).filter((x) => x.id !== t.id);
  list.push(t);
  list.sort((a, b) => a.id.localeCompare(b.id));
  cache.set(projectId, list);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: projectId }));
}

export const pngUrl = (b64: string) => (b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`);

// ---- Dokument mit Ebenen und Frames ----

export interface LayerMeta {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
}

export interface TexDoc {
  size: number;
  frametime: number;
  interpolate: boolean;
  layers: LayerMeta[];
  /** frames[f][l] = RGBA-Pixel */
  frames: Uint8ClampedArray[][];
}

let lseq = 0;
export const layerId = () => `l${Date.now().toString(36)}${(lseq++).toString(36)}`;

export function blankDoc(size: number): TexDoc {
  return { size, frametime: 4, interpolate: false, layers: [{ id: layerId(), name: "Ebene 1", visible: true, opacity: 1 }], frames: [[new Uint8ClampedArray(size * size * 4)]] };
}

function toB64(a: Uint8ClampedArray): string {
  let s = "";
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(s: string, len: number): Uint8ClampedArray {
  const bin = atob(s);
  const a = new Uint8ClampedArray(len);
  for (let i = 0; i < Math.min(len, bin.length); i++) a[i] = bin.charCodeAt(i);
  return a;
}

export function serialize(d: TexDoc): string {
  return JSON.stringify({ v: 1, size: d.size, frametime: d.frametime, interpolate: d.interpolate, layers: d.layers, frames: d.frames.map((f) => f.map(toB64)) });
}

export function deserialize(json: string): TexDoc | null {
  try {
    const o = JSON.parse(json);
    const size = Math.max(1, Math.min(512, Number(o.size) || 16));
    const layers: LayerMeta[] = Array.isArray(o.layers) && o.layers.length ? o.layers : [{ id: layerId(), name: "Ebene 1", visible: true, opacity: 1 }];
    const frames: Uint8ClampedArray[][] = (Array.isArray(o.frames) && o.frames.length ? o.frames : [[]]).map((f: string[]) => layers.map((_, i) => (f?.[i] ? fromB64(f[i], size * size * 4) : new Uint8ClampedArray(size * size * 4))));
    return { size, frametime: Number(o.frametime) || 4, interpolate: !!o.interpolate, layers, frames };
  } catch {
    return null;
  }
}

/** Ebenen eines Frames zusammenrechnen (unten → oben) */
export function composite(d: TexDoc, f: number, skipHidden = true): Uint8ClampedArray<ArrayBuffer> {
  const n = d.size * d.size;
  const out = new Uint8ClampedArray(n * 4);
  d.layers.forEach((l, li) => {
    if (skipHidden && !l.visible) return;
    const src = d.frames[f]?.[li];
    if (!src) return;
    for (let i = 0; i < n; i++) {
      const sa = (src[i * 4 + 3] / 255) * l.opacity;
      if (sa <= 0) continue;
      const da = out[i * 4 + 3] / 255;
      const oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) out[i * 4 + c] = (src[i * 4 + c] * sa + out[i * 4 + c] * da * (1 - sa)) / oa;
      out[i * 4 + 3] = oa * 255;
    }
  });
  return out;
}

/** Fertiges Bild: alle Frames untereinander (wie Minecraft es für Animationen erwartet) */
export function sheet(d: TexDoc): string {
  const c = document.createElement("canvas");
  c.width = d.size;
  c.height = d.size * d.frames.length;
  const ctx = c.getContext("2d")!;
  d.frames.forEach((_, f) => ctx.putImageData(new ImageData(composite(d, f, true), d.size, d.size), 0, f * d.size));
  return c.toDataURL("image/png");
}

export function frameUrl(d: TexDoc, f: number): string {
  const c = document.createElement("canvas");
  c.width = d.size;
  c.height = d.size;
  c.getContext("2d")!.putImageData(new ImageData(composite(d, f), d.size, d.size), 0, 0);
  return c.toDataURL("image/png");
}

/** Bild laden und auf size×size (bzw. Frames untereinander) bringen */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Bild konnte nicht geladen werden"));
    img.src = src;
  });
}

export function imageToFrames(img: HTMLImageElement, size: number, asFrames: boolean): Uint8ClampedArray[] {
  const frames = asFrames && img.height > img.width && img.height % img.width === 0 ? img.height / img.width : 1;
  const fh = frames > 1 ? img.width : img.height;
  const out: Uint8ClampedArray[] = [];
  for (let f = 0; f < Math.min(frames, 64); f++) {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, f * fh, img.width, fh, 0, 0, size, size);
    out.push(ctx.getImageData(0, 0, size, size).data);
  }
  return out;
}

/** Erstes Frame einer Bibliotheks-Textur als CSS-Hintergrund (Sheet ist ggf. höher) */
export function thumbStyle(t: LibTex | undefined, px: number): CSSProperties {
  if (!t) return {};
  return { backgroundImage: `url(${pngUrl(t.png)})`, backgroundSize: `${px}px ${px * t.frames}px`, backgroundPosition: "0 0", imageRendering: "pixelated" };
}
