import { ArmorSlot, BlockDef, BlockShape, ItemDef, OreDef, Recipe, ToolType } from "../../api";
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
  nameDe: kind === "tool" ? "Neues Werkzeug" : kind === "armor" ? "Neue Rüstung" : "Neues Item",
  nameEn: kind === "tool" ? "New Tool" : kind === "armor" ? "New Armor" : "New Item",
  recipe: emptyRecipe(),
  kind,
  ...itemBase,
  ...(kind === "tool" ? toolPreset("sword", "iron") : {}),
  ...(kind === "armor" ? armorPreset("iron", "helmet") : {}),
});

/** Ergänzt Felder, die ältere Inhalte noch nicht haben. */
export function normalizeBlock(b: BlockDef): BlockDef {
  return { ...newBlock(b.id), ...b, shapes: b.shapes ?? [], ore: { ...defaultOre(), ...(b.ore ?? {}) } };
}
export function normalizeItem(i: ItemDef): ItemDef {
  return { ...itemBase, ...i, kind: i.kind ?? "basic" };
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

export const SLOT_LABEL: Record<ArmorSlot, string> = { helmet: "Helm", chestplate: "Brustpanzer", leggings: "Hose", boots: "Stiefel" };
export const SLOT_EN: Record<ArmorSlot, string> = { helmet: "Helmet", chestplate: "Chestplate", leggings: "Leggings", boots: "Boots" };
export const TOOL_LABEL: Record<ToolType, string> = { sword: "Schwert", pickaxe: "Spitzhacke", axe: "Axt", shovel: "Schaufel", hoe: "Hacke" };

// ---- Formen ---------------------------------------------------------------

export const SHAPES: { id: BlockShape; label: string; en: string }[] = [
  { id: "stairs", label: "Treppe", en: "Stairs" },
  { id: "slab", label: "Stufe", en: "Slab" },
  { id: "wall", label: "Mauer", en: "Wall" },
  { id: "fence", label: "Zaun", en: "Fence" },
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
