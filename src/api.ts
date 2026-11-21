import { t } from "./i18n";
import { invoke } from "@tauri-apps/api/core";

export type LastRun = { task: string; success: boolean; finishedAt: number };

export type Project = {
  id: string;
  name: string;
  modId: string;
  package: string;
  mcVersion: string;
  loader: string;
  path: string;
  createdAt: number;
  lastRun: LastRun | null;
};

export type JavaStatus = { installed: boolean; broken: boolean; version: number; path: string | null };
export type RunInfo = { projectId: string; task: string; startedAt: number };
export type CrashReport = { path: string; content: string; modified: number };

export type CreateRequest = {
  name: string;
  modId: string;
  package: string;
  mcVersion: string;
  author: string;
  description: string;
  parentDir: string | null;
};

export type Task = "runClient" | "runServer" | "runData" | "build" | "clean";

export const api = {
  listProjects: () => invoke<Project[]>("list_projects"),
  removeProject: (projectId: string, mode: "list" | "trash" | "delete" = "list") => invoke<void>("remove_project", { projectId, mode }),
  javaStatus: () => invoke<JavaStatus>("java_status"),
  installJava: () => invoke<JavaStatus>("install_java"),
  supportedVersions: () => invoke<{ versions: string[]; defaultDir: string }>("supported_versions"),
  createProject: (req: CreateRequest) => invoke<Project>("create_project", { req }),
  runTask: (projectId: string, task: Task, world?: string) =>
    invoke<void>("run_task", { projectId, task, world: world ?? null }),
  stopTask: (projectId: string) => invoke<void>("stop_task", { projectId }),
  runningTasks: () => invoke<RunInfo[]>("running_tasks"),
  openIn: (projectId: string, target: "code" | "idea" | "folder") =>
    invoke<void>("open_in", { projectId, target }),
  openPath: (path: string) => invoke<void>("open_path", { path }),
  openUrl: (url: string) => invoke<void>("open_url", { url }),
  listJars: (projectId: string) => invoke<string[]>("list_jars", { projectId }),
  latestCrashReport: (projectId: string) =>
    invoke<CrashReport | null>("latest_crash_report", { projectId }),
};

export const TASK_LABELS: Record<Task, string> = {
  runClient: t("Testen (Client)"),
  runServer: t("Server"),
  runData: t("Datagen"),
  build: t("Bauen"),
  clean: t("Aufräumen"),
};

export function timeAgo(seconds: number): string {
  const diff = Math.max(0, Date.now() / 1000 - seconds);
  if (diff < 60) return t("gerade eben");
  if (diff < 3600) return t("vor {v0} min", { v0: Math.floor(diff / 60) });
  if (diff < 86400) return t("vor {v0} Std.", { v0: Math.floor(diff / 3600) });
  return t("vor {v0} Tagen", { v0: Math.floor(diff / 86400) });
}

// ---- Einstellungen & Updates -------------------------------------------

export type UpdateCheck = "startup" | "daily" | "weekly" | "manual";
export type UpdateChannel = "stable" | "beta" | "dev";

export type Settings = {
  updateCheck: UpdateCheck;
  autoInstall: boolean;
  includePrerelease: boolean;
  updateChannel: UpdateChannel;
  defaultIde: "code" | "idea";
  projectsDir: string;
  reduceMotion: boolean;
  theme: "dark" | "light" | "system";
  accent: "green" | "blue" | "violet" | "orange";
  consoleFontSize: number;
  lastUpdateCheck: number;
  workshopUrl: string;
  startPage: "workshop" | "projects";
  playMemoryMb: number;
};

export type UpdateInfo = {
  version: string;
  current: string;
  notes: string;
  publishedAt: string;
  htmlUrl: string;
  assetUrl: string;
  assetName: string;
  size: number;
  digest: string | null;
  prerelease: boolean;
  channel: UpdateChannel;
  assetApiUrl: string;
};

