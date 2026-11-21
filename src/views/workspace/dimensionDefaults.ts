import { t } from "../../i18n";
import { DimBiome, DimDef, DimOre, DimTemplate } from "../../api";
import { builderToGraph, defaultBuilder } from "./terrain";

export const templateOf = (d: DimDef): DimTemplate => (d.template || "overworld") as DimTemplate;

export const TEMPLATES: { id: DimTemplate; label: () => string; desc: () => string }[] = [
  { id: "overworld", label: () => t("Oberwelt"), desc: () => t("Berge, Wälder, Meere – mit deinen eigenen Blöcken") },
  { id: "amplified", label: () => t("Zerklüftet"), desc: () => t("Riesige Berge und tiefe Täler") },
  { id: "nether", label: () => t("Nether"), desc: () => t("Höhlenwelt mit Decke, Lavameer und Nether-Himmel") },
  { id: "end", label: () => t("End"), desc: () => t("Inseln im Nichts unter dunklem Himmel") },
  { id: "floating", label: () => t("Schwebende Inseln"), desc: () => t("Inseln am Himmel, darunter nichts") },
  { id: "caves", label: () => t("Höhlenwelt"), desc: () => t("Alles unter der Erde, mit Decke") },
  { id: "flat", label: () => t("Flachland"), desc: () => t("Flache Schichten – ideal zum Bauen") },
  { id: "void", label: () => t("Leere"), desc: () => t("Nur Luft – für Skyblock und Lobbys") },
];

/** Vanilla-Biome als Vorbild, mit passender Oberfläche */
export const BASES: { id: string; label: () => string; top?: string; fill?: string }[] = [
  { id: "plains", label: () => t("Ebene") },
  { id: "forest", label: () => t("Wald") },
  { id: "dark_forest", label: () => t("Dunkler Wald") },
  { id: "taiga", label: () => t("Taiga") },
  { id: "snowy_plains", label: () => t("Verschneite Ebene"), top: "minecraft:snow_block" },
  { id: "desert", label: () => t("Wüste"), top: "minecraft:sand", fill: "minecraft:sandstone" },
  { id: "savanna", label: () => t("Savanne") },
  { id: "jungle", label: () => t("Dschungel") },
  { id: "badlands", label: () => t("Tafelberge"), top: "minecraft:red_sand", fill: "minecraft:terracotta" },
  { id: "swamp", label: () => t("Sumpf") },
  { id: "mushroom_fields", label: () => t("Pilzland"), top: "minecraft:mycelium" },
  { id: "cherry_grove", label: () => t("Kirschhain") },
  { id: "ocean", label: () => t("Ozean"), top: "minecraft:sand", fill: "minecraft:gravel" },
  { id: "lush_caves", label: () => t("Üppige Höhlen"), top: "minecraft:moss_block" },
  { id: "dripstone_caves", label: () => t("Tropfsteinhöhlen") },
  { id: "deep_dark", label: () => t("Tiefes Dunkel") },
  { id: "nether_wastes", label: () => t("Nether-Ödland") },
  { id: "crimson_forest", label: () => t("Karmesinwald"), top: "minecraft:crimson_nylium" },
  { id: "warped_forest", label: () => t("Wirrwald"), top: "minecraft:warped_nylium" },
  { id: "soul_sand_valley", label: () => t("Seelensandtal"), top: "minecraft:soul_sand", fill: "minecraft:soul_soil" },
  { id: "basalt_deltas", label: () => t("Basaltdeltas"), top: "minecraft:basalt", fill: "minecraft:blackstone" },
  { id: "the_end", label: () => t("Das End") },
  { id: "end_highlands", label: () => t("End-Hochland") },
  { id: "small_end_islands", label: () => t("Kleine End-Inseln") },
];

