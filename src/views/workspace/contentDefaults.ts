import { t } from "../../i18n";
import { ArmorSlot, BlockDef, BlockShape, ItemDef, MobDef, MobModel, OreDef, Recipe, ToolType } from "../../api";
import type { McElement, McIconDef } from "../../iconRender";

export const emptyRecipe = (): Recipe => ({ enabled: false, kind: "crafting", shaped: true, grid: Array(9).fill(""), count: 1, experience: 0.1, cookingTime: 200 });

export const defaultOre = (): OreDef => ({
  enabled: false,
  drop: "",
  dropMin: 1,
  dropMax: 1,
  xpMin: 0,
  xpMax: 0,
  deepslate: true,
  dimension: "overworld",
  veinSize: 8,
  veinsPerChunk: 6,
  minY: -64,
  maxY: 32,
});

export const newBlock = (id: string): BlockDef => ({
  id,
  nameDe: "Neuer Block",
  nameEn: "New Block",
  material: "stone",
  hardness: 1.5,
  resistance: 6,
  light: 0,
  tool: "pickaxe",
  tier: "wood",
  recipe: emptyRecipe(),
  shapes: [],
  ore: defaultOre(),
  kind: "normal",
  rows: 3,
  names: {},
  model: [],
  rotate: false,
  workbenchRecipes: [],
  machine: { fuel: true, recipes: [] },
});

const itemBase = {
  stackSize: 64,
  rarity: "common" as const,
  food: false,
  nutrition: 4,
  saturation: 0.3,
  toolType: "sword" as ToolType,
  toolTier: "iron" as const,
  durability: 250,
  attackDamage: 6,
  attackSpeed: 1.6,
  miningSpeed: 6,
  enchantability: 14,
  repairItem: "",
  armorSlot: "helmet" as ArmorSlot,
  armorMaterial: "",
  defense: 2,
  toughness: 0,
  knockbackResistance: 0,
};

export const newItem = (id: string, kind: ItemDef["kind"] = "basic"): ItemDef => ({
  id,
  nameDe: kind === "tool" ? t("Neues Werkzeug") : kind === "armor" ? t("Neue Rüstung") : t("Neues Item"),
  nameEn: kind === "tool" ? t("New Tool") : kind === "armor" ? t("New Armor") : t("New Item"),
  names: {},
  recipe: emptyRecipe(),
  kind,
  ...itemBase,
  ...(kind === "tool" ? toolPreset("sword", "iron") : {}),
  ...(kind === "armor" ? armorPreset("iron", "helmet") : {}),
});

/** Ergänzt Felder, die ältere Inhalte noch nicht haben. */
export function normalizeBlock(b: BlockDef): BlockDef {
  return { ...newBlock(b.id), ...b, shapes: b.shapes ?? [], ore: { ...defaultOre(), ...(b.ore ?? {}) }, names: b.names ?? {} };
}
export function normalizeItem(i: ItemDef): ItemDef {
  return { ...itemBase, ...i, kind: i.kind ?? "basic", names: i.names ?? {} };
}

// ---- Vorlagen wie Vanilla --------------------------------------------------

export type Tier = "wood" | "stone" | "iron" | "diamond" | "netherite";
const TIER = {
  wood: { uses: 59, speed: 2, ench: 15, bonus: 0 },
  stone: { uses: 131, speed: 4, ench: 5, bonus: 1 },
  iron: { uses: 250, speed: 6, ench: 14, bonus: 2 },
  diamond: { uses: 1561, speed: 8, ench: 10, bonus: 3 },
  netherite: { uses: 2031, speed: 9, ench: 15, bonus: 4 },
};

export function toolPreset(type: ToolType, tier: Tier): Partial<ItemDef> {
  const t = TIER[tier];
  const dmg: Record<ToolType, number> = {
    sword: t.bonus + 4,
    pickaxe: t.bonus + 2,
    axe: { wood: 7, stone: 9, iron: 9, diamond: 9, netherite: 10 }[tier],
    shovel: t.bonus + 2.5,
    hoe: 1,
  };
  const spd: Record<ToolType, number> = {
    sword: 1.6,
    pickaxe: 1.2,
    axe: { wood: 0.8, stone: 0.8, iron: 0.9, diamond: 1, netherite: 1 }[tier],
    shovel: 1,
    hoe: { wood: 1, stone: 2, iron: 3, diamond: 4, netherite: 4 }[tier],
  };
  return {
    toolType: type,
    toolTier: tier,
    durability: t.uses,
    miningSpeed: t.speed,
    enchantability: t.ench,
    attackDamage: dmg[type] + 1,
    attackSpeed: spd[type],
    stackSize: 1,
  };
}