export const settingsApi = {
  get: () => invoke<Settings>("get_settings"),
  save: (settings: Settings) => invoke<Settings>("save_settings", { settings }),
  checkUpdate: (channel: UpdateChannel) => invoke<UpdateInfo | null>("check_update", { channel }),
  installUpdate: (info: UpdateInfo) => invoke<void>("install_update", { info }),
  patchNotesPending: () => invoke<PatchNotes | null>("patch_notes_pending"),
  patchNotesSeen: (version: string) => invoke<void>("patch_notes_seen", { version }),
};

export type PatchNotes = { version: string; title: string; body: string; date: string; url: string };

// ---- Inhalte, Mods, Dateien, Import (0.5) --------------------------------

export type Recipe = {
  enabled: boolean;
  kind: string; // crafting | smelting | blasting | smoking | campfire | stonecutting | smithing
  shaped: boolean;
  grid: string[];
  count: number;
  experience: number;
  cookingTime: number;
};
export type BlockDef = {
  id: string;
  nameDe: string;
  nameEn: string;
  material: "stone" | "wood" | "metal" | "glass" | "grass" | "sand" | "wool" | "gravel";
  hardness: number;
  resistance: number;
  light: number;
  tool: "none" | "pickaxe" | "axe" | "shovel" | "hoe";
  tier: "wood" | "stone" | "iron" | "diamond";
  recipe: Recipe;
  shapes: BlockShape[];
  ore: OreDef;
  kind: "normal" | "lamp" | "storage" | "workbench" | "machine";
  rows: number;
  workbenchRecipes: WorkbenchRecipe[];
  machine: { fuel: boolean; recipes: MachineRecipe[] };
  names: Record<string, string>;
  model: Cuboid[];
  rotate: boolean;
};
export type WorkbenchRecipe = { shaped: boolean; grid: string[]; result: string; count: number };
export type MachineRecipe = { input: string; inputCount: number; output: string; outputCount: number; time: number };
export type Cuboid = { from: [number, number, number]; to: [number, number, number]; tex: string };
export type BlockShape = "stairs" | "slab" | "wall" | "fence" | "button" | "pressure_plate";
export type OreDef = {
  enabled: boolean;
  drop: string;
  dropMin: number;
  dropMax: number;
  xpMin: number;
  xpMax: number;
  deepslate: boolean;
  dimension: "overworld" | "nether" | "end";
  veinSize: number;
  veinsPerChunk: number;
  minY: number;
  maxY: number;
};
export type ToolType = "sword" | "pickaxe" | "axe" | "shovel" | "hoe";
export type ArmorSlot = "helmet" | "chestplate" | "leggings" | "boots";
export type ItemDef = {
  id: string;
  nameDe: string;
  nameEn: string;
  names: Record<string, string>;
  stackSize: number;
  rarity: "common" | "uncommon" | "rare" | "epic";
  food: boolean;
  nutrition: number;
  saturation: number;
  recipe: Recipe;
  kind: "basic" | "tool" | "armor";
  toolType: ToolType;
  toolTier: "wood" | "stone" | "iron" | "diamond" | "netherite";
  durability: number;
  attackDamage: number;
  attackSpeed: number;
  miningSpeed: number;
  enchantability: number;
  repairItem: string;
  armorSlot: ArmorSlot;
  armorMaterial: string;
  defense: number;
  toughness: number;
  knockbackResistance: number;
};
export type TexKind = "block" | "item" | "armor" | "armor_legs" | "entity";
export type MobModel = "cow" | "pig" | "chicken" | "zombie" | "spider" | "creeper";
export type MobDef = {
  id: string;
  nameDe: string;
  nameEn: string;
  names: Record<string, string>;
  model: MobModel;
  health: number;
  speed: number;
  attackDamage: number;
  eggPrimary: string;
  eggSecondary: string;
  spawn: boolean;
  biomes: string;
  weight: number;
  groupMin: number;
  groupMax: number;
  drop: string;
  dropMin: number;
  dropMax: number;
};
export const mcEntityTexture = (version: string, model: string) => invoke<string | null>("mc_entity_texture", { version, model });
export type Content = {
  schemaVersion: number;
  generatorVersion: number;
  blocks: BlockDef[];
  items: ItemDef[];
  mobs: MobDef[];
  generatedBlocks: string[];
  generatedItems: string[];
  generatedMobs: string[];
  tabIcon: string;
  tabName: string;
  /** zusätzliche Sprachen (Minecraft-Codes) */
  languages?: string[];
  /** Sprachcode → Schlüssel → Text */
  translations?: Record<string, Record<string, string>>;
  brewing: BrewDef[];
  events: EventDef[];
  blueprints: Blueprint[];
  dimensions: DimDef[];
  /** Eigene Strukturen (im Spiel mit dem Strukturblock gebaut) */
  structures?: StructDef[];
};
export type BrewDef = { input: string; ingredient: string; output: string };
export type EventTrigger = "right_click_block" | "right_click_item" | "break_block" | "place_block" | "use_item" | "entity_hurt" | "entity_killed";
export type ActionKind = "effect" | "give_item" | "message" | "sound" | "explode" | "fire" | "xp" | "heal" | "launch";
export type ActionDef = { kind: ActionKind; value: string; amount: number; duration: number; to: "player" | "target" };
export type EventDef = { trigger: EventTrigger; target: string; cancel: boolean; actions: ActionDef[] };
export type ModEntry = {
  projectId: string;
  slug: string;
  title: string;
  iconUrl: string;
  versionId: string;
  versionNumber: string;
  fileName: string;
  clientSide: string;
  serverSide: string;
  enabled: boolean;
  dependencyOf: string | null;
};
export type ModHit = { projectId: string; slug: string; title: string; description: string; iconUrl: string; downloads: number; author: string };
export type FileEntry = { name: string; rel: string; isDir: boolean; size: number };

