import { t } from "../../i18n";
import { BetaBadge } from "../../features";
import { useUndoTarget } from "../../undo";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Blueprint, BpComment, BpLink, BpNode, Content, Project } from "../../api";
import { Toggle } from "../../components/Chrome";
import { OwnEntry } from "../../components/ItemPicker";
import { MenuItem, openMenu } from "../../components/Overlay";
import {
  AlertIcon,
  BatteryIcon,
  CheckIcon,
  ChevronIcon,
  ClipboardIcon,
  CodeIcon,
  VarIcon,
  RedoIcon,
  UndoIcon,
  BlueprintIcon,
  BranchIcon,
  ChatIcon,
  CopyIcon,
  CubeIcon,
  DelayIcon,
  FitIcon,
  GridIcon,
  InfoIcon,
  LightningIcon,
  PlusIcon,
  PuzzleIcon,
  RepeatIcon,
  SearchIcon,
  TrashIcon,
  UserIcon,
  WeatherIcon,
  WrenchIcon,
  ZoomInIcon,
  ZoomOutIcon,
  CancelIcon,
} from "../../icons";
import { ItemField } from "./ContentForms";
import { EFFECTS, SOUNDS } from "./LogicEditors";
import { BpCat, CATS, ENTITIES, isEvent, isValue, makeNode, NODES, nodeId, nodeSpec, NodeSpec, PARTICLES, PropSpec, visibleProps, varKeyFor, GAME_VALUES, VAL_COLOR, ValType } from "./blueprints";
import { varKindLabel, varScopeLabel } from "./variables";
import { KNOWN_TAGS } from "./TagsTab";
import { usePlugins } from "../../plugins";

type View = { x: number; y: number; zoom: number };
type Pt = { x: number; y: number };
type Connect = { kind: "exec"; from: string; out: string } | { kind: "dout"; from: string } | { kind: "din"; to: string; pin: string };
type Palette = { sx: number; sy: number; wx: number; wy: number; connect?: Connect };
type Problem = { level: "error" | "warn" | "info"; text: string; node?: string };

export const CAT_ICON: Record<BpCat, React.ReactNode> = {
  event: <LightningIcon size={13} />,
  flow: <BranchIcon size={13} />,
  values: <CodeIcon size={13} />,
  vars: <VarIcon size={13} />,
  block: <BatteryIcon size={13} />,
  world: <WeatherIcon size={13} />,
  player: <UserIcon size={13} />,
  other: <WrenchIcon size={13} />,
};
const KIND_ICON: Record<string, React.ReactNode> = {
  delay: <DelayIcon size={13} />,
  repeat: <RepeatIcon size={13} />,
  cancel: <CancelIcon size={13} />,
  ev_chat: <ChatIcon size={13} />,
  setblock: <CubeIcon size={13} />,
};
const COMMENT_COLORS = ["#f0c94c", "#6cc957", "#5aa8ff", "#b892ff", "#ff7eb6", "#3ec7b5", "#8f95a1"];
const BLOCK_EVENTS = ["ev_block_tick", "ev_block_use", "ev_block_redstone", "ev_click_block", "ev_break", "ev_place", "ev_left_click_block"];
const ABILITY_LABEL: Record<string, string> = {
  energy: t("Energiespeicher"),
  inventory: t("Inventar"),
  tick: t("Tick-Logik"),
  active: t("An/Aus-Zustand"),
  redstone: t("Redstone"),
};

const GRID = 20;
/** Zwischenablage für Knoten (auch zwischen Blueprints) */
let clipboard: { nodes: BpNode[]; links: BpLink[] } | null = null;
const snap = (v: number) => Math.round(v / GRID) * GRID;
const isData = (l: BpLink) => !!l.pin;
/** Typ eines Werte-Knotens bzw. einer Eingangs-Eigenschaft */
const outType = (kind: string): ValType => nodeSpec(kind)?.value ?? "any";