const ARMOR = {
  iron: { dur: 15, def: { helmet: 2, chestplate: 6, leggings: 5, boots: 2 }, ench: 9, tough: 0, kb: 0 },
  diamond: { dur: 33, def: { helmet: 3, chestplate: 8, leggings: 6, boots: 3 }, ench: 10, tough: 2, kb: 0 },
  netherite: { dur: 37, def: { helmet: 3, chestplate: 8, leggings: 6, boots: 3 }, ench: 15, tough: 3, kb: 0.1 },
};
export type ArmorTier = keyof typeof ARMOR;

export function armorPreset(tier: ArmorTier, slot: ArmorSlot): Partial<ItemDef> {
  const a = ARMOR[tier];
  return { armorSlot: slot, durability: a.dur, defense: a.def[slot], enchantability: a.ench, toughness: a.tough, knockbackResistance: a.kb, stackSize: 1 };
}

export const SLOT_LABEL: Record<ArmorSlot, string> = { helmet: t("Helm"), chestplate: t("Brustpanzer"), leggings: t("Hose"), boots: t("Stiefel") };
export const SLOT_DE: Record<ArmorSlot, string> = { helmet: "Helm", chestplate: "Brustpanzer", leggings: "Hose", boots: "Stiefel" };
export const SLOT_EN: Record<ArmorSlot, string> = { helmet: "Helmet", chestplate: "Chestplate", leggings: "Leggings", boots: "Boots" };
export const TOOL_LABEL: Record<ToolType, string> = { sword: t("Schwert"), pickaxe: t("Spitzhacke"), axe: t("Axt"), shovel: t("Schaufel"), hoe: t("Hacke") };

// ---- Formen ---------------------------------------------------------------

export const SHAPES: { id: BlockShape; label: string; en: string }[] = [
  { id: "stairs", label: t("Treppe"), en: "Stairs" },
  { id: "slab", label: t("Stufe"), en: "Slab" },
  { id: "wall", label: t("Mauer"), en: "Wall" },
  { id: "fence", label: t("Zaun"), en: "Fence" },
  { id: "button", label: t("Knopf"), en: "Button" },
  { id: "pressure_plate", label: t("Druckplatte"), en: "Pressure Plate" },
];

/** Weitere Sprachen für Namen in der Mod (Deutsch und Englisch haben eigene Felder). */
export const EXTRA_NAME_LANGS: { id: string; label: string }[] = [
  { id: "fr", label: "Français" },
  { id: "es", label: "Español" },
  { id: "pl", label: "Polski" },
  { id: "nl", label: "Nederlands" },
  { id: "tr", label: "Türkçe" },
  { id: "ru", label: "Русский" },
];

/** Vanilla-Tränke für Brau-Rezepte */
export const POTIONS: string[] = [
  "water", "awkward", "mundane", "thick", "night_vision", "invisibility", "leaping", "fire_resistance", "swiftness", "slowness",
  "water_breathing", "healing", "harming", "poison", "regeneration", "strength", "weakness", "luck", "slow_falling", "turtle_master",
  "long_night_vision", "long_invisibility", "long_swiftness", "long_fire_resistance", "strong_healing", "strong_strength", "strong_regeneration",
];

export function variantIds(b: BlockDef): { id: string; shape: BlockShape | "block" | "deepslate"; name: string }[] {
  const name = b.nameDe || b.nameEn || b.id;
  const out: { id: string; shape: BlockShape | "block" | "deepslate"; name: string }[] = [{ id: b.id, shape: "block", name }];
  if (b.ore?.enabled && b.ore.deepslate && b.ore.dimension === "overworld") out.push({ id: `deepslate_${b.id}`, shape: "deepslate", name: `Tiefenschiefer-${name}` });
  for (const s of SHAPES) if (b.shapes?.includes(s.id)) out.push({ id: `${b.id}_${s.id}`, shape: s.id, name: `${name}-${s.label}` });
  return out;
}

/** 3D-Symbol einer Blockform mit eigener Textur (wie die Inventar-Modelle von Minecraft). */
export function shapeIcon(shape: BlockShape | "block" | "deepslate", tex: string): McIconDef {
  const all = (from: [number, number, number], to: [number, number, number]): McElement => ({
    from,
    to,
    faces: { up: { tex }, north: { tex }, south: { tex }, east: { tex }, west: { tex } },
  });
  switch (shape) {
    case "stairs":
      return { kind: "model", elements: [all([0, 0, 0], [16, 8, 16]), all([8, 8, 0], [16, 16, 16])] };
    case "button":
      return { kind: "model", elements: [all([5, 0, 6], [11, 2, 10])], gui: [30, 225, 0] };
    case "pressure_plate":
      return { kind: "model", elements: [all([1, 0, 1], [15, 1, 15])] };
    case "slab":
      return { kind: "model", elements: [all([0, 0, 0], [16, 8, 16])] };
    case "wall":
      return { kind: "model", gui: [30, 135, 0], elements: [all([4, 0, 4], [12, 16, 12]), all([5, 0, 0], [11, 13, 16])] };
    case "fence":
      return {
        kind: "model",
        gui: [30, 135, 0],
        elements: [all([6, 0, 0], [10, 16, 4]), all([6, 0, 12], [10, 16, 16]), all([7, 13, -2], [9, 15, 18]), all([7, 5, -2], [9, 7, 18])],
      };
    default:
      return { kind: "cube", top: tex, side: tex };
  }
}

