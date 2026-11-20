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
  runClient: "Testen (Client)",
  runServer: "Server",
  runData: "Datagen",
  build: "Bauen",
  clean: "Aufräumen",
};

export function timeAgo(seconds: number): string {
  const diff = Math.max(0, Date.now() / 1000 - seconds);
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
  return `vor ${Math.floor(diff / 86400)} Tagen`;
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
};

// ---- Inhalte, Mods, Dateien, Import (0.5) --------------------------------

export type Recipe = {
  enabled: boolean;
  kind: "crafting" | "smelting";
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
};
export type BlockShape = "stairs" | "slab" | "wall" | "fence";
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
export type Content = {
  schemaVersion: number;
  generatorVersion: number;
  blocks: BlockDef[];
  items: ItemDef[];
  generatedBlocks: string[];
  generatedItems: string[];
  tabIcon: string;
  tabName: string;
};
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
  save: (projectId: string, content: Content) => invoke<{ content: Content; registration: string }>("content_save", { projectId, content }),
  textureGet: (projectId: string, kind: "block" | "item", id: string) => invoke<string | null>("texture_get", { projectId, kind, id }),
  textureSave: (projectId: string, kind: "block" | "item", id: string, pngBase64: string) => invoke<void>("texture_save", { projectId, kind, id, pngBase64 }),
  open: (projectId: string) => invoke<string[]>("project_open", { projectId }),
};

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
