import { getDraft, setDraft } from "./draft";
import { t } from "../../i18n";
import { confirmDialog, contextMenu, MenuItem } from "../../components/Overlay";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArmorSlot, BlockDef, Blueprint, Content, contentApi, ItemDef, MobDef, Project, Recipe } from "../../api";
import { useCatalog } from "../../catalog";
import { Toggle } from "../../components/Chrome";
import ItemPicker, { OwnEntry, resolveItem } from "../../components/ItemPicker";
import McIcon from "../../components/McIcon";
import { BoxIcon, ChevronIcon, GridIcon, PawIcon, GlobeIcon, BlueprintIcon, ChestplateIcon, CloseIcon, CopyIcon, CubeIcon, FlaskIcon, GemIcon, LampIcon, LightningIcon, PencilIcon, PlusIcon, SaveIcon, SearchIcon, SparkIcon, SwordIcon, TagIcon, TrashIcon, GuiIcon } from "../../icons";
import { toast } from "../../state";
import { useRunning } from "../../store";
import PixelEditor from "./PixelEditor";
import { FacesEditor, LibTexSelect } from "./TexturePickers";
import { useLib } from "./texlib";
import type { Faces } from "../../api";

/** Nutzt der Block nur Bibliotheks-Texturen (dann braucht er keine eigene)? */
const usesOnlyLib = (f: Faces) =>
  f.mode === "all" ? !!f.all : f.mode === "pillar" ? !!(f.top && f.bottom && f.side) : f.mode === "each" ? !!(f.top && f.bottom && f.north && f.south && f.east && f.west) : false;
import { ArmorForm, BlockExtras, Field, ItemKindSwitch, NameFields, SubTabs, ToolForm } from "./ContentForms";
import MobEditor from "./MobEditor";
import BlueprintEditor from "./BlueprintEditor";
import { ModelPreview } from "./ModelEditor";
import DimensionEditor, { newDimension } from "./DimensionEditor";
import StructureEditor, { newStructure } from "./StructureEditor";
import GuiEditor, { newGui } from "./GuiEditor";
import CreateMenu, { CreateChoice, CreateGroup } from "./CreateMenu";
import { TEMPLATES } from "./blueprints";
import { BrewEditor, brewLabel, EventEditor, eventLabel, NamesField, newBrew, newEvent } from "./LogicEditors";
import { armorPreset, toolPreset, eggDataUrl, newMob, normalizeMob, newBlock, newItem, normalizeBlock, normalizeItem, SLOT_DE, SLOT_EN, variantIds } from "./contentDefaults";

const normalize = (c: Content): Content => ({ ...c, blocks: c.blocks.map(normalizeBlock), items: c.items.map(normalizeItem), mobs: (c.mobs ?? []).map(normalizeMob), brewing: c.brewing ?? [], events: (c.events ?? []).map((e) => ({ ...e, actions: e.actions ?? [] })), blueprints: c.blueprints ?? [], dimensions: c.dimensions ?? [], structures: c.structures ?? [], generatedMobs: c.generatedMobs ?? [], tabIcon: c.tabIcon ?? "", tabName: c.tabName ?? "" });

/** Einklappbare Gruppe in der Inhalte-Liste (Zustand bleibt gespeichert) */
function ListGroup({ id, label, icon, count, forceOpen, children }: { id: string; label: string; icon: React.ReactNode; count: number; forceOpen: boolean; children: React.ReactNode }) {
  const key = `anvil.content.group.${id}`;
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  });
  const shown = forceOpen || open;
  return (
    <div className="list-group">
      <button
        className="list-group-head"
        aria-expanded={shown}
        onClick={() => {
          setOpen(!open);
          try {
            localStorage.setItem(key, open ? "0" : "1");
          } catch {}
        }}
      >
        <span className={shown ? "list-group-chev open" : "list-group-chev"}>
          <ChevronIcon size={11} />
        </span>
        {icon}
        <span className="grow">{label}</span>
        <span className="list-group-count">{count}</span>
      </button>
      {shown && <div className="list-group-body">{count === 0 ? <p className="muted small pad">{t("Noch leer")}</p> : children}</div>}
    </div>
  );
}

type BlockTab = "general" | "mining" | "function" | "model" | "shapes" | "recipe";
type ItemTab = "general" | "function" | "recipe";

type Sel = { kind: "block" | "item" | "mob" | "event" | "brew" | "blueprint" | "dimension" | "structure" | "gui"; index: number } | null;

