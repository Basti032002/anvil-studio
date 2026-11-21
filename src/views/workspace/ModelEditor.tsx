import { t } from "../../i18n";
import { useUndoTarget } from "../../undo";
import { useEffect, useRef, useState } from "react";
import { BlockDef, Cuboid, Project } from "../../api";
import { useCatalog } from "../../catalog";
import { Toggle } from "../../components/Chrome";
import { OwnEntry } from "../../components/ItemPicker";
import { CloseIcon, CopyIcon, CubeIcon, PlusIcon, TrashIcon, UndoIcon } from "../../icons";
import { ItemField } from "./ContentForms";

type Face = "up" | "down" | "north" | "south" | "east" | "west";

export const MODEL_PRESETS: { id: string; label: string; cuboids: Cuboid[] }[] = [
  { id: "slab", label: t("Halbe Stufe"), cuboids: [{ from: [0, 0, 0], to: [16, 8, 16], tex: "" }] },
  { id: "pillar", label: t("Säule"), cuboids: [{ from: [4, 0, 4], to: [12, 16, 12], tex: "" }] },
  {
    id: "table",
    label: t("Tisch"),
    cuboids: [
      { from: [0, 13, 0], to: [16, 16, 16], tex: "" },
      { from: [1, 0, 1], to: [3, 13, 3], tex: "" },
      { from: [13, 0, 1], to: [15, 13, 3], tex: "" },
      { from: [1, 0, 13], to: [3, 13, 15], tex: "" },
      { from: [13, 0, 13], to: [15, 13, 15], tex: "" },
    ],
  },
  {
    id: "chair",
    label: t("Stuhl"),
    cuboids: [
      { from: [2, 7, 2], to: [14, 9, 14], tex: "" },
      { from: [2, 9, 12], to: [14, 16, 14], tex: "" },
      { from: [2, 0, 2], to: [4, 7, 4], tex: "" },
      { from: [12, 0, 2], to: [14, 7, 4], tex: "" },
      { from: [2, 0, 12], to: [4, 7, 14], tex: "" },
      { from: [12, 0, 12], to: [14, 7, 14], tex: "" },
    ],
  },
  {
    id: "lantern",
    label: t("Laterne"),
    cuboids: [
      { from: [5, 0, 5], to: [11, 7, 11], tex: "" },
      { from: [6, 7, 6], to: [10, 9, 10], tex: "" },
    ],
  },
  { id: "carpet", label: t("Teppich"), cuboids: [{ from: [0, 0, 0], to: [16, 1, 16], tex: "" }] },
  {
    id: "pedestal",
    label: t("Sockel"),
    cuboids: [
      { from: [1, 0, 1], to: [15, 3, 15], tex: "" },
      { from: [4, 3, 4], to: [12, 13, 12], tex: "" },
      { from: [2, 13, 2], to: [14, 16, 14], tex: "" },
    ],
  },
];

/** UV-Bereich je Seite (wie im erzeugten Modell) */
function uv(c: Cuboid, f: Face): [number, number, number, number] {
  const [x0, y0, z0] = c.from.map((v, i) => Math.min(v, c.to[i]));
  const [x1, y1, z1] = c.to.map((v, i) => Math.max(v, c.from[i]));
  switch (f) {
    case "down":
      return [x0, 16 - z1, x1, 16 - z0];
    case "up":
      return [x0, z0, x1, z1];
    case "north":
      return [16 - x1, 16 - y1, 16 - x0, 16 - y0];
    case "south":
      return [x0, 16 - y1, x1, 16 - y0];
    case "west":
      return [z0, 16 - y1, z1, 16 - y0];
    case "east":
      return [16 - z1, 16 - y1, 16 - z0, 16 - y0];
  }
}

const SHADE: Record<Face, number> = { up: 1, south: 0.86, north: 0.78, east: 0.68, west: 0.62, down: 0.5 };

