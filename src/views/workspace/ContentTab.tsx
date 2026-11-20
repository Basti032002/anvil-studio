import { t } from "../../i18n";
import { confirmDialog, contextMenu, MenuItem } from "../../components/Overlay";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArmorSlot, BlockDef, Blueprint, Content, contentApi, ItemDef, MobDef, Project, Recipe } from "../../api";
import { useCatalog } from "../../catalog";
import { Toggle } from "../../components/Chrome";
import ItemPicker, { OwnEntry, resolveItem } from "../../components/ItemPicker";
import McIcon from "../../components/McIcon";
import { BlueprintIcon, BoxIcon, ChestplateIcon, CloseIcon, CopyIcon, CubeIcon, FlaskIcon, GemIcon, LampIcon, LightningIcon, PencilIcon, PlusIcon, SaveIcon, SearchIcon, SparkIcon, SwordIcon, TagIcon, TrashIcon } from "../../icons";
import { toast } from "../../state";
import PixelEditor from "./PixelEditor";
import { ArmorForm, BlockExtras, Field, ItemKindSwitch, ToolForm } from "./ContentForms";
import MobEditor from "./MobEditor";
import BlueprintEditor from "./BlueprintEditor";
import CreateMenu, { CreateChoice, CreateGroup } from "./CreateMenu";
import { TEMPLATES } from "./blueprints";
import { BrewEditor, brewLabel, EventEditor, eventLabel, NamesField, newBrew, newEvent } from "./LogicEditors";
import { armorPreset, toolPreset, eggDataUrl, newMob, normalizeMob, newBlock, newItem, normalizeBlock, normalizeItem, SLOT_DE, SLOT_EN, variantIds } from "./contentDefaults";

const normalize = (c: Content): Content => ({ ...c, blocks: c.blocks.map(normalizeBlock), items: c.items.map(normalizeItem), mobs: (c.mobs ?? []).map(normalizeMob), brewing: c.brewing ?? [], events: (c.events ?? []).map((e) => ({ ...e, actions: e.actions ?? [] })), blueprints: c.blueprints ?? [], generatedMobs: c.generatedMobs ?? [], tabIcon: c.tabIcon ?? "", tabName: c.tabName ?? "" });

type Sel = { kind: "block" | "item" | "mob" | "event" | "brew" | "blueprint"; index: number } | null;

