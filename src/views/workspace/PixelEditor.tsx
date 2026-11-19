import { useEffect, useRef, useState } from "react";
import { contentApi } from "../../api";
import { BucketIcon, EraserIcon, GridToggleIcon, MirrorIcon, PencilIcon, PipetteIcon, RedoIcon, UndoIcon } from "../../icons";
import { toast } from "../../state";

const SIZE = 16;
const PALETTE = [
  "#000000", "#3b3b3b", "#7a7a7a", "#c6c6c6", "#ffffff", "#5b3a1e", "#8b5a2b", "#c58b4e",
  "#e64b3c", "#f29e38", "#f6d743", "#6fcf5a", "#2f9e44", "#38b6c8", "#3d6fd8", "#9b5de5",
];

type Tool = "pencil" | "eraser" | "fill" | "picker";
type Props = { projectId: string; kind: "block" | "item"; id: string; onSaved?: (dataUrl: string) => void };

function hexToRgba(hex: string): [number, number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}
function rgbaToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export default function PixelEditor({ projectId, kind, id, onSaved }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pixels = useRef<Uint8ClampedArray>(new Uint8ClampedArray(SIZE * SIZE * 4));
  const undo = useRef<Uint8ClampedArray[]>([]);
  const redo = useRef<Uint8ClampedArray[]>([]);
  const drawing = useRef(false);
  const saveTimer = useRef<number>();
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#6fcf5a");
  const [mirror, setMirror] = useState(false);
  const [grid, setGrid] = useState(true);
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [, force] = useState(0);

  function render() {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(new ImageData(Uint8ClampedArray.from(pixels.current), SIZE, SIZE), 0, 0);
    setPreview(canvas.current!.toDataURL("image/png"));
  }

  // Textur laden
  useEffect(() => {
    let cancelled = false;
    undo.current = [];
    redo.current = [];
    setStatus("idle");
    contentApi.textureGet(projectId, kind, id).then((b64) => {
      if (cancelled) return;
      pixels.current = new Uint8ClampedArray(SIZE * SIZE * 4);
      if (!b64) {
        render();
        return;
      }
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        const off = document.createElement("canvas");
        off.width = SIZE;
        off.height = SIZE;
        const c = off.getContext("2d")!;
        c.imageSmoothingEnabled = false;
        c.drawImage(img, 0, 0, SIZE, SIZE);
        pixels.current = c.getImageData(0, 0, SIZE, SIZE).data;
        render();
        force((x) => x + 1);
      };
      img.src = `data:image/png;base64,${b64}`;
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, kind, id]);

  function scheduleSave() {
    setStatus("saving");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        const url = canvas.current!.toDataURL("image/png");
        await contentApi.textureSave(projectId, kind, id, url);
        setStatus("saved");
        onSaved?.(url);
      } catch (e) {
        toast(`Textur nicht gespeichert: ${e}`, "error");
        setStatus("idle");
      }
    }, 500);
  }

  function snapshot() {
    undo.current.push(new Uint8ClampedArray(pixels.current));
    if (undo.current.length > 60) undo.current.shift();
    redo.current = [];
  }

  function setPx(x: number, y: number, rgba: [number, number, number, number]) {
    const targets = mirror ? [x, SIZE - 1 - x] : [x];
    for (const tx of targets) {
      const i = (y * SIZE + tx) * 4;
      pixels.current.set(rgba, i);
    }
  }

  function fill(x: number, y: number, rgba: [number, number, number, number]) {
    const p = pixels.current;
    const start = (y * SIZE + x) * 4;
    const target = [p[start], p[start + 1], p[start + 2], p[start + 3]];
    if (target.every((v, k) => v === rgba[k])) return;
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      if (cx < 0 || cy < 0 || cx >= SIZE || cy >= SIZE) continue;
      const i = (cy * SIZE + cx) * 4;
      if (p[i] !== target[0] || p[i + 1] !== target[1] || p[i + 2] !== target[2] || p[i + 3] !== target[3]) continue;
      p.set(rgba, i);
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }

  function cell(e: React.PointerEvent) {
    const r = canvas.current!.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * SIZE);
    const y = Math.floor(((e.clientY - r.top) / r.height) * SIZE);
    return x >= 0 && y >= 0 && x < SIZE && y < SIZE ? [x, y] : null;
  }

  function apply(e: React.PointerEvent, first: boolean) {
    const c = cell(e);
    if (!c) return;
    const [x, y] = c;
    if (tool === "picker") {
      const i = (y * SIZE + x) * 4;
      if (pixels.current[i + 3] > 0) setColor(rgbaToHex(pixels.current[i], pixels.current[i + 1], pixels.current[i + 2]));
      setTool("pencil");
      return;
    }
    if (first) snapshot();
    if (tool === "fill") fill(x, y, hexToRgba(color));
    else setPx(x, y, tool === "eraser" ? [0, 0, 0, 0] : hexToRgba(color));
    render();
  }

  function history(from: React.MutableRefObject<Uint8ClampedArray[]>, to: React.MutableRefObject<Uint8ClampedArray[]>) {
    const last = from.current.pop();
    if (!last) return;
    to.current.push(new Uint8ClampedArray(pixels.current));
    pixels.current = last;
    render();
    scheduleSave();
  }

  // Tastenkürzel im Editor
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? history(redo, undo) : history(undo, redo);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        history(redo, undo);
      } else if (!e.ctrlKey && !e.metaKey) {
        const map: Record<string, Tool> = { b: "pencil", e: "eraser", g: "fill", i: "picker" };
        if (map[e.key]) setTool(map[e.key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function importFile(file: File) {
    const img = new Image();
    img.onload = () => {
      const off = document.createElement("canvas");
      off.width = SIZE;
      off.height = SIZE;
      const c = off.getContext("2d")!;
      c.imageSmoothingEnabled = false;
      c.drawImage(img, 0, 0, SIZE, SIZE);
      snapshot();
      pixels.current = c.getImageData(0, 0, SIZE, SIZE).data;
      render();
      scheduleSave();
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  }

  const tools: { t: Tool; label: string; key: string; icon: React.ReactNode }[] = [
    { t: "pencil", label: "Stift", key: "B", icon: <PencilIcon size={16} /> },
    { t: "eraser", label: "Radierer", key: "E", icon: <EraserIcon size={16} /> },
    { t: "fill", label: "Füllen", key: "G", icon: <BucketIcon size={16} /> },
    { t: "picker", label: "Pipette", key: "I", icon: <PipetteIcon size={16} /> },
  ];

  return (
    <div className="pixel">
      <div className="pixel-main">
        <div className="pixel-tools" role="toolbar" aria-label="Werkzeuge">
          {tools.map((x) => (
            <button key={x.t} className={tool === x.t ? "ptool active" : "ptool"} onClick={() => setTool(x.t)} aria-label={x.label} data-tip={`${x.label} · ${x.key}`}>
              {x.icon}
            </button>
          ))}
          <span className="ptool-sep" />
          <button className={mirror ? "ptool active" : "ptool"} onClick={() => setMirror(!mirror)} aria-label="Spiegeln" data-tip="Spiegeln">
            <MirrorIcon size={16} />
          </button>
          <button className={grid ? "ptool active" : "ptool"} onClick={() => setGrid(!grid)} aria-label="Raster" data-tip="Raster">
            <GridToggleIcon size={16} />
          </button>
          <span className="ptool-sep" />
          <button className="ptool" onClick={() => history(undo, redo)} aria-label="Rückgängig" data-tip="Rückgängig · Strg Z">
            <UndoIcon size={16} />
          </button>
          <button className="ptool" onClick={() => history(redo, undo)} aria-label="Wiederholen" data-tip="Wiederholen · Strg Y">
            <RedoIcon size={16} />
          </button>
        </div>
        <div className={grid ? "pixel-canvas-wrap show-grid" : "pixel-canvas-wrap"}>
          <canvas
            ref={canvas}
            width={SIZE}
            height={SIZE}
            className={`pixel-canvas tool-${tool}`}
            onPointerDown={(e) => {
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              drawing.current = true;
              apply(e, true);
            }}
            onPointerMove={(e) => drawing.current && (tool === "pencil" || tool === "eraser") && apply(e, false)}
            onPointerUp={() => {
              if (drawing.current && tool !== "picker") scheduleSave();
              drawing.current = false;
            }}
          />
        </div>
        <div className="pixel-side">
          <div className="color-current">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Farbe wählen" />
            <span className="mono small">{color}</span>
          </div>
          <div className="palette">
            {PALETTE.map((c) => (
              <button
                key={c}
                className={c === color ? "swatch active" : "swatch"}
                style={{ background: c }}
                aria-label={`Farbe ${c}`}
                onClick={() => {
                  setColor(c);
                  if (tool === "eraser" || tool === "picker") setTool("pencil");
                }}
              />
            ))}
          </div>
          <label className="btn small full">
            PNG importieren
            <input type="file" accept="image/png" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          </label>
          <button
            className="btn small full ghost"
            onClick={() => {
              snapshot();
              pixels.current = new Uint8ClampedArray(SIZE * SIZE * 4);
              render();
              scheduleSave();
            }}
          >
            Leeren
          </button>
          <div className={`save-state ${status}`}>{status === "saving" ? "Speichert …" : status === "saved" ? "✓ Gespeichert" : " "}</div>
        </div>
      </div>
      <div className="pixel-preview">
        {kind === "block" ? (
          <div className="cube-stage" aria-label="Vorschau als Block">
            <div className="cube">
              <span className="face top" style={{ backgroundImage: `url(${preview})` }} />
              <span className="face front" style={{ backgroundImage: `url(${preview})` }} />
              <span className="face right" style={{ backgroundImage: `url(${preview})` }} />
              <span className="face back" style={{ backgroundImage: `url(${preview})` }} />
              <span className="face left" style={{ backgroundImage: `url(${preview})` }} />
              <span className="face bottom" style={{ backgroundImage: `url(${preview})` }} />
            </div>
          </div>
        ) : (
          <div className="item-stage" aria-label="Vorschau als Item">
            <div className="slot">
              <img src={preview} alt="" />
            </div>
            <img className="item-big" src={preview} alt="" />
          </div>
        )}
      </div>
    </div>
  );
}