/** CSS-3D-Vorschau der Quader */
export function ModelPreview({
  cuboids,
  texFor,
  size = 220,
  selected,
  onSelect,
  interactive = true,
}: {
  cuboids: Cuboid[];
  texFor: (tex: string) => string | undefined;
  size?: number;
  selected?: number;
  onSelect?: (i: number) => void;
  interactive?: boolean;
}) {
  const [rot, setRot] = useState({ yaw: -35, pitch: 25 });
  const u = size / 24;
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  return (
    <div
      className={interactive ? "model-scene interactive" : "model-scene"}
      style={{ width: size, height: size, perspective: size * 4 }}
      onPointerDown={(e) => {
        if (!interactive) return;
        drag.current = { x: e.clientX, y: e.clientY, ...rot };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        setRot({ yaw: d.yaw + (e.clientX - d.x) * 0.6, pitch: Math.max(-89, Math.min(89, d.pitch - (e.clientY - d.y) * 0.6)) });
      }}
      onPointerUp={() => (drag.current = null)}
    >
      <div className="model-world" style={{ transform: `rotateX(${-rot.pitch}deg) rotateY(${rot.yaw}deg)` }}>
        <div className="model-floor" style={{ width: 16 * u, height: 16 * u, marginLeft: -8 * u, marginTop: -8 * u, transform: `translateY(${8 * u}px) rotateX(90deg)`, backgroundSize: `${u}px ${u}px` }} />
        {cuboids.map((c, i) => {
          const [x0, y0, z0] = c.from.map((v, k) => Math.min(v, c.to[k]));
          const [x1, y1, z1] = c.to.map((v, k) => Math.max(v, c.from[k]));
          const w = Math.max(0.05, x1 - x0);
          const h = Math.max(0.05, y1 - y0);
          const d = Math.max(0.05, z1 - z0);
          const mx = ((x0 + x1) / 2 - 8) * u;
          const my = -((y0 + y1) / 2 - 8) * u;
          const mz = ((z0 + z1) / 2 - 8) * u;
          const tex = texFor(c.tex);
          const faces: [Face, number, number, string][] = [
            ["south", w, h, `translateZ(${(d / 2) * u}px)`],
            ["north", w, h, `rotateY(180deg) translateZ(${(d / 2) * u}px)`],
            ["east", d, h, `rotateY(90deg) translateZ(${(w / 2) * u}px)`],
            ["west", d, h, `rotateY(-90deg) translateZ(${(w / 2) * u}px)`],
            ["up", w, d, `rotateX(90deg) translateZ(${(h / 2) * u}px)`],
            ["down", w, d, `rotateX(-90deg) translateZ(${(h / 2) * u}px)`],
          ];
          return faces.map(([f, fw, fh, tr]) => {
            const [u0, v0] = uv(c, f);
            return (
              <div
                key={`${i}-${f}`}
                className={selected === i ? "model-face selected" : "model-face"}
                onClick={() => onSelect?.(i)}
                style={{
                  width: fw * u,
                  height: fh * u,
                  marginLeft: (-fw * u) / 2,
                  marginTop: (-fh * u) / 2,
                  transform: `translate3d(${mx}px, ${my}px, ${mz}px) ${tr}`,
                  backgroundImage: tex ? `url(${tex})` : undefined,
                  backgroundSize: `${16 * u}px ${16 * u}px`,
                  backgroundPosition: `${-u0 * u}px ${-v0 * u}px`,
                  filter: `brightness(${SHADE[f]})`,
                }}
              />
            );
          });
        })}
      </div>
    </div>
  );
}

/** Hook: Textur-URL zu einer Quader-Textur (leer = Textur des Blocks) */
export function useTexFor(project: Project, block: BlockDef, own: OwnEntry[], texture?: string) {
  const needsCatalog = block.model.some((c) => c.tex.startsWith("minecraft:"));
  const { catalog } = useCatalog(project.mcVersion, needsCatalog);
  return (tex: string) => {
    if (!tex) return texture;
    const bare = tex.startsWith(`${project.modId}:`) ? tex.slice(project.modId.length + 1) : tex;
    const mine = own.find((o) => o.id === bare);
    if (mine) return mine.texture;
    const name = tex.replace(/^minecraft:/, "");
    return catalog?.textures[`block/${name}`] ?? catalog?.textures[`block/${name}_side`] ?? catalog?.textures[`block/${name}_top`];
  };
}

