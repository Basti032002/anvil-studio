import { useEffect, useRef, useState } from "react";
import { t } from "../../i18n";
import { Content, GuiDef, GuiEl, GuiElKind, Project } from "../../api";
import { Segmented } from "../../components/Chrome";
import { AlertIcon, ArrowLeftIcon, ArrowRightIcon, CopyIcon, GearIcon, GridToggleIcon, GuiIcon, InfoIcon, PlusIcon, TrashIcon } from "../../icons";

/** Bausteine der Palette */
export const GUI_KINDS: { kind: GuiElKind; label: string; desc: string; w: number; h: number; fixed?: boolean; group: string }[] = [
  { kind: "slot_in", label: t("Eingabe-Slot"), desc: t("Hier kommt das Material rein"), w: 18, h: 18, fixed: true, group: "slots" },
  { kind: "slot_fuel", label: t("Brennstoff-Slot"), desc: t("Kohle, Holz …"), w: 18, h: 18, fixed: true, group: "slots" },
  { kind: "slot_out", label: t("Ausgabe-Slot"), desc: t("Hier landet das Ergebnis"), w: 26, h: 26, fixed: true, group: "slots" },
  { kind: "player_inv", label: t("Spieler-Inventar"), desc: t("27 Plätze + Schnellleiste"), w: 162, h: 76, fixed: true, group: "slots" },
  { kind: "arrow", label: t("Fortschrittspfeil"), desc: t("Zeigt, wie weit die Maschine ist"), w: 24, h: 17, group: "show" },
  { kind: "flame", label: t("Flamme"), desc: t("Zeigt den Brennstoff"), w: 14, h: 14, group: "show" },
  { kind: "energy", label: t("Energieanzeige"), desc: t("Balken aus einer Zahl-Variable"), w: 12, h: 52, group: "show" },
  { kind: "tank", label: t("Flüssigkeitstank"), desc: t("Tank aus einer Zahl-Variable"), w: 16, h: 52, group: "show" },
  { kind: "value", label: t("Wert-Anzeige"), desc: t("Text mit dem Wert einer Variable"), w: 70, h: 9, group: "show" },
  { kind: "button", label: t("Knopf"), desc: t("Startet eine Blueprint-Funktion"), w: 60, h: 20, group: "control" },
  { kind: "switch", label: t("Schalter"), desc: t("Schaltet eine Wahr/Falsch-Variable"), w: 80, h: 20, group: "control" },
  { kind: "text", label: t("Text"), desc: t("Beschriftung"), w: 60, h: 9, group: "deco" },
  { kind: "item", label: t("Item-Bild"), desc: t("Zeigt ein Item als Bild"), w: 16, h: 16, fixed: true, group: "deco" },
  { kind: "panel", label: t("Fläche"), desc: t("Farbiger Hintergrund-Bereich"), w: 60, h: 40, group: "deco" },
];
const GROUPS: [string, string][] = [
  ["slots", t("Slots")],
  ["show", t("Anzeigen")],
  ["control", t("Bedienung")],
  ["deco", t("Gestaltung")],
];
const spec = (k: GuiElKind) => GUI_KINDS.find((x) => x.kind === k)!;

let seq = 0;
const elId = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newGuiEl(kind: GuiElKind, x: number, y: number): GuiEl {
  const s = spec(kind);
  return {
    id: elId(),
    kind,
    x,
    y,
    w: s.w,
    h: s.h,
    text: kind === "button" ? t("Start") : kind === "switch" ? t("Schalter") : kind === "text" ? t("Text") : kind === "value" ? t("Wert: ") : "",
    color: kind === "energy" ? "#d83a3a" : kind === "tank" ? "#3a7bd8" : kind === "panel" ? "#8b8b8b" : "#404040",
    var: "",
    max: 100,
    action: "",
    item: kind === "item" ? "minecraft:diamond" : "",
  };
}

