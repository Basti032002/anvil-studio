import { t } from "../../i18n";
import { useEffect, useRef, useState } from "react";
import { Ability, AbilityKind, Blueprint, BlockDef, Content, Project } from "../../api";
import { Toggle } from "../../components/Chrome";
import { OwnEntry } from "../../components/ItemPicker";
import {
  ArrowRightIcon,
  BatteryIcon,
  BlueprintIcon,
  ChestIcon,
  ChevronIcon,
  CubeIcon,
  GearIcon,
  GemIcon,
  GuiIcon,
  LampIcon,
  LayersIcon,
  LightningIcon,
  MoveIcon,
  PlugIcon,
  PlusIcon,
  PuzzleIcon,
  RefreshIcon,
  SearchIcon,
  ToggleIcon,
  TrashIcon,
} from "../../icons";
import { MachineEditor } from "./StationEditors";

/** Katalog der Block-Fähigkeiten. Muss zu src-tauri/src/abilities.rs passen. */
export type AbilityInfo = { kind: AbilityKind; group: string; label: string; desc: string; icon: React.ReactNode; color: string; plugin?: string; fields?: import("../../plugins").PluginField[] };
export const ABILITIES: AbilityInfo[] = [
  { kind: "inventory", group: t("Speichern"), label: t("Inventar"), desc: t("Slots für Items"), icon: <ChestIcon size={15} />, color: "#5aa8ff" },
  { kind: "energy", group: t("Speichern"), label: t("Energiespeicher"), desc: t("Strom speichern (FE) – auch mit anderen Mods"), icon: <BatteryIcon size={15} />, color: "#f0c94c" },
  { kind: "tick", group: t("Verhalten"), label: t("Tick-Logik"), desc: t("Ein Blueprint läuft regelmäßig für jeden Block"), icon: <RefreshIcon size={15} />, color: "#b892ff" },
  { kind: "redstone", group: t("Verhalten"), label: t("Redstone"), desc: t("Auf Redstone reagieren oder ein Signal senden"), icon: <LightningIcon size={15} />, color: "#f26d6d" },
  { kind: "recipes", group: t("Verhalten"), label: t("Rezepte verarbeiten"), desc: t("Wie Ofen oder Presse: Eingang → Ausgang"), icon: <GearIcon size={15} />, color: "#5aa8ff" },
  { kind: "gui", group: t("Verhalten"), label: t("Oberfläche"), desc: t("Eigenes Fenster beim Rechtsklick"), icon: <GuiIcon size={15} />, color: "#f0c94c" },
  { kind: "facing", group: t("Aussehen"), label: t("Ausrichtung"), desc: t("Vorderseite zeigt beim Setzen zum Spieler"), icon: <MoveIcon size={15} />, color: "#3ec7b5" },
  { kind: "active", group: t("Aussehen"), label: t("An/Aus-Zustand"), desc: t("Eigene Textur, wenn der Block an ist"), icon: <ToggleIcon size={15} />, color: "#5aa8ff" },
  { kind: "light", group: t("Aussehen"), label: t("Leuchten"), desc: t("Immer oder nur im Zustand „an“"), icon: <LampIcon size={15} />, color: "#f0c94c" },
  { kind: "connect", group: t("Aussehen"), label: t("Verbindet sich"), desc: t("Form wie ein Kabel – verbindet sich mit Nachbarn"), icon: <PlugIcon size={15} />, color: "#3ec7b5" },
  { kind: "shapes", group: t("Aussehen"), label: t("Formen"), desc: t("Treppe, Stufe, Mauer … aus demselben Material"), icon: <LayersIcon size={15} />, color: "#6cc957" },
  { kind: "ore", group: t("Welt"), label: t("Erz-Vorkommen"), desc: t("Erscheint unter der Erde in neuen Chunks"), icon: <GemIcon size={15} />, color: "#6cc957" },
];
export const abilityInfo = (k: string) => ABILITIES.find((a) => a.kind === k);

const SIDE_NAMES = [t("Vorne"), t("Hinten"), t("Links"), t("Rechts"), t("Oben"), t("Unten")];
const SIDE_MODES: [string, string][] = [
  ["b", t("rein & raus")],
  ["i", t("nur rein")],
  ["o", t("nur raus")],
  ["n", t("gesperrt")],
];