export default function BlueprintEditor({
  project,
  content,
  bp,
  own,
  onChange,
  onDuplicate,
  onRemove,
}: {
  project: Project;
  content: Content;
  bp: Blueprint;
  own: OwnEntry[];
  onChange: (b: Blueprint) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 40, y: 40, zoom: 1 });
  const [sel, setSel] = useState<string[]>([]);
  const selRef = useRef(sel);
  selRef.current = sel;
  const [box, setBox] = useState<{ a: Pt; b: Pt } | null>(null);
  const mouse = useRef<Pt | null>(null);
  // Verlauf für Rückgängig/Wiederholen
  const undoStack = useRef<Blueprint[]>([]);
  const redoStack = useRef<Blueprint[]>([]);
  const lastRecord = useRef<{ tag: string; at: number }>({ tag: "", at: 0 });
  const [, forceHistory] = useState(0);
  const [pins, setPins] = useState<Record<string, Pt>>({});
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 500 });
  const [wire, setWire] = useState<{ a: string; to: Pt; back?: boolean; color?: string } | null>(null);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [libOpen, setLibOpen] = useState(() => localStorage.getItem("anvil.bp.lib") !== "0");
  const [sideOpen, setSideOpen] = useState(() => localStorage.getItem("anvil.bp.side") !== "0");
  const [sideTab, setSideTab] = useState<"details" | "problems">("details");
  const [editComment, setEditComment] = useState<string | null>(null);
  const bpRef = useRef(bp);
  bpRef.current = bp;
  const viewRef = useRef(view);
  viewRef.current = view;
  const comments = bp.comments ?? [];

  const toWorld = useCallback((cx: number, cy: number): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
  }, []);

  // Positionen der Anschlüsse und Größen der Knoten aus dem DOM messen
  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const next: Record<string, Pt> = {};
    el.querySelectorAll<HTMLElement>("[data-pin]").forEach((p) => {
      const r = p.getBoundingClientRect();
      next[p.dataset.pin!] = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    });
    const round = (o: Record<string, Pt>) => JSON.stringify(Object.entries(o).map(([k, v]) => [k, Math.round(v.x), Math.round(v.y)]));
    if (round(next) !== round(pins)) setPins(next);
    const sz: Record<string, { w: number; h: number }> = {};
    el.querySelectorAll<HTMLElement>("[data-node]").forEach((n) => (sz[n.dataset.node!] = { w: n.offsetWidth, h: n.offsetHeight }));
    if (JSON.stringify(sz) !== JSON.stringify(sizes)) setSizes(sz);
    const cs = { w: el.clientWidth, h: el.clientHeight };
    if (cs.w !== canvasSize.w || cs.h !== canvasSize.h) setCanvasSize(cs);
  });

  /** Zustand vor einer Änderung merken; gleiche Art kurz hintereinander zählt als ein Schritt */
  const record = (tag = "") => {
    const now = Date.now();
    if (tag && tag === lastRecord.current.tag && now - lastRecord.current.at < 1000) {
      lastRecord.current.at = now;
      return;
    }
    lastRecord.current = { tag, at: now };
    undoStack.current.push(structuredClone(bpRef.current));
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    forceHistory((x) => x + 1);
  };
  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(structuredClone(bpRef.current));
    lastRecord.current = { tag: "", at: 0 };
    onChange(prev);
    setSel((s) => s.filter((id) => prev.nodes.some((n) => n.id === id)));
    forceHistory((x) => x + 1);
  };
  const redo = () => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(structuredClone(bpRef.current));
    lastRecord.current = { tag: "", at: 0 };
    onChange(next);
    forceHistory((x) => x + 1);
  };

  const update = (patch: Partial<Blueprint>, tag = "") => {
    record(tag);
    onChange({ ...bpRef.current, ...patch });
  };
  /** ohne Verlaufseintrag (z. B. während des Ziehens) */
  const updateRaw = (patch: Partial<Blueprint>) => onChange({ ...bpRef.current, ...patch });
  const setNode = (id: string, patch: Partial<BpNode>, tag = "") => update({ nodes: bpRef.current.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }, tag);
  const setComments = (list: BpComment[], tag = "") => update({ comments: list }, tag);
  const removeNodes = (ids: string[]) => {
    if (!ids.length) return;
    update({ nodes: bpRef.current.nodes.filter((n) => !ids.includes(n.id)), links: bpRef.current.links.filter((l) => !ids.includes(l.from) && !ids.includes(l.to)) });
    setSel([]);
  };
  /** Knoten samt Verbindungen untereinander einfügen */
  const pasteNodes = (nodes: BpNode[], links: BpLink[], dx: number, dy: number) => {
    if (!nodes.length) return;
    const map = new Map(nodes.map((n) => [n.id, nodeId()]));
    const copies = nodes.map((n) => ({ ...structuredClone(n), id: map.get(n.id)!, x: snap(n.x + dx), y: snap(n.y + dy) }));
    const newLinks = links.filter((l) => map.has(l.from) && map.has(l.to)).map((l) => ({ ...l, from: map.get(l.from)!, to: map.get(l.to)! }));
    update({ nodes: [...bpRef.current.nodes, ...copies], links: [...bpRef.current.links, ...newLinks] });
    setSel(copies.map((c) => c.id));
  };
  const duplicateNodes = (ids: string[]) => pasteNodes(bpRef.current.nodes.filter((n) => ids.includes(n.id)), bpRef.current.links, 40, 40);
  const copyNodes = (ids: string[]) => {
    const nodes = bpRef.current.nodes.filter((n) => ids.includes(n.id));
    if (!nodes.length) return;
    clipboard = { nodes: structuredClone(nodes), links: bpRef.current.links.filter((l) => ids.includes(l.from) && ids.includes(l.to)) };
  };
  const paste = () => {
    if (!clipboard) return;
    const minX = Math.min(...clipboard.nodes.map((n) => n.x));
    const minY = Math.min(...clipboard.nodes.map((n) => n.y));
    const at = mouse.current ?? { x: minX + 40, y: minY + 40 };
    pasteNodes(clipboard.nodes, clipboard.links, at.x - minX, at.y - minY);
  };
  /** Werte-Verbindung setzen (ein Eingang hat höchstens eine Quelle) */
  const withData = (links: BpLink[], from: string, to: string, pin: string) => [...links.filter((l) => !(l.to === to && l.pin === pin)), { from, out: "value", to, pin }];
  const addNode = (kind: string, at: Pt, connect?: Connect) => {
    const n = makeNode(kind, snap(at.x), snap(at.y));
    let links = [...bpRef.current.links];
    const spec = nodeSpec(kind)!;
    if (connect?.kind === "exec" && !isEvent(kind) && !isValue(kind)) links.push({ from: connect.from, out: connect.out, to: n.id, pin: "" });
    if (connect?.kind === "dout") {
      const first = spec.props.find((p) => p.pin);
      if (first) links = withData(links, connect.from, n.id, first.key);
    }
    if (connect?.kind === "din" && isValue(kind)) {
      links = withData(links, n.id, connect.to, connect.pin);
      // links vom Eingang hinlegen
      n.x = snap(at.x - 240);
    }
    update({ nodes: [...bpRef.current.nodes, n], links });
    setSel([n.id]);
    setPalette(null);
  };
  const removeLink = (l: BpLink) => update({ links: bpRef.current.links.filter((x) => x !== l) });
  const center = (): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return toWorld(r.left + r.width / 2 - 115, r.top + r.height / 2 - 60);
  };

  useUndoTarget({ undo, redo, canUndo: () => undoStack.current.length > 0, canRedo: () => redoStack.current.length > 0, focused: () => !!canvasRef.current?.isConnected });

  // Tastatur: Entf, Strg+Z/Y/C/V/D/A, Leertaste = Knoten suchen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!canvasRef.current?.isConnected) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const ids = selRef.current;
      if (ctrl && (k === "z" || k === "y")) {
        // Rückgängig/Wiederholen läuft über die Leiste oben (undo.ts)
      } else if (ctrl && k === "a") {
        e.preventDefault();
        setSel(bpRef.current.nodes.map((n) => n.id));
      } else if (ctrl && k === "c" && ids.length) {
        e.preventDefault();
        copyNodes(ids);
      } else if (ctrl && k === "x" && ids.length) {
        e.preventDefault();
        copyNodes(ids);
        removeNodes(ids);
      } else if (ctrl && k === "v") {
        e.preventDefault();
        paste();
      } else if (ctrl && k === "d" && ids.length) {
        e.preventDefault();
        duplicateNodes(ids);
      } else if ((e.key === "Delete" || e.key === "Backspace") && ids.length) {
        e.preventDefault();
        removeNodes(ids);
      } else if (e.key === " " && mouse.current && !palette) {
        e.preventDefault();
        const r = canvasRef.current.getBoundingClientRect();
        const v = viewRef.current;
        setPalette({ sx: mouse.current.x * v.zoom + v.x, sy: mouse.current.y * v.zoom + v.y, wx: mouse.current.x, wy: mouse.current.y });
        void r;
      } else if (e.key === "Escape") setSel([]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Zoomen mit Mausrad um den Mauszeiger
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest(".bp-palette, select, textarea")) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const v = viewRef.current;
      const zoom = Math.min(2, Math.max(0.25, v.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setView({ zoom, x: mx - ((mx - v.x) / v.zoom) * zoom, y: my - ((my - v.y) / v.zoom) * zoom });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function zoomBy(f: number) {
    const el = canvasRef.current!;
    const r = el.getBoundingClientRect();
    const v = view;
    const zoom = Math.min(2, Math.max(0.25, v.zoom * f));
    const mx = r.width / 2;
    const my = r.height / 2;
    setView({ zoom, x: mx - ((mx - v.x) / v.zoom) * zoom, y: my - ((my - v.y) / v.zoom) * zoom });
  }

  /** Alles (oder eine Liste von Knoten) ins Bild holen */
  function fit(only?: BpNode[], b = bpRef.current) {
    const el = canvasRef.current;
    const list = only ?? b.nodes;
    if (!el || list.length === 0) return setView({ x: 40, y: 40, zoom: 1 });
    const r = el.getBoundingClientRect();
    const sz = (n: BpNode) => sizes[n.id] ?? { w: 240, h: 160 };
    const boxes = [...list.map((n) => ({ x: n.x, y: n.y, w: sz(n).w, h: sz(n).h })), ...(only ? [] : (b.comments ?? []))];
    const minX = Math.min(...boxes.map((n) => n.x)) - 40;
    const minY = Math.min(...boxes.map((n) => n.y)) - 40;
    const w = Math.max(...boxes.map((n) => n.x + n.w)) + 40 - minX;
    const h = Math.max(...boxes.map((n) => n.y + n.h)) + 40 - minY;
    const zoom = Math.min(1.1, Math.max(0.25, Math.min(r.width / w, r.height / h)));
    setView({ zoom, x: -minX * zoom + (r.width - w * zoom) / 2, y: -minY * zoom + (r.height - h * zoom) / 2 });
  }
  const focusNode = (id: string) => {
    const n = bpRef.current.nodes.find((x) => x.id === id);
    if (!n) return;
    setSel([id]);
    const v = viewRef.current;
    setView({ ...v, x: canvasSize.w / 2 - (n.x + 115) * v.zoom, y: canvasSize.h / 2 - (n.y + 60) * v.zoom });
  };

  useEffect(() => {
    // beim Öffnen alles zeigen (nach dem ersten Messen)
    const id = requestAnimationFrame(() => requestAnimationFrame(() => fit()));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Knoten ordnen: Spalten nach dem Ablauf, Werte links von ihrem Verbraucher */
  function arrange() {
    const b = bpRef.current;
    const col = new Map<string, number>();
    const execLinks = b.links.filter((l) => !isData(l));
    b.nodes.filter((n) => isEvent(n.kind)).forEach((n) => col.set(n.id, 0));
    for (let round = 0; round < b.nodes.length + 2; round++) {
      let changed = false;
      for (const l of execLinks) {
        const c = col.get(l.from);
        if (c === undefined) continue;
        if ((col.get(l.to) ?? -1) < c + 1 && c + 1 < 60) {
          col.set(l.to, c + 1);
          changed = true;
        }
      }
      if (!changed) break;
    }
    // Werte-Knoten: eine Spalte vor dem Verbraucher; unverbundene Ablauf-Knoten ans Ende
    for (let round = 0; round < 12; round++) {
      for (const l of b.links.filter(isData)) {
        const c = col.get(l.to);
        if (c !== undefined) col.set(l.from, Math.min(col.get(l.from) ?? 999, c - 1));
      }
    }
    const maxCol = Math.max(0, ...col.values());
    b.nodes.forEach((n) => !col.has(n.id) && col.set(n.id, maxCol + 1));
    const min = Math.min(0, ...col.values());
    const columns = new Map<number, BpNode[]>();
    for (const n of b.nodes) {
      const c = col.get(n.id)! - min;
      columns.set(c, [...(columns.get(c) ?? []), n]);
    }
    const pos = new Map<string, Pt>();
    for (const [c, list] of [...columns.entries()].sort((a, b2) => a[0] - b2[0])) {
      let y = 0;
      for (const n of list.sort((a, b2) => a.y - b2.y)) {
        pos.set(n.id, { x: c * 320, y: snap(y) });
        y += (sizes[n.id]?.h ?? 140) + 40;
      }
    }
    const next = { ...b, nodes: b.nodes.map((n) => ({ ...n, ...pos.get(n.id)! })) };
    update({ nodes: next.nodes });
    requestAnimationFrame(() => requestAnimationFrame(() => fit(undefined, next)));
  }

  function addComment() {
    const b = bpRef.current;
    const chosen = b.nodes.filter((n) => selRef.current.includes(n.id));
    let rect: { x: number; y: number; w: number; h: number };
    if (chosen.length) {
      const x0 = Math.min(...chosen.map((n) => n.x)) - 30;
      const y0 = Math.min(...chosen.map((n) => n.y)) - 60;
      const x1 = Math.max(...chosen.map((n) => n.x + (sizes[n.id]?.w ?? 240))) + 30;
      const y1 = Math.max(...chosen.map((n) => n.y + (sizes[n.id]?.h ?? 140))) + 30;
      rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    } else {
      const c = center();
      rect = { x: snap(c.x - 100), y: snap(c.y - 60), w: 440, h: 260 };
    }
    const id = nodeId();
    setComments([...(b.comments ?? []), { id, ...rect, text: t("Kommentar"), color: COMMENT_COLORS[(b.comments?.length ?? 0) % COMMENT_COLORS.length] }]);
    setEditComment(id);
  }

  // ---- Ziehen: Hintergrund verschieben ----
  function onCanvasDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.button !== 1) return;
    if ((e.target as HTMLElement).closest(".bp-node, .bp-palette, .bp-wire-hit, .bp-comment-head, .bp-comment-resize, .bp-minimap")) return;
    setPalette(null);
    if (e.button === 0 && (e.shiftKey || e.ctrlKey)) {
      // Rahmen aufziehen → Mehrfachauswahl
      const a = toWorld(e.clientX, e.clientY);
      const keep = e.ctrlKey ? [...selRef.current] : [];
      setBox({ a, b: a });
      const move = (ev: PointerEvent) => {
        const b = toWorld(ev.clientX, ev.clientY);
        setBox({ a, b });
        const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
        const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
        const hit = bpRef.current.nodes.filter((n) => n.x + (sizes[n.id]?.w ?? 230) > x0 && n.x < x1 && n.y + 60 > y0 && n.y < y1).map((n) => n.id);
        setSel([...new Set([...keep, ...hit])]);
      };
      const up = () => {
        setBox(null);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }
    setSel([]);
    const start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    const move = (ev: PointerEvent) => setView((v) => ({ ...v, x: start.vx + ev.clientX - start.x, y: start.vy + ev.clientY - start.y }));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /** Knoten (und optional Kommentare) gemeinsam verschieben */
  function dragItems(e: React.PointerEvent, nodeIds: string[], commentIds: string[]) {
    const start = toWorld(e.clientX, e.clientY);
    const b = bpRef.current;
    const origins = new Map(b.nodes.filter((x) => nodeIds.includes(x.id)).map((x) => [x.id, { x: x.x, y: x.y }]));
    const corigins = new Map((b.comments ?? []).filter((c) => commentIds.includes(c.id)).map((c) => [c.id, { x: c.x, y: c.y }]));
    let moved = false;
    const move = (ev: PointerEvent) => {
      const p = toWorld(ev.clientX, ev.clientY);
      const dx = snap(p.x - start.x);
      const dy = snap(p.y - start.y);
      if (!moved && (dx || dy)) {
        record();
        moved = true;
      }
      if (!moved) return;
      const cur = bpRef.current;
      updateRaw({
        nodes: cur.nodes.map((x) => (origins.has(x.id) ? { ...x, x: origins.get(x.id)!.x + dx, y: origins.get(x.id)!.y + dy } : x)),
        comments: (cur.comments ?? []).map((c) => (corigins.has(c.id) ? { ...c, x: corigins.get(c.id)!.x + dx, y: corigins.get(c.id)!.y + dy } : c)),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ---- Ziehen: Knoten bewegen ----
  function onNodeDown(e: React.PointerEvent, n: BpNode) {
    if (e.button !== 0) return;
    const el = e.target as HTMLElement;
    if (el.closest("input, select, textarea, button, .bp-pin, .item-field")) return;
    e.stopPropagation();
    setPalette(null);
    let ids = selRef.current;
    if (e.shiftKey || e.ctrlKey) {
      ids = ids.includes(n.id) ? ids.filter((x) => x !== n.id) : [...ids, n.id];
      setSel(ids);
      return;
    }
    if (!ids.includes(n.id)) {
      ids = [n.id];
      setSel(ids);
    }
    dragItems(e, ids, []);
  }

  function onCommentDown(e: React.PointerEvent, c: BpComment) {
    if (e.button !== 0 || (e.target as HTMLElement).closest("input, button")) return;
    e.stopPropagation();
    // Knoten im Rahmen ziehen mit
    const inside = bpRef.current.nodes.filter((n) => n.x >= c.x && n.y >= c.y && n.x + (sizes[n.id]?.w ?? 230) <= c.x + c.w + 4 && n.y + 30 <= c.y + c.h).map((n) => n.id);
    dragItems(e, inside, [c.id]);
  }

  function onCommentResize(e: React.PointerEvent, c: BpComment) {
    e.stopPropagation();
    const start = toWorld(e.clientX, e.clientY);
    record();
    const move = (ev: PointerEvent) => {
      const p = toWorld(ev.clientX, ev.clientY);
      updateRaw({ comments: (bpRef.current.comments ?? []).map((x) => (x.id === c.id ? { ...x, w: Math.max(160, snap(c.w + p.x - start.x)), h: Math.max(80, snap(c.h + p.y - start.y)) } : x)) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /** Linie ziehen. `pin`: Schlüssel des Anschlusses, an dem gezogen wird */
  function startWire(e: React.PointerEvent, pinKey: string, back: boolean, color: string, onDrop: (hit: HTMLElement | null, ev: PointerEvent) => void) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setWire({ a: pinKey, to: toWorld(e.clientX, e.clientY), back, color });
    const move = (ev: PointerEvent) => setWire({ a: pinKey, to: toWorld(ev.clientX, ev.clientY), back, color });
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setWire(null);
      onDrop(document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null, ev);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  const paletteAt = (ev: PointerEvent, connect: Connect) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const w = toWorld(ev.clientX, ev.clientY);
    setPalette({ sx: ev.clientX - r.left, sy: ev.clientY - r.top, wx: w.x, wy: w.y, connect });
  };

  // Ablauf-Ausgang → Knoten
  function onPinDown(e: React.PointerEvent, from: string, out: string) {
    startWire(e, `out:${from}:${out}`, false, "", (hit, ev) => {
      const target = hit?.closest<HTMLElement>("[data-node]")?.dataset.node;
      const cur = bpRef.current;
      if (target && target !== from) {
        const tn = cur.nodes.find((n) => n.id === target);
        if (!tn || isEvent(tn.kind) || isValue(tn.kind)) return;
        if (cur.links.some((l) => l.from === from && l.out === out && l.to === target && !l.pin)) return;
        update({ links: [...cur.links, { from, out, to: target, pin: "" }] });
      } else if (!target && hit?.closest(".bp-canvas")) paletteAt(ev, { kind: "exec", from, out });
    });
  }

  // Werte-Ausgang → Eingang
  function onDataOutDown(e: React.PointerEvent, from: string) {
    const color = VAL_COLOR[outType(bpRef.current.nodes.find((n) => n.id === from)?.kind ?? "")];
    startWire(e, `dout:${from}`, false, color, (hit, ev) => {
      const din = hit?.closest<HTMLElement>("[data-din]")?.dataset.din;
      if (din) {
        const [to, pin] = din.split(":");
        if (to !== from) update({ links: withData(bpRef.current.links, from, to, pin) });
        return;
      }
      const target = hit?.closest<HTMLElement>("[data-node]")?.dataset.node;
      if (target && target !== from) {
        // auf den Knoten statt auf den Punkt → erster freier Eingang
        const tn = bpRef.current.nodes.find((n) => n.id === target);
        const spec = tn && nodeSpec(tn.kind);
        const free = spec && visibleProps(spec, tn!.props).find((p) => p.pin && !bpRef.current.links.some((l) => l.to === target && l.pin === p.key));
        if (free) update({ links: withData(bpRef.current.links, from, target, free.key) });
      } else if (!target && hit?.closest(".bp-canvas")) paletteAt(ev, { kind: "dout", from });
    });
  }

  // Eingang ← Wert (rückwärts ziehen)
  function onDataInDown(e: React.PointerEvent, to: string, pin: string, ty: ValType) {
    startWire(e, `din:${to}:${pin}`, true, VAL_COLOR[ty], (hit, ev) => {
      const src = hit?.closest<HTMLElement>("[data-node]")?.dataset.node;
      const sn = src && bpRef.current.nodes.find((n) => n.id === src);
      if (sn && isValue(sn.kind) && src !== to) update({ links: withData(bpRef.current.links, src!, to, pin) });
      else if (!src && hit?.closest(".bp-canvas")) paletteAt(ev, { kind: "din", to, pin });
    });
  }

  const clampPalette = (p: Palette): Palette => ({ ...p, sx: Math.max(8, Math.min(p.sx, canvasSize.w - 290)), sy: Math.max(8, Math.min(p.sy, canvasSize.h - 400)) });

  function openPaletteAt(clientX: number, clientY: number) {
    const r = canvasRef.current!.getBoundingClientRect();
    const w = toWorld(clientX, clientY);
    setPalette({ sx: clientX - r.left, sy: clientY - r.top, wx: w.x, wy: w.y });
  }

  function nodeMenu(n: BpNode): MenuItem[] {
    const ids = selRef.current.includes(n.id) ? selRef.current : [n.id];
    const many = ids.length > 1;
    return [
      { label: many ? t("{n} Knoten duplizieren", { n: ids.length }) : t("Duplizieren"), icon: <CopyIcon size={15} />, hint: t("Strg D"), onClick: () => duplicateNodes(ids) },
      { label: t("Kopieren"), icon: <ClipboardIcon size={15} />, hint: t("Strg C"), onClick: () => copyNodes(ids) },
      { label: t("Kommentar um Auswahl"), icon: <ChatIcon size={15} />, onClick: addComment },
      {
        label: t("Verbindungen lösen"),
        icon: <BranchIcon size={15} />,
        disabled: !bp.links.some((l) => ids.includes(l.from) || ids.includes(l.to)),
        onClick: () => update({ links: bpRef.current.links.filter((l) => !ids.includes(l.from) && !ids.includes(l.to)) }),
      },
      "separator",
      { label: many ? t("{n} Knoten entfernen", { n: ids.length }) : t("Entfernen"), icon: <TrashIcon size={15} />, danger: true, hint: t("Entf"), onClick: () => removeNodes(ids) },
    ];
  }

  const curve = (a: Pt, b: Pt) => {
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  };

  // ---- Probleme finden ----
  const problems = useMemo<Problem[]>(() => {
    const out: Problem[] = [];
    const evs = bp.nodes.filter((n) => isEvent(n.kind));
    if (!evs.length && bp.nodes.length) out.push({ level: "error", text: t("Ein Blueprint braucht ein Ereignis als Start.") });
    const reach = new Set<string>();
    const stack = evs.map((n) => n.id);
    while (stack.length) {
      const id = stack.pop()!;
      if (reach.has(id)) continue;
      reach.add(id);
      bp.links.filter((l) => l.from === id && !isData(l)).forEach((l) => stack.push(l.to));
    }
    for (const n of bp.nodes) {
      const spec = nodeSpec(n.kind);
      if (!spec) {
        if (n.kind.includes(":")) out.push({ level: "error", text: t("Ein Knoten aus dem Plugin „{p}“ fehlt – Plugin installieren oder einschalten.", { p: n.kind.split(":")[0] }) });
        continue;
      }
      if (isValue(n.kind)) {
        if (!bp.links.some((l) => l.from === n.id && isData(l))) out.push({ level: "info", text: t("„{n}“ ist mit nichts verbunden.", { n: spec.label }), node: n.id });
      } else if (!reach.has(n.id)) out.push({ level: "warn", text: t("„{n}“ hängt an keinem Ereignis und wird nie ausgeführt.", { n: spec.label }), node: n.id });
    }
    const blockNodes = bp.nodes.filter((n) => n.kind.startsWith("blk_") || n.kind.startsWith("val_blk"));
    if (blockNodes.length && !evs.some((n) => BLOCK_EVENTS.includes(n.kind)))
      out.push({ level: "warn", text: t("Block-Knoten wirken auf den Block an der Stelle des Ereignisses – nimm dafür ein Block-Ereignis wie „Block-Tick“."), node: blockNodes[0].id });
    // Fähigkeiten der Blöcke prüfen
    for (const ev of evs.filter((n) => n.kind.startsWith("ev_block_"))) {
      const id = (ev.props.target ?? "").split(":").pop() ?? "";
      if (!id) continue;
      const blk = content.blocks.find((b) => b.id === id);
      if (!blk) {
        out.push({ level: "error", text: t("Block „{b}“ gibt es nicht.", { b: id }), node: ev.id });
        continue;
      }
      const has = (k: string) => (blk.abilities ?? []).some((a) => a.kind === k);
      if (ev.kind === "ev_block_tick" && !has("tick")) out.push({ level: "error", text: t("„{b}“ hat keine Tick-Logik – füge die Fähigkeit im Block hinzu.", { b: blk.nameDe || blk.nameEn || blk.id }), node: ev.id });
      const needed = new Set(blockNodes.map((n) => nodeSpec(n.kind)?.needs).filter((x): x is string => !!x && x !== "tick"));
      for (const k of needed)
        if (!has(k)) out.push({ level: "warn", text: t("„{b}“ braucht die Fähigkeit „{a}“.", { b: blk.nameDe || blk.nameEn || blk.id, a: ABILITY_LABEL[k] ?? k }), node: blockNodes.find((n) => nodeSpec(n.kind)?.needs === k)?.id });
    }
    return out;
  }, [bp, content.blocks]);
  const errors = problems.filter((p) => p.level !== "info").length;

  const selected = sel.length === 1 ? bp.nodes.find((n) => n.id === sel[0]) : undefined;
  const nodeById = useMemo(() => new Map(bp.nodes.map((n) => [n.id, n])), [bp.nodes]);

  // ---- Übersichtskarte ----
  const mini = useMemo(() => {
    if (!bp.nodes.length) return null;
    const boxes = bp.nodes.map((n) => ({ n, x: n.x, y: n.y, w: sizes[n.id]?.w ?? 230, h: sizes[n.id]?.h ?? 120 }));
    const vx0 = -view.x / view.zoom,
      vy0 = -view.y / view.zoom;
    const vw = canvasSize.w / view.zoom,
      vh = canvasSize.h / view.zoom;
    const x0 = Math.min(vx0, ...boxes.map((b) => b.x)) - 40;
    const y0 = Math.min(vy0, ...boxes.map((b) => b.y)) - 40;
    const x1 = Math.max(vx0 + vw, ...boxes.map((b) => b.x + b.w)) + 40;
    const y1 = Math.max(vy0 + vh, ...boxes.map((b) => b.y + b.h)) + 40;
    const W = 190,
      H = 110;
    const s = Math.min(W / (x1 - x0), H / (y1 - y0));
    return { boxes, s, x0, y0, view: { x: (vx0 - x0) * s, y: (vy0 - y0) * s, w: vw * s, h: vh * s } };
  }, [bp.nodes, sizes, view, canvasSize]);
  function onMiniDown(e: React.PointerEvent) {
    if (!mini) return;
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    const go = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      const wx = (cx - r.left) / mini.s + mini.x0;
      const wy = (cy - r.top) / mini.s + mini.y0;
      const v = viewRef.current;
      setView({ ...v, x: canvasSize.w / 2 - wx * v.zoom, y: canvasSize.h / 2 - wy * v.zoom });
    };
    go(e.clientX, e.clientY);
    const move = (ev: PointerEvent) => go(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const toggleLib = () => {
    localStorage.setItem("anvil.bp.lib", libOpen ? "0" : "1");
    setLibOpen(!libOpen);
  };
  const toggleSide = () => {
    localStorage.setItem("anvil.bp.side", sideOpen ? "0" : "1");
    setSideOpen(!sideOpen);
  };

  return (
    <div className="panel bp-panel">
      <div className="bp-toolbar">
        <span className="sub-icon">
          <BlueprintIcon size={16} />
        </span>
        <BetaBadge feature="blueprints" />
        <input className="input bp-name" value={bp.name} onChange={(e) => update({ name: e.target.value }, "name")} aria-label={t("Name")} placeholder={t("Name")} />
        {bp.owner && <span className="chip accent">{t("gehört zu: {o}", { o: content.blocks.find((b) => b.id === bp.owner)?.nameDe || bp.owner })}</span>}
        <span className="row gap-6 bp-enabled">
          <Toggle label={t("Aktiv")} checked={bp.enabled} onChange={(v) => update({ enabled: v })} />
          <span className="small">{bp.enabled ? t("Aktiv") : t("Aus")}</span>
        </span>
        <span className="grow" />
        <button
          className={`chip-btn ${errors ? "warn" : "ok"}`}
          onClick={() => {
            setSideOpen(true);
            setSideTab("problems");
          }}
        >
          {errors ? <AlertIcon size={12} /> : <CheckIcon size={12} />} {errors ? t("{n} Probleme", { n: errors }) : t("Keine Probleme")}
        </button>
        <button
          className="btn small"
          onClick={() => {
            const r = canvasRef.current!.getBoundingClientRect();
            openPaletteAt(r.left + r.width / 2 - 130, r.top + 60);
          }}
        >
          <PlusIcon size={13} /> {t("Knoten")}
        </button>
        <button className="btn small" onClick={addComment} data-tip={t("Rahmen mit Überschrift – um die Auswahl herum")}>
          <ChatIcon size={13} /> {t("Kommentar")}
        </button>
        <button className="btn small" onClick={arrange} disabled={!bp.nodes.length} data-tip={t("Knoten ordentlich in Spalten anordnen")}>
          <GridIcon size={13} /> {t("Ordnen")}
        </button>
        <div className="bp-zoom">
          <button className="icon-btn" onClick={undo} disabled={!undoStack.current.length} aria-label={t("Rückgängig")} data-tip={t("Rückgängig (Strg Z)")}>
            <UndoIcon size={15} />
          </button>
          <button className="icon-btn" onClick={redo} disabled={!redoStack.current.length} aria-label={t("Wiederherstellen")} data-tip={t("Wiederherstellen (Strg Y)")}>
            <RedoIcon size={15} />
          </button>
        </div>

        <button className="icon-btn" onClick={onDuplicate} aria-label={t("Duplizieren")} data-tip={t("Blueprint duplizieren")}>
          <CopyIcon size={15} />
        </button>
        <button className="icon-btn danger" onClick={onRemove} aria-label={t("Entfernen")} data-tip={t("Blueprint entfernen")}>
          <TrashIcon size={15} />
        </button>
      </div>

      <div className="bp-body">
        {libOpen ? (
          <BpLibrary onAdd={(k) => addNode(k, center())} onClose={toggleLib} />
        ) : (
          <button className="bp-side-tab left" onClick={toggleLib} data-tip={t("Bibliothek zeigen")}>
            <ChevronIcon size={13} />
            <span>{t("Bibliothek")}</span>
          </button>
        )}
        <div
          ref={canvasRef}
          className="bp-canvas"
          onPointerDown={onCanvasDown}
          onPointerMove={(e) => (mouse.current = toWorld(e.clientX, e.clientY))}
          onPointerLeave={() => (mouse.current = null)}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest(".bp-node, .bp-palette, .bp-comment-head, .bp-minimap")) return;
            openPaletteAt(e.clientX, e.clientY);
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("anvil/bp-node")) e.preventDefault();
          }}
          onDrop={(e) => {
            const k = e.dataTransfer.getData("anvil/bp-node");
            if (!k) return;
            e.preventDefault();
            addNode(k, toWorld(e.clientX - 40, e.clientY - 16));
          }}
          onContextMenu={(e) => {
            if ((e.target as HTMLElement).closest(".bp-node, .bp-palette, .bp-wire-hit, .bp-comment-head")) return;
            e.preventDefault();
            e.stopPropagation();
            (e.nativeEvent as MouseEvent & { __anvilMenu?: boolean }).__anvilMenu = true;
            openPaletteAt(e.clientX, e.clientY);
          }}
          style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${GRID * view.zoom}px ${GRID * view.zoom}px` }}
        >
          <div className="bp-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
            {comments.map((c) => (
              <div key={c.id} className="bp-comment" style={{ left: c.x, top: c.y, width: c.w, height: c.h, ["--cc" as string]: c.color || COMMENT_COLORS[0] }}>
                <div
                  className="bp-comment-head"
                  onPointerDown={(e) => onCommentDown(e, c)}
                  onDoubleClick={() => setEditComment(c.id)}
                  onContextMenu={(e) =>
                    openMenu(e, [
                      { label: t("Umbenennen"), icon: <ChatIcon size={15} />, onClick: () => setEditComment(c.id) },
                      ...COMMENT_COLORS.map((col) => ({ label: col === c.color ? `● ${t("Farbe")}` : t("Farbe"), icon: <span className="bp-color-dot" style={{ background: col }} />, onClick: () => setComments(comments.map((x) => (x.id === c.id ? { ...x, color: col } : x))) })),
                      "separator" as const,
                      { label: t("Kommentar entfernen"), icon: <TrashIcon size={15} />, danger: true, onClick: () => setComments(comments.filter((x) => x.id !== c.id)) },
                    ])
                  }
                >
                  <ChatIcon size={13} />
                  {editComment === c.id ? (
                    <input
                      className="bp-comment-input"
                      autoFocus
                      defaultValue={c.text}
                      onBlur={(e) => {
                        setComments(comments.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)));
                        setEditComment(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  ) : (
                    <span className="grow">{c.text}</span>
                  )}
                </div>
                <span className="bp-comment-resize" onPointerDown={(e) => onCommentResize(e, c)} />
              </div>
            ))}
            <svg className="bp-wires" width="1" height="1">
              {bp.links.map((l, i) => {
                const data = isData(l);
                const a = pins[data ? `dout:${l.from}` : `out:${l.from}:${l.out}`];
                const b = pins[data ? `din:${l.to}:${l.pin}` : `in:${l.to}`];
                if (!a || !b) return null;
                const d = curve(a, b);
                const fromKind = nodeById.get(l.from)?.kind ?? "";
                const color = data ? VAL_COLOR[outType(fromKind)] : undefined;
                const hot = sel.includes(l.from) || sel.includes(l.to);
                return (
                  <g key={i}>
                    <path
                      d={d}
                      className={`bp-wire ${data ? "data" : ""} ${hot ? "hot" : ""} ${l.out === "false" || l.out === "fail" ? "no" : l.out === "true" || l.out === "ok" ? "yes" : ""} ${isEvent(fromKind) ? "ev" : ""}`}
                      style={color ? { stroke: color } : undefined}
                    />
                    <path
                      d={d}
                      className="bp-wire-hit"
                      onClick={() => removeLink(l)}
                      onContextMenu={(e) => openMenu(e, [{ label: t("Verbindung entfernen"), icon: <TrashIcon size={15} />, danger: true, onClick: () => removeLink(l) }])}
                    >
                      <title>{t("Klicken zum Entfernen")}</title>
                    </path>
                  </g>
                );
              })}
              {wire && pins[wire.a] && <path d={wire.back ? curve(wire.to, pins[wire.a]) : curve(pins[wire.a], wire.to)} className="bp-wire drawing" style={wire.color ? { stroke: wire.color } : undefined} />}
            </svg>
            {box && (
              <div
                className="bp-box"
                style={{ left: Math.min(box.a.x, box.b.x), top: Math.min(box.a.y, box.b.y), width: Math.abs(box.b.x - box.a.x), height: Math.abs(box.b.y - box.a.y) }}
              />
            )}
            {bp.nodes.map((n) => {
              const spec = nodeSpec(n.kind);
              if (!spec) return null;
              const value = isValue(n.kind);
              const vt = spec.value ?? "any";
              return (
                <div
                  key={n.id}
                  data-node={n.id}
                  className={`bp-node cat-${spec.cat} ${value ? "value" : ""} ${sel.includes(n.id) ? "selected" : ""}`}
                  style={{ left: n.x, top: n.y }}
                  onPointerDown={(e) => onNodeDown(e, n)}
                  onContextMenu={(e) => {
                    if (!selRef.current.includes(n.id)) setSel([n.id]);
                    openMenu(e, nodeMenu(n));
                  }}
                >
                  <div className="bp-node-head">
                    {!isEvent(n.kind) && !value && <span className="bp-pin in" data-pin={`in:${n.id}`} />}
                    <span className="bp-node-icon">{KIND_ICON[n.kind] ?? CAT_ICON[spec.cat]}</span>
                    <span className="bp-node-title">{spec.label}</span>
                    {spec.plugin && <PuzzleIcon size={11} />}
                    {spec.outs.length === 1 && <OutPin node={n.id} out={spec.outs[0].id} onDown={onPinDown} />}
                    {value && <span className="bp-pin dout" data-pin={`dout:${n.id}`} style={{ borderColor: VAL_COLOR[vt] }} onPointerDown={(e) => onDataOutDown(e, n.id)} />}
                  </div>
                  {spec.desc && !value && <div className="bp-node-desc">{spec.desc}</div>}
                  <NodeFields
                    project={project}
                    content={content}
                    own={own}
                    spec={spec}
                    node={n}
                    links={bp.links}
                    nodeById={nodeById}
                    onPinDown={onDataInDown}
                    onUnlink={(key) => update({ links: bpRef.current.links.filter((l) => !(l.to === n.id && l.pin === key)) })}
                    onChange={(props) => setNode(n.id, { props }, `props:${n.id}`)}
                  />
                  {spec.outs.length > 1 && (
                    <div className="bp-outs">
                      {spec.outs.map((o) => (
                        <div key={o.id} className={`bp-out out-${o.id}`}>
                          <span>{o.label}</span>
                          <OutPin node={n.id} out={o.id} onDown={onPinDown} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {bp.nodes.length === 0 && (
            <div className="bp-empty muted">
              <BlueprintIcon size={28} />
              <div>{t("Ziehe einen Knoten aus der Bibliothek hierher – oder Doppelklick auf die Fläche")}</div>
            </div>
          )}

          {palette && <NodePalette at={clampPalette(palette)} connect={palette.connect} nodeById={nodeById} onPick={(k) => addNode(k, { x: palette.wx, y: palette.wy }, palette.connect)} onClose={() => setPalette(null)} />}

          <div className="bp-legend small">
            {(["num", "bool", "text"] as ValType[]).map((k) => (
              <span key={k}>
                <span className="bp-legend-dot" style={{ borderColor: VAL_COLOR[k] }} />
                {k === "num" ? t("Zahl") : k === "bool" ? t("Ja/Nein") : t("Text")}
              </span>
            ))}
            <span className="muted">
              {sel.length > 1 ? t("{n} Knoten ausgewählt · Strg C kopieren · Strg D duplizieren · Entf löschen", { n: sel.length }) : t("Leertaste oder Doppelklick: Knoten suchen · Umschalt + Ziehen: auswählen")}
            </span>
          </div>
<div className="bp-zoom bp-float-zoom">
          <button className="icon-btn" onClick={() => zoomBy(1 / 1.2)} aria-label={t("Verkleinern")} data-tip={t("Verkleinern")}>
            <ZoomOutIcon size={15} />
          </button>
          <span className="mono small">{Math.round(view.zoom * 100)}%</span>
          <button className="icon-btn" onClick={() => zoomBy(1.2)} aria-label={t("Vergrößern")} data-tip={t("Vergrößern")}>
            <ZoomInIcon size={15} />
          </button>
          <button className="icon-btn" onClick={() => fit()} aria-label={t("Alles zeigen")} data-tip={t("Alles zeigen")}>
            <FitIcon size={15} />
          </button>
        </div>
          {mini && (
            <div className="bp-minimap" onPointerDown={onMiniDown} aria-label={t("Übersichtskarte")}>
              {mini.boxes.map((b) => (
                <span key={b.n.id} className={`bp-mini-node cat-${nodeSpec(b.n.kind)?.cat ?? "other"}`} style={{ left: (b.x - mini.x0) * mini.s, top: (b.y - mini.y0) * mini.s, width: Math.max(3, b.w * mini.s), height: Math.max(2, b.h * mini.s) }} />
              ))}
              <span className="bp-mini-view" style={{ left: mini.view.x, top: mini.view.y, width: mini.view.w, height: mini.view.h }} />
            </div>
          )}
        </div>
        {sideOpen ? (
          <aside className="bp-side">
            <div className="bp-side-tabs">
              <button className={sideTab === "details" ? "active" : ""} onClick={() => setSideTab("details")}>
                {t("Details")}
              </button>
              <button className={sideTab === "problems" ? "active" : ""} onClick={() => setSideTab("problems")}>
                {t("Probleme")} {errors > 0 && <span className="bp-count warn">{errors}</span>}
              </button>
              <span className="grow" />
              <button className="icon-btn" onClick={toggleSide} aria-label={t("Seitenleiste ausblenden")}>
                <ChevronIcon size={13} />
              </button>
            </div>
            <div className="bp-side-body">
              {sideTab === "problems" ? (
                problems.length ? (
                  problems.map((p, i) => (
                    <button key={i} className={`bp-problem ${p.level}`} onClick={() => p.node && focusNode(p.node)} disabled={!p.node}>
                      {p.level === "info" ? <InfoIcon size={13} /> : <AlertIcon size={13} />}
                      <span>{p.text}</span>
                    </button>
                  ))
                ) : (
                  <div className="bp-ok">
                    <CheckIcon size={16} /> {t("Alles in Ordnung – der Blueprint wird so gebaut.")}
                  </div>
                )
              ) : selected ? (
                <NodeDetails project={project} content={content} own={own} node={selected} links={bp.links} nodeById={nodeById} onChange={(props) => setNode(selected.id, { props }, `props:${selected.id}`)} onFocus={focusNode} />
              ) : (
                <BpOverview bp={bp} problems={problems} onFocus={focusNode} onProblems={() => setSideTab("problems")} sel={sel.length} />
              )}
            </div>
          </aside>
        ) : (
          <button className="bp-side-tab right" onClick={toggleSide} data-tip={t("Details zeigen")}>
            <ChevronIcon size={13} />
            <span>{t("Details")}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/** Bibliothek: alle Knoten nach Kategorien, zum Hineinziehen oder Anklicken */
function BpLibrary({ onAdd, onClose }: { onAdd: (kind: string) => void; onClose: () => void }) {
  usePlugins();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("anvil.bp.libopen") ?? "") as Record<string, boolean>;
    } catch {
      return { event: true };
    }
  });
  const toggle = (c: string, cur: boolean) => {
    const next = { ...open, [c]: !cur };
    setOpen(next);
    try {
      localStorage.setItem("anvil.bp.libopen", JSON.stringify(next));
    } catch {
      /* egal */
    }
  };
  const query = q.trim().toLowerCase();
  return (
    <aside className="bp-lib">
      <div className="bp-lib-head">
        <div className="search grow">
          <SearchIcon size={13} />
          <input placeholder={t("Knoten suchen …")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="icon-btn" onClick={onClose} aria-label={t("Bibliothek ausblenden")}>
          <ChevronIcon size={13} />
        </button>
      </div>
      <div className="bp-lib-hint">{t("In die Fläche ziehen oder anklicken")}</div>
      <div className="bp-lib-list">
        {[
          ...[...new Set(NODES.filter((n) => n.plugin).map((n) => n.plugin as string))].map((name) => ({ key: `plugin:${name}`, label: name, icon: <PuzzleIcon size={12} />, cls: "plugin", match: (n: NodeSpec) => n.plugin === name, def: true })),
          ...CATS.map((c) => ({ key: c.id as string, label: c.label, icon: CAT_ICON[c.id], cls: c.id as string, match: (n: NodeSpec) => !n.plugin && n.cat === c.id, def: false })),
        ].map((c) => {
          const items = NODES.filter((n) => c.match(n) && (!query || `${n.label} ${n.desc}`.toLowerCase().includes(query)));
          if (!items.length) return null;
          const isOpen = !!query || (open[c.key] ?? c.def);
          return (
            <div key={c.key} className={`bp-lib-cat cat-${c.cls}`}>
              <button className={`bp-lib-cat-head ${isOpen ? "open" : ""}`} onClick={() => toggle(c.key, isOpen)}>
                <ChevronIcon size={11} />
                <span className="bp-lib-cat-icon">{c.icon}</span>
                <span className="grow">{c.label}</span>
                <span className="muted small">{items.length}</span>
              </button>
              {isOpen &&
                items.map((n) => (
                  <button
                    key={n.kind}
                    className="bp-lib-item"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("anvil/bp-node", n.kind);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => onAdd(n.kind)}
                    title={n.desc}
                  >
                    {n.value ? <span className="bp-lib-val" style={{ borderColor: VAL_COLOR[n.value] }} /> : <span className={`bp-dot cat-${n.cat}`} />}
                    <span className="grow">{n.label}</span>
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function BpOverview({ bp, problems, onFocus, onProblems, sel }: { bp: Blueprint; problems: Problem[]; onFocus: (id: string) => void; onProblems: () => void; sel: number }) {
  const evs = bp.nodes.filter((n) => isEvent(n.kind));
  const values = bp.nodes.filter((n) => isValue(n.kind)).length;
  const errs = problems.filter((p) => p.level !== "info").length;
  return (
    <div className="bp-overview">
      <div className="muted small">{sel > 1 ? t("{n} Knoten ausgewählt", { n: sel }) : t("Klicke einen Knoten an, um ihn hier zu bearbeiten.")}</div>
      <div className="bp-stats">
        <span>
          <b>{bp.nodes.length}</b> {t("Knoten")}
        </span>
        <span>
          <b>{values}</b> {t("Werte")}
        </span>
        <span>
          <b>{bp.links.length}</b> {t("Verbindungen")}
        </span>
      </div>
      <div className="field-label">{t("Startet bei")}</div>
      {evs.length ? (
        evs.map((e) => (
          <button key={e.id} className="bp-ev-row" onClick={() => onFocus(e.id)}>
            <LightningIcon size={13} />
            <span className="grow">{nodeSpec(e.kind)?.label}</span>
            {e.props.target && <span className="muted small mono">{e.props.target.split(":").pop()}</span>}
          </button>
        ))
      ) : (
        <div className="muted small">{t("Noch kein Ereignis.")}</div>
      )}
      <button className={`bp-problem ${errs ? "warn" : "ok"}`} onClick={onProblems}>
        {errs ? <AlertIcon size={13} /> : <CheckIcon size={13} />}
        <span>{errs ? t("{n} Probleme ansehen", { n: errs }) : t("Keine Probleme")}</span>
      </button>
      <div className="bp-tips small muted">
        <div>{t("Tipp: Werte (Zahlen, Ja/Nein, Text) verbindest du über die farbigen Punkte links an den Feldern.")}</div>
        <div>{t("Tipp: Ziehe von einem Punkt ins Leere, um gleich einen passenden Knoten anzuhängen.")}</div>
      </div>
    </div>
  );
}

function NodeDetails({
  project,
  content,
  own,
  node,
  links,
  nodeById,
  onChange,
  onFocus,
}: {
  project: Project;
  content: Content;
  own: OwnEntry[];
  node: BpNode;
  links: BpLink[];
  nodeById: Map<string, BpNode>;
  onChange: (p: Record<string, string>) => void;
  onFocus: (id: string) => void;
}) {
  const spec = nodeSpec(node.kind);
  if (!spec) return null;
  const cat = CATS.find((c) => c.id === spec.cat);
  const used = links.filter((l) => l.from === node.id && l.pin);
  return (
    <div className="bp-details">
      <div className="row gap-10">
        <span className={`bp-details-icon cat-${spec.cat}`}>{KIND_ICON[node.kind] ?? CAT_ICON[spec.cat]}</span>
        <div className="grow">
          <div className="panel-title">{spec.label}</div>
          <div className="muted small">{cat?.label}</div>
        </div>
      </div>
      {spec.desc && <div className="small bp-details-desc">{spec.desc}</div>}
      {spec.needs && (
        <div className="bp-needs small">
          <span className="field-label">{t("Braucht")}</span>
          <span>{t("Fähigkeit „{a}“ am Block", { a: ABILITY_LABEL[spec.needs] ?? spec.needs })}</span>
        </div>
      )}
      <NodeFields project={project} content={content} own={own} spec={spec} node={node} links={links} nodeById={nodeById} onChange={onChange} wide />
      {spec.value && (
        <div className="bp-needs small">
          <span className="field-label">{t("Liefert")}</span>
          <span>
            <span className="bp-legend-dot" style={{ borderColor: VAL_COLOR[spec.value] }} /> {spec.value === "num" ? t("Zahl") : spec.value === "bool" ? t("Ja/Nein") : spec.value === "text" ? t("Text") : t("Wert")}
            {used.length > 0 && " → " + used.map((l) => nodeSpec(nodeById.get(l.to)?.kind ?? "")?.label).join(", ")}
          </span>
          {used.map((l) => (
            <button key={l.to + l.pin} className="link-btn small" onClick={() => onFocus(l.to)}>
              {t("Zeigen")}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OutPin({ node, out, onDown }: { node: string; out: string; onDown: (e: React.PointerEvent, from: string, out: string) => void }) {
  return <span className={`bp-pin out pin-${out}`} data-pin={`out:${node}:${out}`} onPointerDown={(e) => onDown(e, node, out)} />;
}

function NodePalette({ at, connect, nodeById, onPick, onClose }: { at: Palette; connect?: Connect; nodeById: Map<string, BpNode>; onPick: (kind: string) => void; onClose: () => void }) {
  const connecting = !!connect;
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const query = q.trim().toLowerCase();
  const fits = (n: NodeSpec) => {
    if (!connect) return true;
    if (connect.kind === "exec") return n.cat !== "event" && !n.value;
    if (connect.kind === "din") return !!n.value;
    // Wert → Knoten mit passendem Eingang
    const from = nodeById.get(connect.from);
    const ty = from ? nodeSpec(from.kind)?.value : undefined;
    return n.props.some((p) => p.pin && (p.pin === "any" || !ty || ty === "any" || p.pin === ty || p.pin === "text"));
  };
  void connecting;
  const list = NODES.filter((n) => fits(n) && (!query || `${n.label} ${n.desc} ${n.kind}`.toLowerCase().includes(query)));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [onClose]);
  useEffect(() => setIndex(0), [q]);
  return (
    <div
      ref={ref}
      className="bp-palette"
      style={{ left: at.sx, top: at.sy }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="search">
        <SearchIcon size={13} />
        <input
          autoFocus
          placeholder={t("Knoten suchen …")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(list.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter" && list[index]) onPick(list[index].kind);
          }}
        />
      </div>
      <div className="bp-palette-list">
        {CATS.map((c) => {
          const items = list.filter((n) => n.cat === c.id);
          if (!items.length) return null;
          return (
            <div key={c.id}>
              <div className="bp-palette-cat">
                {CAT_ICON[c.id]} {c.label}
              </div>
              {items.map((n) => (
                <button key={n.kind} className={list[index] === n ? "bp-palette-item active" : "bp-palette-item"} onClick={() => onPick(n.kind)} onMouseEnter={() => setIndex(list.indexOf(n))}>
                  {n.value ? <span className="bp-lib-val" style={{ borderColor: VAL_COLOR[n.value] }} /> : <span className={`bp-dot cat-${n.cat}`} />}
                  <span className="grow">{n.label}</span>
                </button>
              ))}
            </div>
          );
        })}
        {list.length === 0 && <div className="muted small pad">{t("Nichts gefunden.")}</div>}
      </div>
    </div>
  );
}

function NodeFields({
  project,
  content,
  own,
  spec,
  node,
  links,
  nodeById,
  onChange,
  onPinDown,
  onUnlink,
  wide,
}: {
  project: Project;
  content: Content;
  own: OwnEntry[];
  spec: NodeSpec;
  node: BpNode;
  links: BpLink[];
  nodeById: Map<string, BpNode>;
  onChange: (p: Record<string, string>) => void;
  onPinDown?: (e: React.PointerEvent, to: string, pin: string, ty: ValType) => void;
  onUnlink?: (key: string) => void;
  wide?: boolean;
}) {
  const props = node.props;
  const vars = content.variables ?? [];
  const linked = (key: string) => links.find((l) => l.to === node.id && l.pin === key);
  // „Wenn“ mit verbundener Bedingung braucht die Auswahlfelder nicht
  const condLinked = spec.kind === "if" && !!linked("ifcond");
  const fields = visibleProps(spec, props).filter((p) => {
    if (condLinked && p.key !== "ifcond") return false;
    if (p.type === "pinonly" && wide && !linked(p.key)) return false;
    const v = vars.find((x) => x.name === (props[varKeyFor(p.key)] ?? ""));
    // „Gilt für“ nur bei Variablen ohne Eintrag im Variablen-Tab
    if (p.type === "scope") return !vars.find((x) => x.name === (props[p.key === "scope2" ? "var2" : varKeyFor(p.key)] ?? ""));
    if (!v) return true;
    if (v.kind === "logic" && p.type === "varcmp") return false;
    if (v.kind === "logic" && (props[varKeyFor(p.key).replace("var", "op")] ?? "") === "toggle" && (p.type === "varvalue" || p.key.endsWith("src") || p.type === "game")) return false;
    return true;
  });
  if (!fields.length) return null;
  const set = (key: string, v: string) => {
    const next = { ...props, [key]: v };
    // Bedingung gewechselt → abhängigen Wert zurücksetzen
    for (const p of spec.props) if (p.when?.key === key && p.when.values.includes(v)) next[p.key] = p.def;
    onChange(next);
  };
  return (
    <div className="bp-fields">
      {fields.map((p) => {
        const l = p.pin ? linked(p.key) : undefined;
        const src = l ? nodeById.get(l.from) : undefined;
        const ty = p.pin ?? "any";
        return (
          <div key={`${p.key}-${p.label}`} className={`bp-field ${p.pin ? "pinned" : ""}`}>
            {p.pin && !wide && (
              <span
                className={`bp-pin din ${l ? "on" : ""}`}
                data-pin={`din:${node.id}:${p.key}`}
                data-din={`${node.id}:${p.key}`}
                style={{ borderColor: VAL_COLOR[ty], background: l ? VAL_COLOR[ty] : undefined }}
                onPointerDown={(e) => onPinDown?.(e, node.id, p.key, ty)}
                title={t("Wert verbinden")}
              />
            )}
            <span className="bp-field-label">{p.label}</span>
            {l ? (
              <span className="bp-linked" style={{ borderColor: VAL_COLOR[ty] }}>
                <span className="grow">← {nodeSpec(src?.kind ?? "")?.label ?? t("Wert")}</span>
                {onUnlink && (
                  <button className="icon-btn tiny" onClick={() => onUnlink(p.key)} aria-label={t("Verbindung lösen")}>
                    <CancelIcon size={11} />
                  </button>
                )}
              </span>
            ) : p.type === "pinonly" ? (
              <span className="bp-linked empty">{t("nicht verbunden")}</span>
            ) : (
              <label className="bp-field-input">
                <PropInput project={project} content={content} own={own} spec={p} props={props} value={props[p.key] ?? p.def} onChange={(v) => set(p.key, v)} />
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PropInput({ project, content, own, spec, props = {}, value, onChange }: { project: Project; content: Content; own: OwnEntry[]; spec: PropSpec; props?: Record<string, string>; value: string; onChange: (v: string) => void }) {
  const varDef = (content.variables ?? []).find((v) => v.name === (props[varKeyFor(spec.key)] ?? ""));
  const kind = varDef?.kind ?? "number";
  const opts = (list: [string, string][]) => {
    const cur = list.some(([id]) => id === value) ? value : list[0][0];
    return (
      <select className="input" value={cur} onChange={(e) => onChange(e.target.value)}>
        {list.map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
    );
  };
  switch (spec.type) {
    case "varop":
      return opts(
        kind === "number"
          ? [["set", t("Setzen auf")], ["add", t("Erhöhen um")], ["sub", t("Verringern um")], ["mul", t("Malnehmen mit")], ["div", t("Teilen durch")], ["random", t("Zufallszahl unter")]]
          : kind === "logic"
            ? [["set", t("Setzen auf")], ["toggle", t("Umschalten (an ↔ aus)")]]
            : [["set", t("Setzen auf")]],
      );
    case "varcmp":
      return opts(
        kind === "number"
          ? [["ge", "≥"], ["gt", ">"], ["eq", "="], ["ne", "≠"], ["le", "≤"], ["lt", "<"]]
          : kind === "text"
            ? [["eq", t("ist gleich")], ["ne", t("ist nicht")], ["contains", t("enthält")], ["empty", t("ist leer")]]
            : [["eq", t("ist gleich")], ["ne", t("ist nicht")]],
      );
    case "game":
      return opts(GAME_VALUES.filter((g) => g.kinds.includes(kind)).map((g) => [g.id, g.label]));
    case "varvalue":
      switch (kind) {
        case "logic":
          return opts([["true", t("Wahr (an)")], ["false", t("Falsch (aus)")]]);
        case "text":
          return <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={t("Text, {player}, {var:name}")} />;
        case "item":
        case "block":
          return <PropInput project={project} content={content} own={own} spec={{ ...spec, type: kind }} value={value} onChange={onChange} />;
        case "direction":
          return opts([["north", t("Norden")], ["south", t("Süden")], ["east", t("Osten")], ["west", t("Westen")], ["up", t("Oben")], ["down", t("Unten")]]);
        case "position":
          return <input className="input mono" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0 64 0" />;
        default:
          return <input className="input" type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)} />;
      }
    case "gui":
      return (
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t("– Oberfläche wählen –")}</option>
          {(content.guis ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.nameEn || g.id}
            </option>
          ))}
        </select>
      );
    case "tag": {
      const reg = /holding/.test(props[spec.key.replace("value", "cond")] ?? "") ? "item" : /target/.test(props[spec.key.replace("value", "cond")] ?? "") ? "entity_type" : "block";
      const list = [...(content.tags ?? []).filter((x) => x.registry === reg).map((x) => x.id), ...KNOWN_TAGS.filter((k) => k.reg === reg).map((k) => k.id)];
      return (
        <>
          <input className="input mono" list={`bp-tags-${reg}`} value={value} onChange={(e) => onChange(e.target.value.trim().toLowerCase())} placeholder="minecraft:logs" />
          <datalist id={`bp-tags-${reg}`}>
            {[...new Set(list)].map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </>
      );
    }
    case "scope":
    case "select":
    case "who":
      return (
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          {spec.options!.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "fn": {
      const fns = [...new Set(content.blueprints.flatMap((b) => b.nodes.filter((n) => n.kind === "ev_function").map((n) => n.props.fn).filter(Boolean)))].sort();
      return (
        <>
          <input className="input" list="bp-fns" value={value} onChange={(e) => onChange(e.target.value)} placeholder={t("Name der Funktion")} />
          <datalist id="bp-fns">
            {fns.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          {value && !fns.includes(value) && <span className="muted tiny">{t("Lege dazu einen Blueprint mit „Eigene Funktion“ und diesem Namen an.")}</span>}
        </>
      );
    }
    case "var": {
      const defined = (content.variables ?? []).map((v) => v.name);
      const names = [...new Set([...defined, ...content.blueprints.flatMap((b) => b.nodes.flatMap((n) => [n.props.var, n.props.var2, n.props.b_var]).filter(Boolean))])];
      const own = (content.variables ?? []).find((v) => v.name === value);
      return (
        <>
          <input
            className="input mono"
            list="bp-vars"
            value={value}
            onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
            placeholder="punkte"
          />
          <datalist id="bp-vars">
            {names.map((n) => (
              <option key={n} value={n} label={(content.variables ?? []).find((v) => v.name === n) ? varKindLabel((content.variables ?? []).find((v) => v.name === n)!.kind) : undefined} />
            ))}
          </datalist>
          {value && (own ? <span className="muted tiny">{varKindLabel(own.kind)} · {varScopeLabel(own.scope)}</span> : <span className="muted tiny">{t("Nicht im Variablen-Tab angelegt – gilt als Zahl.")}</span>)}
        </>
      );
    }
    case "dim":
      return (
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          {content.dimensions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nameEn || d.nameDe || d.id} ({t("eigene")})
            </option>
          ))}
          <option value="minecraft:overworld">{t("Oberwelt")}</option>
          <option value="minecraft:the_end">{t("End")}</option>
        </select>
      );
    case "number":
      return <input className="input" type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)} />;
    case "item":
    case "block":
      return (
        <ItemField
          project={project}
          own={spec.type === "block" ? own.filter((o) => o.kind === "block") : own}
          value={value}
          onChange={onChange}
          placeholder={spec.type === "block" ? t("Block wählen") : t("Item wählen")}
        />
      );
    case "entity": {
      const opts = [
        ...content.mobs.map((m) => ({ id: `${project.modId}:${m.id}`, label: `${m.nameEn || m.nameDe || m.id} (${t("eigene")})` })),
        ...ENTITIES.map((e) => ({ id: `minecraft:${e}`, label: e.replace(/_/g, " ") })),
      ];
      return (
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t("– beliebig –")}</option>
          {opts.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    case "effect":
      return (
        <select className="input" value={value.replace("minecraft:", "")} onChange={(e) => onChange(e.target.value)}>
          {EFFECTS.map((e) => (
            <option key={e} value={e}>
              {e.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      );
    case "particle":
      return (
        <select className="input" value={value.replace("minecraft:", "")} onChange={(e) => onChange(`minecraft:${e.target.value}`)}>
          {PARTICLES.map((e) => (
            <option key={e} value={e}>
              {e.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      );
    case "sound":
      return (
        <>
          <input className="input mono" list="bp-sounds" value={value} onChange={(e) => onChange(e.target.value)} />
          <datalist id="bp-sounds">
            {SOUNDS.map((s) => (
              <option key={s} value={`minecraft:${s}`} />
            ))}
          </datalist>
        </>
      );
    default:
      return <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />;
  }
}