export const contentApi = {
  load: (projectId: string) => invoke<Content>("content_load", { projectId }),
  save: (projectId: string, content: Content) => invoke<{ content: Content; registration: string; javaChanged: boolean }>("content_save", { projectId, content }),
  hotReload: (projectId: string) => invoke<number>("content_hot_reload", { projectId }),
  textureGet: (projectId: string, kind: TexKind, id: string) => invoke<string | null>("texture_get", { projectId, kind, id }),
  textureSave: (projectId: string, kind: TexKind, id: string, pngBase64: string) => invoke<void>("texture_save", { projectId, kind, id, pngBase64 }),
  open: (projectId: string) => invoke<string[]>("project_open", { projectId }),
  langEntries: (projectId: string, content: Content) => invoke<LangEntry[]>("content_lang_entries", { projectId, content }),
  langExport: (path: string, data: unknown) => invoke<void>("lang_export", { path, data }),
  langImport: (path: string) => invoke<Record<string, Record<string, string>>>("lang_import", { path }),
  structuresScan: (projectId: string) => invoke<FoundStructure[]>("structures_scan", { projectId }),
  structuresImported: (projectId: string) => invoke<FoundStructure[]>("structures_imported", { projectId }),
  structureImport: (projectId: string, file: string, name: string) => invoke<StructInfo>("structure_import", { projectId, file, name }),
};
export type StructInfo = { size: [number, number, number]; blocks: number; palette: [string, number][]; pools: string[] };
export type FoundStructure = { name: string; short: string; world: string; file: string; modified: number; info: StructInfo | null; error: string | null };
export interface StructPiece {
  template: string;
  /** "" = Start */
  pool: string;
  weight: number;
}
export interface StructDef {
  id: string;
  nameEn: string;
  nameDe: string;
  pieces: StructPiece[];
  overworld: boolean;
  biomes: string[];
  placement: "surface" | "underground" | "sky";
  y: number;
  spacing: number;
  separation: number;
  depth: number;
  adapt: "" | "none" | "beard_thin" | "beard_box" | "bury" | "encapsulate";
}
export type LangEntry = { key: string; kind: "block" | "item" | "entity" | "egg" | "tab"; owner: string; shape: string; de: string; en: string; legacy: Record<string, string> };