/** Vorlagen */
export function guiPreset(kind: "machine" | "panel" | "empty"): GuiEl[] {
  if (kind === "machine")
    return [newGuiEl("slot_in", 55, 16), newGuiEl("slot_fuel", 55, 52), newGuiEl("flame", 57, 36), newGuiEl("arrow", 79, 34), newGuiEl("slot_out", 111, 31), newGuiEl("player_inv", 7, 83)];
  if (kind === "panel") return [{ ...newGuiEl("text", 8, 8), text: t("Bedienfeld") }, newGuiEl("button", 8, 24), newGuiEl("switch", 8, 50), newGuiEl("value", 8, 80)];
  return [];
}

export function newGui(id: string, preset: "machine" | "panel" | "empty" = "machine"): GuiDef {
  return { id, nameEn: "", nameDe: "", width: 176, height: preset === "panel" ? 110 : 166, style: "light", showTitle: true, elements: guiPreset(preset) };
}

const STYLES: { id: GuiDef["style"]; label: string }[] = [
  { id: "light", label: t("Minecraft (hell)") },
  { id: "dark", label: t("Dunkel") },
  { id: "stone", label: t("Stein") },
  { id: "wood", label: t("Holz") },
];

export default function GuiEditor({
  project,
  content,
  gui,
  onChange,
  onLinkMachine,
  onDuplicate,
  onRemove,
}: {
  project: Project;
  content: Content;
  gui: GuiDef;
  onChange: (g: GuiDef) => void;
  onLinkMachine: (blockId: string, guiId: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [grid, setGrid] = useState(true);
  const [zoom, setZoom] = useState(3);
  const [ghost, setGhost] = useState<{ kind: GuiElKind; x: number; y: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const els = gui.elements;
  const cur = els.find((e) => e.id === sel) ?? null;
  const set = (p: Partial<GuiDef>) => onChange({ ...gui, ...p });
  const setEl = (id: string, p: Partial<GuiEl>) => set({ elements: els.map((e) => (e.id === id ? { ...e, ...p } : e)) });
  const clampEl = (e: GuiEl, x: number, y: number) => ({ x: Math.max(0, Math.min(gui.width - e.w, Math.round(x))), y: Math.max(0, Math.min(gui.height - e.h, Math.round(y))) });

  const machines = content.blocks.filter((b) => b.kind === "machine");
  const linked = machines.filter((b) => b.machine?.gui === gui.id);
  const hasSlots = els.some((e) => e.kind.startsWith("slot_"));
  const fns = [...new Set(content.blueprints.flatMap((b) => b.nodes.filter((n) => n.kind === "ev_function").map((n) => n.props.fn).filter(Boolean)))].sort();
  const vars = content.variables ?? [];

  // Tastatur: Entf löscht, Pfeile verschieben
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!cur || mode !== "edit") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const step = e.shiftKey ? 5 : 1;
      const mv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (mv[e.key]) {
        e.preventDefault();
        setEl(cur.id, clampEl(cur, cur.x + mv[e.key][0], cur.y + mv[e.key][1]));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        set({ elements: els.filter((x) => x.id !== cur.id) });
        setSel(null);
      } else if (e.key === "d" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        duplicate(cur);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function duplicate(e: GuiEl) {
    const c = { ...e, id: elId(), ...clampEl(e, e.x + 4, e.y + 4) };
    set({ elements: [...els, c] });
    setSel(c.id);
  }

  function place(kind: GuiElKind, cx?: number, cy?: number) {
    const s = spec(kind);
    const base = newGuiEl(kind, 0, 0);
    const x = cx === undefined ? (gui.width - s.w) / 2 : cx - s.w / 2;
    const y = cy === undefined ? (gui.height - s.h) / 2 : cy - s.h / 2;
    const e = { ...base, ...clampEl(base, x, y) };
    set({ elements: [...els, e] });
    setSel(e.id);
  }

  // Palette: ziehen (Pointer-Events, weil Drag & Drop im Fenster gesperrt ist) oder klicken
  function paletteDown(ev: React.PointerEvent, kind: GuiElKind) {
    const sx = ev.clientX,
      sy = ev.clientY;
    let moved = false;
    const move = (e: PointerEvent) => {
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 4) moved = true;
      if (moved) setGhost({ kind, x: e.clientX, y: e.clientY });
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setGhost(null);
      if (!moved) return place(kind);
      const r = frame.current?.getBoundingClientRect();
      if (r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) place(kind, (e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function elDown(ev: React.PointerEvent, e: GuiEl, resize = false) {
    if (mode !== "edit") return;
    ev.stopPropagation();
    ev.preventDefault();
    setSel(e.id);
    const sx = ev.clientX,
      sy = ev.clientY;
    const start = { ...e };
    const move = (m: PointerEvent) => {
      const dx = (m.clientX - sx) / zoom,
        dy = (m.clientY - sy) / zoom;
      if (resize) {
        const w = Math.max(4, Math.min(gui.width - start.x, Math.round(start.w + dx)));
        const h = Math.max(4, Math.min(gui.height - start.y, Math.round(start.h + dy)));
        onChangeRef.current({ id: e.id, p: { w, h } });
      } else onChangeRef.current({ id: e.id, p: clampEl(start, start.x + dx, start.y + dy) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  // aktuelle Fassung für laufende Zieh-Vorgänge
  const onChangeRef = useRef<(x: { id: string; p: Partial<GuiEl> }) => void>(() => {});
  onChangeRef.current = ({ id, p }) => setEl(id, p);

  function move(id: string, dir: -1 | 1) {
    const i = els.findIndex((e) => e.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= els.length) return;
    const list = [...els];
    [list[i], list[j]] = [list[j], list[i]];
    set({ elements: list });
  }

  const warn: string[] = [];
  if (linked.length && !els.some((e) => e.kind === "slot_in")) warn.push(t("Die Maschine braucht einen Eingabe-Slot."));
  if (linked.length && !els.some((e) => e.kind === "slot_out")) warn.push(t("Die Maschine braucht einen Ausgabe-Slot."));
  if (hasSlots && !els.some((e) => e.kind === "player_inv")) warn.push(t("Ohne Spieler-Inventar kann man keine Items hineinlegen."));
  for (const e of els) {
    if (e.x + e.w > gui.width || e.y + e.h > gui.height) {
      warn.push(t("Ein Element ragt über den Rand."));
      break;
    }
  }
  for (const e of els) if ((e.kind === "energy" || e.kind === "tank" || e.kind === "switch" || e.kind === "value") && !e.var) {
    warn.push(t("„{name}“ hat noch keine Variable.", { name: spec(e.kind).label }));
    break;
  }
  for (const e of els) if (e.kind === "button" && !e.action) {
    warn.push(t("Ein Knopf hat noch keine Funktion."));
    break;
  }

  return (
    <div className="gui-ed">
      <header className="gui-ed-head">
        <span className="gui-ed-icon">
          <GuiIcon size={18} />
        </span>
        <div className="grow">
          <input className="gui-ed-name" value={gui.nameEn} placeholder={gui.id} onChange={(e) => set({ nameEn: e.target.value })} aria-label={t("Name")} />
          <div className="muted small mono">{gui.id}</div>
        </div>
        <Segmented
          label={t("Ansicht")}
          value={mode}
          onChange={(v) => setMode(v)}
          options={[
            { value: "edit", label: t("Bearbeiten") },
            { value: "preview", label: t("Vorschau") },
          ]}
        />
        <button className="icon-btn" onClick={onDuplicate} data-tip={t("Duplizieren")} aria-label={t("Duplizieren")}>
          <CopyIcon size={15} />
        </button>
        <button className="icon-btn danger" onClick={onRemove} data-tip={t("Entfernen")} aria-label={t("Entfernen")}>
          <TrashIcon size={15} />
        </button>
      </header>

      <div className="gui-ed-body">
        <aside className="gui-palette">
          {GROUPS.map(([g, label]) => (
            <div key={g} className="gui-pal-group">
              <div className="tags-group-label">{label}</div>
              {GUI_KINDS.filter((k) => k.group === g).map((k) => (
                <button key={k.kind} className="gui-pal-item" onPointerDown={(e) => paletteDown(e, k.kind)} title={k.desc}>
                  <span className={`gui-pal-prev k-${k.kind}`} />
                  <span className="gui-pal-text">
                    <strong>{k.label}</strong>
                    <span className="muted tiny">{k.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
          <p className="muted tiny">{t("Ziehen oder anklicken, um es einzufügen.")}</p>
        </aside>

        <section className="gui-stage">
          <div className="gui-toolbar">
            <label className="gui-tool">
              <span className="muted small">{t("Größe")}</span>
              <input className="input mono" type="number" min={40} max={400} value={gui.width} onChange={(e) => set({ width: Math.max(40, Math.min(400, Number(e.target.value) || 176)) })} />
              <span className="muted">×</span>
              <input className="input mono" type="number" min={40} max={400} value={gui.height} onChange={(e) => set({ height: Math.max(40, Math.min(400, Number(e.target.value) || 166)) })} />
            </label>
            <label className="gui-tool">
              <span className="muted small">{t("Hintergrund")}</span>
              <select className="input" value={gui.style} onChange={(e) => set({ style: e.target.value as GuiDef["style"] })}>
                {STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <button className={grid ? "btn small active-soft" : "btn small"} onClick={() => setGrid((g) => !g)}>
              <GridToggleIcon size={14} /> {t("Raster")}
            </button>
            <select className="input gui-zoom" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label={t("Zoom")}>
              {[2, 3, 4].map((z) => (
                <option key={z} value={z}>
                  {z * 100} %
                </option>
              ))}
            </select>
            <span className="grow" />
            <span className="muted small">{t("Pfeiltasten verschieben · Entf löscht · Strg+D dupliziert")}</span>
          </div>
          <div className="gui-canvas" onPointerDown={() => setSel(null)}>
            <div
              ref={frame}
              className={`gui-frame style-${gui.style}${grid && mode === "edit" ? " grid" : ""}${mode === "preview" ? " preview" : ""}`}
              style={{ width: gui.width * zoom, height: gui.height * zoom, ["--z" as string]: zoom, backgroundSize: grid ? `${9 * zoom}px ${9 * zoom}px` : undefined }}
            >
              {gui.showTitle && <div className="gui-title" style={{ left: 8 * zoom, top: 6 * zoom, fontSize: 8 * zoom }}>{gui.nameEn || gui.id}</div>}
              {els.map((e) => (
                <div
                  key={e.id}
                  className={`gui-el k-${e.kind}${e.id === sel && mode === "edit" ? " sel" : ""}`}
                  style={{ left: e.x * zoom, top: e.y * zoom, width: e.w * zoom, height: e.h * zoom, ["--c" as string]: e.color }}
                  onPointerDown={(ev) => elDown(ev, e)}
                >
                  <ElView e={e} zoom={zoom} preview={mode === "preview"} />
                  {e.id === sel && mode === "edit" && !spec(e.kind).fixed && <span className="gui-resize" onPointerDown={(ev) => elDown(ev, e, true)} />}
                </div>
              ))}
            </div>
          </div>
          {warn.length > 0 && (
            <div className="gui-warn">
              {warn.map((w) => (
                <div key={w}>
                  <AlertIcon size={13} /> {w}
                </div>
              ))}
            </div>
          )}
          <footer className="gui-foot">
            <span className="muted small">{t("Gehört zu")}</span>
            {linked.map((b) => (
              <span key={b.id} className="tags-chip own">
                <GearIcon size={12} /> {b.nameEn || b.nameDe || b.id}
                <button aria-label={t("Entfernen")} onClick={() => onLinkMachine(b.id, "")}>
                  ×
                </button>
              </span>
            ))}
            {machines.filter((b) => b.machine?.gui !== gui.id).length > 0 && (
              <select className="input gui-link" value="" onChange={(e) => e.target.value && onLinkMachine(e.target.value, gui.id)}>
                <option value="">{t("+ Maschine verbinden …")}</option>
                {machines
                  .filter((b) => b.machine?.gui !== gui.id)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nameEn || b.nameDe || b.id}
                      {b.machine?.gui ? ` (${t("hat schon eine")})` : ""}
                    </option>
                  ))}
              </select>
            )}
            <span className="grow" />
            <span className="muted tiny">
              <InfoIcon size={12} /> {t("Ohne Maschine: im Blueprint mit „Oberfläche öffnen“ anzeigen.")}
            </span>
          </footer>
        </section>

        <aside className="gui-props">
          {cur ? (
            <>
              <div className="gui-props-head">
                <span className={`gui-pal-prev k-${cur.kind}`} />
                <strong className="grow">{spec(cur.kind).label}</strong>
                <button className="icon-btn" onClick={() => duplicate(cur)} data-tip={t("Duplizieren")} aria-label={t("Duplizieren")}>
                  <CopyIcon size={14} />
                </button>
                <button
                  className="icon-btn danger"
                  onClick={() => {
                    set({ elements: els.filter((x) => x.id !== cur.id) });
                    setSel(null);
                  }}
                  data-tip={t("Löschen")}
                  aria-label={t("Löschen")}
                >
                  <TrashIcon size={14} />
                </button>
              </div>
              <div className="gui-xywh">
                {(["x", "y", "w", "h"] as const).map((k) => (
                  <label key={k}>
                    <span>{k.toUpperCase()}</span>
                    <input
                      className="input mono"
                      type="number"
                      value={cur[k]}
                      disabled={(k === "w" || k === "h") && spec(cur.kind).fixed}
                      onChange={(e) => setEl(cur.id, { [k]: Math.max(k === "w" || k === "h" ? 1 : 0, Math.round(Number(e.target.value) || 0)) })}
                    />
                  </label>
                ))}
              </div>
              {(cur.kind === "button" || cur.kind === "switch" || cur.kind === "text" || cur.kind === "value") && (
                <label className="field">
                  <span>{cur.kind === "value" ? t("Text davor") : t("Beschriftung")}</span>
                  <input className="input" value={cur.text} onChange={(e) => setEl(cur.id, { text: e.target.value })} />
                </label>
              )}
              {(cur.kind === "energy" || cur.kind === "tank" || cur.kind === "value" || cur.kind === "switch") && (
                <label className="field">
                  <span>{cur.kind === "switch" ? t("Schaltet Variable") : t("Zeigt an")}</span>
                  <select className="input" value={cur.var} onChange={(e) => setEl(cur.id, { var: e.target.value })}>
                    <option value="">{t("– Variable wählen –")}</option>
                    {vars
                      .filter((v) => (cur.kind === "switch" ? v.kind === "logic" : v.kind === "number"))
                      .map((v) => (
                        <option key={v.name} value={v.name}>
                          {v.name}
                        </option>
                      ))}
                  </select>
                  {vars.filter((v) => (cur.kind === "switch" ? v.kind === "logic" : v.kind === "number")).length === 0 && (
                    <span className="muted tiny">{cur.kind === "switch" ? t("Lege im Variablen-Tab eine Wahr/Falsch-Variable an.") : t("Lege im Variablen-Tab eine Zahl-Variable an.")}</span>
                  )}
                </label>
              )}
              {(cur.kind === "energy" || cur.kind === "tank") && (
                <label className="field">
                  <span>{t("Füllt sich bis")}</span>
                  <input className="input mono" type="number" min={1} value={cur.max} onChange={(e) => setEl(cur.id, { max: Math.max(1, Number(e.target.value) || 1) })} />
                </label>
              )}
              {cur.kind === "button" && (
                <label className="field">
                  <span>{t("Startet Funktion")}</span>
                  <input className="input" list="gui-fns" value={cur.action} placeholder={t("Name der Funktion")} onChange={(e) => setEl(cur.id, { action: e.target.value })} />
                  <datalist id="gui-fns">
                    {fns.map((f) => (
                      <option key={f} value={f} />
                    ))}
                  </datalist>
                  {cur.action && !fns.includes(cur.action) && <span className="muted tiny">{t("Lege dazu einen Blueprint mit „Eigene Funktion“ und diesem Namen an.")}</span>}
                </label>
              )}
              {cur.kind === "item" && (
                <label className="field">
                  <span>{t("Item")}</span>
                  <input className="input mono" list="gui-items" value={cur.item} onChange={(e) => setEl(cur.id, { item: e.target.value.trim().toLowerCase() })} />
                  <datalist id="gui-items">
                    {[...content.items.map((i) => `${project.modId}:${i.id}`), ...content.blocks.map((b) => `${project.modId}:${b.id}`)].map((i) => (
                      <option key={i} value={i} />
                    ))}
                  </datalist>
                </label>
              )}
              {(cur.kind === "energy" || cur.kind === "tank" || cur.kind === "text" || cur.kind === "value" || cur.kind === "panel") && (
                <label className="field">
                  <span>{t("Aussehen")}</span>
                  <div className="gui-color">
                    <input type="color" value={/^#[0-9a-f]{6}$/i.test(cur.color) ? cur.color : "#404040"} onChange={(e) => setEl(cur.id, { color: e.target.value })} />
                    <input className="input mono" value={cur.color} onChange={(e) => setEl(cur.id, { color: e.target.value })} />
                  </div>
                </label>
              )}
              <p className="muted tiny">{KIND_HELP[cur.kind]}</p>
            </>
          ) : (
            <>
              <div className="gui-props-head">
                <strong className="grow">{t("Oberfläche")}</strong>
              </div>
              <label className="field">
                <span>{t("Titel")}</span>
                <input className="input" value={gui.nameEn} placeholder={gui.id} onChange={(e) => set({ nameEn: e.target.value })} />
              </label>
              <label className="gui-check">
                <input type="checkbox" checked={gui.showTitle} onChange={(e) => set({ showTitle: e.target.checked })} /> {t("Titel oben anzeigen")}
              </label>
              <div className="field">
                <span>{t("Vorlage laden")}</span>
                <div className="gui-presets">
                  <button className="btn small" onClick={() => set({ elements: guiPreset("machine"), height: Math.max(gui.height, 166) })}>
                    {t("Ofen-Maschine")}
                  </button>
                  <button className="btn small" onClick={() => set({ elements: guiPreset("panel") })}>
                    {t("Bedienfeld")}
                  </button>
                  <button className="btn small" onClick={() => set({ elements: [] })}>
                    {t("Leer")}
                  </button>
                </div>
              </div>
              <p className="muted tiny">{t("Wähle ein Element auf der Fläche, um es zu bearbeiten.")}</p>
            </>
          )}

          <div className="gui-layers">
            <div className="tags-group-label">{t("Ebenen")}</div>
            {[...els].reverse().map((e) => (
              <div key={e.id} className={e.id === sel ? "gui-layer active" : "gui-layer"} onClick={() => setSel(e.id)}>
                <span className={`gui-pal-prev small k-${e.kind}`} />
                <span className="grow">
                  {spec(e.kind).label}
                  {e.text ? <span className="muted"> · {e.text}</span> : e.var ? <span className="muted"> · {e.var}</span> : null}
                </span>
                <button className="icon-btn tiny" onClick={(ev) => (ev.stopPropagation(), move(e.id, 1))} aria-label={t("Nach vorne")} data-tip={t("Nach vorne")}>
                  <ArrowLeftIcon size={11} />
                </button>
                <button className="icon-btn tiny" onClick={(ev) => (ev.stopPropagation(), move(e.id, -1))} aria-label={t("Nach hinten")} data-tip={t("Nach hinten")}>
                  <ArrowRightIcon size={11} />
                </button>
              </div>
            ))}
            {els.length === 0 && (
              <p className="muted tiny">
                <PlusIcon size={11} /> {t("Noch leer – zieh Bausteine aus der Palette.")}
              </p>
            )}
          </div>
          <p className="muted tiny">{t("Shift-Klick auf Items verschiebt sie wie gewohnt zwischen Inventar und Maschine.")}</p>
        </aside>
      </div>
      {ghost && (
        <div className="gui-ghost" style={{ left: ghost.x, top: ghost.y, width: spec(ghost.kind).w * zoom, height: spec(ghost.kind).h * zoom }}>
          <div className={`gui-el k-${ghost.kind}`} style={{ position: "static", width: "100%", height: "100%" }}>
            <ElView e={newGuiEl(ghost.kind, 0, 0)} zoom={zoom} preview={false} />
          </div>
        </div>
      )}
    </div>
  );
}

const KIND_HELP: Record<GuiElKind, string> = {
  slot_in: t("Nimmt das Material für die Rezepte der Maschine auf."),
  slot_fuel: t("Nur nötig, wenn die Maschine Brennstoff braucht."),
  slot_out: t("Hier legt die Maschine das Ergebnis ab. Man kann nichts hineinlegen."),
  player_inv: t("Das Inventar des Spielers mit Schnellleiste."),
  arrow: t("Füllt sich, während die Maschine arbeitet."),
  flame: t("Zeigt, wie lange der Brennstoff noch reicht."),
  energy: t("Füllt sich nach dem Wert einer Zahl-Variable."),
  tank: t("Füllt sich nach dem Wert einer Zahl-Variable."),
  value: t("Zeigt den Text und dahinter den aktuellen Wert."),
  button: t("Ein Klick startet die gewählte Blueprint-Funktion auf dem Server."),
  switch: t("Ein Klick schaltet die Variable zwischen Wahr und Falsch um."),
  text: t("Feste Beschriftung."),
  item: t("Zeigt ein Item oder einen Block als Bild."),
  panel: t("Eine farbige Fläche, z. B. als Rahmen hinter anderen Elementen."),
};

function ElView({ e, zoom, preview }: { e: GuiEl; zoom: number; preview: boolean }) {
  switch (e.kind) {
    case "player_inv":
      return (
        <div className="gui-inv" style={{ gap: 0 }}>
          {Array.from({ length: 36 }, (_, i) => (
            <span key={i} className="gui-slot" style={{ left: (i % 9) * 18 * zoom, top: (i < 27 ? Math.floor(i / 9) * 18 : 58) * zoom, width: 18 * zoom, height: 18 * zoom }} />
          ))}
        </div>
      );
    case "arrow":
      return (
        <svg viewBox="0 0 24 17" preserveAspectRatio="none" width="100%" height="100%">
          <path d="M0 6 H15 V1 L23 8.5 L15 16 V11 H0 Z" fill="#8b8b8b" />
          {preview && <path d="M0 6 H15 V1 L23 8.5 L15 16 V11 H0 Z" fill="#fff" clipPath="inset(0 40% 0 0)" style={{ clipPath: "inset(0 40% 0 0)" }} />}
        </svg>
      );
    case "flame":
      return (
        <svg viewBox="0 0 14 14" width="100%" height="100%">
          <path d="M7 0 C9 4 13 6 12 10 C11 13 9 14 7 14 C4 14 2 12 2 9 C2 6 5 5 5 2 C6 3 7 4 7 0 Z" fill={preview ? "#ff9a1f" : "#8b8b8b"} />
          {preview && <path d="M7 6 C8 8 10 9 9.5 11 C9 13 8 13.5 7 13.5 C5.5 13.5 4.5 12.5 4.5 11 C4.5 9.5 6 9 7 6 Z" fill="#ffe04a" />}
        </svg>
      );
    case "energy":
    case "tank":
      return <div className="gui-bar">{<span style={{ height: preview ? "65%" : "35%", background: e.color }} />}</div>;
    case "button":
      return <div className="gui-btn" style={{ fontSize: 8 * zoom }}>{e.text}</div>;
    case "switch":
      return (
        <div className="gui-btn" style={{ fontSize: 8 * zoom }}>
          {e.text ? `${e.text}: ` : ""}
          {preview ? t("AN") : t("AUS")}
        </div>
      );
    case "text":
      return (
        <div className="gui-text" style={{ fontSize: 8 * zoom, color: e.color }}>
          {e.text}
        </div>
      );
    case "value":
      return (
        <div className="gui-text" style={{ fontSize: 8 * zoom, color: e.color }}>
          {e.text}
          {preview ? "42" : e.var ? `{${e.var}}` : "?"}
        </div>
      );
    case "item":
      return <div className="gui-item">{(e.item.split(":")[1] ?? "?").slice(0, 2).toUpperCase()}</div>;
    case "panel":
      return <div className="gui-panel" style={{ background: e.color }} />;
    default:
      return <span className="gui-slot" style={{ inset: 0 }} />;
  }
}
