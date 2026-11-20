import { t } from "../../i18n";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Blueprint, BpLink, BpNode, Content, Project } from "../../api";
import { Toggle } from "../../components/Chrome";
import { OwnEntry } from "../../components/ItemPicker";
import { MenuItem, openMenu } from "../../components/Overlay";
import {
  BlueprintIcon,
  BranchIcon,
  ChatIcon,
  CopyIcon,
  CubeIcon,
  DelayIcon,
  FitIcon,
  LightningIcon,
  PlusIcon,
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
import { BpCat, CATS, ENTITIES, isEvent, makeNode, NODES, nodeId, nodeSpec, NodeSpec, PARTICLES, PropSpec, visibleProps } from "./blueprints";

type View = { x: number; y: number; zoom: number };
type Pt = { x: number; y: number };
type Palette = { sx: number; sy: number; wx: number; wy: number; connect?: { from: string; out: string } };

const CAT_ICON: Record<BpCat, React.ReactNode> = {
  event: <LightningIcon size={13} />,
  flow: <BranchIcon size={13} />,
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

const GRID = 20;
const snap = (v: number) => Math.round(v / GRID) * GRID;

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
  const [selected, setSelected] = useState<string | null>(null);
  const [pins, setPins] = useState<Record<string, Pt>>({});
  const [wire, setWire] = useState<{ from: string; out: string; to: Pt } | null>(null);
  const [palette, setPalette] = useState<Palette | null>(null);
  const bpRef = useRef(bp);
  bpRef.current = bp;
  const viewRef = useRef(view);
  viewRef.current = view;

  const toWorld = useCallback((cx: number, cy: number): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
  }, []);

  // Positionen der Anschlüsse aus dem DOM messen
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
  });

  const update = (patch: Partial<Blueprint>) => onChange({ ...bpRef.current, ...patch });
  const setNode = (id: string, patch: Partial<BpNode>) => update({ nodes: bpRef.current.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  const removeNode = (id: string) => {
    update({ nodes: bpRef.current.nodes.filter((n) => n.id !== id), links: bpRef.current.links.filter((l) => l.from !== id && l.to !== id) });
    setSelected(null);
  };
  const duplicateNode = (id: string) => {
    const n = bpRef.current.nodes.find((x) => x.id === id);
    if (!n) return;
    const copy = { ...structuredClone(n), id: nodeId(), x: n.x + 40, y: n.y + 40 };
    update({ nodes: [...bpRef.current.nodes, copy] });
    setSelected(copy.id);
  };
  const addNode = (kind: string, at: Pt, connect?: { from: string; out: string }) => {
    const n = makeNode(kind, snap(at.x), snap(at.y));
    const links = [...bpRef.current.links];
    if (connect && !isEvent(kind)) links.push({ from: connect.from, out: connect.out, to: n.id });
    update({ nodes: [...bpRef.current.nodes, n], links });
    setSelected(n.id);
    setPalette(null);
  };
  const removeLink = (l: BpLink) => update({ links: bpRef.current.links.filter((x) => x !== l) });

  // Tastatur: Entf löscht, Strg+D dupliziert
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (!selected || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeNode(selected);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateNode(selected);
      } else if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Zoomen mit Mausrad um den Mauszeiger
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const v = viewRef.current;
      const zoom = Math.min(2, Math.max(0.3, v.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
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
    const zoom = Math.min(2, Math.max(0.3, v.zoom * f));
    const mx = r.width / 2;
    const my = r.height / 2;
    setView({ zoom, x: mx - ((mx - v.x) / v.zoom) * zoom, y: my - ((my - v.y) / v.zoom) * zoom });
  }

  function fit() {
    const el = canvasRef.current;
    if (!el || bp.nodes.length === 0) return setView({ x: 40, y: 40, zoom: 1 });
    const r = el.getBoundingClientRect();
    const xs = bp.nodes.map((n) => n.x);
    const ys = bp.nodes.map((n) => n.y);
    const minX = Math.min(...xs) - 40;
    const minY = Math.min(...ys) - 40;
    const w = Math.max(...xs) + 280 - minX;
    const h = Math.max(...ys) + 220 - minY;
    const zoom = Math.min(1.2, Math.max(0.3, Math.min(r.width / w, r.height / h)));
    setView({ zoom, x: -minX * zoom + (r.width - w * zoom) / 2, y: -minY * zoom + (r.height - h * zoom) / 2 });
  }

  useEffect(() => {
    // beim Öffnen alles zeigen
    const id = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Ziehen: Hintergrund verschieben ----
  function onCanvasDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.button !== 1) return;
    if ((e.target as HTMLElement).closest(".bp-node, .bp-palette, .bp-wire-hit")) return;
    setSelected(null);
    setPalette(null);
    const start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    const move = (ev: PointerEvent) => setView((v) => ({ ...v, x: start.vx + ev.clientX - start.x, y: start.vy + ev.clientY - start.y }));
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
    setSelected(n.id);
    setPalette(null);
    const start = toWorld(e.clientX, e.clientY);
    const origin = { x: n.x, y: n.y };
    const move = (ev: PointerEvent) => {
      const p = toWorld(ev.clientX, ev.clientY);
      const nx = snap(origin.x + p.x - start.x);
      const ny = snap(origin.y + p.y - start.y);
      const cur = bpRef.current.nodes.find((x) => x.id === n.id);
      if (cur && (cur.x !== nx || cur.y !== ny)) setNode(n.id, { x: nx, y: ny });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ---- Ziehen: Verbindung von einem Ausgang ----
  function onPinDown(e: React.PointerEvent, from: string, out: string) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setWire({ from, out, to: toWorld(e.clientX, e.clientY) });
    const move = (ev: PointerEvent) => setWire({ from, out, to: toWorld(ev.clientX, ev.clientY) });
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setWire(null);
      const hit = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const target = hit?.closest<HTMLElement>("[data-node]")?.dataset.node;
      const cur = bpRef.current;
      if (target && target !== from) {
        const tn = cur.nodes.find((n) => n.id === target);
        if (!tn || isEvent(tn.kind)) return;
        if (cur.links.some((l) => l.from === from && l.out === out && l.to === target)) return;
        update({ links: [...cur.links, { from, out, to: target }] });
      } else if (!target && hit?.closest(".bp-canvas")) {
        // ins Leere gezogen → Knoten auswählen und direkt verbinden
        const r = canvasRef.current!.getBoundingClientRect();
        setPalette({ sx: ev.clientX - r.left, sy: ev.clientY - r.top, ...wp(toWorld(ev.clientX, ev.clientY)), connect: { from, out } });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  const wp = (p: Pt) => ({ wx: p.x, wy: p.y });
  const clampPalette = (p: Palette): Palette => {
    const r = canvasRef.current?.getBoundingClientRect();
    if (!r) return p;
    return { ...p, sx: Math.max(8, Math.min(p.sx, r.width - 280)), sy: Math.max(8, Math.min(p.sy, r.height - 390)) };
  };

  function openPaletteAt(clientX: number, clientY: number) {
    const r = canvasRef.current!.getBoundingClientRect();
    setPalette({ sx: clientX - r.left, sy: clientY - r.top, ...wp(toWorld(clientX, clientY)) });
  }

  function nodeMenu(n: BpNode): MenuItem[] {
    return [
      { label: t("Duplizieren"), icon: <CopyIcon size={15} />, hint: t("Strg D"), onClick: () => duplicateNode(n.id) },
      {
        label: t("Verbindungen lösen"),
        icon: <BranchIcon size={15} />,
        disabled: !bp.links.some((l) => l.from === n.id || l.to === n.id),
        onClick: () => update({ links: bpRef.current.links.filter((l) => l.from !== n.id && l.to !== n.id) }),
      },
      "separator",
      { label: t("Entfernen"), icon: <TrashIcon size={15} />, danger: true, hint: t("Entf"), onClick: () => removeNode(n.id) },
    ];
  }

  const curve = (a: Pt, b: Pt) => {
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  };
  const events = bp.nodes.filter((n) => isEvent(n.kind));
  const unreachable = useMemo(() => {
    const reach = new Set<string>();
    const stack = bp.nodes.filter((n) => isEvent(n.kind)).map((n) => n.id);
    while (stack.length) {
      const id = stack.pop()!;
      if (reach.has(id)) continue;
      reach.add(id);
      bp.links.filter((l) => l.from === id).forEach((l) => stack.push(l.to));
    }
    return bp.nodes.filter((n) => !reach.has(n.id)).length;
  }, [bp]);

  return (
    <div className="panel bp-panel">
      <div className="bp-toolbar">
        <span className="sub-icon">
          <BlueprintIcon size={16} />
        </span>
        <input className="input bp-name" value={bp.name} onChange={(e) => update({ name: e.target.value })} aria-label={t("Name")} placeholder={t("Name")} />
        <span className="row gap-6 bp-enabled">
          <Toggle label={t("Aktiv")} checked={bp.enabled} onChange={(v) => update({ enabled: v })} />
          <span className="small">{bp.enabled ? t("Aktiv") : t("Aus")}</span>
        </span>
        <span className="grow" />
        <button
          className="btn small"
          onClick={() => {
            const r = canvasRef.current!.getBoundingClientRect();
            openPaletteAt(r.left + r.width / 2 - 130, r.top + 60);
          }}
        >
          <PlusIcon size={13} /> {t("Knoten")}
        </button>
        <div className="bp-zoom">
          <button className="icon-btn" onClick={() => zoomBy(1 / 1.2)} aria-label={t("Verkleinern")} data-tip={t("Verkleinern")}>
            <ZoomOutIcon size={15} />
          </button>
          <span className="mono small">{Math.round(view.zoom * 100)}%</span>
          <button className="icon-btn" onClick={() => zoomBy(1.2)} aria-label={t("Vergrößern")} data-tip={t("Vergrößern")}>
            <ZoomInIcon size={15} />
          </button>
          <button className="icon-btn" onClick={fit} aria-label={t("Alles zeigen")} data-tip={t("Alles zeigen")}>
            <FitIcon size={15} />
          </button>
        </div>
        <button className="icon-btn" onClick={onDuplicate} aria-label={t("Duplizieren")} data-tip={t("Duplizieren")}>
          <CopyIcon size={15} />
        </button>
        <button className="icon-btn danger" onClick={onRemove} aria-label={t("Entfernen")} data-tip={t("Entfernen")}>
          <TrashIcon size={15} />
        </button>
      </div>

      <div
        ref={canvasRef}
        className="bp-canvas"
        onPointerDown={onCanvasDown}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest(".bp-node, .bp-palette, .bp-wire-hit")) return;
          e.preventDefault();
          e.stopPropagation();
          (e.nativeEvent as MouseEvent & { __anvilMenu?: boolean }).__anvilMenu = true;
          openPaletteAt(e.clientX, e.clientY);
        }}
        style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${GRID * view.zoom}px ${GRID * view.zoom}px` }}
      >
        <div className="bp-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          <svg className="bp-wires" width="1" height="1">
            {bp.links.map((l, i) => {
              const a = pins[`out:${l.from}:${l.out}`];
              const b = pins[`in:${l.to}`];
              if (!a || !b) return null;
              const d = curve(a, b);
              const fromKind = bp.nodes.find((n) => n.id === l.from)?.kind ?? "";
              return (
                <g key={i}>
                  <path d={d} className={`bp-wire ${l.out === "false" ? "no" : l.out === "true" ? "yes" : ""} ${isEvent(fromKind) ? "ev" : ""}`} />
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
            {wire && pins[`out:${wire.from}:${wire.out}`] && <path d={curve(pins[`out:${wire.from}:${wire.out}`], wire.to)} className="bp-wire drawing" />}
          </svg>
          {bp.nodes.map((n) => {
            const spec = nodeSpec(n.kind);
            if (!spec) return null;
            return (
              <div
                key={n.id}
                data-node={n.id}
                className={`bp-node cat-${spec.cat} ${selected === n.id ? "selected" : ""}`}
                style={{ left: n.x, top: n.y }}
                onPointerDown={(e) => onNodeDown(e, n)}
                onContextMenu={(e) => {
                  setSelected(n.id);
                  openMenu(e, nodeMenu(n));
                }}
              >
                <div className="bp-node-head">
                  {!isEvent(n.kind) && <span className="bp-pin in" data-pin={`in:${n.id}`} />}
                  <span className="bp-node-icon">{KIND_ICON[n.kind] ?? CAT_ICON[spec.cat]}</span>
                  <span className="bp-node-title">{spec.label}</span>
                  {spec.outs.length === 1 && <OutPin node={n.id} out={spec.outs[0].id} onDown={onPinDown} />}
                </div>
                {spec.desc && <div className="bp-node-desc">{spec.desc}</div>}
                <NodeFields project={project} content={content} own={own} spec={spec} node={n} onChange={(props) => setNode(n.id, { props })} />
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
            <div>{t("Rechtsklick auf die Fläche, um einen Knoten hinzuzufügen")}</div>
          </div>
        )}

        {palette && <NodePalette at={clampPalette(palette)} connecting={!!palette.connect} onPick={(k) => addNode(k, { x: palette.wx, y: palette.wy }, palette.connect)} onClose={() => setPalette(null)} />}

        <div className="bp-hints small">
          {events.length === 0 ? (
            <span className="bp-warn">{t("Ein Blueprint braucht ein Ereignis als Start.")}</span>
          ) : unreachable > 0 ? (
            <span className="bp-warn">{t("{n} Knoten sind mit keinem Ereignis verbunden und werden nicht ausgeführt.", { n: unreachable })}</span>
          ) : (
            <span className="muted">{t("Ziehen: verschieben · Mausrad: zoomen · Punkt rechts ziehen: verbinden · Linie klicken: lösen")}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function OutPin({ node, out, onDown }: { node: string; out: string; onDown: (e: React.PointerEvent, from: string, out: string) => void }) {
  return <span className={`bp-pin out pin-${out}`} data-pin={`out:${node}:${out}`} onPointerDown={(e) => onDown(e, node, out)} />;
}

function NodePalette({ at, connecting, onPick, onClose }: { at: Palette; connecting: boolean; onPick: (kind: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const query = q.trim().toLowerCase();
  const list = NODES.filter((n) => (!connecting || n.cat !== "event") && (!query || `${n.label} ${n.desc} ${n.kind}`.toLowerCase().includes(query)));
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
                  <span className={`bp-dot cat-${n.cat}`} />
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

function NodeFields({ project, content, own, spec, node, onChange }: { project: Project; content: Content; own: OwnEntry[]; spec: NodeSpec; node: BpNode; onChange: (p: Record<string, string>) => void }) {
  const props = node.props;
  const fields = visibleProps(spec, props);
  if (!fields.length) return null;
  const set = (key: string, v: string) => {
    const next = { ...props, [key]: v };
    // Bedingung gewechselt → abhängigen Wert zurücksetzen
    for (const p of spec.props) if (p.when?.key === key && p.when.values.includes(v)) next[p.key] = p.def;
    onChange(next);
  };
  return (
    <div className="bp-fields">
      {fields.map((p) => (
        <label key={`${p.key}-${p.label}`} className="bp-field">
          <span className="bp-field-label">{p.label}</span>
          <PropInput project={project} content={content} own={own} spec={p} value={props[p.key] ?? p.def} onChange={(v) => set(p.key, v)} />
        </label>
      ))}
    </div>
  );
}

function PropInput({ project, content, own, spec, value, onChange }: { project: Project; content: Content; own: OwnEntry[]; spec: PropSpec; value: string; onChange: (v: string) => void }) {
  switch (spec.type) {
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
        ...content.mobs.map((m) => ({ id: `${project.modId}:${m.id}`, label: `${m.nameDe || m.id} (${t("eigene")})` })),
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