export default function ContentTab({ project }: { project: Project }) {
  const [content, setContent] = useState<Content | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [sel, setSel] = useState<Sel>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [textures, setTextures] = useState<Record<string, string>>({});
  const [createGroup, setCreateGroup] = useState<CreateGroup | null>(null);

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
    contentApi
      .load(project.id)
      .then((raw) => {
        const c = normalize(raw);
        setContent(c);
        setSaved(JSON.stringify(c));
        loadTextures(c);
        if (c.blocks.length) setSel({ kind: "block", index: 0 });
        else if (c.items.length) setSel({ kind: "item", index: 0 });
      })
      .catch((e) => toast(String(e), "error"));
  }, [project.id, loadTextures]);

  const dirty = content ? JSON.stringify(content) !== saved : false;
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
  const own: OwnEntry[] = useMemo(
    () =>
      content
        ? [
            ...content.blocks.flatMap((b) =>
              variantIds(b).map((v) => ({ id: v.id, name: v.name, kind: "block" as const, texture: textures[v.id] ?? textures[b.id], shape: v.shape })),
            ),
            ...content.items.map((i) => ({ id: i.id, name: i.nameDe || i.nameEn || i.id, kind: "item" as const, texture: textures[i.id] })),
            ...content.mobs.map((m) => ({ id: `${m.id}_spawn_egg`, name: `${m.nameDe || m.id}-Spawn-Ei`, kind: "item" as const, texture: eggDataUrl(m.eggPrimary, m.eggSecondary) })),
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
      ? { ...structuredClone(from), id: uniqueId(`${from.id}_kopie`), nameDe: `${from.nameDe} (Kopie)`, nameEn: `${from.nameEn} (Copy)` }
      : newBlock(uniqueId("neuer_block"));
    setContent({ ...content, blocks: [...content.blocks, b] });
    setSel({ kind: "block", index: content.blocks.length });
    setFilter("");
  }

  function addItem(from?: ItemDef, kind: ItemDef["kind"] = "basic") {
    if (!content) return;
    const base = kind === "tool" ? "neues_werkzeug" : kind === "armor" ? "neue_ruestung" : "neues_item";
    const i: ItemDef = from
      ? { ...structuredClone(from), id: uniqueId(`${from.id}_kopie`), nameDe: `${from.nameDe} (Kopie)`, nameEn: `${from.nameEn} (Copy)` }
      : newItem(uniqueId(base), kind);
    setContent({ ...content, items: [...content.items, i] });
    setSel({ kind: "item", index: content.items.length });
    setFilter("");
  }

  function addMob(from?: MobDef) {
    if (!content) return;
    const m: MobDef = from ? { ...structuredClone(from), id: uniqueId(`${from.id}_kopie`), nameDe: `${from.nameDe} (Kopie)`, nameEn: `${from.nameEn} (Copy)` } : newMob(uniqueId("neue_kreatur"));
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
      const b = newBlock(uid(v === "ore" ? "neues_erz" : v === "lamp" ? "neue_lampe" : v === "storage" ? "neue_truhe" : "neuer_block"));
      if (v === "ore") Object.assign(b, { nameDe: t("Neues Erz"), nameEn: "New Ore", hardness: 3, resistance: 3, tier: "stone", ore: { ...b.ore, enabled: true } });
      if (v === "lamp") Object.assign(b, { nameDe: t("Neue Lampe"), nameEn: "New Lamp", kind: "lamp", material: "glass", hardness: 0.3, resistance: 0.3, tool: "none" });
      if (v === "storage") Object.assign(b, { nameDe: t("Neue Truhe"), nameEn: "New Chest", kind: "storage", material: "wood", hardness: 2.5, resistance: 2.5, tool: "axe", rows: 3 });
      if (v === "shapes") Object.assign(b, { shapes: ["stairs", "slab", "wall"] });
      setContent({ ...content, blocks: [...content.blocks, b] });
      setSel({ kind: "block", index: content.blocks.length });
    } else if (choice.kind === "item") {
      const v = choice.variant;
      const added: ItemDef[] = [];
      if (v === "basic") added.push(newItem(uid("neues_item")));
      else if (v === "food") added.push({ ...newItem(uid("neue_nahrung")), nameDe: t("Neue Nahrung"), nameEn: "New Food", food: true, nutrition: 6, saturation: 0.6 });
      else if (v === "toolset") {
        for (const type of ["sword", "pickaxe", "axe", "shovel", "hoe"] as const) {
          const [id, de, en] = TOOL_NAMES[type];
          added.push({ ...newItem(uid(id), "tool"), ...toolPreset(type, "iron"), nameDe: de, nameEn: en });
        }
      } else if (v === "armor" || v === "armorset") {
        const mat = uid("neues_material");
        const slots: ArmorSlot[] = v === "armor" ? ["helmet"] : ["helmet", "chestplate", "leggings", "boots"];
        for (const slot of slots)
          added.push({ ...newItem(uid(`${mat}_${slot}`), "armor"), ...armorPreset("iron", slot), armorMaterial: mat, nameDe: `${t("Neue Rüstung")} – ${SLOT_DE[slot]}`, nameEn: `New ${SLOT_EN[slot]}` });
      } else {
        const [id, de, en] = TOOL_NAMES[v];
        added.push({ ...newItem(uid(id), "tool"), ...toolPreset(v, "iron"), nameDe: de, nameEn: en });
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
    const matName = (from.nameDe || mat).replace(/[- ]?(Helm|Brustpanzer|Hose|Stiefel)$/i, "").trim() || mat;
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
        nameDe: `${matName}-${SLOT_DE[slot]}`,
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
        </div>
        <div className="content-list-scroll">
          <div className="content-list-head">
            <span>{t("Blöcke ·")}{" "}{content.blocks.length}</span>
            <button className="icon-btn" onClick={() => setCreateGroup("block")} aria-label={t("Block hinzufügen")} data-tip={t("Block hinzufügen")}>
              <PlusIcon size={15} />
            </button>
          </div>
          {content.blocks.map((b, i) =>
            matches(b) ? (
              <button
                key={`b${i}`}
                className={sel?.kind === "block" && sel.index === i ? "entry active" : "entry"}
                onClick={() => setSel({ kind: "block", index: i })}
                {...contextMenu(() => entryMenu("block", i))}
              >
                {entryIcon("block", b.id, b.nameDe || b.id)}
                <span className="entry-text">
                  <span className="entry-name">{b.nameDe || b.id}</span>
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
          {content.blocks.length === 0 && <p className="muted small pad">{t("Noch keine Blöcke.")}</p>}
          <div className="content-list-head">
            <span>{t("Items ·")}{" "}{content.items.length}</span>
            <button className="icon-btn" onClick={() => setCreateGroup("item")} aria-label={t("Item hinzufügen")} data-tip={t("Item")}>
              <PlusIcon size={15} />
            </button>
          </div>
          {content.items.map((it, i) =>
            matches(it) ? (
              <button
                key={`i${i}`}
                className={sel?.kind === "item" && sel.index === i ? "entry active" : "entry"}
                onClick={() => setSel({ kind: "item", index: i })}
                {...contextMenu(() => entryMenu("item", i))}
              >
                {entryIcon("item", it.id, it.nameDe || it.id)}
                <span className="entry-text">
                  <span className="entry-name">{it.nameDe || it.id}</span>
                  <span className="entry-id">{it.id}</span>
                </span>
                {it.kind !== "basic" && <span className="entry-badges">{it.kind === "tool" ? <SwordIcon size={12} /> : <ChestplateIcon size={12} />}</span>}
              </button>
            ) : null,
          )}
          {content.items.length === 0 && <p className="muted small pad">{t("Noch keine Items.")}</p>}
          <div className="content-list-head">
            <span>{t("Kreaturen ·")}{" "}{content.mobs.length}</span>
            <button className="icon-btn" onClick={() => setCreateGroup("mob")} aria-label={t("Kreatur hinzufügen")} data-tip={t("Kreatur")}>
              <PlusIcon size={15} />
            </button>
          </div>
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
                  <span className="entry-name">{m.nameDe || m.id}</span>
                  <span className="entry-id">{m.id}</span>
                </span>
              </button>
            ) : null,
          )}
          {content.mobs.length === 0 && <p className="muted small pad">{t("Noch keine Kreaturen.")}</p>}
          <div className="content-list-head">
            <span>{t("Blueprints ·")}{" "}{content.blueprints.length}</span>
            <button className="icon-btn" onClick={() => setCreateGroup("logic")} aria-label={t("Blueprint hinzufügen")} data-tip={t("Blueprint")}>
              <PlusIcon size={15} />
            </button>
          </div>
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
          {content.blueprints.length === 0 && <p className="muted small pad">{t("Noch keine Blueprints.")}</p>}
          <div className="content-list-head">
            <span>{t("Ereignisse ·")}{" "}{content.events.length}</span>
            <button
              className="icon-btn"
              onClick={() => setCreateGroup("logic")}
              aria-label={t("Ereignis hinzufügen")}
              data-tip={t("Ereignis")}
            >
              <PlusIcon size={15} />
            </button>
          </div>
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
          {content.events.length === 0 && <p className="muted small pad">{t("Noch keine Ereignisse.")}</p>}
          <div className="content-list-head">
            <span>{t("Brau-Rezepte ·")}{" "}{content.brewing.length}</span>
            <button
              className="icon-btn"
              onClick={() => setCreateGroup("logic")}
              aria-label={t("Brau-Rezept hinzufügen")}
              data-tip={t("Brau-Rezept")}
            >
              <PlusIcon size={15} />
            </button>
          </div>
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
        </div>
        <div className="content-save">
          <button className={busy ? "btn primary full loading" : "btn primary full"} disabled={busy || (!dirty && content.generatorVersion > 0)} onClick={save}>
            <SaveIcon size={14} /> {dirty ? t("Speichern & Code erzeugen") : t("Alles gespeichert")}
          </button>
          <div className="muted small center">{t("Strg S")}</div>
        </div>
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
        {sel?.kind === "blueprint" && content.blueprints[sel.index] ? (
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
          <div className="content-empty">
            <div className="empty-icon">
              <CubeIcon size={26} />
            </div>
            <h2>{t("Blöcke & Items ohne Code")}</h2>
            <p className="muted">
              {t("Lege Inhalte per Formular an. Beim Speichern erzeugt Anvil Studio Java-Code, Modelle, Loot-Tabellen, Rezepte und Übersetzungen – passend für Minecraft")}{" "}{project.mcVersion}.
            </p>
            <div className="row center">
              <button className="btn primary" onClick={() => setCreateGroup("block")}>
                <PlusIcon size={15} />{" "}{t("Block")}
              </button>
              <button className="btn" onClick={() => setCreateGroup("item")}>
                <BoxIcon size={15} />{" "}{t("Item")}
              </button>
              <button className="btn" onClick={() => setCreateGroup("mob")}>
                <SwordIcon size={15} />{" "}{t("Kreatur")}
              </button>
              <button className="btn" onClick={() => setCreateGroup("logic")}>
                <BlueprintIcon size={15} />{" "}{t("Blueprint")}
              </button>
            </div>
          </div>
        ) : (
          <div className="editor-grid" key={`${sel!.kind}-${sel!.index}`}>
            <div className="panel form-panel">
              <div className="panel-head">
                <div className="row">
                  {entryIcon(block ? "block" : "item", current.id, current.nameDe)}
                  <div className="panel-title-lg">{block ? (block.ore.enabled ? t("Erz") : t("Block")) : item!.kind === "tool" ? t("Werkzeug") : item!.kind === "armor" ? t("Rüstung") : t("Item")}</div>
                </div>
                <div className="row gap-6">
                  <button className="icon-btn" onClick={() => (block ? addBlock(block) : addItem(item))} aria-label={t("Duplizieren")} data-tip={t("Duplizieren")}>
                    <CopyIcon size={15} />
                  </button>
                  <button className="icon-btn danger" onClick={() => remove()} aria-label={t("Entfernen")} data-tip={t("Entfernen")}>
                    <TrashIcon size={15} />
                  </button>
                </div>
              </div>
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
                <Field label={t("Name (Deutsch)")}>
                  <input className="input" value={current.nameDe} onChange={(e) => (block ? updBlock({ nameDe: e.target.value }) : updItem({ nameDe: e.target.value }))} />
                </Field>
                <Field label={t("Name (Englisch)")}>
                  <input className="input" value={current.nameEn} onChange={(e) => (block ? updBlock({ nameEn: e.target.value }) : updItem({ nameEn: e.target.value }))} />
                </Field>
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

              {block && <BlockExtras project={project} block={block} own={own} texture={textures[block.id]} onChange={updBlock} />}
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

              <RecipeEditor
                project={project}
                recipe={current.recipe}
                own={own}
                resultId={`${project.modId}:${current.id}`}
                onChange={(recipe) => (block ? updBlock({ recipe }) : updItem({ recipe }))}
              />
            </div>

            <div className="panel texture-panel">
              <div className="panel-title-lg">{t("Textur")}</div>
              {savedIds.includes(current.id) ? (
                <PixelEditor
                  projectId={project.id}
                  kind={block ? "block" : "item"}
                  id={current.id}
                  onSaved={(dataUrl) => setTextures((t) => ({ ...t, [current.id]: dataUrl }))}
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