/** Welche Fähigkeiten ein Block hat – ore/shapes werden aus den Block-Feldern abgeleitet */
export function blockAbilities(b: BlockDef): Ability[] {
  const list = [...(b.abilities ?? [])].filter((a) => a.kind !== "ore" && a.kind !== "shapes");
  if (b.shapes.length) list.push({ kind: "shapes", props: {} });
  if (b.ore.enabled) list.push({ kind: "ore", props: {} });
  return list;
}

export function AbilitiesEditor({
  project,
  content,
  block,
  own,
  onChange,
  onBlueprint,
  onOpenBlueprint,
  onTab,
}: {
  project: Project;
  content: Content;
  block: BlockDef;
  own: OwnEntry[];
  onChange: (patch: Partial<BlockDef>) => void;
  /** Blueprint mit diesem Block-Ereignis anlegen */
  onBlueprint: (event: string) => void;
  onOpenBlueprint: (index: number) => void;
  /** zu einem Reiter des Blocks springen */
  onTab: (tab: "mining" | "shapes" | "model") => void;
}) {
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const list = blockAbilities(block);
  const has = (k: string) => list.some((a) => a.kind === k);
  const stored = block.abilities ?? [];
  const setProps = (kind: string, patch: Record<string, string>) =>
    onChange({ abilities: stored.map((a) => (a.kind === kind ? { ...a, props: { ...a.props, ...patch } } : a)) });
  const add = (kind: AbilityKind) => {
    setAdding(false);
    setOpen((o) => ({ ...o, [kind]: true }));
    if (kind === "ore") return onChange({ ore: { ...block.ore, enabled: true } });
    if (kind === "shapes") return onChange({ shapes: block.shapes.length ? block.shapes : ["stairs", "slab"] });
    const defaults: Partial<Record<string, Record<string, string>>> = {
      energy: { capacity: "10000", in: "100", out: "100", sides: "bbbbbb", push: "true" },
      inventory: { slots: "9" },
      tick: { ticks: "20" },
      light: { level: "15", when: has("active") ? "active" : "always" },
      facing: { mode: "horizontal" },
      connect: { to: "energy" },
      recipes: { use: "20", fuel: has("energy") ? "false" : "true" },
      redstone: { emit: "false" },
      gui: { gui: content.guis?.[0]?.id ?? "" },
    };
    const info = abilityInfo(kind);
    if (info?.fields) defaults[kind] = Object.fromEntries(info.fields.map((f) => [f.key, f.def ?? ""]));
    const extra: Partial<BlockDef> = {};
    if (kind === "connect") Object.assign(extra, { material: block.material === "stone" ? "metal" : block.material });
    onChange({ ...extra, abilities: [...stored, { kind, props: defaults[kind] ?? {} }] });
    if (kind === "recipes" && !(block.machine?.recipes ?? []).length)
      onChange({ ...extra, abilities: [...stored, { kind, props: defaults[kind] ?? {} }], machine: { ...(block.machine ?? { fuel: true, recipes: [] }), recipes: [{ input: "minecraft:cobblestone", inputCount: 1, output: "minecraft:gravel", outputCount: 1, time: 100 }] } });
  };
  const remove = (kind: string) => {
    if (kind === "ore") return onChange({ ore: { ...block.ore, enabled: false } });
    if (kind === "shapes") return onChange({ shapes: [] });
    onChange({ abilities: stored.filter((a) => a.kind !== kind) });
  };

  const tickBps = content.blueprints
    .map((bp, i) => ({ bp, i }))
    .filter(({ bp }) => bp.nodes.some((n) => n.kind.startsWith("ev_block_") && (n.props.target ?? "").split(":").pop() === block.id));

  return (
    <div className="abilities">
      <div className="abilities-head">
        <div className="grow">
          <div className="panel-title-lg">{t("Fähigkeiten")}</div>
          <div className="muted small">{t("Was dieser Block kann. Was er damit macht, steuerst du mit Blueprints.")}</div>
        </div>
        <span className="chip-soft">{t("{n} Fähigkeiten", { n: list.length })}</span>
      </div>
      {list.length === 0 && <div className="abilities-empty muted">{t("Noch ein ganz normaler Block. Füge Fähigkeiten hinzu – z. B. Energiespeicher + Tick-Logik für einen Generator.")}</div>}
      {list.map((a) => {
        const info = abilityInfo(a.kind);
        if (!info) return null;
        const isOpen = open[a.kind] ?? true;
        return (
          <section key={a.kind} className="ability-card">
            <div className="ability-head" onClick={() => setOpen((o) => ({ ...o, [a.kind]: !isOpen }))}>
              <span className="ability-icon" style={{ ["--ac" as string]: info.color }}>
                {info.icon ?? <PuzzleIcon size={15} />}
              </span>
              <span className="grow">
                <b>{info.label}</b>
                {info.plugin && <> <PluginChip name={info.plugin} /></>}
                <span className="muted small"> · {summary(a, block, content)}</span>
              </span>
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(a.kind);
                }}
                aria-label={t("Fähigkeit entfernen")}
                data-tip={t("Fähigkeit entfernen")}
              >
                <TrashIcon size={14} />
              </button>
              <span className={`ability-chev ${isOpen ? "open" : ""}`}>
                <ChevronIcon size={12} />
              </span>
            </div>
            {isOpen && (
              <div className="ability-body">
                <AbilityForm project={project} content={content} block={block} own={own} a={a} has={has} set={(p) => setProps(a.kind, p)} onChange={onChange} onTab={onTab} />
                {(a.kind === "tick" || a.kind === "redstone") && (
                  <div className="ability-bps">
                    {tickBps.map(({ bp, i }) => (
                      <button key={i} className="ability-bp" onClick={() => onOpenBlueprint(i)}>
                        <BlueprintIcon size={14} />
                        <span className="grow">{bp.name}</span>
                        <span className="muted small">{t("{n} Knoten", { n: bp.nodes.length })}</span>
                        <ArrowRightIcon size={13} />
                      </button>
                    ))}
                    <button className="btn small" onClick={() => onBlueprint(a.kind === "tick" ? "ev_block_tick" : "ev_block_redstone")}>
                      <PlusIcon size={13} /> {a.kind === "tick" ? t("Blueprint für den Tick anlegen") : t("Blueprint für Redstone anlegen")}
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
      <div className="ability-add-wrap">
        <button className="ability-add" onClick={() => setAdding((v) => !v)}>
          <PlusIcon size={14} /> {t("Fähigkeit hinzufügen")}
        </button>
        {adding && <AbilityMenu has={has} onPick={add} onClose={() => setAdding(false)} />}
      </div>
      <div className="ability-hint small muted">
        <CubeIcon size={13} /> {t("Rechtsklick auf den Block: zuerst Blueprints mit „Block wird benutzt“, sonst Oberfläche, Inventar oder Füllstand.")}
        <button className="link-btn small" onClick={() => onBlueprint("ev_block_use")}>
          {t("Rechtsklick-Blueprint anlegen")}
        </button>
      </div>
    </div>
  );
}

function summary(a: Ability, b: BlockDef, c: Content): string {
  const p = a.props;
  if (a.kind.includes(":"))
    return (
      abilityInfo(a.kind)
        ?.fields?.slice(0, 3)
        .map((f) => {
          const v = p[f.key] ?? f.def ?? "";
          const o = (f.options ?? []).map((x) => (Array.isArray(x) ? x : [x.id, x.label])).find(([id]) => String(id) === v);
          return `${f.label}: ${o ? o[1] : v}`;
        })
        .join(" · ") ?? ""
    );
  switch (a.kind) {
    case "energy":
      return t("{c} FE · rein {i} · raus {o} pro Tick", { c: Number(p.capacity ?? 10000).toLocaleString(), i: p.in ?? "100", o: p.out ?? "100" });
    case "inventory":
      return t("{n} Slots", { n: p.slots ?? "9" });
    case "tick":
      return t("alle {n} Ticks", { n: p.ticks ?? "20" });
    case "gui":
      return c.guis?.find((g) => g.id === p.gui)?.nameEn || p.gui || t("keine gewählt");
    case "facing":
      return p.mode === "all" ? t("alle 6 Richtungen") : t("4 Himmelsrichtungen");
    case "active":
      return t("Textur „{id}_on“", { id: b.id });
    case "light":
      return p.when === "active" ? t("Stufe {l}, wenn an", { l: p.level ?? "15" }) : t("Stufe {l}", { l: p.level ?? "15" });
    case "redstone":
      return p.emit === "true" ? t("reagiert und sendet") : t("reagiert");
    case "connect":
      return p.to === "same" ? t("mit gleichen Blöcken") : p.to === "inventory" ? t("mit Inventaren") : t("mit allem, was Strom hat");
    case "recipes":
      return t("{n} Rezepte", { n: b.machine?.recipes?.length ?? 0 });
    case "shapes":
      return b.shapes.join(", ");
    case "ore":
      return t("Y {a} bis {b}", { a: b.ore.minY, b: b.ore.maxY });
  }
  return "";
}

function NumIn({ label, value, onChange, min = 0, max = 2_000_000_000, unit }: { label: string; value: string | undefined; onChange: (v: string) => void; min?: number; max?: number; unit?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="input-unit">
        <input className="input" type="number" min={min} max={max} value={value ?? ""} onChange={(e) => onChange(String(Math.max(min, Math.min(max, Math.round(Number(e.target.value) || 0)))))} />
        {unit && <span className="muted small">{unit}</span>}
      </span>
    </label>
  );
}

function AbilityForm({
  project,
  content,
  block,
  own,
  a,
  has,
  set,
  onChange,
  onTab,
}: {
  project: Project;
  content: Content;
  block: BlockDef;
  own: OwnEntry[];
  a: Ability;
  has: (k: string) => boolean;
  set: (p: Record<string, string>) => void;
  onChange: (patch: Partial<BlockDef>) => void;
  onTab: (tab: "mining" | "shapes" | "model") => void;
}) {
  const p = a.props;
  if (a.kind.includes(":")) {
    const info = abilityInfo(a.kind);
    if (!info) return <div className="muted small">{t("Das Plugin für diese Fähigkeit ist nicht installiert oder ausgeschaltet. Die Einstellungen bleiben erhalten.")}</div>;
    return (
      <div className="ability-grid">
        {(info.fields ?? []).map((f) => (
          <label key={f.key} className="field">
            <span className="field-label">{f.label}</span>
            {f.type === "select" || f.type === "bool" ? (
              <select className="input" value={p[f.key] ?? f.def ?? ""} onChange={(e) => set({ [f.key]: e.target.value })}>
                {(f.type === "bool" ? [["true", t("Ja")], ["false", t("Nein")]] : (f.options ?? []).map((o) => (Array.isArray(o) ? o : [o.id, o.label]))).map(([v, l]) => (
                  <option key={String(v)} value={String(v)}>
                    {String(l)}
                  </option>
                ))}
              </select>
            ) : (
              <input className="input" type={f.type === "number" ? "number" : "text"} value={p[f.key] ?? f.def ?? ""} onChange={(e) => set({ [f.key]: e.target.value })} />
            )}
          </label>
        ))}
      </div>
    );
  }
  switch (a.kind) {
    case "energy": {
      const sides = (p.sides ?? "bbbbbb").padEnd(6, "b");
      return (
        <>
          <div className="ability-grid">
            <NumIn label={t("Speicher")} unit="FE" min={1} value={p.capacity} onChange={(v) => set({ capacity: v })} />
            <NumIn label={t("Max. rein pro Tick")} unit="FE" value={p.in} onChange={(v) => set({ in: v })} />
            <NumIn label={t("Max. raus pro Tick")} unit="FE" value={p.out} onChange={(v) => set({ out: v })} />
          </div>
          <div className="field">
            <span className="field-label">{t("Seiten")}{!has("facing") && <span className="muted"> · {t("ohne Ausrichtung ist „vorne“ Norden")}</span>}</span>
            <div className="ability-sides">
              {SIDE_NAMES.map((n, i) => (
                <label key={n} className={`ability-side side-${sides[i]}`}>
                  <span>{n}</span>
                  <select value={sides[i]} onChange={(e) => set({ sides: sides.slice(0, i) + e.target.value + sides.slice(i + 1) })}>
                    {SIDE_MODES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
          <div className="toggle-row" style={{ flexDirection: "row" }}>
            <Toggle label={t("Automatisch abgeben")} checked={p.push !== "false"} onChange={(v) => set({ push: v ? "true" : "false" })} />
            <span>
              {t("Automatisch abgeben")} <span className="muted small">· {t("gibt Strom an Nachbarn (Seiten mit „raus“) – für Kabel und Akkus ohne Blueprint")}</span>
            </span>
          </div>
          <div className="muted small">{t("Funktioniert mit Kabeln und Maschinen aus anderen Mods (Forge Energy). Strom erzeugen oder verbrauchen machst du im Blueprint.")}</div>
        </>
      );
    }
    case "inventory": {
      const n = Number(p.slots ?? 9);
      const real = n <= 3 ? 3 : n <= 5 ? 5 : Math.min(54, Math.ceil(n / 9) * 9);
      return (
        <>
          <label className="field">
            <span className="field-label">{t("Slots · {n}", { n })}</span>
            <input type="range" className="range full" min={1} max={54} value={n} onChange={(e) => set({ slots: e.target.value })} />
          </label>
          <div className="muted small">
            {real === 3
              ? t("Wird zur Ofen-Ansicht: Slot 1 oben, Slot 2 unten, Slot 3 rechts.")
              : real === 5
                ? t("Wird zur Trichter-Ansicht mit 5 Slots.")
                : t("Wird zu einer Truhen-Ansicht mit {n} Slots ({r} Reihen).", { n: real, r: real / 9 })}{" "}
            {t("Trichter können Items hinein- und herausholen.")}
          </div>
        </>
      );
    }
    case "tick":
      return (
        <>
          <div className="ability-grid">
            <NumIn label={t("Läuft alle")} unit={t("Ticks")} min={1} max={72000} value={p.ticks} onChange={(v) => set({ ticks: v })} />
          </div>
          <div className="muted small">{t("20 Ticks = 1 Sekunde. Im Blueprint startet das Ereignis „Block-Tick“ – dort legst du fest, was passiert.")}</div>
        </>
      );
    case "gui":
      return (
        <label className="field">
          <span className="field-label">{t("Oberfläche")}</span>
          <select className="input" value={p.gui ?? ""} onChange={(e) => set({ gui: e.target.value })}>
            <option value="">{t("– wählen –")}</option>
            {(content.guis ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.nameEn || g.id}
              </option>
            ))}
          </select>
          <span className="muted small">{t("Slots der Oberfläche: Eingabe = Slot 1, Brennstoff = Slot 2, Ausgabe = Slot 3. Balken für Strom und Fortschritt zeigen automatisch die Werte des Blocks.")}</span>
        </label>
      );
    case "facing":
      return (
        <label className="field">
          <span className="field-label">{t("Richtungen")}</span>
          <select className="input" value={p.mode ?? "horizontal"} onChange={(e) => set({ mode: e.target.value })}>
            <option value="horizontal">{t("4 Himmelsrichtungen (wie Ofen)")}</option>
            <option value="all">{t("Alle 6 Richtungen (wie Spender)")}</option>
          </select>
          {has("connect") && <span className="muted small">{t("Blöcke, die sich verbinden, haben keine Ausrichtung.")}</span>}
        </label>
      );
    case "active":
      return <div className="muted small">{t("Der Block hat die Zustände „an“ und „aus“. Für „an“ kannst du rechts eine eigene Textur malen ({id}_on). Schalten: Blueprint-Knoten „An/Aus setzen“ – Maschinen mit Rezepten schalten selbst.", { id: block.id })}</div>;
    case "light":
      return (
        <div className="ability-grid">
          <label className="field">
            <span className="field-label">{t("Leuchtkraft · {l}", { l: p.level ?? "15" })}</span>
            <input type="range" className="range full" min={1} max={15} value={p.level ?? "15"} onChange={(e) => set({ level: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">{t("Wann")}</span>
            <select className="input" value={has("active") ? (p.when ?? "always") : "always"} disabled={!has("active")} onChange={(e) => set({ when: e.target.value })}>
              <option value="always">{t("Immer")}</option>
              <option value="active">{t("Nur wenn an")}</option>
            </select>
          </label>
        </div>
      );
    case "redstone":
      return (
        <>
          <div className="toggle-row" style={{ flexDirection: "row" }}>
            <Toggle label={t("Signal senden")} checked={p.emit === "true"} onChange={(v) => set({ emit: v ? "true" : "false" })} />
            <span>
              {t("Kann selbst ein Signal senden")} <span className="muted small">· {t("Knoten „Redstone-Signal senden“")}</span>
            </span>
          </div>
          <div className="muted small">{t("Ändert sich der Redstone-Strom am Block, startet das Ereignis „Redstone geändert“.")}</div>
        </>
      );
    case "connect":
      return (
        <label className="field">
          <span className="field-label">{t("Verbindet sich mit")}</span>
          <select className="input" value={p.to ?? "energy"} onChange={(e) => set({ to: e.target.value })}>
            <option value="energy">{t("Allem, was Strom hat (Kabel)")}</option>
            <option value="inventory">{t("Inventaren (Röhren)")}</option>
            <option value="same">{t("Nur gleichen Blöcken")}</option>
          </select>
          <span className="muted small">{t("Gleiche Blöcke verbinden sich immer. Mit Energiespeicher leitet der Block Strom weiter – ganz ohne Blueprint.")}</span>
        </label>
      );
    case "recipes":
      return (
        <>
          {has("energy") ? (
            <div className="ability-grid">
              <NumIn label={t("Verbrauch beim Arbeiten")} unit={t("FE/Tick")} value={p.use} onChange={(v) => set({ use: v })} />
            </div>
          ) : (
            <div className="toggle-row" style={{ flexDirection: "row" }}>
              <Toggle label={t("Braucht Brennstoff")} checked={p.fuel !== "false"} onChange={(v) => set({ fuel: v ? "true" : "false" })} />
              <span>
                {t("Braucht Brennstoff (Slot 2)")} <span className="muted small">· {t("mit Energiespeicher läuft sie stattdessen mit Strom")}</span>
              </span>
            </div>
          )}
          <MachineEditor project={project} block={block} own={own} onChange={onChange} recipesOnly />
        </>
      );
    case "shapes":
      return (
        <button className="btn small" onClick={() => onTab("shapes")}>
          {t("Formen auswählen")} <ArrowRightIcon size={13} />
        </button>
      );
    case "ore":
      return (
        <button className="btn small" onClick={() => onTab("mining")}>
          {t("Erz einstellen")} <ArrowRightIcon size={13} />
        </button>
      );
  }
  return null;
}

function AbilityMenu({ has, onPick, onClose }: { has: (k: string) => boolean; onPick: (k: AbilityKind) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  const query = q.trim().toLowerCase();
  const list = ABILITIES.filter((a) => !query || `${a.label} ${a.desc}`.toLowerCase().includes(query));
  const groups = [...new Set(list.map((a) => a.group))];
  return (
    <div ref={ref} className="ability-menu" role="menu">
      <div className="search">
        <SearchIcon size={13} />
        <input autoFocus placeholder={t("Fähigkeit suchen …")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {groups.map((g) => (
        <div key={g}>
          <div className="ability-menu-group">{g}</div>
          {list
            .filter((a) => a.group === g)
            .map((a) => {
              const done = has(a.kind);
              return (
                <button key={a.kind} className="ability-menu-item" disabled={done} onClick={() => onPick(a.kind)}>
                  <span className="ability-icon small" style={{ ["--ac" as string]: a.color }}>
                    {a.icon ?? <PuzzleIcon size={14} />}
                  </span>
                  <span className="grow">
                    <b>{a.label}</b> <span className="muted small">· {a.desc}</span>
                  </span>
                  {a.plugin && <PluginChip name={a.plugin} />}
                  {done && <span className="muted small">{t("schon drin")}</span>}
                </button>
              );
            })}
        </div>
      ))}
    </div>
  );
}

/** Neuen Blueprint für ein Block-Ereignis bauen */
export function blockBlueprint(project: Project, block: BlockDef, event: string): Blueprint {
  const name = block.nameDe || block.nameEn || block.id;
  const label = event === "ev_block_tick" ? t("Tick") : event === "ev_block_use" ? t("Rechtsklick") : t("Redstone");
  return {
    name: `${name} · ${label}`,
    enabled: true,
    owner: block.id,
    comments: [],
    nodes: [{ id: `n${Date.now().toString(36)}`, kind: event, x: 60, y: 80, props: { target: `${project.modId}:${block.id}` } }],
    links: [],
  };
}

/** Kennzeichen für Bausteine aus Plugins */
export function PluginChip({ name }: { name: string }) {
  return (
    <span className="plugin-chip" title={t("Aus dem Plugin „{p}“", { p: name })}>
      <PuzzleIcon size={10} /> {name}
    </span>
  );
}
