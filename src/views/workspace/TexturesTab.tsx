import { useEffect, useMemo, useRef, useState } from "react";
import { notifyUndo, useUndoTarget } from "../../undo";
import { t } from "../../i18n";
import { Content, contentApi, Project, texLibApi, pickSaveFile } from "../../api";
import { confirmDialog } from "../../components/Overlay";
import {
  BucketIcon,
  CircleIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  EraserIcon,
  EyeIcon,
  EyeOffIcon,
  FramesIcon,
  GradientIcon,
  GridToggleIcon,
  ImageIcon,
  ImportIcon,
  LayersIcon,
  LineIcon,
  MirrorIcon,
  MoveIcon,
  NoiseIcon,
  PauseIcon,
  PencilIcon,
  PipetteIcon,
  PlayIcon,
  PlusIcon,
  RectIcon,
  RedoIcon,
  SaveIcon,
  SearchIcon,
  SelectIcon,
  TrashIcon,
  UndoIcon,
} from "../../icons";
import { toast } from "../../state";
import { getDraft, setDraft } from "./draft";
import { blankDoc, composite, deserialize, frameUrl, imageToFrames, layerId, LayerMeta, loadImage, pngUrl, putLib, refreshLib, serialize, sheet, TexDoc, thumbStyle, useLib } from "./texlib";
import { CubePreview } from "./TexturePickers";

type Tool = "pencil" | "eraser" | "fill" | "picker" | "line" | "rect" | "ellipse" | "gradient" | "noise" | "select" | "move";
type Rect = { x: number; y: number; w: number; h: number };

const PALETTE = [
  "#000000", "#1d1d21", "#3b3b3b", "#5a5a5a", "#7a7a7a", "#9d9d9d", "#c6c6c6", "#ffffff",
  "#3a2413", "#5b3a1e", "#8b5a2b", "#c58b4e", "#e0b47c", "#6b3f87", "#9b5de5", "#d7a6ff",
  "#7a1c1c", "#c0392b", "#e64b3c", "#f29e38", "#f6d743", "#fff3a0", "#1f5e2a", "#2f9e44",
  "#6fcf5a", "#b5f28c", "#145a6e", "#38b6c8", "#9ee8f0", "#1d3b8b", "#3d6fd8", "#9fb9ff",
];

const hex2rgba = (hex: string, a = 255): [number, number, number, number] => {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
};
const rgba2hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
const cloneDoc = (d: TexDoc): TexDoc => ({ ...d, layers: d.layers.map((l) => ({ ...l })), frames: d.frames.map((f) => f.map((p) => new Uint8ClampedArray(p))) });
const cleanId = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").slice(0, 64);