export default function ContentTab({ project }: { project: Project }) {
  const [content, setContent] = useState<Content | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [sel, setSel] = useState<Sel>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [textures, setTextures] = useState<Record<string, string>>({});
  const libTex = useLib(project.id);
  const [createGroup, setCreateGroup] = useState<CreateGroup | null>(null);
  const [blockTab, setBlockTab] = useState<BlockTab>("general");
  const [itemTab, setItemTab] = useState<ItemTab>("general");
  const running = useRunning(project.id);
  const gameRunning = !!running && (running.task === "runClient" || running.task === "runServer");

  const loadTextures = useCallback(
    async (c: Content) => {
      const entries = await Promise.all([
        ...c.generatedBlocks.map(async (id) => [id, await contentApi.textureGet(project.id, "block", id).catch(() => null)] as const),
        ...c.generatedItems.map(async (id) => [id, await contentApi.textureGet(project.id, "item", id).catch(() => null)] as const),
      ]);
      setTextures(Object.fromEntries(entries.filter(([, b]) => b).map(([id, b]) => [id, `data:image/png;base64,${b}`])));
    },
    [project.id],
  );

  useEffect(() => {
    const d = getDraft(project.id);
    if (d) {
      setContent(normalize(d.content));
      setSaved(d.saved);
      loadTextures(d.content);
      return;
    }
    contentApi
      .load(project.id)
      .then((raw) => {
        const c = normalize(raw);
        setContent(c);
        setSaved(JSON.stringify(c));
        loadTextures(c);
      })
      .catch((e) => toast(String(e), "error"));
  }, [project.id, loadTextures]);

  const dirty = content ? JSON.stringify(content) !== saved : false;
  useEffect(() => {
    if (content && saved) setDraft(project.id, content, saved);
  }, [content, saved, project.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "n") {
        // im Inhalte-Tab heißt Strg+N „neuer Inhalt“ (statt neues Projekt)
        e.preventDefault();
        e.stopImmediatePropagation();
        setCreateGroup("all");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  const savedContent = useMemo(() => (saved ? (JSON.parse(saved) as Content) : null), [saved]);
  const savedIds = useMemo(() => [...(savedContent?.generatedBlocks ?? []), ...(savedContent?.generatedItems ?? [])], [savedContent]);

  async function save() {
    if (!content) return;
    setBusy(true);
    try {
      const r = await contentApi.save(project.id, content);
      const c = normalize(r.content);
      setContent(c);
      setSaved(JSON.stringify(c));
      loadTextures(c);
      if (r.registration === "ok" || r.registration === "added") {
        setHint(null);
        if (gameRunning) {
          await liveUpdate(r.javaChanged);
          return;
        }
        toast(r.registration === "added" ? t("Gespeichert – die Hauptklasse wurde einmalig ergänzt.") : t("Gespeichert, Code und Dateien erzeugt."), "success");
      } else {
        setHint(r.registration);
        toast(t("Gespeichert – ein Schritt fehlt noch (siehe Hinweis)."), "info");
      }
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  /** Spiel läuft: ohne Neustart nachladen, wenn nur Dateien geändert wurden */
  async function liveUpdate(javaChanged: boolean) {
    if (!javaChanged) {
      try {
        await contentApi.hotReload(project.id);
        toast(t("Gespeichert und im laufenden Spiel neu geladen."), "success");
      } catch (e) {
        toast(String(e), "error");
      }
      return;
    }
    // Neue Blöcke, Items oder Logik brauchen einen Neustart
    contentApi.hotReload(project.id).catch(() => {});
    if (
      await confirmDialog(
        t("Neustart nötig"),
        t("Neue oder entfernte Inhalte und geänderte Logik werden erst nach einem Neustart des Spiels aktiv. Texturen, Namen und Rezepte wurden schon neu geladen."),
        t("Jetzt neu starten"),
        t("Später"),
      )
    )
      window.dispatchEvent(new CustomEvent("anvil:workspace", { detail: "restart" }));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const allIds = useMemo(
    () => (content ? [...content.blocks.flatMap((b) => variantIds(b).map((v) => v.id)), ...content.items.map((i) => i.id), ...content.mobs.flatMap((m) => [m.id, `${m.id}_spawn_egg`])] : []),
    [content],
  );
  const german = (content?.languages ?? []).includes("de_de");
  const own: OwnEntry[] = useMemo(
    () =>
      content
        ? [
            ...content.blocks.flatMap((b) =>
              variantIds(b).map((v) => ({ id: v.id, name: v.name, kind: "block" as const, texture: textures[v.id] ?? textures[b.id], shape: v.shape })),
            ),
            ...content.items.map((i) => ({ id: i.id, name: i.nameEn || i.nameDe || i.id, kind: "item" as const, texture: textures[i.id] })),
            ...content.mobs.map((m) => ({ id: `${m.id}_spawn_egg`, name: `${m.nameEn || m.nameDe || m.id} Spawn Egg`, kind: "item" as const, texture: eggDataUrl(m.eggPrimary, m.eggSecondary) })),
          ]
        : [],
    [content, textures],
  );

  function uniqueId(base: string) {
    let id = base;
    let n = 2;
    while (allIds.includes(id)) id = `${base}_${n++}`;
    return id;
  }

  function addBlock(from?: BlockDef) {
    if (!content) return;
    const b: BlockDef = from
      ? { ...structuredClone(from), id: uniqueId(`${from.id}_kopie`), nameDe: from.nameDe ? `${from.nameDe} (Kopie)` : "", nameEn: `${from.nameEn} (Copy)` }
      : newBlock(uniqueId("neuer_block"));
    setContent({ ...content, blocks: [...content.blocks, b] });
    setSel({ kind: "block", index: content.blocks.length });
    setFilter("");
  }

  function addItem(from?: ItemDef, kind: ItemDef["kind"] = "basic") {
    if (!content) return;
    const base = kind === "tool" ? "neues_werkzeug" : kind === "armor" ? "neue_ruestung" : "neues_item";
    const i: ItemDef = from
      ? { ...structuredClone(from), id: uniqueId(`${from.id}_kopie`), nameDe: from.nameDe ? `${from.nameDe} (Kopie)` : "", nameEn: `${from.nameEn} (Copy)` }
      : newItem(uniqueId(base), kind);
    setContent({ ...content, items: [...content.items, i] });
    setSel({ kind: "item", index: content.items.length });
    setFilter("");
  }

  function addMob(from?: MobDef) {
    if (!content) return;
    const m: MobDef = from ? { ...structuredClone(from), id: uniqueId(`${from.id}_kopie`), nameDe: from.nameDe ? `${from.nameDe} (Kopie)` : "", nameEn: `${from.nameEn} (Copy)` } : newMob(uniqueId("neue_kreatur"));
    setContent({ ...content, mobs: [...content.mobs, m] });
    setSel({ kind: "mob", index: content.mobs.length });
    setFilter("");
  }


  const TOOL_NAMES: Record<string, [string, string, string]> = {
    sword: ["neues_schwert", t("Neues Schwert"), "New Sword"],
    pickaxe: ["neue_spitzhacke", t("Neue Spitzhacke"), "New Pickaxe"],
    axe: ["neue_axt", t("Neue Axt"), "New Axe"],
    shovel: ["neue_schaufel", t("Neue Schaufel"), "New Shovel"],
    hoe: ["neue_hacke", t("Neue Hacke"), "New Hoe"],
  };

  /** Auswahl aus dem Erstellen-Menü umsetzen */
  function create(choice: CreateChoice) {
    if (!content) return;
    setCreateGroup(null);
    setFilter("");
    const ids = new Set(allIds);
    const uid = (base: string) => {
      let id = base;
      let n = 2;
      while (ids.has(id)) id = `${base}_${n++}`;
      ids.add(id);
      return id;
    };
    if (choice.kind === "block") {
      const v = choice.variant;
      const b = newBlock(uid(v === "ore" ? "neues_erz" : v === "lamp" ? "neue_lampe" : v === "storage" ? "neue_truhe" : v === "workbench" ? "neue_werkbank" : v === "machine" ? "neue_maschine" : "neuer_block"));
      if (v === "ore") Object.assign(b, { nameDe: "", nameEn: "New Ore", hardness: 3, resistance: 3, tier: "stone", ore: { ...b.ore, enabled: true } });
      if (v === "lamp") Object.assign(b, { nameDe: "", nameEn: "New Lamp", kind: "lamp", material: "glass", hardness: 0.3, resistance: 0.3, tool: "none" });
      if (v === "storage") Object.assign(b, { nameDe: "", nameEn: "New Chest", kind: "storage", material: "wood", hardness: 2.5, resistance: 2.5, tool: "axe", rows: 3 });
      if (v === "shapes") Object.assign(b, { shapes: ["stairs", "slab", "wall"] });
      if (v === "workbench") Object.assign(b, { nameDe: "", nameEn: "New Workbench", kind: "workbench", material: "wood", hardness: 2.5, resistance: 2.5, tool: "axe" });
      if (v === "machine") Object.assign(b, { nameDe: "", nameEn: "New Machine", kind: "machine", material: "metal", hardness: 3.5, resistance: 3.5, tool: "pickaxe", machine: { fuel: true, recipes: [{ input: "minecraft:cobblestone", inputCount: 1, output: "minecraft:gravel", outputCount: 1, time: 100 }] } });
      setContent({ ...content, blocks: [...content.blocks, b] });
      setSel({ kind: "block", index: content.blocks.length });
    } else if (choice.kind === "item") {
      const v = choice.variant;
      const added: ItemDef[] = [];
      if (v === "basic") added.push(newItem(uid("neues_item")));
      else if (v === "food") added.push({ ...newItem(uid("neue_nahrung")), nameDe: "", nameEn: "New Food", food: true, nutrition: 6, saturation: 0.6 });
      else if (v === "toolset") {
        for (const type of ["sword", "pickaxe", "axe", "shovel", "hoe"] as const) {
          const [id, , en] = TOOL_NAMES[type];
          added.push({ ...newItem(uid(id), "tool"), ...toolPreset(type, "iron"), nameDe: "", nameEn: en });
        }
      } else if (v === "armor" || v === "armorset") {
        const mat = uid("neues_material");
        const slots: ArmorSlot[] = v === "armor" ? ["helmet"] : ["helmet", "chestplate", "leggings", "boots"];
        for (const slot of slots)
          added.push({ ...newItem(uid(`${mat}_${slot}`), "armor"), ...armorPreset("iron", slot), armorMaterial: mat, nameDe: "", nameEn: `New ${SLOT_EN[slot]}` });
      } else {
        const [id, , en] = TOOL_NAMES[v];
        added.push({ ...newItem(uid(id), "tool"), ...toolPreset(v, "iron"), nameDe: "", nameEn: en });
      }
      setContent({ ...content, items: [...content.items, ...added] });
      setSel({ kind: "item", index: content.items.length });
      if (added.length > 1) toast(t("{n} Items hinzugefügt.", { n: added.length }), "success");
    } else if (choice.kind === "mob") {
      const m = newMob(uid(`neue_kreatur_${choice.model}`), choice.model);
      setContent({ ...content, mobs: [...content.mobs, m] });
      setSel({ kind: "mob", index: content.mobs.length });
    } else if (choice.kind === "blueprint") {
      const bp: Blueprint = (TEMPLATES.find((x) => x.id === choice.template) ?? TEMPLATES[0]).build();
      setContent({ ...content, blueprints: [...content.blueprints, bp] });
      setSel({ kind: "blueprint", index: content.blueprints.length });
    } else if (choice.kind === "dimension") {
      const used = new Set(content.dimensions.map((d) => d.id));
      let id = `welt_${choice.preset}`;
      for (let n = 2; used.has(id); n++) id = `${id.replace(/_\d+$/, "")}_${n}`;
      setContent({ ...content, dimensions: [...content.dimensions, newDimension(id, choice.preset)] });
      setSel({ kind: "dimension", index: content.dimensions.length });
    } else if (choice.kind === "gui") {
      const list = content.guis ?? [];
      const used = new Set(list.map((d) => d.id));
      let id = choice.preset === "panel" ? "bedienfeld" : "oberflaeche";
      for (let n = 2; used.has(id); n++) id = `${id.replace(/_\d+$/, "")}_${n}`;
      setContent({ ...content, guis: [...list, newGui(id, choice.preset)] });
      setSel({ kind: "gui", index: list.length });
    } else if (choice.kind === "structure") {
      const list = content.structures ?? [];
      const used = new Set(list.map((d) => d.id));
      let id = "neue_struktur";
      for (let n = 2; used.has(id); n++) id = `neue_struktur_${n}`;
      setContent({ ...content, structures: [...list, newStructure(id)] });
      setSel({ kind: "structure", index: list.length });
    } else if (choice.kind === "event") {
      setContent({ ...content, events: [...content.events, newEvent(content.blocks[0]?.id ?? "")] });
      setSel({ kind: "event", index: content.events.length });
    } else {
      setContent({ ...content, brewing: [...content.brewing, newBrew()] });
      setSel({ kind: "brew", index: content.brewing.length });
    }
  }

  function createArmorSet(from: ItemDef) {
    if (!content) return;
    const mat = from.armorMaterial || "material";
    const have = content.items.filter((i) => i.kind === "armor" && i.armorMaterial === mat).map((i) => i.armorSlot);
    const matName = (from.nameEn || from.nameDe || mat).replace(/[- ]?(Helm|Brustpanzer|Hose|Stiefel)$/i, "").trim() || mat;
    const matEn = (from.nameEn || mat).replace(/[- ]?(Helmet|Chestplate|Leggings|Boots)$/i, "").trim() || mat;
    const ids = new Set(allIds);
    const added: ItemDef[] = [];
    for (const slot of ["helmet", "chestplate", "leggings", "boots"] as ArmorSlot[]) {
      if (have.includes(slot)) continue;
      let id = `${mat}_${slot}`;
      let n = 2;
      while (ids.has(id)) id = `${mat}_${slot}_${n++}`;
      ids.add(id);
      added.push({
        ...structuredClone(from),
        id,
        nameDe: from.nameDe ? `${matName}-${SLOT_DE[slot]}` : "",
        nameEn: `${matEn} ${SLOT_EN[slot]}`,
        armorSlot: slot,
        defense: armorPreset("iron", slot).defense! + Math.max(0, from.defense - armorPreset("iron", from.armorSlot).defense!),
        recipe: { ...from.recipe, enabled: false },
      });
    }
    setContent({ ...content, items: [...content.items, ...added] });
    toast(t("{length} Rüstungsteile hinzugefügt.", { length: added.length }), "success");
  }

  function entryMenu(kind: "block" | "item" | "mob", index: number): MenuItem[] {
    const def = kind === "block" ? content!.blocks[index] : kind === "mob" ? content!.mobs[index] : content!.items[index];
    return [
      { label: t("Bearbeiten"), icon: <PencilIcon size={15} />, onClick: () => setSel({ kind, index }) },
      { label: t("Duplizieren"), icon: <CopyIcon size={15} />, onClick: () => (kind === "block" ? addBlock(def as BlockDef) : kind === "mob" ? addMob(def as MobDef) : addItem(def as ItemDef)) },
      {
        label: t("ID kopieren"),
        icon: <TagIcon size={15} />,
        hint: `${project.modId}:${def.id}`,
        onClick: () => navigator.clipboard.writeText(`${project.modId}:${def.id}`).then(() => toast(t("ID kopiert."), "success")),
      },
      "separator",
      { label: t("Entfernen"), icon: <TrashIcon size={15} />, danger: true, onClick: () => remove({ kind, index }) },
    ];
  }

  async function remove(target: Sel = sel) {
    if (!content || !target) return;
    if (target.kind === "dimension") {
      const d = content.dimensions[target.index];
      if (!(await confirmDialog(t("„{name}“ entfernen?", { name: d.nameEn || d.nameDe || d.id }), t("Die Dimension wird beim Speichern aus der Mod entfernt. Bereits erkundete Gebiete bleiben in der Welt gespeichert."), t("Entfernen"), t("Abbrechen"), true))) return;
      setContent((c) => (c ? { ...c, dimensions: c.dimensions.filter((_, i) => i !== target.index) } : c));
      setSel(null);
      return;
    }
    if (target.kind === "gui") {
      const g = (content.guis ?? [])[target.index];
      if (!(await confirmDialog(t("„{name}“ entfernen?", { name: g.nameEn || g.id }), t("Die Oberfläche wird gelöscht. Verbundene Maschinen nutzen wieder die Ofen-Oberfläche."), t("Entfernen"), t("Abbrechen"), true))) return;
      setContent((c) => (c ? { ...c, guis: (c.guis ?? []).filter((_, i) => i !== target.index), blocks: c.blocks.map((b) => (b.machine?.gui === g.id ? { ...b, machine: { ...b.machine, gui: "" } } : b)) } : c));
      setSel(null);
      return;
    }
    if (target.kind === "structure") {
      const st = (content.structures ?? [])[target.index];
      if (!(await confirmDialog(t("„{name}“ entfernen?", { name: st.nameEn || st.id }), t("Die Struktur wird beim Speichern aus der Weltgenerierung entfernt. Die gespeicherten Teile bleiben im Projekt."), t("Entfernen"), t("Abbrechen"), true))) return;
      setContent((c) => (c ? { ...c, structures: (c.structures ?? []).filter((_, i) => i !== target.index) } : c));
      setSel(null);
      return;
    }
    if (target.kind === "blueprint") {
      const bp = content.blueprints[target.index];
      if (bp.nodes.length > 1 && !(await confirmDialog(t("„{name}“ entfernen?", { name: bp.name }), t("Der Blueprint mit allen Knoten wird gelöscht."), t("Entfernen"), t("Abbrechen"), true))) return;
      setContent((c) => (c ? { ...c, blueprints: c.blueprints.filter((_, i) => i !== target.index) } : c));
      setSel(null);
      return;
    }
    if (target.kind === "event" || target.kind === "brew") {
      const key = target.kind === "event" ? "events" : "brewing";
      setContent((c) => (c ? { ...c, [key]: (c[key] as unknown[]).filter((_, i) => i !== target.index) } : c));
      setSel(null);
      return;
    }
    const name = target.kind === "block" ? content.blocks[target.index].id : target.kind === "mob" ? content.mobs[target.index].id : content.items[target.index].id;
    if (!(await confirmDialog(t("„{name}“ entfernen?", { name: name }), t("Die erzeugten Dateien werden beim Speichern gelöscht, die Textur bleibt erhalten."), t("Entfernen"), t("Abbrechen"), true))) return;
    setContent((c) =>
      !c
        ? c
        : target.kind === "block"
          ? { ...c, blocks: c.blocks.filter((_, i) => i !== target.index) }
          : target.kind === "mob"
            ? { ...c, mobs: c.mobs.filter((_, i) => i !== target.index) }
            : { ...c, items: c.items.filter((_, i) => i !== target.index) },
    );
    setSel(null);
  }

  if (!content) return <div className="content-loading muted">{t("Lade Inhalte …")}</div>;

  const block = sel?.kind === "block" ? content.blocks[sel.index] : undefined;
  const item = sel?.kind === "item" ? content.items[sel.index] : undefined;
  const mob = sel?.kind === "mob" ? content.mobs[sel.index] : undefined;
  const current = block ?? item;
  const itemTabEff: ItemTab = item && itemTab === "function" && item.kind !== "tool" && item.kind !== "armor" ? "general" : itemTab;
  const q = filter.trim().toLowerCase();
  const matches = (d: { id: string; nameDe: string; nameEn: string }) => !q || `${d.id} ${d.nameDe} ${d.nameEn}`.toLowerCase().includes(q);

  const updBlock = (patch: Partial<BlockDef>) => setContent({ ...content, blocks: content.blocks.map((b, i) => (i === sel!.index ? { ...b, ...patch } : b)) });
  const updMob = (patch: Partial<MobDef>) => setContent({ ...content, mobs: content.mobs.map((m, i) => (i === sel!.index ? { ...m, ...patch } : m)) });
  const updItem = (patch: Partial<ItemDef>) => setContent({ ...content, items: content.items.map((b, i) => (i === sel!.index ? { ...b, ...patch } : b)) });

  const entryIcon = (kind: "block" | "item", id: string, name: string) => {
    const key = `own:${id}`;
    return (
      <McIcon
        icon={kind === "block" ? { kind: "cube", top: key, side: key } : { kind: "flat", tex: key }}
        textures={textures[id] ? { [key]: textures[id] } : undefined}
        size={24}
        fallback={name}
      />
    );
  };

  const saveBlock = (
    <div className="content-save">
      <button className={busy ? "btn primary full loading" : "btn primary full"} disabled={busy || (!dirty && content.generatorVersion > 0)} onClick={save}>
        <SaveIcon size={14} /> {dirty ? t("Speichern & Code erzeugen") : t("Alles gespeichert")}
      </button>
      <div className="muted small center">{t("Strg S")}</div>
    </div>
  );

  if (sel?.kind === "dimension" && content.dimensions[sel.index])
    return (
      <div className="content dimx-host">
          <DimensionEditor
            key={`dim-${sel.index}`}
            project={project}
            content={content}
            dim={content.dimensions[sel.index]}
            own={own}
            onChange={(d) => setContent({ ...content, dimensions: content.dimensions.map((x, i) => (i === sel.index ? d : x)) })}
            onDuplicate={() => {
              const d = content.dimensions[sel.index];
              setContent({ ...content, dimensions: [...content.dimensions, { ...structuredClone(d), id: `${d.id}_kopie`, nameDe: d.nameDe ? `${d.nameDe} (Kopie)` : "", nameEn: `${d.nameEn || d.id} (Copy)` }] });
              setSel({ kind: "dimension", index: content.dimensions.length });
            }}
            onRemove={() => remove()}
            onBack={() => setSel(null)}
            footer={saveBlock}
            onViewInGame={async () => {
              const d = content.dimensions[sel.index];
              const cmd = `/execute in ${project.modId}:${d.id} run tp @s 0 ${Math.max(d.seaLevel + 40, 120)} 0`;
              try {
                await navigator.clipboard.writeText(cmd);
              } catch {
                /* Zwischenablage nicht verfügbar */
              }
              if (dirty) await save();
              window.dispatchEvent(new CustomEvent("anvil:workspace", { detail: "run" }));
              toast(t("Spiel startet. Der Befehl zum Hinreisen ist kopiert: {cmd}", { cmd }), "success");
            }}
            onAddBlueprint={(b) => {
              setContent({ ...content, blueprints: [...content.blueprints, b] });
              setSel({ kind: "blueprint", index: content.blueprints.length });
              toast(t("Blueprint angelegt – wähle darin den Block, der dich hinbringt."), "success");
            }}
          />
      </div>
    );

  return (
    <div className="content">
      <aside className="content-list">
        <div className="content-list-search">
          <div className="search">
            <SearchIcon size={13} />
            <label htmlFor="cfilter" className="sr-only">
              {t("Inhalte durchsuchen")}
            </label>
            <input id="cfilter" placeholder={t("Inhalte durchsuchen …")} value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <button className="btn primary content-add" onClick={() => setCreateGroup("all")} aria-label={t("Neuer Inhalt")} data-tip={t("Neuer Inhalt (Strg+N)")}>
            <PlusIcon size={16} />
          </button>
        </div>
        <div className="content-list-scroll">
          <button className={sel ? "entry overview-entry" : "entry overview-entry active"} onClick={() => setSel(null)}>
            <span className="logic-icon">
              <GridIcon size={14} />
            </span>
            <span className="entry-text">
              <span className="entry-name">{t("Übersicht")}</span>
            </span>
          </button>
          <ListGroup id="blocks" label={t("Blöcke")} icon={<CubeIcon size={13} />} count={content.blocks.length} forceOpen={!!q}>
            {content.blocks.map((b, i) =>
              matches(b) ? (
                <button
                  key={`b${i}`}
                  className={sel?.kind === "block" && sel.index === i ? "entry active" : "entry"}
                  onClick={() => setSel({ kind: "block", index: i })}
                  {...contextMenu(() => entryMenu("block", i))}
                >
                  {entryIcon("block", b.id, b.nameEn || b.nameDe || b.id)}
                  <span className="entry-text">
                    <span className="entry-name">{b.nameEn || b.nameDe || b.id}</span>
                    <span className="entry-id">{b.id}</span>
                  </span>
                  {(b.ore.enabled || b.shapes.length > 0) && (
                    <span className="entry-badges">
                      {b.ore.enabled && <span className="badge-mini">{t("Erz")}</span>}
                      {b.shapes.length > 0 && <span className="badge-mini">+{b.shapes.length}</span>}
                    </span>
                  )}
                </button>
              ) : null,
            )}
          </ListGroup>
          <ListGroup id="items" label={t("Items")} icon={<GemIcon size={13} />} count={content.items.length} forceOpen={!!q}>
            {content.items.map((it, i) =>
              matches(it) ? (
                <button
                  key={`i${i}`}
                  className={sel?.kind === "item" && sel.index === i ? "entry active" : "entry"}
                  onClick={() => setSel({ kind: "item", index: i })}
                  {...contextMenu(() => entryMenu("item", i))}
                >
                  {entryIcon("item", it.id, it.nameEn || it.nameDe || it.id)}
                  <span className="entry-text">
                    <span className="entry-name">{it.nameEn || it.nameDe || it.id}</span>
                    <span className="entry-id">{it.id}</span>
                  </span>
                  {it.kind !== "basic" && <span className="entry-badges">{it.kind === "tool" ? <SwordIcon size={12} /> : <ChestplateIcon size={12} />}</span>}
                </button>
              ) : null,
            )}
          </ListGroup>
          <ListGroup id="mobs" label={t("Kreaturen")} icon={<PawIcon size={13} />} count={content.mobs.length} forceOpen={!!q}>
            {content.mobs.map((m, i) =>
              matches(m) ? (
                <button
                  key={`m${i}`}
                  className={sel?.kind === "mob" && sel.index === i ? "entry active" : "entry"}
                  onClick={() => setSel({ kind: "mob", index: i })}
                  {...contextMenu(() => entryMenu("mob", i))}
                >
                  <img className="egg-icon" src={eggDataUrl(m.eggPrimary, m.eggSecondary)} alt="" />
                  <span className="entry-text">
                    <span className="entry-name">{m.nameEn || m.nameDe || m.id}</span>
                    <span className="entry-id">{m.id}</span>
                  </span>
                </button>
              ) : null,
            )}
          </ListGroup>
          <ListGroup id="world" label={t("Welt")} icon={<GlobeIcon size={13} />} count={content.dimensions.length + (content.structures ?? []).length} forceOpen={!!q}>
            {content.dimensions.map((d, i) =>
              !q || `${d.id} ${d.nameDe} ${d.nameEn}`.toLowerCase().includes(q) ? (
                <button
                  key={`dim${i}`}
                  className={sel?.kind === "dimension" && sel.index === i ? "entry active" : "entry"}
                  onClick={() => setSel({ kind: "dimension", index: i })}
                  {...contextMenu(() => [
                    { label: t("Bearbeiten"), icon: <PencilIcon size={15} />, onClick: () => setSel({ kind: "dimension", index: i }) },
                    {
                      label: t("ID kopieren"),
                      icon: <TagIcon size={15} />,
                      hint: `${project.modId}:${d.id}`,
                      onClick: () => navigator.clipboard.writeText(`${project.modId}:${d.id}`).then(() => toast(t("ID kopiert."), "success")),
                    },
                    "separator",
                    { label: t("Entfernen"), icon: <TrashIcon size={15} />, danger: true, onClick: () => remove({ kind: "dimension", index: i }) },
                  ])}
                >
                  <span className="logic-icon">
                    <GlobeIcon size={14} />
                  </span>
                  <span className="entry-text">
                    <span className="entry-name">{d.nameEn || d.nameDe || d.id}</span>
                    <span className="entry-id">{d.id}</span>
                  </span>
                </button>
              ) : null,
            )}
            {(content.structures ?? []).map((st, i) =>
              !q || `${st.id} ${st.nameEn} ${st.nameDe}`.toLowerCase().includes(q) ? (
                <button
                  key={`st${i}`}
                  className={sel?.kind === "structure" && sel.index === i ? "entry active" : "entry"}
                  onClick={() => setSel({ kind: "structure", index: i })}
                  {...contextMenu(() => [
                    { label: t("Bearbeiten"), icon: <PencilIcon size={15} />, onClick: () => setSel({ kind: "structure", index: i }) },
                    "separator",
                    { label: t("Entfernen"), icon: <TrashIcon size={15} />, danger: true, onClick: () => remove({ kind: "structure", index: i }) },
                  ])}
                >
                  <span className="logic-icon">
                    <BoxIcon size={14} />
                  </span>
                  <span className="entry-text">
                    <span className="entry-name">{st.nameEn || st.nameDe || st.id}</span>
                    <span className="entry-id">{st.id}</span>
                  </span>
                  <span className="entry-badges">
                    <span className="badge-mini">{t("Struktur")}</span>
                  </span>
                </button>
              ) : null,
            )}
          </ListGroup>
          <ListGroup id="logic" label={t("Logik")} icon={<BlueprintIcon size={13} />} count={content.blueprints.length + content.events.length + (content.guis ?? []).length} forceOpen={!!q}>
            {content.blueprints.map((b, i) =>
              !q || b.name.toLowerCase().includes(q) ? (
                <button
                  key={`bp${i}`}
                  className={sel?.kind === "blueprint" && sel.index === i ? "entry active" : "entry"}
                  onClick={() => setSel({ kind: "blueprint", index: i })}
                  {...contextMenu(() => [
                    { label: t("Bearbeiten"), icon: <PencilIcon size={15} />, onClick: () => setSel({ kind: "blueprint", index: i }) },
                    { label: t("Duplizieren"), icon: <CopyIcon size={15} />, onClick: () => setContent({ ...content, blueprints: [...content.blueprints, { ...structuredClone(b), name: `${b.name} (${t("Kopie")})` }] }) },
                    { label: b.enabled ? t("Ausschalten") : t("Einschalten"), icon: <LightningIcon size={15} />, onClick: () => setContent({ ...content, blueprints: content.blueprints.map((x, j) => (j === i ? { ...x, enabled: !x.enabled } : x)) }) },
                    "separator",
                    { label: t("Entfernen"), icon: <TrashIcon size={15} />, danger: true, onClick: () => remove({ kind: "blueprint", index: i }) },
                  ])}
                >
                  <span className={b.enabled ? "logic-icon" : "logic-icon off"}>
                    <BlueprintIcon size={14} />
                  </span>
                  <span className="entry-text">
                    <span className="entry-name">{b.name || t("Blueprint")}</span>
                    <span className="entry-id">{b.enabled ? t("{n} Knoten", { n: b.nodes.length }) : t("ausgeschaltet")}</span>
                  </span>
                </button>
              ) : null,
            )}
            {(content.guis ?? []).map((g, i) =>
              !q || `${g.id} ${g.nameEn}`.toLowerCase().includes(q) ? (
                <button
                  key={`gui${i}`}
                  className={sel?.kind === "gui" && sel.index === i ? "entry active" : "entry"}
                  onClick={() => setSel({ kind: "gui", index: i })}
                  {...contextMenu(() => [
                    { label: t("Bearbeiten"), icon: <PencilIcon size={15} />, onClick: () => setSel({ kind: "gui", index: i }) },
                    "separator",
                    { label: t("Entfernen"), icon: <TrashIcon size={15} />, danger: true, onClick: () => remove({ kind: "gui", index: i }) },
                  ])}
                >
                  <span className="logic-icon">
                    <GuiIcon size={14} />
                  </span>
                  <span className="entry-text">
                    <span className="entry-name">{g.nameEn || g.id}</span>
                    <span className="entry-id">{g.id}</span>
                  </span>
                  <span className="entry-badges">
                    <span className="badge-mini">{t("Oberfläche")}</span>
                  </span>
                </button>
              ) : null,
            )}
            {content.events.map((e, i) => (
              <button
                key={`e${i}`}
                className={sel?.kind === "event" && sel.index === i ? "entry active" : "entry"}
                onClick={() => setSel({ kind: "event", index: i })}
                {...contextMenu(() => [
                  { label: t("Bearbeiten"), icon: <PencilIcon size={15} />, onClick: () => setSel({ kind: "event", index: i }) },
                  { label: t("Duplizieren"), icon: <CopyIcon size={15} />, onClick: () => setContent({ ...content, events: [...content.events, structuredClone(e)] }) },
                  "separator",
                  { label: t("Entfernen"), icon: <TrashIcon size={15} />, danger: true, onClick: () => remove({ kind: "event", index: i }) },
                ])}
              >
                <span className="logic-icon">
                  <LightningIcon size={14} />
                </span>
                <span className="entry-text">
                  <span className="entry-name">{eventLabel(e)}</span>
                  <span className="entry-id">{e.target || "–"}</span>
                </span>
              </button>
            ))}
          </ListGroup>
          <ListGroup id="brew" label={t("Brauen")} icon={<FlaskIcon size={13} />} count={content.brewing.length} forceOpen={!!q}>
            {content.brewing.map((b, i) => (
              <button
                key={`b${i}`}
                className={sel?.kind === "brew" && sel.index === i ? "entry active" : "entry"}
                onClick={() => setSel({ kind: "brew", index: i })}
                {...contextMenu(() => [{ label: t("Entfernen"), icon: <TrashIcon size={15} />, danger: true, onClick: () => remove({ kind: "brew", index: i }) }])}
              >
                <span className="logic-icon">
                  <FlaskIcon size={14} />
                </span>
                <span className="entry-text">
                  <span className="entry-name">{brewLabel(b)}</span>
                  <span className="entry-id">{b.ingredient || "–"}</span>
                </span>
              </button>
            ))}
          </ListGroup>
        </div>
        {saveBlock}
      </aside>

      <section className="content-editor">
        {hint && (
          <div className="callout warn">
            <div>
              <div className="callout-title">{t("Einmaliger Schritt nötig")}</div>
              <div className="small mono" style={{ userSelect: "text" }}>
                {hint}
              </div>
            </div>
          </div>
        )}
        {sel?.kind === "gui" && (content.guis ?? [])[sel.index] ? (
          <GuiEditor
            key={`gui-${sel.index}`}
            project={project}
            content={content}
            gui={(content.guis ?? [])[sel.index]}
            onChange={(g) => setContent((c) => (c ? { ...c, guis: (c.guis ?? []).map((x, i) => (i === sel.index ? g : x)) } : c))}
            onLinkMachine={(blockId, guiId) => setContent((c) => (c ? { ...c, blocks: c.blocks.map((b) => (b.id === blockId ? { ...b, machine: { ...(b.machine ?? { fuel: true, recipes: [] }), gui: guiId } } : b)) } : c))}
            onDuplicate={() => {
              const list = content.guis ?? [];
              const d = list[sel.index];
              setContent({ ...content, guis: [...list, { ...structuredClone(d), id: `${d.id}_kopie` }] });
              setSel({ kind: "gui", index: list.length });
            }}
            onRemove={() => remove()}
          />
        ) : sel?.kind === "structure" && (content.structures ?? [])[sel.index] ? (
          <StructureEditor
            key={`st-${sel.index}`}
            project={project}
            content={content}
            st={(content.structures ?? [])[sel.index]}
            onChange={(st) => setContent((c) => (c ? { ...c, structures: (c.structures ?? []).map((x, i) => (i === sel.index ? st : x)) } : c))}
            onDuplicate={() => {
              const list = content.structures ?? [];
              const d = list[sel.index];
              setContent({ ...content, structures: [...list, { ...structuredClone(d), id: `${d.id}_kopie`, nameEn: `${d.nameEn || d.id} (Copy)` }] });
              setSel({ kind: "structure", index: list.length });
            }}
            onRemove={() => remove()}
          />
        ) : sel?.kind === "blueprint" && content.blueprints[sel.index] ? (
          <BlueprintEditor
            key={`bp-${sel.index}`}
            project={project}
            content={content}
            bp={content.blueprints[sel.index]}
            own={own}
            onChange={(b) => setContent((c) => (c ? { ...c, blueprints: c.blueprints.map((x, i) => (i === sel.index ? b : x)) } : c))}
            onDuplicate={() => {
              setContent({ ...content, blueprints: [...content.blueprints, { ...structuredClone(content.blueprints[sel.index]), name: `${content.blueprints[sel.index].name} (${t("Kopie")})` }] });
              setSel({ kind: "blueprint", index: content.blueprints.length });
            }}
            onRemove={() => remove()}
          />
        ) : sel?.kind === "event" && content.events[sel.index] ? (
          <EventEditor
            key={`event-${sel.index}`}
            project={project}
            content={content}
            event={content.events[sel.index]}
            own={own}
            onChange={(ev) => setContent({ ...content, events: content.events.map((x, i) => (i === sel.index ? ev : x)) })}
            onDuplicate={() => {
              setContent({ ...content, events: [...content.events, structuredClone(content.events[sel.index])] });
              setSel({ kind: "event", index: content.events.length });
            }}
            onRemove={() => remove()}
          />
        ) : sel?.kind === "brew" && content.brewing[sel.index] ? (
          <BrewEditor
            key={`brew-${sel.index}`}
            project={project}
            brew={content.brewing[sel.index]}
            own={own}
            onChange={(b) => setContent({ ...content, brewing: content.brewing.map((x, i) => (i === sel.index ? b : x)) })}
            onRemove={() => remove()}
          />
        ) : mob ? (
          <MobEditor
            key={`mob-${sel!.index}`}
            project={project}
            german={german}
            mob={mob}
            own={own}
            saved={(savedContent?.generatedMobs ?? []).includes(mob.id)}
            busy={busy}
            onChange={updMob}
            onSave={save}
            onDuplicate={() => addMob(mob)}
            onRemove={() => remove()}
          />
        ) : !current ? (
          <ContentOverview project={project} content={content} textures={textures} dirty={dirty} onCreate={(g) => setCreateGroup(g)} onSelect={setSel} onSave={save} />
        ) : (
          <div className="editor-grid" key={`${sel!.kind}-${sel!.index}`}>
            <div className="panel form-panel">
              <div className="editor-head">
                {entryIcon(block ? "block" : "item", current.id, current.nameDe)}
                <div className="grow editor-head-text">
                  <div className="editor-head-title">{current.nameEn || current.nameDe || current.id}</div>
                  <div className="editor-head-sub mono">
                    {project.modId}:{current.id} · {block ? (block.ore.enabled ? t("Erz") : t("Block")) : item!.kind === "tool" ? t("Werkzeug") : item!.kind === "armor" ? t("Rüstung") : t("Item")}
                  </div>
                </div>
                <button className="icon-btn" onClick={() => (block ? addBlock(block) : addItem(item))} aria-label={t("Duplizieren")} data-tip={t("Duplizieren")}>
                  <CopyIcon size={15} />
                </button>
                <button className="icon-btn danger" onClick={() => remove()} aria-label={t("Entfernen")} data-tip={t("Entfernen")}>
                  <TrashIcon size={15} />
                </button>
              </div>
              <SubTabs
                value={block ? blockTab : itemTabEff}
                onChange={(v) => (block ? setBlockTab(v as BlockTab) : setItemTab(v as ItemTab))}
                tabs={
                  block
                    ? [
                        ["general", t("Allgemein")],
                        ["mining", t("Abbau & Erz")],
                        ["function", t("Funktion")],
                        ["model", t("3D-Form")],
                        ["shapes", t("Formen")],
                        ["recipe", t("Rezept")],
                      ]
                    : [
                        ["general", t("Allgemein")],
                        ...(item!.kind === "tool" ? ([["function", t("Werkzeug")]] as [string, string][]) : item!.kind === "armor" ? ([["function", t("Rüstung")]] as [string, string][]) : []),
                        ["recipe", t("Rezept")],
                      ]
                }
              />
              {(block ? blockTab : itemTabEff) === "general" && (
                <div className="form-grid">
                <Field label={t("ID")} hint={savedIds.includes(current.id) ? t("ändern löscht die alten Dateien") : t("Kleinbuchstaben, _")}>
                  <input
                    className="input mono"
                    value={current.id}
                    onChange={(e) => {
                      const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_");
                      block ? updBlock({ id: v }) : updItem({ id: v });
                    }}
                  />
                </Field>
                <Field label={t("Vollständige ID")}>
                  <input className="input mono" readOnly value={`${project.modId}:${current.id}`} />
                </Field>
                <NameFields
                  en={current.nameEn}
                  de={current.nameDe}
                  german={german}
                  onEn={(v) => (block ? updBlock({ nameEn: v }) : updItem({ nameEn: v }))}
                  onDe={(v) => (block ? updBlock({ nameDe: v }) : updItem({ nameDe: v }))}
                />
                <NamesField names={current.names ?? {}} onChange={(names) => (block ? updBlock({ names }) : updItem({ names }))} />

                  {block && (
                    <>
                    <Field label={t("Material & Klang")}>
                      <select className="input" value={block.material} onChange={(e) => updBlock({ material: e.target.value as BlockDef["material"] })}>
                        <option value="stone">{t("Stein")}</option>
                        <option value="wood">{t("Holz")}</option>
                        <option value="metal">{t("Metall")}</option>
                        <option value="glass">{t("Glas (durchsichtig)")}</option>
                        <option value="grass">{t("Gras/Pflanze")}</option>
                        <option value="sand">{t("Sand")}</option>
                        <option value="gravel">{t("Kies")}</option>
                        <option value="wool">{t("Wolle")}</option>
                      </select>
                    </Field>
                    <Field label={t("Leuchtkraft · {light}", { light: block.light })}>
                      <input type="range" className="range full" min={0} max={15} value={block.light} onChange={(e) => updBlock({ light: Number(e.target.value) })} />
                    </Field>
                    </>
                  )}
                {item && <ItemKindSwitch item={item} onChange={updItem} />}
                {item && item.kind === "basic" && (
                  <>
                    <Field label={t("Stapelgröße")}>
                      <select className="input" value={item.stackSize} onChange={(e) => updItem({ stackSize: Number(e.target.value) })}>
                        <option value={64}>64</option>
                        <option value={16}>16</option>
                        <option value={1}>{t("1 (nicht stapelbar)")}</option>
                      </select>
                    </Field>
                    <div className="span-2 toggle-row" style={{ flexDirection: "row" }}>
                      <Toggle label={t("Essbar")} checked={item.food} onChange={(v) => updItem({ food: v })} />
                      <span>{t("Essbar")}</span>
                    </div>
                    {item.food && (
                      <>
                        <Field label={t("Hunger · {v0} Keulen", { v0: item.nutrition / 2 })}>
                          <input type="range" className="range full" min={1} max={20} value={item.nutrition} onChange={(e) => updItem({ nutrition: Number(e.target.value) })} />
                        </Field>
                        <Field label={t("Sättigung")} hint={t("Apfel 0,3 · Steak 0,8")}>
                          <input className="input" type="number" min={0} max={2} step={0.1} value={item.saturation} onChange={(e) => updItem({ saturation: Number(e.target.value) })} />
                        </Field>
                      </>
                    )}
                  </>
                )}
                {item && (
                  <Field label={t("Seltenheit")} hint={t("Farbe des Namens")}>
                    <select className="input" value={item.rarity} onChange={(e) => updItem({ rarity: e.target.value as ItemDef["rarity"] })}>
                      <option value="common">{t("Gewöhnlich (weiß)")}</option>
                      <option value="uncommon">{t("Ungewöhnlich (gelb)")}</option>
                      <option value="rare">{t("Selten (türkis)")}</option>
                      <option value="epic">{t("Episch (lila)")}</option>
                    </select>
                  </Field>
                )}
                </div>
              )}
              {block && blockTab === "mining" && (
                <>
                  <div className="form-grid">
                    <Field label={t("Härte")} hint={t("Stein 1,5 · Eisenerz 3 · Obsidian 50")}>
                      <input className="input" type="number" min={0} step={0.5} value={block.hardness} onChange={(e) => updBlock({ hardness: Number(e.target.value) })} />
                    </Field>
                    <Field label={t("Explosionsresistenz")} hint={t("Stein 6 · Obsidian 1200")}>
                      <input className="input" type="number" min={0} step={1} value={block.resistance} onChange={(e) => updBlock({ resistance: Number(e.target.value) })} />
                    </Field>
                    <Field label={t("Abbauen mit")}>
                      <select className="input" value={block.tool} onChange={(e) => updBlock({ tool: e.target.value as BlockDef["tool"] })}>
                        <option value="none">{t("Beliebig (droppt immer)")}</option>
                        <option value="pickaxe">{t("Spitzhacke")}</option>
                        <option value="axe">{t("Axt")}</option>
                        <option value="shovel">{t("Schaufel")}</option>
                        <option value="hoe">{t("Hacke")}</option>
                      </select>
                    </Field>
                    <Field label={t("Mindestens")}>
                      <select className="input" value={block.tier} disabled={block.tool === "none"} onChange={(e) => updBlock({ tier: e.target.value as BlockDef["tier"] })}>
                        <option value="wood">{t("Holz")}</option>
                        <option value="stone">{t("Stein")}</option>
                        <option value="iron">{t("Eisen")}</option>
                        <option value="diamond">{t("Diamant")}</option>
                      </select>
                    </Field>
                  </div>
                  <BlockExtras project={project} block={block} own={own} texture={textures[block.id]} onChange={updBlock} part="ore" />
                </>
              )}
              {block && (blockTab === "function" || blockTab === "model" || blockTab === "shapes") && (
                <BlockExtras project={project} block={block} own={own} texture={textures[block.id]} onChange={updBlock} part={blockTab} guis={content.guis ?? []} />
              )}
              {item && itemTabEff === "function" && (
                <>
              {item?.kind === "tool" && <ToolForm project={project} item={item} own={own} onChange={updItem} />}
              {item?.kind === "armor" && (
                <ArmorForm
                  project={project}
                  item={item}
                  own={own}
                  onChange={updItem}
                  onCreateSet={() => createArmorSet(item)}
                  missingSlots={(["helmet", "chestplate", "leggings", "boots"] as ArmorSlot[]).filter(
                    (sl) => !content.items.some((x) => x.kind === "armor" && x.armorMaterial === item.armorMaterial && x.armorSlot === sl),
                  )}
                />
              )}

                </>
              )}
              {(block ? blockTab : itemTabEff) === "recipe" && (
                <>
              <RecipeEditor
                project={project}
                recipe={current.recipe}
                own={own}
                resultId={`${project.modId}:${current.id}`}
                onChange={(recipe) => (block ? updBlock({ recipe }) : updItem({ recipe }))}
              />
                </>
              )}
            </div>

            <div className="panel texture-panel">
              <div className="panel-title-lg">{t("Textur")}</div>
              {block && !(block.kind === "normal" && !block.ore.enabled && block.model.length > 0) && (
                <FacesEditor faces={block.faces} lib={libTex} own={textures[block.id] ?? ""} onChange={(faces) => updBlock({ faces })} onOpenLib={() => window.dispatchEvent(new CustomEvent("anvil:open-tab", { detail: "textures" }))} />
              )}
              {item && item.kind !== "armor" && (
                <div className="faces">
                  <LibTexSelect lib={libTex} own={textures[item.id] ?? ""} label={t("Textur aus der Bibliothek")} value={item.texture ?? ""} onChange={(texture) => updItem({ texture })} />
                </div>
              )}
              {savedIds.includes(current.id) && !(item?.texture && item.kind !== "armor") && !(block?.faces?.mode && usesOnlyLib(block.faces)) ? (
                <PixelEditor
                  projectId={project.id}
                  kind={block ? "block" : "item"}
                  id={current.id}
                  onSaved={(dataUrl) => setTextures((t) => ({ ...t, [current.id]: dataUrl }))}
                  renderPreview={
                    block && block.kind === "normal" && !block.ore.enabled && block.model.length
                      ? (url) => (
                          <ModelPreview
                            cuboids={block.model}
                            size={190}
                            texFor={(tx) => (tx ? textures[tx.replace(`${project.modId}:`, "")] : url)}
                          />
                        )
                      : undefined
                  }
                />
              ) : null}
              {savedIds.includes(current.id) && block?.ore.enabled && block.ore.deepslate && block.ore.dimension === "overworld" && savedIds.includes(`deepslate_${block.id}`) && (
                <div className="texture-sub">
                  <div className="texture-sub-head">
                    <GemIcon size={16} />
                    <span className="panel-title-lg">{t("Tiefenschiefer-Variante")}</span>
                  </div>
                  <PixelEditor
                    projectId={project.id}
                    kind="block"
                    id={`deepslate_${block.id}`}
                    onSaved={(dataUrl) => setTextures((t) => ({ ...t, [`deepslate_${block.id}`]: dataUrl }))}
                  />
                </div>
              )}
              {savedIds.includes(current.id) && block?.kind === "lamp" && (
                <div className="texture-sub">
                  <div className="texture-sub-head">
                    <LampIcon size={16} />
                    <span className="panel-title-lg">{t("Eingeschaltet (leuchtend)")}</span>
                  </div>
                  <PixelEditor
                    projectId={project.id}
                    kind="block"
                    id={`${block.id}_on`}
                    onSaved={(dataUrl) => setTextures((t) => ({ ...t, [`${block.id}_on`]: dataUrl }))}
                  />
                </div>
              )}
              {savedIds.includes(current.id) && item?.kind === "armor" && item.armorMaterial && savedContent?.items.some((x) => x.kind === "armor" && x.armorMaterial === item.armorMaterial) && (
                <div className="texture-sub">
                  <div className="texture-sub-head">
                    <ChestplateIcon size={16} />
                    <span className="panel-title-lg">{item.armorSlot === "leggings" ? t("Getragen: Hose") : t("Getragen: Helm, Brust & Stiefel")}</span>
                  </div>
                  <p className="muted small">
                    {item.armorSlot === "leggings" ? t("64×32 im Aufbau eines Spieler-Skins. Gilt für die Hose aus „{material}“.", { material: item.armorMaterial }) : t("64×32 im Aufbau eines Spieler-Skins. Gilt für alle Teile aus „{material}“ außer der Hose.", { material: item.armorMaterial })}
                  </p>
                  <PixelEditor key={`${item.armorMaterial}-${item.armorSlot === "leggings"}`} projectId={project.id} kind={item.armorSlot === "leggings" ? "armor_legs" : "armor"} id={item.armorMaterial} />
                </div>
              )}
              {savedIds.includes(current.id) ? (
                null
              ) : (
                <div className="texture-wait">
                  <SparkIcon size={20} />
                  <p className="muted small">{t("Speichere zuerst, dann kannst du die Textur malen.")}</p>
                  <button className="btn small primary" onClick={save} disabled={busy}>
                    <SaveIcon size={14} />{" "}{t("Jetzt speichern")}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
      {createGroup && <CreateMenu group={createGroup} onPick={create} onClose={() => setCreateGroup(null)} />}
    </div>
  );
}

function RecipeEditor({
  project,
  recipe,
  own,
  resultId,
  onChange,
}: {
  project: Project;
  recipe: Recipe;
  own: OwnEntry[];
  resultId: string;
  onChange: (r: Recipe) => void;
}) {
  const grid = recipe.grid?.length === 9 ? recipe.grid : Array(9).fill("");
  const kind = recipe.kind ?? "crafting";
  const [picking, setPicking] = useState<number | null>(null);
  const { catalog } = useCatalog(project.mcVersion, recipe.enabled);
  const cooking = ["smelting", "blasting", "smoking", "campfire"].includes(kind);
  const mode = kind === "crafting" ? (recipe.shaped ? "shaped" : "shapeless") : kind;
  const cells = cooking || kind === "stonecutting" ? [0] : kind === "smithing" ? [0, 1, 2] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const cellLabel = (i: number) => (kind === "smithing" ? [t("Vorlage"), t("Basis"), t("Zusatz")][i] : undefined);
  const resultInfo = resolveItem(resultId, catalog, own, project.modId);

  const setCell = (i: number, v: string) => {
    const g = [...grid];
    g[i] = v;
    onChange({ ...recipe, grid: g });
  };

  return (
    <div className="recipe">
      <div className="recipe-head">
        <Toggle label={t("Rezept")} checked={recipe.enabled} onChange={(v) => onChange({ ...recipe, enabled: v, grid, kind })} />
        <span className="panel-title-lg">{t("Rezept")}</span>
        {recipe.enabled && (
          <select
            className="input recipe-kind"
            aria-label={t("Rezeptart")}
            value={mode}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ ...recipe, grid, kind: v === "shaped" || v === "shapeless" ? "crafting" : v, shaped: v !== "shapeless" });
            }}
          >
            <option value="shaped">{t("Werkbank")}</option>
            <option value="shapeless">{t("Werkbank ohne Form")}</option>
            <option value="smelting">{t("Ofen")}</option>
            <option value="blasting">{t("Schmelzofen")}</option>
            <option value="smoking">{t("Räucherofen")}</option>
            <option value="campfire">{t("Lagerfeuer")}</option>
            <option value="stonecutting">{t("Steinsäge")}</option>
            <option value="smithing">{t("Schmiedetisch")}</option>
          </select>
        )}
      </div>
      {recipe.enabled && (
        <div className="recipe-body">
          <div className={cells.length === 1 ? "craft-grid one" : cells.length === 3 ? "craft-grid three" : "craft-grid"}>
            {cells.map((i) => {
              const id = grid[i];
              const info = resolveItem(id, catalog, own, project.modId);
              return (
                <button
                  key={i}
                  type="button"
                  className={id ? "slot-btn filled" : "slot-btn"}
                  title={id ? `${info.name}\n${id}` : cellLabel(i) ?? t("Item wählen")}
                  aria-label={id ? t("Feld {v0}: {name}", { v0: i + 1, name: info.name }) : t("Feld {v0}: leer", { v0: i + 1 })}
                  onClick={() => setPicking(i)}
                  {...contextMenu(() => [
                    { label: t("Item wählen …"), icon: <SearchIcon size={15} />, onClick: () => setPicking(i) },
                    { label: t("Leeren"), icon: <TrashIcon size={15} />, disabled: !id, onClick: () => setCell(i, "") },
                    "separator",
                    { label: t("Alle Felder leeren"), icon: <TrashIcon size={15} />, danger: true, onClick: () => onChange({ ...recipe, grid: Array(9).fill("") }) },
                  ])}
                >
                  {id ? (
                    <McIcon icon={info.icon} textures={info.textures} size={34} fallback={info.name} />
                  ) : (
                    <span className="slot-plus">
                      <PlusIcon size={14} />
                      {cellLabel(i) && <span className="slot-label">{cellLabel(i)}</span>}
                    </span>
                  )}
                  {id && (
                    <span
                      role="button"
                      className="slot-clear"
                      aria-label={t("Leeren")}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCell(i, "");
                      }}
                    >
                      <CloseIcon size={9} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="craft-result">
            <svg className="craft-arrow" width="28" height="20" viewBox="0 0 28 20" aria-hidden="true">
              <path d="M2 10h22M17 3l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="result-slot" title={resultInfo.name}>
              <McIcon icon={resultInfo.icon} textures={resultInfo.textures} size={40} fallback={resultInfo.name} />
              {!cooking && recipe.count > 1 && <span className="result-count">{recipe.count}</span>}
            </div>
          </div>
          <div className="recipe-options">
            {cooking ? (
              <>
                <Field label={t("Erfahrung")}>
                  <input className="input" type="number" min={0} step={0.1} value={recipe.experience ?? 0.1} onChange={(e) => onChange({ ...recipe, experience: Number(e.target.value) })} />
                </Field>
                <Field label={t("Dauer (Sekunden)")}>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    step={1}
                    value={Math.round((recipe.cookingTime ?? 200) / 20)}
                    onChange={(e) => onChange({ ...recipe, cookingTime: Math.max(1, Number(e.target.value)) * 20 })}
                  />
                </Field>
              </>
            ) : (
              <Field label={t("Anzahl")}>
                <input className="input" type="number" min={1} max={64} value={recipe.count} onChange={(e) => onChange({ ...recipe, count: Number(e.target.value) })} />
              </Field>
            )}
          </div>
        </div>
      )}
      {picking !== null && (
        <ItemPicker
          mcVersion={project.mcVersion}
          modId={project.modId}
          own={own}
          onClose={() => setPicking(null)}
          onPick={(id) => {
            setCell(picking, id);
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}

type Todo = { text: string; tone: "warn" | "info"; action: string; run: () => void };

/** Startseite des Inhalte-Tabs: Bereiche mit Anzahl und was noch offen ist */
function ContentOverview({
  project,
  content,
  textures,
  dirty,
  onCreate,
  onSelect,
  onSave,
}: {
  project: Project;
  content: Content;
  textures: Record<string, string>;
  dirty: boolean;
  onCreate: (g: CreateGroup) => void;
  onSelect: (s: Sel) => void;
  onSave: () => void;
}) {
  const tiles: { g: CreateGroup; label: string; desc: string; icon: React.ReactNode; n: number }[] = [
    { g: "block", label: t("Blöcke"), desc: t("Bauen, Erze, Truhen, Werkbänke, Maschinen"), icon: <CubeIcon size={17} />, n: content.blocks.length },
    { g: "item", label: t("Items"), desc: t("Materialien, Werkzeuge, Rüstung, Essen"), icon: <GemIcon size={17} />, n: content.items.length },
    { g: "mob", label: t("Kreaturen"), desc: t("Tiere und Monster mit eigenem Verhalten"), icon: <PawIcon size={17} />, n: content.mobs.length },
    { g: "world", label: t("Welt"), desc: t("Eigene Dimensionen und Weltgenerierung"), icon: <GlobeIcon size={17} />, n: content.dimensions.length },
    { g: "logic", label: t("Logik"), desc: t("Blueprints, Oberflächen und Ereignisse: Wenn … dann …"), icon: <BlueprintIcon size={17} />, n: content.blueprints.length + content.events.length + (content.guis ?? []).length },
    { g: "logic", label: t("Brauen"), desc: t("Eigene Tränke im Braustand"), icon: <FlaskIcon size={17} />, n: content.brewing.length },
  ];
  const todos: Todo[] = [];
  if (dirty) todos.push({ text: t("Es gibt ungespeicherte Änderungen."), tone: "info", action: t("Speichern"), run: onSave });
  content.blocks.forEach((b, i) => {
    const name = b.nameEn || b.nameDe || b.id;
    if (content.generatedBlocks.includes(b.id) && !textures[b.id] && !b.model.length) todos.push({ text: t("„{name}“ hat noch keine eigene Textur", { name }), tone: "warn", action: t("Öffnen"), run: () => onSelect({ kind: "block", index: i }) });
    if (b.kind === "workbench" && !(b.workbenchRecipes ?? []).length) todos.push({ text: t("Werkbank „{name}“ hat noch keine eigenen Rezepte", { name }), tone: "warn", action: t("Öffnen"), run: () => onSelect({ kind: "block", index: i }) });
    if (b.kind === "machine" && !(b.machine?.recipes ?? []).length) todos.push({ text: t("Maschine „{name}“ hat noch kein Rezept", { name }), tone: "warn", action: t("Öffnen"), run: () => onSelect({ kind: "block", index: i }) });
    if (!b.nameEn.trim()) todos.push({ text: t("„{name}“ hat noch keinen englischen Namen", { name }), tone: "info", action: t("Öffnen"), run: () => onSelect({ kind: "block", index: i }) });
  });
  content.items.forEach((it, i) => {
    const name = it.nameEn || it.nameDe || it.id;
    if (content.generatedItems.includes(it.id) && !textures[it.id]) todos.push({ text: t("„{name}“ hat noch keine eigene Textur", { name }), tone: "warn", action: t("Öffnen"), run: () => onSelect({ kind: "item", index: i }) });
    if (!it.nameEn.trim()) todos.push({ text: t("„{name}“ hat noch keinen englischen Namen", { name }), tone: "info", action: t("Öffnen"), run: () => onSelect({ kind: "item", index: i }) });
  });
  content.blueprints.forEach((b, i) => {
    if (b.nodes.length <= 1) todos.push({ text: t("Blueprint „{name}“ ist noch leer", { name: b.name }), tone: "info", action: t("Öffnen"), run: () => onSelect({ kind: "blueprint", index: i }) });
  });
  const total = content.blocks.length + content.items.length + content.mobs.length + content.dimensions.length + content.blueprints.length + content.events.length + content.brewing.length;
  return (
    <div className="content-overview">
      <header className="overview-head">
        <div className="grow">
          <h1>{t("Inhalte")}</h1>
          <p className="muted">
            {total
              ? t("Alles, was deine Mod ins Spiel bringt. Wähle links etwas aus oder lege mit + Neues an.")
              : t("Lege Inhalte per Formular an. Beim Speichern erzeugt Anvil Studio Java-Code, Modelle, Loot-Tabellen, Rezepte und Übersetzungen – passend für Minecraft {v}.", { v: project.mcVersion })}
          </p>
        </div>
        <button className="btn primary" onClick={() => onCreate("all")}>
          <PlusIcon size={15} /> {t("Neuer Inhalt")}
        </button>
      </header>
      <div className="overview-tiles">
        {tiles.map((x) => (
          <button key={x.label} className="overview-tile" onClick={() => onCreate(x.g)}>
            <span className="overview-tile-top">
              <span className="overview-tile-icon">{x.icon}</span>
              <span className="overview-tile-label">{x.label}</span>
              <span className="overview-tile-n">{x.n}</span>
            </span>
            <span className="muted small">{x.desc}</span>
          </button>
        ))}
      </div>
      {todos.length > 0 && (
        <section className="overview-todos">
          <h2>{t("Noch offen")}</h2>
          <ul>
            {todos.slice(0, 10).map((x, i) => (
              <li key={i}>
                <span className={`todo-dot ${x.tone}`} />
                <span className="grow">{x.text}</span>
                <button className="btn small" onClick={x.run}>
                  {x.action}
                </button>
              </li>
            ))}
          </ul>
          {todos.length > 10 && <span className="muted small">{t("… und {n} weitere", { n: todos.length - 10 })}</span>}
        </section>
      )}
    </div>
  );
}