export default function ModelEditor({
  project,
  block,
  own,
  texture,
  onChange,
  onClose,
}: {
  project: Project;
  block: BlockDef;
  own: OwnEntry[];
  texture?: string;
  onChange: (patch: Partial<BlockDef>) => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState(0);
  const history = useRef<Cuboid[][]>([]);
  const cuboids = block.model;
  const texFor = useTexFor(project, block, own, texture);
  const cur = cuboids[sel];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const set = (next: Cuboid[]) => {
    history.current.push(cuboids);
    if (history.current.length > 50) history.current.shift();
    onChange({ model: next });
  };
  const undo = () => {
    const prev = history.current.pop();
    if (prev) onChange({ model: prev });
  };
  useUndoTarget({ undo, redo() {}, canUndo: () => history.current.length > 0, canRedo: () => false });

  const setCur = (patch: Partial<Cuboid>) => set(cuboids.map((c, i) => (i === sel ? { ...c, ...patch } : c)));
  const setAxis = (which: "from" | "to", axis: number, v: number) => {
    const arr = [...cur[which]] as [number, number, number];
    arr[axis] = Math.max(0, Math.min(16, Math.round(v * 2) / 2));
    setCur({ [which]: arr });
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="model-editor" role="dialog" aria-label={t("3D-Modell")}>
        <div className="create-head">
          <div>
            <div className="panel-title-lg">{t("3D-Modell · {name}", { name: block.nameEn || block.nameDe || block.id })}</div>
            <div className="muted small">{t("Baue die Form aus Quadern. Ein Block ist 16 × 16 × 16 Pixel groß.")}</div>
          </div>
          <div className="row gap-6">
            <button className="icon-btn" onClick={undo} disabled={!history.current.length} aria-label={t("Rückgängig")} data-tip={t("Rückgängig (Strg Z)")}>
              <UndoIcon size={15} />
            </button>
            <button className="icon-btn" onClick={onClose} aria-label={t("Schließen")} data-tip={t("Schließen")}>
              <CloseIcon size={14} />
            </button>
          </div>
        </div>
        <div className="model-body">
          <aside className="model-list">
            <div className="model-list-head">
              <span className="muted small">{t("Quader · {n}", { n: cuboids.length })}</span>
              <button
                className="icon-btn"
                onClick={() => {
                  set([...cuboids, { from: [4, 0, 4], to: [12, 8, 12], tex: "" }]);
                  setSel(cuboids.length);
                }}
                aria-label={t("Quader hinzufügen")}
                data-tip={t("Quader hinzufügen")}
              >
                <PlusIcon size={14} />
              </button>
            </div>
            {cuboids.map((c, i) => (
              <button key={i} className={sel === i ? "model-item active" : "model-item"} onClick={() => setSel(i)}>
                <CubeIcon size={14} />
                <span className="grow">{t("Quader {n}", { n: i + 1 })}</span>
                <span className="mono muted small">
                  {Math.abs(c.to[0] - c.from[0])}×{Math.abs(c.to[1] - c.from[1])}×{Math.abs(c.to[2] - c.from[2])}
                </span>
              </button>
            ))}
            <div className="model-presets">
              <span className="muted small">{t("Vorlagen")}</span>
              <div className="preset-grid">
                {MODEL_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className="btn small"
                    onClick={() => {
                      set(structuredClone(p.cuboids));
                      setSel(0);
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <div className="model-stage">
            <ModelPreview cuboids={cuboids} texFor={texFor} size={360} selected={sel} onSelect={setSel} />
            <div className="muted small center">{t("Ziehen zum Drehen · Seite anklicken zum Auswählen")}</div>
          </div>

          <aside className="model-props">
            {cur ? (
              <>
                <div className="panel-title-lg">{t("Quader {n}", { n: sel + 1 })}</div>
                {(["from", "to"] as const).map((which) => (
                  <div key={which} className="model-axis">
                    <span className="muted small">{which === "from" ? t("Von") : t("Bis")}</span>
                    {["X", "Y", "Z"].map((axis, k) => (
                      <label key={axis} className="axis-field">
                        <span className={`axis axis-${axis.toLowerCase()}`}>{axis}</span>
                        <input className="input" type="number" min={0} max={16} step={0.5} value={cur[which][k]} onChange={(e) => setAxis(which, k, Number(e.target.value))} />
                        <input className="range" type="range" min={0} max={16} step={0.5} value={cur[which][k]} onChange={(e) => setAxis(which, k, Number(e.target.value))} />
                      </label>
                    ))}
                  </div>
                ))}
                <div className="model-axis">
                  <span className="muted small">{t("Textur")}</span>
                  <ItemField project={project} own={own.filter((o) => o.kind === "block")} value={cur.tex} onChange={(v) => setCur({ tex: v })} placeholder={t("Textur dieses Blocks")} />
                </div>
                <div className="row gap-6">
                  <button
                    className="btn small"
                    onClick={() => {
                      set([...cuboids, structuredClone(cur)]);
                      setSel(cuboids.length);
                    }}
                  >
                    <CopyIcon size={13} /> {t("Duplizieren")}
                  </button>
                  <button
                    className="btn small danger"
                    disabled={cuboids.length <= 1}
                    onClick={() => {
                      set(cuboids.filter((_, i) => i !== sel));
                      setSel(Math.max(0, sel - 1));
                    }}
                  >
                    <TrashIcon size={13} /> {t("Entfernen")}
                  </button>
                </div>
              </>
            ) : (
              <p className="muted small">{t("Wähle links einen Quader oder eine Vorlage.")}</p>
            )}
            <div className="toggle-row model-rotate">
              <Toggle label={t("Beim Platzieren drehen")} checked={block.rotate} onChange={(v) => onChange({ rotate: v })} />
              <span>
                {t("Beim Platzieren drehen")} <span className="muted small">· {t("zeigt zum Spieler, z. B. Stuhl")}</span>
              </span>
            </div>
          </aside>
        </div>
        <div className="notes-foot">
          <button className="btn primary" onClick={onClose}>
            {t("Fertig")}
          </button>
        </div>
      </div>
    </div>
  );
}
