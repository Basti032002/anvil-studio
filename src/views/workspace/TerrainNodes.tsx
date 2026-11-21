import { t } from "../../i18n";
import { useEffect, useRef, useState } from "react";
import { TGraph, TNode } from "../../api";
import { newNode, NODE_SPECS, specOf } from "./terrain";

const W = 196;
const HEAD = 32;
const ROW = 24;

const inPos = (n: TNode, i: number) => ({ x: n.x, y: n.y + HEAD + 6 + i * ROW + ROW / 2 });
const outPos = (n: TNode) => ({ x: n.x + W, y: n.y + HEAD / 2 });

function wire(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

export default function TerrainNodes({ graph, onChange }: { graph: TGraph; onChange: (g: TGraph) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [pending, setPending] = useState<{ from: string; x: number; y: number } | null>(null);
  const gRef = useRef(graph);
  gRef.current = graph;

  const local = (e: { clientX: number; clientY: number }) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: e.clientX - r.left + wrap.current!.scrollLeft, y: e.clientY - r.top + wrap.current!.scrollTop };
  };

  useEffect(() => {
    if (!drag && !pending) return;
    const move = (e: MouseEvent) => {
      const p = local(e);
      if (drag) {
        const g = gRef.current;
        onChange({ ...g, nodes: g.nodes.map((n) => (n.id === drag.id ? { ...n, x: Math.max(0, Math.round(p.x - drag.dx)), y: Math.max(0, Math.round(p.y - drag.dy)) } : n)) });
      } else if (pending) setPending({ ...pending, x: p.x, y: p.y });
    };
    const up = (e: MouseEvent) => {
      if (pending) {
        const el = (e.target as HTMLElement).closest("[data-port]") as HTMLElement | null;
        if (el) {
          const to = el.dataset.node!;
          const port = el.dataset.port!;
          const g = gRef.current;
          if (to !== pending.from) onChange({ ...g, links: [...g.links.filter((l) => !(l.to === to && l.port === port)), { from: pending.from, to, port }] });
        }
      }
      setDrag(null);
      setPending(null);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [drag, pending]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!sel || (e.key !== "Delete" && e.key !== "Backspace")) return;
      if ((e.target as HTMLElement).closest("input, select, textarea")) return;
      const g = gRef.current;
      if (g.nodes.find((n) => n.id === sel)?.kind === "output") return;
      onChange({ nodes: g.nodes.filter((n) => n.id !== sel), links: g.links.filter((l) => l.from !== sel && l.to !== sel) });
      setSel(null);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [sel]);

  const add = (kind: string) => {
    const el = wrap.current;
    const x = (el?.scrollLeft ?? 0) + 40 + Math.random() * 60;
    const y = (el?.scrollTop ?? 0) + 40 + Math.random() * 60;
    const n = newNode(kind, Math.round(x), Math.round(y));
    onChange({ ...graph, nodes: [...graph.nodes, n] });
    setSel(n.id);
  };
  const setProp = (id: string, key: string, v: string | number) =>
    onChange({ ...graph, nodes: graph.nodes.map((n) => (n.id === id ? { ...n, props: { ...n.props, [key]: v } } : n)) });

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const maxX = Math.max(1400, ...graph.nodes.map((n) => n.x + W + 200));
  const maxY = Math.max(700, ...graph.nodes.map((n) => n.y + 260));

  return (
    <div className="tn">
      <div className="tn-palette">
        {NODE_SPECS.filter((s) => s.kind !== "output").map((s) => (
          <button key={s.kind} className="tn-chip" style={{ color: s.color, borderColor: `${s.color}55`, background: `${s.color}14` }} onClick={() => add(s.kind)}>
            {s.label()}
          </button>
        ))}
      </div>
      <div className="tn-canvas" ref={wrap} onMouseDown={(e) => e.target === e.currentTarget && setSel(null)}>
        <div className="tn-inner" style={{ width: maxX, height: maxY }}>
          <svg className="tn-wires" width={maxX} height={maxY}>
            {graph.links.map((l, i) => {
              const a = byId.get(l.from), b = byId.get(l.to);
              if (!a || !b) return null;
              const idx = specOf(b.kind).inputs.findIndex(([k]) => k === l.port);
              if (idx < 0) return null;
              return (
                <path
                  key={i}
                  d={wire(outPos(a), inPos(b, idx))}
                  className="tn-wire"
                  stroke={specOf(a.kind).color}
                  onClick={() => onChange({ ...graph, links: graph.links.filter((_, j) => j !== i) })}
                >
                  <title>{t("Klicken zum Trennen")}</title>
                </path>
              );
            })}
            {pending && byId.get(pending.from) && <path d={wire(outPos(byId.get(pending.from)!), pending)} className="tn-wire pending" stroke="#ecedef" />}
          </svg>
          {graph.nodes.map((n) => {
            const spec = specOf(n.kind);
            return (
              <div key={n.id} className={sel === n.id ? "tn-node sel" : "tn-node"} style={{ left: n.x, top: n.y, width: W }} onMouseDown={() => setSel(n.id)}>
                <div
                  className="tn-head"
                  style={{ color: spec.color, background: `${spec.color}1f` }}
                  onMouseDown={(e) => {
                    const p = local(e);
                    setDrag({ id: n.id, dx: p.x - n.x, dy: p.y - n.y });
                  }}
                >
                  <span className="grow">
                    {spec.label()}
                    {n.props.label ? <span className="tn-sub"> · {String(n.props.label)}</span> : null}
                  </span>
                  {n.kind !== "output" && (
                    <span
                      className="tn-port out"
                      style={{ borderColor: spec.color, background: spec.color }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        const p = local(e);
                        setPending({ from: n.id, x: p.x, y: p.y });
                      }}
                    />
                  )}
                </div>
                <div className="tn-body">
                  {spec.inputs.map(([k, label]) => (
                    <div key={k} className="tn-row tn-in">
                      <span className="tn-port in" data-port={k} data-node={n.id} />
                      <span>{label()}</span>
                    </div>
                  ))}
                  {spec.props
                    .filter((p) => !(n.kind === "curve" && p.key === "points" && n.props.shape !== "steps"))
                    .map((p) => (
                      <label key={p.key} className="tn-row">
                        <span className="grow">{p.label()}</span>
                        {p.type === "select" ? (
                          <select className="tn-input" value={String(n.props[p.key] ?? p.def)} onChange={(e) => setProp(n.id, p.key, e.target.value)}>
                            {p.options!.map(([v, l]) => (
                              <option key={v} value={v}>
                                {l()}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="tn-input mono"
                            type="number"
                            step={p.step ?? 1}
                            value={n.props[p.key] ?? p.def}
                            onChange={(e) => setProp(n.id, p.key, e.target.value === "" ? "" : Number(e.target.value))}
                          />
                        )}
                      </label>
                    ))}
                  {n.kind === "output" && <div className="tn-row muted small">{t("> 0 = Stein")}</div>}
                </div>
              </div>
            );
          })}
        </div>

      </div>
      <div className="tn-foot muted small">{t("Ergebnis > 0 wird Stein, sonst Luft (unter dem Meeresspiegel Wasser). Ziehe vom Punkt rechts an einem Knoten zu einem Eingang. Kabel anklicken trennt sie, Entf löscht den gewählten Knoten.")}</div>
    </div>
  );
}