// ---- Kreaturen ------------------------------------------------------------


export const MOB_MODELS: { id: MobModel; label: string; hostile: boolean; health: number; speed: number; attack: number; egg: [string, string] }[] = [
  { id: "cow", label: t("Kuh"), hostile: false, health: 10, speed: 0.2, attack: 0, egg: ["#443626", "#a1a1a1"] },
  { id: "pig", label: t("Schwein"), hostile: false, health: 10, speed: 0.25, attack: 0, egg: ["#f0a5a2", "#db635f"] },
  { id: "chicken", label: t("Huhn"), hostile: false, health: 4, speed: 0.25, attack: 0, egg: ["#a1a1a1", "#ff0000"] },
  { id: "zombie", label: t("Zombie"), hostile: true, health: 20, speed: 0.23, attack: 3, egg: ["#00afaf", "#799c65"] },
  { id: "spider", label: t("Spinne"), hostile: true, health: 16, speed: 0.3, attack: 2, egg: ["#342d27", "#a80e0e"] },
  { id: "creeper", label: t("Creeper"), hostile: true, health: 20, speed: 0.25, attack: 0, egg: ["#0da70b", "#000000"] },
];

export const newMob = (id: string, model: MobModel = "cow"): MobDef => {
  const m = MOB_MODELS.find((x) => x.id === model)!;
  return {
    id,
    nameDe: "Neue Kreatur",
    nameEn: "New Creature",
    names: {},
    model,
    health: m.health,
    speed: m.speed,
    attackDamage: m.attack,
    eggPrimary: m.egg[0],
    eggSecondary: m.egg[1],
    spawn: true,
    biomes: m.hostile ? "overworld" : "plains",
    weight: m.hostile ? 60 : 8,
    groupMin: m.hostile ? 1 : 2,
    groupMax: m.hostile ? 3 : 4,
    drop: "",
    dropMin: 0,
    dropMax: 2,
  };
};

export function normalizeMob(m: MobDef): MobDef {
  return { ...newMob(m.id, m.model ?? "cow"), ...m, names: m.names ?? {} };
}

export const BIOMES: { id: string; label: string }[] = [
  { id: "overworld", label: t("Ganze Oberwelt") },
  { id: "plains", label: t("Ebenen & Wiesen") },
  { id: "forest", label: t("Wälder") },
  { id: "jungle", label: t("Dschungel") },
  { id: "taiga", label: t("Taiga") },
  { id: "savanna", label: t("Savanne") },
  { id: "desert", label: t("Wüste & Tafelberge") },
  { id: "snowy", label: t("Schneegebiete") },
  { id: "mountain", label: t("Berge") },
  { id: "beach", label: t("Strände") },
  { id: "nether", label: t("Nether") },
  { id: "end", label: t("Ende") },
];

const eggCache = new Map<string, string>();
/** Spawn-Ei als Bild (gleiche Form wie die erzeugte Textur). */
export function eggDataUrl(primary: string, secondary: string): string {
  const key = primary + secondary;
  const hit = eggCache.get(key);
  if (hit) return hit;
  const hex = (h: string) => {
    const n = parseInt(h.replace("#", ""), 16) || 0x888888;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const p = hex(primary);
  const sc = hex(secondary);
  const inside = (x: number, y: number) => {
    const ry = y < 9 ? 6.8 : 5.6;
    const rx = 4.6 + Math.min(Math.max(y - 3, 0), 6) * 0.12;
    return ((x - 7.5) / rx) ** 2 + ((y - 9) / ry) ** 2 <= 1;
  };
  const spots = new Set(["6,5", "9,7", "5,9", "6,9", "10,11", "7,13", "8,13", "9,4", "4,11"]);
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 16;
  const g = c.getContext("2d")!;
  const img = g.createImageData(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      const base = spots.has(`${x},${y}`) ? sc : p;
      const f = edge ? 0.62 : x >= 9 && y >= 10 ? 0.85 : x <= 5 && y <= 7 ? 1.15 : 1;
      const i = (y * 16 + x) * 4;
      img.data[i] = Math.min(255, base[0] * f);
      img.data[i + 1] = Math.min(255, base[1] * f);
      img.data[i + 2] = Math.min(255, base[2] * f);
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const url = c.toDataURL();
  eggCache.set(key, url);
  return url;
}