export const STRUCTURES: { id: string; label: () => string }[] = [
  { id: "village_plains", label: () => t("Dorf (Ebene)") },
  { id: "village_desert", label: () => t("Dorf (Wüste)") },
  { id: "village_savanna", label: () => t("Dorf (Savanne)") },
  { id: "village_snowy", label: () => t("Dorf (Schnee)") },
  { id: "village_taiga", label: () => t("Dorf (Taiga)") },
  { id: "pillager_outpost", label: () => t("Plünderer-Außenposten") },
  { id: "mineshaft", label: () => t("Mine") },
  { id: "stronghold", label: () => t("Festung") },
  { id: "desert_pyramid", label: () => t("Wüstentempel") },
  { id: "jungle_temple", label: () => t("Dschungeltempel") },
  { id: "igloo", label: () => t("Iglu") },
  { id: "swamp_hut", label: () => t("Hexenhütte") },
  { id: "woodland_mansion", label: () => t("Waldanwesen") },
  { id: "ocean_monument", label: () => t("Ozeanmonument") },
  { id: "ocean_ruin_cold", label: () => t("Ozeanruine") },
  { id: "shipwreck", label: () => t("Schiffswrack") },
  { id: "buried_treasure", label: () => t("Vergrabener Schatz") },
  { id: "ruined_portal_standard", label: () => t("Portalruine") },
  { id: "ancient_city", label: () => t("Antike Stätte") },
  { id: "trail_ruins", label: () => t("Pfadruinen") },
  { id: "trial_chambers", label: () => t("Prüfungskammern") },
  { id: "nether_fortress", label: () => t("Netherfestung") },
  { id: "bastion_remnant", label: () => t("Bastionsruine") },
  { id: "ruined_portal_nether", label: () => t("Portalruine (Nether)") },
  { id: "nether_fossil", label: () => t("Nether-Fossil") },
  { id: "end_city", label: () => t("Endsiedlung") },
];

export const SPAWN_CATEGORIES: { id: string; label: () => string }[] = [
  { id: "monster", label: () => t("Monster") },
  { id: "creature", label: () => t("Tiere") },
  { id: "ambient", label: () => t("Umgebung (Fledermäuse)") },
  { id: "water_creature", label: () => t("Wassertiere") },
  { id: "water_ambient", label: () => t("Fische") },
];

const ore = (block: string, deepBlock: string, size: number, count: number, minY: number, maxY: number): DimOre => ({ block, deepBlock, size, count, minY, maxY, distribution: "triangle" });

export const ORE_PRESETS: { id: string; label: () => string; ores: () => DimOre[] }[] = [
  {
    id: "overworld",
    label: () => t("Oberwelt-Erze"),
    ores: () => [
      ore("minecraft:coal_ore", "minecraft:deepslate_coal_ore", 17, 20, 0, 192),
      ore("minecraft:iron_ore", "minecraft:deepslate_iron_ore", 9, 10, -24, 56),
      ore("minecraft:copper_ore", "minecraft:deepslate_copper_ore", 10, 16, -16, 112),
      ore("minecraft:gold_ore", "minecraft:deepslate_gold_ore", 9, 4, -64, 32),
      ore("minecraft:redstone_ore", "minecraft:deepslate_redstone_ore", 8, 4, -64, 15),
      ore("minecraft:lapis_ore", "minecraft:deepslate_lapis_ore", 7, 2, -32, 32),
      ore("minecraft:diamond_ore", "minecraft:deepslate_diamond_ore", 8, 1, -64, 16),
      ore("minecraft:emerald_ore", "minecraft:deepslate_emerald_ore", 3, 0.5, -16, 160),
    ],
  },
  {
    id: "nether",
    label: () => t("Nether-Erze"),
    ores: () => [
      ore("minecraft:nether_quartz_ore", "", 14, 16, 10, 118),
      ore("minecraft:nether_gold_ore", "", 10, 10, 10, 118),
      ore("minecraft:ancient_debris", "", 3, 1, 8, 24),
    ],
  },
  {
    id: "rich",
    label: () => t("Viele Erze"),
    ores: () => [
      ore("minecraft:iron_ore", "minecraft:deepslate_iron_ore", 12, 24, -64, 120),
      ore("minecraft:gold_ore", "minecraft:deepslate_gold_ore", 10, 10, -64, 64),
      ore("minecraft:diamond_ore", "minecraft:deepslate_diamond_ore", 8, 6, -64, 32),
      ore("minecraft:emerald_ore", "minecraft:deepslate_emerald_ore", 4, 4, -16, 160),
    ],
  },
];

const biome = (id: string, nameDe: string, nameEn: string, base: string): DimBiome => {
  const b = BASES.find((x) => x.id === base);
  return { id, nameDe, nameEn, base, topBlock: b?.top ?? "", fillBlock: b?.fill ?? "" };
};