export const modsApi = {
  search: (projectId: string, query: string) => invoke<ModHit[]>("mods_search", { projectId, query }),
  list: (projectId: string) => invoke<ModEntry[]>("mods_list", { projectId }),
  add: (projectId: string, modId: string) => invoke<ModEntry[]>("mods_add", { projectId, modId }),
  remove: (projectId: string, modId: string) => invoke<ModEntry[]>("mods_remove", { projectId, modId }),
  toggle: (projectId: string, modId: string, enabled: boolean) => invoke<ModEntry[]>("mods_toggle", { projectId, modId, enabled }),
  update: (projectId: string) => invoke<number>("mods_update", { projectId }),
};

export const filesApi = {
  list: (projectId: string, rel: string) => invoke<FileEntry[]>("files_list", { projectId, rel }),
  read: (projectId: string, rel: string) => invoke<string>("files_read", { projectId, rel }),
  write: (projectId: string, rel: string, content: string) => invoke<void>("files_write", { projectId, rel, content }),
  create: (projectId: string, rel: string, isDir: boolean) => invoke<void>("files_create", { projectId, rel, isDir }),
  remove: (projectId: string, rel: string) => invoke<void>("files_delete", { projectId, rel }),
  rename: (projectId: string, rel: string, newRel: string) => invoke<void>("files_rename", { projectId, rel, newRel }),
  reveal: (projectId: string, rel: string) => invoke<void>("files_reveal", { projectId, rel }),
};

export type ModSettings = {
  name: string;
  version: string;
  authors: string;
  description: string;
  license: string;
  logo: string | null;
  tabName: string;
  tabIcon: string;
};
export const modSettingsApi = {
  get: (projectId: string) => invoke<ModSettings>("mod_settings_get", { projectId }),
  save: (projectId: string, settings: ModSettings) => invoke<void>("mod_settings_save", { projectId, settings }),
};

export type JarInfo = { path: string; name: string; size: number; modified: number };
export const exportApi = {
  jars: (projectId: string) => invoke<JarInfo[]>("export_jars", { projectId }),
  copyJar: (projectId: string, path: string, dest: string) => invoke<void>("export_copy_jar", { projectId, path, dest }),
  deleteJar: (projectId: string, path: string) => invoke<void>("export_delete_jar", { projectId, path }),
  sourceZip: (projectId: string, dest: string) => invoke<number>("export_source_zip", { projectId, dest }),
};

/** Windows-Speichern-Dialog. Gibt null zurück, wenn abgebrochen. */
export async function pickSaveFile(title: string, defaultPath: string, ext: string, label: string): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const r = await save({ title, defaultPath, filters: [{ name: label, extensions: [ext] }] });
  return typeof r === "string" ? r : null;
}

export const changeMcVersion = (projectId: string, version: string) => invoke<string[]>("change_mc_version", { projectId, version });

export const importProject = (path: string, setupWorld: boolean) => invoke<Project>("import_project", { path, setupWorld });

/** Windows-Ordnerauswahl. Gibt null zurück, wenn abgebrochen. */
export async function pickFolder(title: string, defaultPath?: string): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ directory: true, multiple: false, title, defaultPath: defaultPath || undefined });
  return typeof r === "string" ? r : null;
}

// ---- Minecraft-Katalog (0.5.0-dev.2) -----------------------------------------

export type { McIconDef } from "./iconRender";
import type { McIconDef } from "./iconRender";
export type CatalogEntry = { id: string; name: string; nameEn: string; kind: "block" | "item"; icon: McIconDef };
export type Catalog = { format: number; version: string; entries: CatalogEntry[]; textures: Record<string, string> };
export const mcCatalog = (version: string) => invoke<Catalog>("mc_catalog", { version });