export default function TexturesTab({ project }: { project: Project }) {
  const lib = useLib(project.id);
  const [active, setActive] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [content, setContent] = useState<Content | null>(null);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    refreshLib(project.id);
    const d = getDraft(project.id);
    if (d) {
      setContent(d.content);
      setSaved(d.saved);
      return;
    }
    contentApi
      .load(project.id)
      .then((c) => {
        setContent(c);
        setSaved(JSON.stringify(c));
      })
      .catch(() => {});
  }, [project.id]);
  useEffect(() => {
    if (content && saved) setDraft(project.id, content, saved);
  }, [content, saved, project.id]);

  const dirty = content ? JSON.stringify(content) !== saved : false;
  async function saveContent() {
    if (!content) return;
    try {
      const r = await contentApi.save(project.id, content);
      setContent(r.content);
      setSaved(JSON.stringify(r.content));
      toast(t("Gespeichert – Blöcke und Items nutzen jetzt die Texturen."), "success");
    } catch (e) {
      toast(String(e), "error");
    }
  }

  const usage = (id: string) => {
    if (!content) return [];
    const out: string[] = [];
    for (const b of content.blocks) {
      const f = b.faces;
      if (f && f.mode && [f.all, f.top, f.bottom, f.side, f.north, f.south, f.east, f.west].includes(id)) out.push(b.nameEn || b.nameDe || b.id);
    }
    for (const i of content.items) if (i.texture === id) out.push(i.nameEn || i.nameDe || i.id);
    return out;
  };

  async function remove(id: string) {
    const u = usage(id);
    if (!(await confirmDialog(t("„{name}“ löschen?", { name: id }), u.length ? t("Wird noch benutzt von: {list}. Dort wird wieder die eigene Textur genommen.", { list: u.join(", ") }) : t("Die Textur wird aus der Bibliothek gelöscht."), t("Löschen"), t("Abbrechen"), true))) return;
    await texLibApi.remove(project.id, id).catch((e) => toast(String(e), "error"));
    await refreshLib(project.id);
    if (active === id) setActive(null);
  }

  async function duplicate(id: string) {
    const doc = await texLibApi.load(project.id, id);
    const src = lib.find((x) => x.id === id);
    if (!src) return;
    let nid = `${id}_kopie`;
    for (let n = 2; lib.some((x) => x.id === nid); n++) nid = `${id}_kopie_${n}`;
    await texLibApi.save(project.id, nid, doc ?? serialize(blankDoc(src.size)), src.png);
    await refreshLib(project.id);
    setActive(nid);
  }

  const query = q.trim().toLowerCase();
  const list = lib.filter((x) => !query || x.id.includes(query));

  return (
    <div className="tx">
      <aside className="tx-lib">
        <div className="tags-side-head">
          <button className="btn primary small grow" onClick={() => setCreating(true)}>
            <PlusIcon size={14} /> {t("Neue Textur")}
          </button>
        </div>
        <div className="search">
          <SearchIcon size={13} />
          <input placeholder={t("Texturen durchsuchen …")} aria-label={t("Texturen durchsuchen")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="tx-lib-grid">
          {list.map((x) => (
            <button key={x.id} className={x.id === active ? "tx-lib-item active" : "tx-lib-item"} onClick={() => setActive(x.id)} title={x.id}>
              <span className="tx-thumb" style={thumbStyle(x, 44)} />
              <span className="tx-lib-name mono">{x.id}</span>
              <span className="muted tiny">
                {x.size}×{x.size}
                {x.frames > 1 ? ` · ${x.frames} ${t("Frames")}` : ""}
              </span>
            </button>
          ))}
          {lib.length === 0 && <p className="muted small pad">{t("Noch keine Texturen. Lege eine neue an oder importiere ein PNG.")}</p>}
        </div>
        {dirty && (
          <button className="btn primary small" onClick={saveContent}>
            <SaveIcon size={14} /> {t("Zuweisungen speichern")}
          </button>
        )}
      </aside>

      {active && lib.some((x) => x.id === active) ? (
        <TexEditor
          key={active}
          project={project}
          id={active}
          content={content}
          usage={usage(active)}
          onAssign={(c) => setContent(c)}
          onDuplicate={() => duplicate(active)}
          onDelete={() => remove(active)}
        />
      ) : (
        <div className="tx-home">
          <ImageIcon size={34} />
          <h1>{t("Texturen")}</h1>
          <p className="muted">{t("Male Texturen mit Ebenen und Animation, speichere sie in der Bibliothek und gib sie Blöcken (jede Seite einzeln) und Items.")}</p>
          <button className="btn primary" onClick={() => setCreating(true)}>
            <PlusIcon size={14} /> {t("Neue Textur")}
          </button>
        </div>
      )}

      {creating && (
        <NewTexDialog
          project={project}
          taken={lib.map((x) => x.id)}
          onCancel={() => setCreating(false)}
          onCreated={async (id) => {
            setCreating(false);
            await refreshLib(project.id);
            setActive(id);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Neue Textur

function NewTexDialog({ project, taken, onCancel, onCreated }: { project: Project; taken: string[]; onCancel: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [size, setSize] = useState(16);
  const [start, setStart] = useState<"empty" | "color" | "mc" | "png" | "own">("empty");
  const [color, setColor] = useState("#7a7a7a");
  const [mcList, setMcList] = useState<string[] | null>(null);
  const [mcQ, setMcQ] = useState("");
  const [mcPick, setMcPick] = useState("");
  const [mcPrev, setMcPrev] = useState("");
  const [pngB64, setPngB64] = useState("");
  const [own, setOwn] = useState("");
  const [busy, setBusy] = useState(false);
  const [content, setContent] = useState<Content | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  useEffect(() => {
    if (start === "mc" && !mcList) texLibApi.mcList(project.mcVersion).then(setMcList).catch((e) => toast(String(e), "error"));
    if (start === "own" && !content) contentApi.load(project.id).then(setContent).catch(() => {});
  }, [start]);
  useEffect(() => {
    if (!mcPick) return;
    texLibApi.mcTexture(project.mcVersion, mcPick).then((b) => setMcPrev(b ? pngUrl(b) : ""));
    if (!name) setName(cleanId(mcPick.split("/").pop() ?? ""));
  }, [mcPick]);

  async function importPng() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const r = await open({ multiple: false, filters: [{ name: "PNG", extensions: ["png"] }] });
    if (typeof r !== "string") return;
    try {
      setPngB64(pngUrl(await texLibApi.pngRead(r)));
      if (!name) setName(cleanId(r.split(/[\\/]/).pop()!.replace(/\.png$/i, "")));
    } catch (e) {
      toast(String(e), "error");
    }
  }

  const id = cleanId(name);
  const clash = taken.includes(id);
  const ownList = content ? [...content.blocks.map((b) => ({ kind: "block" as const, id: b.id, label: b.nameEn || b.id })), ...content.items.map((i) => ({ kind: "item" as const, id: i.id, label: i.nameEn || i.id }))] : [];
  const ok = !!id && !clash && !busy && (start !== "mc" || !!mcPrev) && (start !== "png" || !!pngB64) && (start !== "own" || !!own);

  async function create() {
    setBusy(true);
    try {
      const doc = blankDoc(size);
      let src = "";
      if (start === "mc") src = mcPrev;
      if (start === "png") src = pngB64;
      if (start === "own") {
        const [kind, oid] = own.split(":");
        const b = await contentApi.textureGet(project.id, kind as "block" | "item", oid);
        if (b) src = pngUrl(b);
      }
      if (src) {
        const img = await loadImage(src);
        const frames = imageToFrames(img, size, true);
        doc.frames = frames.map((f) => [f]);
        if (start === "mc" && frames.length > 1) doc.frametime = 2;
      } else if (start === "color") {
        const [r, g, b] = hex2rgba(color);
        const p = doc.frames[0][0];
        for (let i = 0; i < p.length; i += 4) p.set([r, g, b, 255], i);
      }
      await texLibApi.save(project.id, id, serialize(doc), sheet(doc));
      onCreated(id);
    } catch (e) {
      toast(String(e), "error");
      setBusy(false);
    }
  }

  const mcShown = (mcList ?? []).filter((x) => !mcQ || x.includes(mcQ.toLowerCase())).slice(0, 300);

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="vars-dialog tx-new" role="dialog" aria-label={t("Neue Textur")}>
        <div className="vars-dialog-head">
          <ImageIcon size={18} />
          <strong className="grow">{t("Neue Textur")}</strong>
          <button className="icon-btn" onClick={onCancel} aria-label={t("Schließen")}>
            <CloseIcon size={14} />
          </button>
        </div>
        <label className="field">
          <span>{t("Name")}</span>
          <input autoFocus className="input mono" value={name} placeholder="rubin_stein" onChange={(e) => setName(e.target.value)} />
          {clash && <span className="err small">{t("Eine Textur mit diesem Namen gibt es schon.")}</span>}
        </label>
        <div className="field">
          <span>{t("Größe")}</span>
          <div className="vars-scopes three">
            {[16, 32, 64].map((s) => (
              <button key={s} className={size === s ? "vars-kind active" : "vars-kind"} onClick={() => setSize(s)}>
                <strong>
                  {s}×{s}
                </strong>
                <span className="muted tiny">{s === 16 ? t("Wie Minecraft") : s === 32 ? t("Doppelt so fein") : t("Sehr detailliert")}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>{t("Start mit")}</span>
          <div className="vars-kinds">
            {(
              [
                ["empty", t("Leer"), t("Durchsichtig")],
                ["color", t("Farbe"), t("Ganz gefüllt")],
                ["mc", t("Minecraft-Vorlage"), t("Vanilla-Textur abwandeln")],
                ["png", t("PNG importieren"), t("Bild von der Festplatte")],
                ["own", t("Aus deiner Mod"), t("Textur eines Blocks oder Items")],
              ] as const
            ).map(([k, l, d]) => (
              <button key={k} className={start === k ? "vars-kind active" : "vars-kind"} onClick={() => setStart(k)}>
                <strong>{l}</strong>
                <span className="muted tiny">{d}</span>
              </button>
            ))}
          </div>
        </div>
        {start === "color" && <input type="color" className="tx-color-big" value={color} onChange={(e) => setColor(e.target.value)} />}
        {start === "png" && (
          <div className="tx-new-row">
            <button className="btn small" onClick={importPng}>
              <ImportIcon size={14} /> {t("PNG auswählen …")}
            </button>
            {pngB64 && <img className="tx-new-prev" src={pngB64} alt="" />}
            <span className="muted tiny">{t("Höhere Bilder (z. B. 16×64) werden als Animation mit mehreren Frames geladen.")}</span>
          </div>
        )}
        {start === "own" && (
          <select className="input" value={own} onChange={(e) => setOwn(e.target.value)}>
            <option value="">{t("– Block oder Item wählen –")}</option>
            {ownList.map((o) => (
              <option key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id}`}>
                {o.kind === "block" ? t("Block") : t("Item")}: {o.label}
              </option>
            ))}
          </select>
        )}
        {start === "mc" && (
          <div className="tx-mc">
            <div className="search">
              <SearchIcon size={13} />
              <input placeholder={t("z. B. stone, diamond, oak_log …")} value={mcQ} onChange={(e) => setMcQ(e.target.value)} />
            </div>
            <div className="tx-mc-body">
              <div className="tx-mc-list">
                {!mcList && <p className="muted small pad">{t("Lade Minecraft-Texturen …")}</p>}
                {mcShown.map((x) => (
                  <button key={x} className={x === mcPick ? "active" : ""} onClick={() => setMcPick(x)}>
                    {x}
                  </button>
                ))}
              </div>
              <div className="tx-mc-prev">{mcPrev ? <img src={mcPrev} alt="" /> : <span className="muted tiny">{t("Vorschau")}</span>}</div>
            </div>
          </div>
        )}
        <div className="vars-dialog-foot">
          <button className="btn" onClick={onCancel}>
            {t("Abbrechen")}
          </button>
          <button className={busy ? "btn primary loading" : "btn primary"} disabled={!ok} onClick={create}>
            <PlusIcon size={14} /> {t("Anlegen")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Editor

const TOOLS: { t: Tool; label: string; key: string; icon: React.ReactNode }[] = [
  { t: "pencil", label: t("Stift"), key: "B", icon: <PencilIcon size={16} /> },
  { t: "eraser", label: t("Radierer"), key: "E", icon: <EraserIcon size={16} /> },
  { t: "fill", label: t("Füllen"), key: "G", icon: <BucketIcon size={16} /> },
  { t: "picker", label: t("Pipette"), key: "I", icon: <PipetteIcon size={16} /> },
  { t: "line", label: t("Linie"), key: "L", icon: <LineIcon size={16} /> },
  { t: "rect", label: t("Rechteck"), key: "R", icon: <RectIcon size={16} /> },
  { t: "ellipse", label: t("Kreis"), key: "O", icon: <CircleIcon size={16} /> },
  { t: "gradient", label: t("Farbverlauf"), key: "D", icon: <GradientIcon size={16} /> },
  { t: "noise", label: t("Rauschen"), key: "N", icon: <NoiseIcon size={16} /> },
  { t: "select", label: t("Auswahl"), key: "M", icon: <SelectIcon size={16} /> },
  { t: "move", label: t("Verschieben"), key: "V", icon: <MoveIcon size={16} /> },
];

function TexEditor({
  project,
  id,
  content,
  usage,
  onAssign,
  onDuplicate,
  onDelete,
}: {
  project: Project;
  id: string;
  content: Content | null;
  usage: string[];
  onAssign: (c: Content) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const doc = useRef<TexDoc | null>(null);
  const [ver, setVer] = useState(0);
  const bump = () => setVer((v) => v + 1);
  const [frame, setFrame] = useState(0);
  const [layer, setLayer] = useState(0);
  const [tool, setTool] = useState<Tool>("pencil");
  const [prim, setPrim] = useState("#6fcf5a");
  const [sec, setSec] = useState("#000000");
  const [alpha, setAlpha] = useState(255);
  const [brush, setBrush] = useState(1);
  const [mirX, setMirX] = useState(false);
  const [mirY, setMirY] = useState(false);
  const [filled, setFilled] = useState(false);
  const [grid, setGrid] = useState(true);
  const [onion, setOnion] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playFrame, setPlayFrame] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [sel, setSel] = useState<Rect | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const undo = useRef<TexDoc[]>([]);
  const redo = useRef<TexDoc[]>([]);
  const clip = useRef<{ w: number; h: number; px: Uint8ClampedArray } | null>(null);
  const saveTimer = useRef<number>();

  // Laden
  useEffect(() => {
    let off = false;
    (async () => {
      const json = await texLibApi.load(project.id, id).catch(() => null);
      let d = json ? deserialize(json) : null;
      if (!d) {
        const entry = (await texLibApi.list(project.id)).find((x) => x.id === id);
        d = blankDoc(entry?.size ?? 16);
        if (entry) {
          const img = await loadImage(pngUrl(entry.png));
          d.frames = imageToFrames(img, d.size, true).map((f) => [f]);
        }
      }
      if (off) return;
      doc.current = d;
      setZoom(Math.max(4, Math.floor(480 / d.size)));
      bump();
    })();
    return () => {
      off = true;
    };
  }, [project.id, id]);

  const d = doc.current;
  const size = d?.size ?? 16;
  const layerData = () => doc.current!.frames[frame][layer];

  function snapshot() {
    undo.current.push(cloneDoc(doc.current!));
    if (undo.current.length > 50) undo.current.shift();
    redo.current = [];
  }
  function changed() {
    bump();
    notifyUndo();
    setStatus("saving");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const dd = doc.current!;
      const png = sheet(dd);
      try {
        await texLibApi.save(project.id, id, serialize(dd), png);
        putLib(project.id, { id, size: dd.size, frames: dd.frames.length, frametime: dd.frametime, interpolate: dd.interpolate, png: png.split(",")[1] });
        setStatus("saved");
      } catch (e) {
        toast(t("Textur nicht gespeichert: {e}", { e: String(e) }), "error");
        setStatus("idle");
      }
    }, 600);
  }
  function doUndo() {
    const u = undo.current.pop();
    if (!u) return;
    redo.current.push(cloneDoc(doc.current!));
    doc.current = u;
    setFrame((f) => Math.min(f, u.frames.length - 1));
    setLayer((l) => Math.min(l, u.layers.length - 1));
    changed();
  }
  function doRedo() {
    const r = redo.current.pop();
    if (!r) return;
    undo.current.push(cloneDoc(doc.current!));
    doc.current = r;
    changed();
  }
  useUndoTarget({ undo: doUndo, redo: doRedo, canUndo: () => undo.current.length > 0, canRedo: () => redo.current.length > 0 });

  // ---- Zeichnen ----
  const inSel = (x: number, y: number) => !sel || (x >= sel.x && y >= sel.y && x < sel.x + sel.w && y < sel.y + sel.h);
  function put(px: Uint8ClampedArray, x: number, y: number, c: [number, number, number, number]) {
    const pts: [number, number][] = [[x, y]];
    if (mirX) pts.push([size - 1 - x, y]);
    if (mirY) pts.push([x, size - 1 - y]);
    if (mirX && mirY) pts.push([size - 1 - x, size - 1 - y]);
    for (const [a, b] of pts) if (a >= 0 && b >= 0 && a < size && b < size && inSel(a, b)) px.set(c, (b * size + a) * 4);
  }
  function stamp(px: Uint8ClampedArray, x: number, y: number, c: [number, number, number, number]) {
    const o = Math.floor((brush - 1) / 2);
    for (let dy = 0; dy < brush; dy++) for (let dx = 0; dx < brush; dx++) put(px, x - o + dx, y - o + dy, c);
  }
  function line(px: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number, c: [number, number, number, number]) {
    const dx = Math.abs(x1 - x0),
      dy = -Math.abs(y1 - y0),
      sx = x0 < x1 ? 1 : -1,
      sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      stamp(px, x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
  function rect(px: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number, c: [number, number, number, number]) {
    const [a, b, e, f] = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
    for (let y = b; y <= f; y++) for (let x = a; x <= e; x++) if (filled || x === a || x === e || y === b || y === f) put(px, x, y, c);
  }
  function ellipse(px: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number, c: [number, number, number, number]) {
    const [a, b, e, f] = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
    const cx = (a + e) / 2,
      cy = (b + f) / 2,
      rx = (e - a) / 2 + 0.5,
      ry = (f - b) / 2 + 0.5;
    const inside = (x: number, y: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
    for (let y = b; y <= f; y++)
      for (let x = a; x <= e; x++) {
        if (!inside(x, y)) continue;
        if (filled || !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) put(px, x, y, c);
      }
  }
  function gradient(px: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number) {
    const a = hex2rgba(prim, alpha),
      b = hex2rgba(sec, alpha);
    const vx = x1 - x0,
      vy = y1 - y0,
      len = vx * vx + vy * vy || 1;
    const steps = 6;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        if (!inSel(x, y)) continue;
        let tt = ((x - x0) * vx + (y - y0) * vy) / len;
        tt = Math.max(0, Math.min(1, tt));
        tt = Math.round(tt * steps) / steps; // Pixel-Look: Stufen
        px.set(
          a.map((v, i) => Math.round(v + (b[i] - v) * tt)),
          (y * size + x) * 4,
        );
      }
  }
  function fill(px: Uint8ClampedArray, x: number, y: number, c: [number, number, number, number], global: boolean) {
    const i0 = (y * size + x) * 4;
    const target = Array.from(px.slice(i0, i0 + 4));
    const same = (i: number) => px[i] === target[0] && px[i + 1] === target[1] && px[i + 2] === target[2] && px[i + 3] === target[3];
    if (target.every((v, i) => v === c[i])) return;
    if (global) {
      for (let yy = 0; yy < size; yy++) for (let xx = 0; xx < size; xx++) if (same((yy * size + xx) * 4) && inSel(xx, yy)) px.set(c, (yy * size + xx) * 4);
      return;
    }
    const stack = [[x, y]];
    const seen = new Uint8Array(size * size);
    while (stack.length) {
      const [a, b] = stack.pop()!;
      if (a < 0 || b < 0 || a >= size || b >= size || seen[b * size + a] || !inSel(a, b)) continue;
      seen[b * size + a] = 1;
      if (!same((b * size + a) * 4)) continue;
      px.set(c, (b * size + a) * 4);
      stack.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]);
    }
  }
  function noise(px: Uint8ClampedArray, x: number, y: number) {
    const o = Math.floor((Math.max(brush, 2) - 1) / 2);
    for (let dy = 0; dy < Math.max(brush, 2); dy++)
      for (let dx = 0; dx < Math.max(brush, 2); dx++) {
        const a = x - o + dx,
          b = y - o + dy;
        if (a < 0 || b < 0 || a >= size || b >= size || !inSel(a, b)) continue;
        const i = (b * size + a) * 4;
        if (px[i + 3] === 0) continue;
        const k = 1 + (Math.random() - 0.5) * 0.25;
        for (let c = 0; c < 3; c++) px[i + c] = px[i + c] * k;
      }
  }

  const stroke = useRef<{ base: Uint8ClampedArray; x0: number; y0: number; last: [number, number]; right: boolean; moveSel?: Rect | null } | null>(null);

  function cell(e: React.PointerEvent): [number, number] {
    const r = canvas.current!.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * size), Math.floor(((e.clientY - r.top) / r.height) * size)];
  }

  function onDown(e: React.PointerEvent) {
    if (!d || e.button === 1) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    const [x, y] = cell(e);
    const right = e.button === 2;
    const color = hex2rgba(right ? sec : prim, alpha);
    const px = layerData();
    if (tool === "picker") {
      const c = composite(d, frame);
      const i = (y * size + x) * 4;
      if (c[i + 3] > 0) {
        const h = rgba2hex(c[i], c[i + 1], c[i + 2]);
        right ? setSec(h) : setPrim(h);
        setAlpha(c[i + 3]);
      }
      return;
    }
    if (tool === "select") {
      stroke.current = { base: px, x0: x, y0: y, last: [x, y], right };
      setSel({ x, y, w: 1, h: 1 });
      return;
    }
    snapshot();
    stroke.current = { base: new Uint8ClampedArray(px), x0: x, y0: y, last: [x, y], right, moveSel: sel };
    if (tool === "fill") {
      fill(px, x, y, color, e.shiftKey);
      stroke.current = null;
      changed();
      remember();
      return;
    }
    if (tool === "pencil") stamp(px, x, y, color);
    if (tool === "eraser") stamp(px, x, y, [0, 0, 0, 0]);
    if (tool === "noise") noise(px, x, y);
    bump();
  }

  function onMove(e: React.PointerEvent) {
    if (!d) return;
    const [x, y] = cell(e);
    setHover(x >= 0 && y >= 0 && x < size && y < size ? [x, y] : null);
    const s = stroke.current;
    if (!s) return;
    const px = layerData();
    const color = hex2rgba(s.right ? sec : prim, alpha);
    const [lx, ly] = s.last;
    if (lx === x && ly === y && tool !== "select") return;
    switch (tool) {
      case "pencil":
        line(px, lx, ly, x, y, color);
        break;
      case "eraser":
        line(px, lx, ly, x, y, [0, 0, 0, 0]);
        break;
      case "noise":
        noise(px, x, y);
        break;
      case "line":
        px.set(s.base);
        line(px, s.x0, s.y0, x, y, color);
        break;
      case "rect":
        px.set(s.base);
        rect(px, s.x0, s.y0, x, y, color);
        break;
      case "ellipse":
        px.set(s.base);
        ellipse(px, s.x0, s.y0, x, y, color);
        break;
      case "gradient":
        px.set(s.base);
        gradient(px, s.x0, s.y0, x, y);
        break;
      case "select": {
        const a = Math.max(0, Math.min(s.x0, x)),
          b = Math.max(0, Math.min(s.y0, y));
        setSel({ x: a, y: b, w: Math.min(size - 1, Math.max(s.x0, x)) - a + 1, h: Math.min(size - 1, Math.max(s.y0, y)) - b + 1 });
        break;
      }
      case "move": {
        const dx = x - s.x0,
          dy = y - s.y0;
        const r = s.moveSel ?? { x: 0, y: 0, w: size, h: size };
        px.set(s.base);
        for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) px.set([0, 0, 0, 0], (yy * size + xx) * 4);
        for (let yy = r.y; yy < r.y + r.h; yy++)
          for (let xx = r.x; xx < r.x + r.w; xx++) {
            const nx = xx + dx,
              ny = yy + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
            const si = (yy * size + xx) * 4;
            if (s.base[si + 3] === 0) continue;
            px.set(s.base.slice(si, si + 4), (ny * size + nx) * 4);
          }
        if (s.moveSel) setSel({ ...s.moveSel, x: s.moveSel.x + dx, y: s.moveSel.y + dy });
        break;
      }
    }
    s.last = [x, y];
    bump();
  }

  function onUp() {
    const s = stroke.current;
    stroke.current = null;
    if (!s) return;
    if (tool === "select") {
      if (sel && sel.w <= 1 && sel.h <= 1 && s.x0 === s.last[0] && s.y0 === s.last[1]) setSel(null);
      return;
    }
    if (tool === "move" && sel) {
      // Auswahl an die neue Stelle, aber im Bild begrenzen
      setSel((r) => (r ? { x: Math.max(0, r.x), y: Math.max(0, r.y), w: Math.min(r.w, size - Math.max(0, r.x)), h: Math.min(r.h, size - Math.max(0, r.y)) } : r));
    }
    remember();
    changed();
  }
  function remember() {
    if (tool === "eraser" || tool === "move" || tool === "noise") return;
    setRecent((r) => [prim, ...r.filter((x) => x !== prim)].slice(0, 12));
  }

  // ---- Tastatur ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || !doc.current) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? doRedo() : doUndo();
      } else if (ctrl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        doRedo();
      } else if (ctrl && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSel({ x: 0, y: 0, w: size, h: size });
      } else if (ctrl && e.key.toLowerCase() === "c" && sel) {
        e.preventDefault();
        const px = layerData();
        const out = new Uint8ClampedArray(sel.w * sel.h * 4);
        for (let y = 0; y < sel.h; y++) out.set(px.slice(((sel.y + y) * size + sel.x) * 4, ((sel.y + y) * size + sel.x + sel.w) * 4), y * sel.w * 4);
        clip.current = { w: sel.w, h: sel.h, px: out };
      } else if (ctrl && e.key.toLowerCase() === "v" && clip.current) {
        e.preventDefault();
        snapshot();
        const c = clip.current;
        const at = sel ?? { x: 0, y: 0 };
        const px = layerData();
        for (let y = 0; y < c.h; y++)
          for (let x = 0; x < c.w; x++) {
            const nx = at.x + x,
              ny = at.y + y;
            if (nx >= size || ny >= size || c.px[(y * c.w + x) * 4 + 3] === 0) continue;
            px.set(c.px.slice((y * c.w + x) * 4, (y * c.w + x) * 4 + 4), (ny * size + nx) * 4);
          }
        setSel({ x: at.x, y: at.y, w: Math.min(c.w, size - at.x), h: Math.min(c.h, size - at.y) });
        setTool("move");
        changed();
      } else if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        e.preventDefault();
        snapshot();
        const px = layerData();
        for (let y = sel.y; y < sel.y + sel.h; y++) for (let x = sel.x; x < sel.x + sel.w; x++) px.set([0, 0, 0, 0], (y * size + x) * 4);
        changed();
      } else if (e.key === "Escape") setSel(null);
      else if (e.key === "x" && !ctrl) {
        setPrim(sec);
        setSec(prim);
      } else if (!ctrl && !e.altKey) {
        const tl = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
        if (tl) setTool(tl.t);
        if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(64, z + 2));
        if (e.key === "-") setZoom((z) => Math.max(2, z - 2));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- Darstellung ----
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !d) return;
    const z = zoom;
    cv.width = size * z;
    cv.height = size * z;
    const ctx = cv.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    // Schachbrett
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        ctx.fillStyle = (x + y) % 2 ? "#2b2d31" : "#36383e";
        ctx.fillRect(x * z, y * z, z, z);
      }
    const tmp = document.createElement("canvas");
    tmp.width = size;
    tmp.height = size;
    const tctx = tmp.getContext("2d")!;
    if (onion && frame > 0) {
      tctx.putImageData(new ImageData(composite(d, frame - 1), size, size), 0, 0);
      ctx.globalAlpha = 0.28;
      ctx.drawImage(tmp, 0, 0, size * z, size * z);
      ctx.globalAlpha = 1;
    }
    tctx.putImageData(new ImageData(composite(d, frame), size, size), 0, 0);
    ctx.drawImage(tmp, 0, 0, size * z, size * z);
    if (grid && z >= 6) {
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < size; i++) {
        ctx.moveTo(i * z + 0.5, 0);
        ctx.lineTo(i * z + 0.5, size * z);
        ctx.moveTo(0, i * z + 0.5);
        ctx.lineTo(size * z, i * z + 0.5);
      }
      ctx.stroke();
      if (size >= 32) {
        ctx.strokeStyle = "rgba(255,255,255,0.16)";
        ctx.beginPath();
        for (let i = 16; i < size; i += 16) {
          ctx.moveTo(i * z + 0.5, 0);
          ctx.lineTo(i * z + 0.5, size * z);
          ctx.moveTo(0, i * z + 0.5);
          ctx.lineTo(size * z, i * z + 0.5);
        }
        ctx.stroke();
      }
    }
    if (mirX || mirY) {
      ctx.strokeStyle = "rgba(91,200,120,0.6)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      if (mirX) {
        ctx.moveTo((size * z) / 2, 0);
        ctx.lineTo((size * z) / 2, size * z);
      }
      if (mirY) {
        ctx.moveTo(0, (size * z) / 2);
        ctx.lineTo(size * z, (size * z) / 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (hover && !stroke.current && tool !== "select" && tool !== "move") {
      const o = tool === "pencil" || tool === "eraser" || tool === "noise" ? Math.floor((brush - 1) / 2) : 0;
      const bs = tool === "pencil" || tool === "eraser" || tool === "noise" ? brush : 1;
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.strokeRect((hover[0] - o) * z + 0.5, (hover[1] - o) * z + 0.5, bs * z - 1, bs * z - 1);
    }
    if (sel) {
      ctx.strokeStyle = "#fff";
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(sel.x * z + 0.5, sel.y * z + 0.5, sel.w * z - 1, sel.h * z - 1);
      ctx.strokeStyle = "#000";
      ctx.lineDashOffset = 4;
      ctx.strokeRect(sel.x * z + 0.5, sel.y * z + 0.5, sel.w * z - 1, sel.h * z - 1);
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
  });

  // Animation abspielen
  useEffect(() => {
    if (!playing || !d) return;
    const iv = window.setInterval(() => setPlayFrame((f) => (f + 1) % (doc.current?.frames.length ?? 1)), (d.frametime / 20) * 1000);
    return () => window.clearInterval(iv);
  }, [playing, d?.frametime, ver]);

  const previews = useMemo(() => (d ? d.frames.map((_, i) => frameUrl(d, i)) : []), [ver]);
  const flat = previews[playing ? playFrame % previews.length : frame] ?? "";

  if (!d) return <div className="tx-home muted">{t("Lade …")}</div>;

  // ---- Ebenen und Frames ----
  const editDoc = (fn: (dd: TexDoc) => void) => {
    snapshot();
    fn(doc.current!);
    changed();
  };
  const addLayer = () =>
    editDoc((dd) => {
      dd.layers.splice(layer + 1, 0, { id: layerId(), name: t("Ebene {n}", { n: String(dd.layers.length + 1) }), visible: true, opacity: 1 });
      dd.frames.forEach((f) => f.splice(layer + 1, 0, new Uint8ClampedArray(size * size * 4)));
      setLayer(layer + 1);
    });
  const dupLayer = () =>
    editDoc((dd) => {
      dd.layers.splice(layer + 1, 0, { ...dd.layers[layer], id: layerId(), name: `${dd.layers[layer].name} (${t("Kopie")})` });
      dd.frames.forEach((f) => f.splice(layer + 1, 0, new Uint8ClampedArray(f[layer])));
      setLayer(layer + 1);
    });
  const delLayer = () =>
    d.layers.length > 1 &&
    editDoc((dd) => {
      dd.layers.splice(layer, 1);
      dd.frames.forEach((f) => f.splice(layer, 1));
      setLayer(Math.max(0, layer - 1));
    });
  const moveLayer = (dir: 1 | -1) => {
    const j = layer + dir;
    if (j < 0 || j >= d.layers.length) return;
    editDoc((dd) => {
      [dd.layers[layer], dd.layers[j]] = [dd.layers[j], dd.layers[layer]];
      dd.frames.forEach((f) => ([f[layer], f[j]] = [f[j], f[layer]]));
      setLayer(j);
    });
  };
  const mergeDown = () =>
    layer > 0 &&
    editDoc((dd) => {
      const sub: TexDoc = { ...dd, layers: [dd.layers[layer - 1], dd.layers[layer]], frames: dd.frames.map((f) => [f[layer - 1], f[layer]]) };
      dd.frames.forEach((f, fi) => (f[layer - 1] = composite(sub, fi, true)));
      dd.layers[layer - 1] = { ...dd.layers[layer - 1], opacity: 1, visible: true };
      dd.layers.splice(layer, 1);
      dd.frames.forEach((f) => f.splice(layer, 1));
      setLayer(layer - 1);
    });
  const setLayerMeta = (i: number, p: Partial<LayerMeta>, snap = true) => {
    if (snap) snapshot();
    doc.current!.layers[i] = { ...doc.current!.layers[i], ...p };
    changed();
  };
  const addFrame = (copy: boolean) =>
    editDoc((dd) => {
      dd.frames.splice(frame + 1, 0, dd.layers.map((_, li) => (copy ? new Uint8ClampedArray(dd.frames[frame][li]) : new Uint8ClampedArray(size * size * 4))));
      setFrame(frame + 1);
    });
  const delFrame = () =>
    d.frames.length > 1 &&
    editDoc((dd) => {
      dd.frames.splice(frame, 1);
      setFrame(Math.max(0, frame - 1));
    });
  const moveFrame = (dir: 1 | -1) => {
    const j = frame + dir;
    if (j < 0 || j >= d.frames.length) return;
    editDoc((dd) => {
      [dd.frames[frame], dd.frames[j]] = [dd.frames[j], dd.frames[frame]];
      setFrame(j);
    });
  };
  const transform = (kind: "flipX" | "flipY" | "rot" | "clear") =>
    editDoc((dd) => {
      const src = new Uint8ClampedArray(dd.frames[frame][layer]);
      const dst = dd.frames[frame][layer];
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const [sx, sy] = kind === "flipX" ? [size - 1 - x, y] : kind === "flipY" ? [x, size - 1 - y] : kind === "rot" ? [y, size - 1 - x] : [x, y];
          dst.set(kind === "clear" ? [0, 0, 0, 0] : src.slice((sy * size + sx) * 4, (sy * size + sx) * 4 + 4), (y * size + x) * 4);
        }
    });

  async function importPng() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const r = await open({ multiple: false, filters: [{ name: "PNG", extensions: ["png"] }] });
    if (typeof r !== "string") return;
    try {
      const img = await loadImage(pngUrl(await texLibApi.pngRead(r)));
      const frames = imageToFrames(img, size, true);
      editDoc((dd) => {
        if (frames.length > 1) {
          // Animation: als neue Frames dieser Ebene
          frames.forEach((px, i) => {
            if (!dd.frames[i]) dd.frames.push(dd.layers.map(() => new Uint8ClampedArray(size * size * 4)));
            dd.frames[i][layer] = px;
          });
          toast(t("{n} Frames importiert.", { n: String(frames.length) }), "success");
        } else dd.frames[frame][layer] = frames[0];
      });
    } catch (e) {
      toast(String(e), "error");
    }
  }
  async function exportPng() {
    const dest = await pickSaveFile(t("Textur exportieren"), `${id}.png`, "png", "PNG");
    if (!dest) return;
    texLibApi
      .pngWrite(dest, sheet(d!))
      .then(() => toast(t("Exportiert."), "success"))
      .catch((e) => toast(String(e), "error"));
  }

  const swatch = (c: string) => (
    <button
      key={c}
      className={c === prim ? "tx-sw active" : "tx-sw"}
      style={{ background: c }}
      onClick={() => setPrim(c)}
      onContextMenu={(e) => {
        e.preventDefault();
        setSec(c);
      }}
      title={c}
    />
  );

  return (
    <div className="tx-ed">
      <header className="tx-ed-head">
        <span className="tx-thumb big" style={{ backgroundImage: `url(${previews[0]})` }} />
        <div className="grow">
          <h2 className="mono">{id}</h2>
          <div className="muted small">
            {size}×{size} · {d.layers.length} {t("Ebenen")} · {d.frames.length} {t("Frames")}
            {usage.length > 0 && ` · ${t("benutzt von {list}", { list: usage.join(", ") })}`}
          </div>
        </div>
        <div className={`save-state ${status}`}>{status === "saving" ? t("Speichert …") : status === "saved" ? t("Gespeichert") : " "}</div>
        <button className="icon-btn" onClick={doUndo} data-tip={t("Rückgängig · Strg Z")} aria-label={t("Rückgängig")}>
          <UndoIcon size={15} />
        </button>
        <button className="icon-btn" onClick={doRedo} data-tip={t("Wiederholen · Strg Y")} aria-label={t("Wiederholen")}>
          <RedoIcon size={15} />
        </button>
        <span className="tx-div" />
        <button className="btn small" onClick={importPng}>
          <ImportIcon size={14} /> {t("PNG importieren")}
        </button>
        <button className="btn small" onClick={exportPng}>
          <DownloadIcon size={14} /> {t("Exportieren")}
        </button>
        <button className="icon-btn" onClick={onDuplicate} data-tip={t("Duplizieren")} aria-label={t("Duplizieren")}>
          <CopyIcon size={15} />
        </button>
        <button className="icon-btn danger" onClick={onDelete} data-tip={t("Löschen")} aria-label={t("Löschen")}>
          <TrashIcon size={15} />
        </button>
      </header>

      <div className="tx-ed-body">
        <div className="tx-tools">
          {TOOLS.map((x) => (
            <button key={x.t} className={tool === x.t ? "tx-tool active" : "tx-tool"} onClick={() => setTool(x.t)} data-tip={`${x.label} · ${x.key}`} aria-label={x.label}>
              {x.icon}
            </button>
          ))}
          <span className="tx-tools-sep" />
          <button className={mirX ? "tx-tool active" : "tx-tool"} onClick={() => setMirX((v) => !v)} data-tip={t("Spiegeln links/rechts")} aria-label={t("Spiegeln")}>
            <MirrorIcon size={16} />
          </button>
          <button className={mirY ? "tx-tool active" : "tx-tool"} onClick={() => setMirY((v) => !v)} data-tip={t("Spiegeln oben/unten")} aria-label={t("Spiegeln oben/unten")}>
            <span style={{ transform: "rotate(90deg)", display: "grid" }}>
              <MirrorIcon size={16} />
            </span>
          </button>
          <button className={grid ? "tx-tool active" : "tx-tool"} onClick={() => setGrid((v) => !v)} data-tip={t("Raster")} aria-label={t("Raster")}>
            <GridToggleIcon size={16} />
          </button>
        </div>

        <div className="tx-center">
          <div className="tx-opts">
            {(tool === "pencil" || tool === "eraser" || tool === "noise" || tool === "line") && (
              <label className="tx-opt">
                {t("Pinsel")}
                {[1, 2, 3, 4].map((b) => (
                  <button key={b} className={brush === b ? "tx-chip active" : "tx-chip"} onClick={() => setBrush(b)}>
                    {b}
                  </button>
                ))}
              </label>
            )}
            {(tool === "rect" || tool === "ellipse") && (
              <label className="tx-opt">
                <button className={!filled ? "tx-chip active" : "tx-chip"} onClick={() => setFilled(false)}>
                  {t("Umriss")}
                </button>
                <button className={filled ? "tx-chip active" : "tx-chip"} onClick={() => setFilled(true)}>
                  {t("Gefüllt")}
                </button>
              </label>
            )}
            {tool === "fill" && <span className="muted small">{t("Umschalt-Klick ersetzt die Farbe überall")}</span>}
            {tool === "gradient" && <span className="muted small">{t("Ziehen: von Hauptfarbe zu Zweitfarbe")}</span>}
            {tool === "noise" && <span className="muted small">{t("Malt leichte Helligkeits-Unterschiede – wie bei Minecraft-Steinen")}</span>}
            {tool === "select" && <span className="muted small">{t("Bereich aufziehen · Strg C/V kopieren · Entf löscht · Esc hebt auf")}</span>}
            {tool === "move" && <span className="muted small">{sel ? t("Verschiebt die Auswahl") : t("Verschiebt die ganze Ebene")}</span>}
            <span className="grow" />
            <button className="tx-chip" onClick={() => transform("flipX")}>
              ⇋ {t("Spiegeln")}
            </button>
            <button className="tx-chip" onClick={() => transform("rot")}>
              ⟳ 90°
            </button>
            <button className="tx-chip" onClick={() => transform("clear")}>
              {t("Ebene leeren")}
            </button>
            <select className="input tx-zoom" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label={t("Zoom")}>
              {[4, 6, 8, 12, 16, 24, 32, 40].map((z) => (
                <option key={z} value={z}>
                  {z}×
                </option>
              ))}
            </select>
          </div>
          <div
            className="tx-canvas-wrap"
            onWheel={(e) => {
              if (!e.ctrlKey) return;
              e.preventDefault();
              setZoom((z) => Math.max(2, Math.min(64, z + (e.deltaY < 0 ? 2 : -2))));
            }}
          >
            <canvas
              ref={canvas}
              className={`tx-canvas tool-${tool}`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={() => setHover(null)}
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>
          <div className="tx-status muted tiny">
            {hover ? `x ${hover[0]} · y ${hover[1]}` : " "}
            <span className="grow" />
            {t("Rechtsklick malt mit der Zweitfarbe · X tauscht · Strg+Mausrad zoomt")}
          </div>

          {/* Frames */}
          <div className="tx-frames">
            <div className="tx-frames-head">
              <FramesIcon size={14} />
              <strong>{t("Animation")}</strong>
              <button className="icon-btn" onClick={() => setPlaying((p) => !p)} disabled={d.frames.length < 2} aria-label={playing ? t("Pause") : t("Abspielen")} data-tip={playing ? t("Pause") : t("Abspielen")}>
                {playing ? <PauseIcon size={14} /> : <PlayIcon size={12} />}
              </button>
              <label className="tx-opt">
                {t("Tempo")}
                <input className="input mono tx-num" type="number" min={1} max={200} value={d.frametime} onChange={(e) => editDoc((dd) => (dd.frametime = Math.max(1, Math.min(200, Number(e.target.value) || 1))))} />
                <span className="muted tiny">{t("Ticks/Frame")}</span>
              </label>
              <label className="tx-opt">
                <input type="checkbox" checked={d.interpolate} onChange={(e) => editDoc((dd) => (dd.interpolate = e.target.checked))} /> {t("Weich überblenden")}
              </label>
              <label className="tx-opt">
                <input type="checkbox" checked={onion} onChange={(e) => setOnion(e.target.checked)} /> {t("Zwiebelhaut")}
              </label>
              <span className="grow" />
              <button className="btn small ghost" onClick={() => moveFrame(-1)} disabled={frame === 0}>
                ←
              </button>
              <button className="btn small ghost" onClick={() => moveFrame(1)} disabled={frame >= d.frames.length - 1}>
                →
              </button>
              <button className="btn small ghost" onClick={delFrame} disabled={d.frames.length < 2}>
                <TrashIcon size={13} />
              </button>
            </div>
            <div className="tx-frames-list">
              {previews.map((u, i) => (
                <button key={i} className={i === frame ? "tx-frame active" : "tx-frame"} onClick={() => setFrame(i)}>
                  <img src={u} alt="" />
                  <span>{i + 1}</span>
                </button>
              ))}
              <button className="tx-frame add" onClick={() => addFrame(true)} data-tip={t("Frame kopieren")}>
                <CopyIcon size={14} />
              </button>
              <button className="tx-frame add" onClick={() => addFrame(false)} data-tip={t("Leerer Frame")}>
                <PlusIcon size={14} />
              </button>
            </div>
          </div>
        </div>

        <aside className="tx-right">
          {/* Farben */}
          <div className="tx-panel">
            <div className="tx-colors">
              <div className="tx-pair">
                <label className="tx-prim" style={{ background: prim }} data-tip={t("Hauptfarbe")}>
                  <input type="color" value={prim} onChange={(e) => setPrim(e.target.value)} />
                </label>
                <label className="tx-sec" style={{ background: sec }} data-tip={t("Zweitfarbe")}>
                  <input type="color" value={sec} onChange={(e) => setSec(e.target.value)} />
                </label>
              </div>
              <div className="grow">
                <input className="input mono" value={prim} onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && setPrim(e.target.value)} aria-label={t("Hex-Farbe")} />
                <label className="tx-alpha">
                  <span className="muted tiny">{t("Deckkraft")}</span>
                  <input type="range" min={0} max={255} value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} />
                  <span className="mono tiny">{Math.round((alpha / 255) * 100)}%</span>
                </label>
              </div>
            </div>
            <div className="tx-palette">{PALETTE.map(swatch)}</div>
            {recent.length > 0 && (
              <>
                <div className="tags-group-label">{t("Zuletzt")}</div>
                <div className="tx-palette">{recent.map(swatch)}</div>
              </>
            )}
          </div>

          {/* Ebenen */}
          <div className="tx-panel">
            <div className="tx-panel-head">
              <LayersIcon size={14} />
              <strong className="grow">{t("Ebenen")}</strong>
              <button className="icon-btn tiny" onClick={addLayer} data-tip={t("Neue Ebene")} aria-label={t("Neue Ebene")}>
                <PlusIcon size={13} />
              </button>
              <button className="icon-btn tiny" onClick={dupLayer} data-tip={t("Ebene duplizieren")} aria-label={t("Ebene duplizieren")}>
                <CopyIcon size={13} />
              </button>
              <button className="icon-btn tiny" onClick={mergeDown} disabled={layer === 0} data-tip={t("Mit unterer zusammenfügen")} aria-label={t("Zusammenfügen")}>
                ⤓
              </button>
              <button className="icon-btn tiny danger" onClick={delLayer} disabled={d.layers.length < 2} data-tip={t("Ebene löschen")} aria-label={t("Ebene löschen")}>
                <TrashIcon size={13} />
              </button>
            </div>
            <div className="tx-layers">
              {[...d.layers].map((l, i) => ({ l, i })).reverse().map(({ l, i }) => (
                <div key={l.id} className={i === layer ? "tx-layer active" : "tx-layer"} onClick={() => setLayer(i)}>
                  <button
                    className="icon-btn tiny"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLayerMeta(i, { visible: !l.visible });
                    }}
                    aria-label={t("Sichtbar")}
                  >
                    {l.visible ? <EyeIcon size={13} /> : <EyeOffIcon size={13} />}
                  </button>
                  <LayerThumb data={d.frames[frame][i]} size={size} ver={ver} />
                  {renaming === l.id ? (
                    <input
                      autoFocus
                      className="input tx-layer-name"
                      defaultValue={l.name}
                      onBlur={(e) => {
                        setLayerMeta(i, { name: e.target.value || l.name });
                        setRenaming(null);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    />
                  ) : (
                    <span className="grow tx-layer-label" onDoubleClick={() => setRenaming(l.id)}>
                      {l.name}
                    </span>
                  )}
                  {l.opacity < 1 && <span className="muted tiny">{Math.round(l.opacity * 100)}%</span>}
                </div>
              ))}
            </div>
            <label className="tx-alpha">
              <span className="muted tiny">{t("Deckkraft der Ebene")}</span>
              <input type="range" min={0} max={100} value={Math.round(d.layers[layer].opacity * 100)} onChange={(e) => setLayerMeta(layer, { opacity: Number(e.target.value) / 100 }, false)} />
            </label>
            <div className="tx-layer-move">
              <button className="btn small ghost" onClick={() => moveLayer(1)} disabled={layer >= d.layers.length - 1}>
                ↑ {t("Nach oben")}
              </button>
              <button className="btn small ghost" onClick={() => moveLayer(-1)} disabled={layer === 0}>
                ↓ {t("Nach unten")}
              </button>
            </div>
          </div>

          {/* Vorschau */}
          <div className="tx-panel">
            <div className="tx-panel-head">
              <EyeIcon size={14} />
              <strong className="grow">{t("Vorschau")}</strong>
            </div>
            <div className="tx-previews">
              <div className="tx-tile" style={{ backgroundImage: `url(${flat})` }} data-tip={t("Gekachelt wie in der Welt")} />
              <CubePreview size={92} faces={[flat, flat, flat, flat, flat, flat]} />
            </div>
            <div className="tx-prev-row">
              <img className="tx-item-prev" src={flat} alt="" />
              <span className="muted tiny">{t("Als Item im Inventar")}</span>
            </div>
          </div>

          {content && <AssignPanel id={id} content={content} onAssign={onAssign} />}
        </aside>
      </div>
    </div>
  );
}

function LayerThumb({ data, size, ver }: { data: Uint8ClampedArray; size: number; ver: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = size;
    c.height = size;
    c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(data), size, size), 0, 0);
  }, [ver, data, size]);
  return <canvas ref={ref} className="tx-layer-thumb" />;
}

/** Schnell zuweisen: Block (alle Seiten / Oben / Unten / Seiten) oder Item */
function AssignPanel({ id, content, onAssign }: { id: string; content: Content; onAssign: (c: Content) => void }) {
  const [target, setTarget] = useState("");
  const [where, setWhere] = useState<"all" | "top" | "bottom" | "side">("all");
  const isBlock = target.startsWith("b:");
  function apply() {
    const key = target.slice(2);
    if (isBlock) {
      onAssign({
        ...content,
        blocks: content.blocks.map((b) => {
          if (b.id !== key) return b;
          const f = b.faces ?? { mode: "", all: "", top: "", bottom: "", side: "", north: "", south: "", east: "", west: "" };
          if (where === "all") return { ...b, faces: { ...f, mode: "all", all: id } };
          const base = f.mode === "all" ? f.all : f.mode === "pillar" ? "" : "";
          const nf = f.mode === "pillar" ? { ...f } : { ...f, mode: "pillar" as const, top: f.top || base, bottom: f.bottom || base, side: f.side || base };
          return { ...b, faces: { ...nf, [where]: id } };
        }),
      });
    } else onAssign({ ...content, items: content.items.map((i) => (i.id === key ? { ...i, texture: id } : i)) });
    toast(t("Zugewiesen – zum Übernehmen links „Zuweisungen speichern“."), "success");
  }
  return (
    <div className="tx-panel">
      <div className="tx-panel-head">
        <strong className="grow">{t("Zuweisen")}</strong>
      </div>
      <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">{t("– Block oder Item –")}</option>
        <optgroup label={t("Blöcke")}>
          {content.blocks.map((b) => (
            <option key={b.id} value={`b:${b.id}`}>
              {b.nameEn || b.nameDe || b.id}
            </option>
          ))}
        </optgroup>
        <optgroup label={t("Items")}>
          {content.items.map((i) => (
            <option key={i.id} value={`i:${i.id}`}>
              {i.nameEn || i.nameDe || i.id}
            </option>
          ))}
        </optgroup>
      </select>
      {isBlock && (
        <div className="tx-where">
          {(
            [
              ["all", t("Alle Seiten")],
              ["top", t("Oben")],
              ["bottom", t("Unten")],
              ["side", t("Seiten")],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={where === k ? "tx-chip active" : "tx-chip"} onClick={() => setWhere(k)}>
              {l}
            </button>
          ))}
        </div>
      )}
      <button className="btn small primary" disabled={!target} onClick={apply}>
        {t("Zuweisen")}
      </button>
      <p className="muted tiny">{t("Jede Seite einzeln stellst du beim Block im Inhalte-Tab unter „Textur“ ein.")}</p>
    </div>
  );
}