/** Werte, die eine Vorlage vorgibt (Name und ID bleiben) */
export function templateDefaults(tp: DimTemplate): Partial<DimDef> {
  const shape = tp === "overworld" ? "hills" : tp === "amplified" ? "mountains" : null;
  const terrain = shape ? defaultBuilder(shape) : null;
  const common: Partial<DimDef> = {
    terrainMode: terrain ? "builder" : "",
    terrain,
    builderGraph: terrain ? builderToGraph(terrain, -64, 320) : { nodes: [], links: [] },
    graph: { nodes: [], links: [] },
    minY: terrain ? -64 : 0,
    maxY: terrain ? 320 : 0,
    islandsMinY: 0, islandsMaxY: 0, islandsSizeMin: 20, islandsSizeMax: 60, islandsThickness: 12, islandsRough: 0.5, islandsTop: "", islandsWaterfalls: false,
    template: tp, land: 0, islands: false, islandsY: 0, islandsAmount: 0.5, topBlock: "", fillBlock: "", stoneBlock: "", deepBlock: "",
    noBedrock: false, fluid: "water", seaLevel: 63, biomeMode: "own", biome: "overworld", biomeSize: 1, noNoiseCaves: false, noCaves: false,
    noCanyons: false, noOreVeins: false, noPlants: false, noLakes: false, noSprings: false, time: "normal", sky: "overworld", ambientLight: 0,
    skyColor: "", fogColor: "", waterColor: "", grassColor: "", foliageColor: "", weather: "", noBaseSpawns: false, spawns: [],
  };
  switch (tp) {
    case "nether":
      return { ...common, fluid: "lava", seaLevel: 32, time: "night", sky: "nether", ambientLight: 0.1,
        biomes: [biome("oedland", "Ödland", "Wastes", "nether_wastes"), biome("karmesin", "Karmesinwald", "Crimson Forest", "crimson_forest"), biome("seelen", "Seelensandtal", "Soul Sand Valley", "soul_sand_valley")],
        ores: ORE_PRESETS[1].ores(), structures: ["nether_fortress", "bastion_remnant"] };
    case "end":
      return { ...common, fluid: "none", seaLevel: 0, time: "day", sky: "end", biomes: [biome("insel", "Insel", "Island", "the_end"), biome("hochland", "Hochland", "Highlands", "end_highlands")],
        ores: [], structures: ["end_city"] };
    case "void":
      return { ...common, fluid: "none", seaLevel: 0, biomeMode: "own", biomes: [biome("leere", "Leere", "Void", "plains")], noPlants: true, noBaseSpawns: true, ores: [], structures: [], noBedrock: true };
    case "floating":
      return { ...common, fluid: "none", seaLevel: -64, biomes: [biome("wiese", "Wiese", "Meadow", "plains"), biome("wald", "Wald", "Forest", "forest"), biome("kirsche", "Kirschhain", "Cherry Grove", "cherry_grove")],
        ores: ORE_PRESETS[0].ores(), structures: ["ruined_portal_standard"] };
    case "caves":
      return { ...common, seaLevel: 32, biomes: [biome("moos", "Moos", "Moss", "lush_caves"), biome("tropfstein", "Tropfstein", "Dripstone", "dripstone_caves")],
        ores: ORE_PRESETS[0].ores(), structures: ["mineshaft", "trial_chambers"], ambientLight: 0.05 };
    case "flat":
      return { ...common, biomes: [biome("ebene", "Ebene", "Plains", "plains")], ores: [], structures: ["village_plains"], noLakes: true };
    default:
      return { ...common, biomes: [biome("wiese", "Wiese", "Meadow", "plains"), biome("wald", "Wald", "Forest", "forest"), biome("wueste", "Wüste", "Desert", "desert"), biome("schnee", "Schneeland", "Snowland", "snowy_plains")],
        ores: ORE_PRESETS[0].ores(), structures: ["village_plains", "village_desert", "mineshaft", "stronghold", "ruined_portal_standard", "desert_pyramid", "igloo"] };
  }
}

export function newDimension(id: string, tp: DimTemplate = "overworld"): DimDef {
  const label = TEMPLATES.find((x) => x.id === tp);
  return {
    ...(templateDefaults(tp) as DimDef),
    id,
    nameDe: label ? label.label() : t("Neue Dimension"),
    nameEn: { overworld: "Overworld", amplified: "Amplified", nether: "Nether", end: "End", floating: "Floating Islands", caves: "Caves", flat: "Flatland", void: "Void" }[tp] + " Dimension",
  };
}

/** Alte oder unvollständige Dimensionen mit Standardwerten auffüllen */
export function withDefaults(d: DimDef): DimDef {
  const defaults: Partial<DimDef> = {
    land: 0, islands: false, islandsY: 0, islandsAmount: 0.5, deepBlock: "", noBedrock: false, biomeMode: "", biomes: [], biomeSize: 1,
    noNoiseCaves: false, noCaves: false, noCanyons: false, noOreVeins: false, ores: [], structures: [], noPlants: false, noLakes: false,
    noSprings: false, skyColor: "", fogColor: "", waterColor: "", grassColor: "", foliageColor: "", weather: "", noBaseSpawns: false, spawns: [],
    template: "",
  };
  return Object.assign(defaults, d) as DimDef;
}