// ---- Blueprints (Knoten-Graphen) -------------------------------------------
export interface BpNode {
  id: string;
  kind: string;
  x: number;
  y: number;
  props: Record<string, string>;
}
export interface BpLink {
  from: string;
  out: string;
  to: string;
}
export interface Blueprint {
  name: string;
  enabled: boolean;
  nodes: BpNode[];
  links: BpLink[];
}

// ---- Dimensionen -----------------------------------------------------------
export interface DimBiome {
  id: string;
  nameDe: string;
  nameEn: string;
  base: string;
  topBlock: string;
  fillBlock: string;
}
export interface DimOreTarget {
  target: string;
  ore: string;
}
export interface DimOre {
  block: string;
  deepBlock: string;
  size: number;
  count: number;
  minY: number;
  maxY: number;
  disabled?: boolean;
  /** "" | "uniform" | "triangle" | "bottom" | "top" */
  distribution?: string;
  /** nur in diesen eigenen Biomen (leer = alle) */
  biomes?: string[];
  hidden?: boolean;
  extra?: DimOreTarget[];
}
export interface TNode {
  id: string;
  kind: string;
  x: number;
  y: number;
  props: Record<string, string | number>;
}
export interface TLink {
  from: string;
  to: string;
  port: string;
}
export interface TGraph {
  nodes: TNode[];
  links: TLink[];
}
export type TerrainShape = "hills" | "flat" | "mountains" | "islands" | "canyons" | "terraces";
export interface TerrainLayer {
  kind: "continents" | "erosion" | "peaks" | "roughness" | "overhangs";
  on: boolean;
  strength: number;
}
export interface TerrainBuilder {
  shape: TerrainShape;
  base: number;
  diff: number;
  size: number;
  ocean: number;
  layers: TerrainLayer[];
}
export interface DimSpawn {
  entity: string;
  category: string;
  weight: number;
  min: number;
  max: number;
}
export type DimTemplate = "overworld" | "amplified" | "nether" | "end" | "floating" | "caves" | "flat" | "void";
export interface DimDef {
  id: string;
  nameDe: string;
  nameEn: string;
  /** "" = alte Dimension (wie Oberwelt) */
  template: DimTemplate | "";
  /** "" = Form der Vorlage, "builder" = Baukasten, "nodes" = Knoten-Modus */
  terrainMode?: "" | "builder" | "nodes";
  terrain?: TerrainBuilder | null;
  builderGraph?: TGraph;
  graph?: TGraph;
  minY?: number;
  maxY?: number;
  land: number;
  islands: boolean;
  islandsY: number;
  islandsAmount: number;
  islandsMinY?: number;
  islandsMaxY?: number;
  islandsSizeMin?: number;
  islandsSizeMax?: number;
  islandsThickness?: number;
  islandsRough?: number;
  islandsTop?: string;
  islandsWaterfalls?: boolean;
  topBlock: string;
  fillBlock: string;
  stoneBlock: string;
  deepBlock: string;
  noBedrock: boolean;
  fluid: "water" | "lava" | "none";
  seaLevel: number;
  biomeMode: "" | "vanilla" | "own";
  biome: string;
  biomes: DimBiome[];
  biomeSize: number;
  noNoiseCaves: boolean;
  noCaves: boolean;
  noCanyons: boolean;
  noOreVeins: boolean;
  ores: DimOre[];
  structures: string[];
  noPlants: boolean;
  noLakes: boolean;
  noSprings: boolean;
  time: "normal" | "day" | "night";
  sky: "overworld" | "nether" | "end";
  ambientLight: number;
  skyColor: string;
  fogColor: string;
  waterColor: string;
  grassColor: string;
  foliageColor: string;
  weather: "" | "none" | "rain" | "snow";
  noBaseSpawns: boolean;
  spawns: DimSpawn[];
}
