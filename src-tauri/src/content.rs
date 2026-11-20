//! Inhalte per Formular: Blöcke und Items werden in `.anvil/content.json`
//! beschrieben. Daraus erzeugt Anvil Studio Java-Code, Modelle, Loot-Tabellen,
//! Rezepte, Tags und Übersetzungen – jeweils im Format der Minecraft-Version
//! des Projekts.
//!
//! Kompatibilität: `schema_version` beschreibt das Format der Datei,
//! `generator_version` die Vorlagen, mit denen zuletzt erzeugt wurde. Ändert
//! sich eins davon in einer neuen Anvil-Studio-Version, wird beim Öffnen des
//! Projekts automatisch migriert (mit Sicherung) und neu erzeugt.

use crate::projects::Project;
use crate::util::{err, now};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

pub const CONTENT_SCHEMA: u32 = 3;
/// Bei Änderungen an den Vorlagen hochzählen → Projekte werden neu erzeugt.
pub const GENERATOR_VERSION: u32 = 3;

const PLACEHOLDER_PNG: &str = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALklEQVR42mP8wfDjPwMewMHAgU+agYmBQjBqwGAwgJGBgQFvOvjB8GM0EIe/AQAVpgYNJPiOmAAAAABJRU5ErkJggg==";

// ---- Datenmodell -------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Recipe {
    pub enabled: bool,
    /// crafting | smelting | blasting | smoking | campfire | stonecutting | smithing
    /// (Steinsäge: Feld 1; Schmiedetisch: Feld 1 Vorlage, 2 Basis, 3 Zusatz)
    pub kind: String,
    pub shaped: bool,
    /// 9 Felder (3×3), leer = nichts. Einträge wie "minecraft:diamond" oder "#minecraft:planks"
    pub grid: Vec<String>,
    pub count: u32,
    /// Nur Ofen: Erfahrung und Dauer in Ticks
    pub experience: f32,
    pub cooking_time: u32,
}

impl Default for Recipe {
    fn default() -> Self {
        Self { enabled: false, kind: "crafting".into(), shaped: true, grid: vec![], count: 1, experience: 0.1, cooking_time: 200 }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct BlockDef {
    pub id: String,
    pub name_de: String,
    pub name_en: String,
    /// stone | wood | metal | glass | grass | sand | wool | gravel
    pub material: String,
    pub hardness: f32,
    pub resistance: f32,
    pub light: u8,
    /// none | pickaxe | axe | shovel | hoe
    pub tool: String,
    /// wood | stone | iron | diamond
    pub tier: String,
    pub recipe: Recipe,
    /// Zusätzliche Formen aus demselben Material: stairs | slab | wall | fence
    pub shapes: Vec<String>,
    /// Erz mit Weltgenerierung
    pub ore: OreDef,
    /// normal | lamp (Redstone-Lampe) | storage (Lager-Truhe) | workbench (Werkbank) | machine (Maschine)
    pub kind: String,
    /// Lager-Truhe: Reihen à 9 Slots (1–6)
    pub rows: u32,
    /// Weitere Sprachen: fr | es | pl | nl | tr | ru → Name
    pub names: std::collections::BTreeMap<String, String>,
    /// Eigenes 3D-Modell aus Quadern (leer = voller Würfel)
    pub model: Vec<Cuboid>,
    /// Modell beim Platzieren zum Spieler drehen
    pub rotate: bool,
    /// Werkbank: Rezepte, die nur an diesem Block funktionieren (3×3)
    pub workbench_recipes: Vec<WorkbenchRecipe>,
    /// Maschine: Brennstoff und Rezepte
    pub machine: MachineDef,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkbenchRecipe {
    pub shaped: bool,
    /// 9 Felder (3×3), Einträge wie "minecraft:diamond" oder "#minecraft:planks"
    pub grid: Vec<String>,
    pub result: String,
    pub count: u32,
}

impl Default for WorkbenchRecipe {
    fn default() -> Self {
        Self { shaped: true, grid: vec![String::new(); 9], result: String::new(), count: 1 }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct MachineDef {
    /// braucht Brennstoff wie ein Ofen (sonst läuft sie von selbst)
    pub fuel: bool,
    pub recipes: Vec<MachineRecipe>,
}

impl Default for MachineDef {
    fn default() -> Self {
        Self { fuel: true, recipes: vec![] }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct MachineRecipe {
    /// Item-ID oder Tag (#…)
    pub input: String,
    pub input_count: u32,
    pub output: String,
    pub output_count: u32,
    /// Dauer in Ticks (20 = 1 Sekunde)
    pub time: u32,
}

impl Default for MachineRecipe {
    fn default() -> Self {
        Self { input: String::new(), input_count: 1, output: String::new(), output_count: 1, time: 200 }
    }
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Cuboid {
    pub from: [f32; 3],
    pub to: [f32; 3],
    /// leer = Textur des Blocks, sonst Block-ID (eigene oder Vanilla)
    pub tex: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct OreDef {
    pub enabled: bool,
    /// Was das Erz fallen lässt (leer = sich selbst), z. B. "testmod:ruby"
    pub drop: String,
    pub drop_min: u32,
    pub drop_max: u32,
    pub xp_min: u32,
    pub xp_max: u32,
    /// Zusätzlich eine Tiefenschiefer-Variante (deepslate_<id>)
    pub deepslate: bool,
    /// overworld | nether | end
    pub dimension: String,
    /// Blöcke pro Ader
    pub vein_size: u32,
    /// Adern pro Chunk
    pub veins_per_chunk: u32,
    pub min_y: i32,
    pub max_y: i32,
}

impl Default for OreDef {
    fn default() -> Self {
        Self {
            enabled: false,
            drop: String::new(),
            drop_min: 1,
            drop_max: 1,
            xp_min: 0,
            xp_max: 0,
            deepslate: true,
            dimension: "overworld".into(),
            vein_size: 8,
            veins_per_chunk: 6,
            min_y: -64,
            max_y: 32,
        }
    }
}

impl Default for BlockDef {
    fn default() -> Self {
        Self {
            id: String::new(),
            name_de: String::new(),
            name_en: String::new(),
            material: "stone".into(),
            hardness: 1.5,
            resistance: 6.0,
            light: 0,
            tool: "pickaxe".into(),
            tier: "wood".into(),
            recipe: Recipe::default(),
            shapes: vec![],
            ore: OreDef::default(),
            kind: "normal".into(),
            rows: 3,
            names: Default::default(),
            model: vec![],
            rotate: false,
            workbench_recipes: vec![],
            machine: MachineDef::default(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct ItemDef {
    pub id: String,
    pub name_de: String,
    pub name_en: String,
    /// Weitere Sprachen: fr | es | pl | nl | tr | ru → Name
    pub names: std::collections::BTreeMap<String, String>,
    pub stack_size: u32,
    /// common | uncommon | rare | epic
    pub rarity: String,
    pub food: bool,
    pub nutrition: u32,
    pub saturation: f32,
    pub recipe: Recipe,
    /// basic | tool | armor
    pub kind: String,
    /// sword | pickaxe | axe | shovel | hoe
    pub tool_type: String,
    /// Abbaustufe: wood | stone | iron | diamond | netherite
    pub tool_tier: String,
    /// Werkzeug: Haltbarkeit in Benutzungen; Rüstung: Haltbarkeits-Faktor (Eisen 15, Diamant 33)
    pub durability: u32,
    /// Angezeigter Angriffsschaden (wie im Tooltip)
    pub attack_damage: f32,
    /// Angezeigte Angriffsgeschwindigkeit (wie im Tooltip)
    pub attack_speed: f32,
    pub mining_speed: f32,
    pub enchantability: u32,
    /// Reparatur-Item am Amboss (Item-ID oder #Tag), optional
    pub repair_item: String,
    /// helmet | chestplate | leggings | boots
    pub armor_slot: String,
    /// Rüstungsmaterial – Teile mit gleichem Material bilden ein Set
    pub armor_material: String,
    pub defense: u32,
    pub toughness: f32,
    pub knockback_resistance: f32,
}

impl Default for ItemDef {
    fn default() -> Self {
        Self {
            id: String::new(),
            name_de: String::new(),
            name_en: String::new(),
            names: Default::default(),
            stack_size: 64,
            rarity: "common".into(),
            food: false,
            nutrition: 4,
            saturation: 0.3,
            recipe: Recipe::default(),
            kind: "basic".into(),
            tool_type: "sword".into(),
            tool_tier: "iron".into(),
            durability: 250,
            attack_damage: 6.0,
            attack_speed: 1.6,
            mining_speed: 6.0,
            enchantability: 14,
            repair_item: String::new(),
            armor_slot: "helmet".into(),
            armor_material: String::new(),
            defense: 2,
            toughness: 0.0,
            knockback_resistance: 0.0,
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct MobDef {
    pub id: String,
    pub name_de: String,
    pub name_en: String,
    /// Weitere Sprachen: fr | es | pl | nl | tr | ru → Name
    pub names: std::collections::BTreeMap<String, String>,
    /// Körper & Verhalten wie: cow | pig | chicken | zombie | spider | creeper
    pub model: String,
    pub health: f32,
    pub speed: f32,
    pub attack_damage: f32,
    /// Farben des Spawn-Eis (#rrggbb)
    pub egg_primary: String,
    pub egg_secondary: String,
    pub spawn: bool,
    /// overworld | forest | plains | desert | jungle | taiga | savanna | snowy | mountain | beach | nether | end
    pub biomes: String,
    pub weight: u32,
    pub group_min: u32,
    pub group_max: u32,
    /// Beute (leer = keine)
    pub drop: String,
    pub drop_min: u32,
    pub drop_max: u32,
}

impl Default for MobDef {
    fn default() -> Self {
        Self {
            id: String::new(),
            name_de: String::new(),
            name_en: String::new(),
            names: Default::default(),
            model: "cow".into(),
            health: 10.0,
            speed: 0.2,
            attack_damage: 3.0,
            egg_primary: "#9c6b3c".into(),
            egg_secondary: "#e0c9a6".into(),
            spawn: true,
            biomes: "plains".into(),
            weight: 8,
            group_min: 2,
            group_max: 4,
            drop: String::new(),
            drop_min: 0,
            drop_max: 2,
        }
    }
}

pub fn is_hostile(model: &str) -> bool {
    matches!(model, "zombie" | "spider" | "creeper")
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Content {
    pub schema_version: u32,
    pub generator_version: u32,
    pub blocks: Vec<BlockDef>,
    pub items: Vec<ItemDef>,
    pub mobs: Vec<MobDef>,
    /// Zuletzt erzeugte IDs – zum Aufräumen gelöschter Einträge
    pub generated_blocks: Vec<String>,
    pub generated_items: Vec<String>,
    pub generated_mobs: Vec<String>,
    /// Symbol des Kreativ-Tabs (eigene ID, leer = erstes Element)
    pub tab_icon: String,
    /// Name des Kreativ-Tabs (leer = Projektname)
    pub tab_name: String,
    /// Brau-Rezepte: Trank + Zutat → Trank
    pub brewing: Vec<BrewDef>,
    /// Ereignisse ohne Code: Auslöser → Aktionen
    pub events: Vec<EventDef>,
    pub blueprints: Vec<crate::blueprint::Blueprint>,
    pub dimensions: Vec<crate::dimension::DimDef>,
    pub generated_dims: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct BrewDef {
    /// Vanilla-Trank, z. B. "awkward"
    pub input: String,
    /// Zutat (Item-ID)
    pub ingredient: String,
    /// Ergebnis-Trank, z. B. "swiftness"
    pub output: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct EventDef {
    /// right_click_block | right_click_item | break_block | place_block | use_item | entity_hurt | entity_killed
    pub trigger: String,
    /// Eigene ID (Block, Item oder Kreatur)
    pub target: String,
    /// Eigentliche Handlung verhindern (z. B. Abbauen)
    pub cancel: bool,
    pub actions: Vec<ActionDef>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ActionDef {
    /// effect | give_item | message | sound | explode | fire | xp | heal | launch
    pub kind: String,
    /// Effekt-, Item- oder Sound-ID bzw. Nachrichtentext
    pub value: String,
    /// Stufe, Anzahl, Stärke …
    pub amount: f32,
    /// Sekunden
    pub duration: u32,
    /// player | target
    pub to: String,
}

impl Default for Content {
    fn default() -> Self {
        Self {
            schema_version: CONTENT_SCHEMA,
            generator_version: 0,
            blocks: vec![],
            items: vec![],
            mobs: vec![],
            generated_blocks: vec![],
            generated_items: vec![],
            generated_mobs: vec![],
            tab_icon: String::new(),
            tab_name: String::new(),
            brewing: vec![],
            events: vec![],
            blueprints: vec![],
            dimensions: vec![],
            generated_dims: vec![],
        }
    }
}

// ---- Hilfen ------------------------------------------------------------------

fn root(p: &Project) -> PathBuf {
    PathBuf::from(&p.path)
}
fn anvil_dir(p: &Project) -> PathBuf {
    root(p).join(".anvil")
}
fn content_file(p: &Project) -> PathBuf {
    anvil_dir(p).join("content.json")
}

pub fn valid_id(id: &str) -> bool {
    let mut c = id.chars();
    matches!(c.next(), Some('a'..='z')) && id.len() <= 64 && c.all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '_')
}

fn valid_ref(r: &str) -> bool {
    let r = r.strip_prefix('#').unwrap_or(r);
    let Some((ns, path)) = r.split_once(':') else { return false };
    !ns.is_empty()
        && !path.is_empty()
        && ns.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '_' | '-' | '.'))
        && path.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '_' | '-' | '.' | '/'))
}

/// Minecraft-Version >= a.b.c ?
pub fn mc_at_least(version: &str, min: (u32, u32, u32)) -> bool {
    let mut parts = version.split(['.', '-']).map(|p| p.parse::<u32>().unwrap_or(0));
    let v = (parts.next().unwrap_or(0), parts.next().unwrap_or(0), parts.next().unwrap_or(0));
    v >= min
}

fn write_json(path: &Path, v: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(err)?;
    }
    std::fs::write(path, serde_json::to_string_pretty(v).map_err(err)? + "\n").map_err(err)
}

fn read_json(path: &Path) -> Option<Value> {
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

fn backup(p: &Project, file: &Path, label: &str) {
    let dir = anvil_dir(p).join("backups");
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::copy(file, dir.join(format!("{label}-{}.json", now())));
}

// ---- Laden & Migration -------------------------------------------------------

/// Bringt eine ältere content.json auf das aktuelle Format.
fn migrate_value(mut v: Value) -> Value {
    let version = v["schemaVersion"].as_u64().unwrap_or(0);
    if version < 1 {
        // Vor Version 1 gab es keine Versionsnummer – Felder bleiben, Standardwerte ergänzt serde.
        v["schemaVersion"] = json!(1);
    }
    if version < 2 {
        // Version 2: Formen, Erze, Werkzeuge & Rüstung – neue Felder bekommen Standardwerte
        v["schemaVersion"] = json!(2);
    }
    if version < 3 {
        // Version 3: Kreaturen
        v["schemaVersion"] = json!(3);
    }
    // Künftige Migrationen hier anhängen: if version < 4 { … }
    v
}

pub fn load(p: &Project) -> Result<(Content, bool), String> {
    let file = content_file(p);
    if !file.exists() {
        return Ok((Content::default(), false));
    }
    let text = std::fs::read_to_string(&file).map_err(err)?;
    let raw: Value = serde_json::from_str(&text).map_err(|e| format!(".anvil/content.json ist beschädigt: {e}"))?;
    let old = raw["schemaVersion"].as_u64().unwrap_or(0) as u32;
    if old > CONTENT_SCHEMA {
        return Err("Dieses Projekt wurde mit einer neueren Anvil-Studio-Version bearbeitet. Bitte Anvil Studio aktualisieren.".into());
    }
    let migrated = old < CONTENT_SCHEMA;
    if migrated {
        backup(p, &file, &format!("content-v{old}"));
    }
    let c: Content = serde_json::from_value(migrate_value(raw)).map_err(err)?;
    Ok((c, migrated))
}

pub fn save_file(p: &Project, c: &Content) -> Result<(), String> {
    let mut c = c.clone();
    c.schema_version = CONTENT_SCHEMA;
    write_json(&content_file(p), &serde_json::to_value(&c).map_err(err)?)
}

// ---- Prüfen ------------------------------------------------------------------

fn validate(c: &Content) -> Result<(), String> {
    let mut seen = std::collections::HashSet::new();
    for id in c.blocks.iter().map(|b| &b.id).chain(c.items.iter().map(|i| &i.id)) {
        if !valid_id(id) {
            return Err(format!("„{id}“ ist keine gültige ID (Kleinbuchstaben, Ziffern, _; mit Buchstaben beginnen)."));
        }
        if !seen.insert(id.clone()) {
            return Err(format!("Die ID „{id}“ ist doppelt vergeben."));
        }
    }
    for (id, r) in c.blocks.iter().map(|b| (&b.id, &b.recipe)).chain(c.items.iter().map(|i| (&i.id, &i.recipe))) {
        if r.enabled {
            let used: Vec<&String> = r.grid.iter().filter(|g| !g.trim().is_empty()).collect();
            if used.is_empty() {
                return Err(format!("Das Rezept für „{id}“ ist leer."));
            }
            if let Some(bad) = used.iter().find(|g| !valid_ref(g.trim())) {
                return Err(format!("Im Rezept für „{id}“ ist „{bad}“ keine gültige Item-ID (Beispiel: minecraft:diamond)."));
            }
        }
    }
    Ok(())
}

// ---- Java --------------------------------------------------------------------

fn java_float(f: f32) -> String {
    let s = format!("{f}");
    if s.contains('.') { format!("{s}f") } else { format!("{s}.0f") }
}

fn sound_and_color(material: &str) -> (&'static str, &'static str) {
    match material {
        "wood" => ("WOOD", "WOOD"),
        "metal" => ("METAL", "METAL"),
        "glass" => ("GLASS", "NONE"),
        "grass" => ("GRASS", "GRASS"),
        "sand" => ("SAND", "SAND"),
        "wool" => ("WOOL", "WOOL"),
        "gravel" => ("GRAVEL", "STONE"),
        _ => ("STONE", "STONE"),
    }
}

/// Eine registrierte Block-Variante (Grundblock, Tiefenschiefer-Erz oder Form).
#[derive(Clone)]
pub struct Variant<'a> {
    pub id: String,
    /// block | deepslate | stairs | slab | wall | fence
    pub shape: &'static str,
    pub base: &'a BlockDef,
}

pub const SHAPES: [&str; 6] = ["stairs", "slab", "wall", "fence", "button", "pressure_plate"];

pub fn variants(b: &BlockDef) -> Vec<Variant<'_>> {
    let mut v = vec![Variant { id: b.id.clone(), shape: "block", base: b }];
    if b.ore.enabled && b.ore.deepslate && b.ore.dimension == "overworld" {
        v.push(Variant { id: format!("deepslate_{}", b.id), shape: "deepslate", base: b });
    }
    for s in SHAPES {
        if b.shapes.iter().any(|x| x == s) {
            v.push(Variant { id: format!("{}_{s}", b.id), shape: s, base: b });
        }
    }
    v
}

fn all_variants(c: &Content) -> Vec<Variant<'_>> {
    c.blocks.iter().flat_map(variants).collect()
}

/// Versionen der Minecraft-API, die der Generator unterscheidet.
struct Api {
    /// ab 1.21.2: ToolMaterial, ArmorMaterial als Record mit Equipment-Asset
    materials_v2: bool,
    /// ab 1.21.5: Werkzeuge/Rüstung über Item.Properties#sword/#pickaxe/#humanoidArmor
    props_tools: bool,
    /// ab 1.21.9: Properties nur noch als Supplier (werden erst beim Registrieren gebaut)
    lazy_props: bool,
    /// ab 1.21.6: Block-Entities speichern über ValueInput/ValueOutput
    value_io: bool,
}

fn api(p: &Project) -> Api {
    Api {
        materials_v2: mc_at_least(&p.mc_version, (1, 21, 2)),
        props_tools: mc_at_least(&p.mc_version, (1, 21, 5)),
        lazy_props: mc_at_least(&p.mc_version, (1, 21, 9)),
        value_io: mc_at_least(&p.mc_version, (1, 21, 6)),
    }
}

fn incorrect_tag(tier: &str) -> &'static str {
    match tier {
        "wood" => "INCORRECT_FOR_WOODEN_TOOL",
        "stone" => "INCORRECT_FOR_STONE_TOOL",
        "gold" => "INCORRECT_FOR_GOLD_TOOL",
        "diamond" => "INCORRECT_FOR_DIAMOND_TOOL",
        "netherite" => "INCORRECT_FOR_NETHERITE_TOOL",
        _ => "INCORRECT_FOR_IRON_TOOL",
    }
}

fn armor_type(slot: &str, api: &Api) -> String {
    let t = match slot {
        "chestplate" => "CHESTPLATE",
        "leggings" => "LEGGINGS",
        "boots" => "BOOTS",
        _ => "HELMET",
    };
    if api.materials_v2 { format!("ArmorType.{t}") } else { format!("ArmorItem.Type.{t}") }
}

fn block_props(b: &BlockDef, deepslate: bool) -> String {
    let (sound, color) = sound_and_color(&b.material);
    let (sound, color, hardness) = if deepslate { ("DEEPSLATE", "DEEPSLATE", b.hardness + 1.5) } else { (sound, color, b.hardness) };
    let mut props = format!(
        "BlockBehaviour.Properties.of().mapColor(MapColor.{color}).strength({}, {}).sound(SoundType.{sound})",
        java_float(hardness.max(0.0)),
        java_float(b.resistance.max(0.0))
    );
    if b.kind == "lamp" {
        let lit = if b.light == 0 { 15 } else { b.light.min(15) };
        props.push_str(&format!(".lightLevel(state -> state.getValue(RedstoneLampBlock.LIT) ? {lit} : 0)"));
    } else if b.light > 0 {
        props.push_str(&format!(".lightLevel(state -> {})", b.light.min(15)));
    }
    if b.tool != "none" {
        props.push_str(".requiresCorrectToolForDrops()");
    }
    if b.material == "glass" || is_model(b) {
        props.push_str(".noOcclusion()");
    }
    props
}

/// Rüstungsmaterialien: Material-ID → Teile
fn armor_sets(c: &Content) -> std::collections::BTreeMap<String, Vec<&ItemDef>> {
    let mut m: std::collections::BTreeMap<String, Vec<&ItemDef>> = Default::default();
    for i in c.items.iter().filter(|i| i.kind == "armor") {
        m.entry(i.armor_material.clone()).or_default().push(i);
    }
    m
}


// ---- Kreaturen -----------------------------------------------------------------

pub fn camel(id: &str) -> String {
    id.split('_').filter(|p| !p.is_empty()).map(|p| {
        let mut c = p.chars();
        match c.next() {
            Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            None => String::new(),
        }
    }).collect()
}

/// (Basisklasse, Kategorie, Breite, Höhe, Basis-Renderer, Spawn-Regel)
fn mob_base(model: &str) -> (&'static str, &'static str, f32, f32, &'static str, &'static str) {
    match model {
        "pig" => ("Pig", "CREATURE", 0.9, 0.9, "PigRenderer", "Animal::checkAnimalSpawnRules"),
        "chicken" => ("Chicken", "CREATURE", 0.4, 0.7, "ChickenRenderer", "Animal::checkAnimalSpawnRules"),
        "zombie" => ("Zombie", "MONSTER", 0.6, 1.95, "ZombieRenderer", "Monster::checkMonsterSpawnRules"),
        "spider" => ("Spider", "MONSTER", 1.4, 0.9, "SpiderRenderer", "Monster::checkMonsterSpawnRules"),
        "creeper" => ("Creeper", "MONSTER", 0.6, 1.7, "CreeperRenderer", "Monster::checkMonsterSpawnRules"),
        _ => ("Cow", "CREATURE", 0.9, 1.4, "CowRenderer", "Animal::checkAnimalSpawnRules"),
    }
}

/// Parametertyp von getTextureLocation im Renderer – hängt von der Version ab.
fn render_param(model: &str, class: &str, api: &Api) -> String {
    if !api.materials_v2 {
        return match model {
            "spider" => class.to_string(),
            _ => mob_base(model).0.to_string(),
        };
    }
    match model {
        "pig" => "PigRenderState",
        "chicken" => "ChickenRenderState",
        "zombie" => "ZombieRenderState",
        "creeper" => "CreeperRenderState",
        "cow" if api.props_tools => "CowRenderState",
        _ => "LivingEntityRenderState",
    }
    .to_string()
}

fn parse_color(hex: &str) -> u32 {
    u32::from_str_radix(hex.trim().trim_start_matches('#'), 16).unwrap_or(0x888888) & 0xffffff
}

fn biome_target(biomes: &str) -> Value {
    match biomes {
        "forest" => json!("#minecraft:is_forest"),
        "jungle" => json!("#minecraft:is_jungle"),
        "taiga" => json!("#minecraft:is_taiga"),
        "savanna" => json!("#minecraft:is_savanna"),
        "mountain" => json!("#minecraft:is_mountain"),
        "beach" => json!("#minecraft:is_beach"),
        "nether" => json!("#minecraft:is_nether"),
        "end" => json!("#minecraft:is_end"),
        "plains" => json!(["minecraft:plains", "minecraft:sunflower_plains", "minecraft:meadow"]),
        "desert" => json!(["minecraft:desert", "minecraft:badlands"]),
        "snowy" => json!(["minecraft:snowy_plains", "minecraft:snowy_taiga", "minecraft:ice_spikes", "minecraft:snowy_slopes"]),
        _ => json!("#minecraft:is_overworld"),
    }
}

/// 16×16-Spawn-Ei aus zwei Farben (ab 1.21.5 hat jedes Ei eine eigene Textur).
fn egg_png(primary: u32, secondary: u32) -> Vec<u8> {
    let rgb = |c: u32| [(c >> 16) as u8, (c >> 8) as u8, c as u8];
    let (p, sc) = (rgb(primary), rgb(secondary));
    let inside = |x: f32, y: f32| {
        let ry = if y < 9.0 { 6.8 } else { 5.6 };
        let rx = 4.6 + (y - 3.0).clamp(0.0, 6.0) * 0.12;
        ((x - 7.5) / rx).powi(2) + ((y - 9.0) / ry).powi(2) <= 1.0
    };
    png_rgba(16, 16, |x, y| {
        let (fx, fy) = (x as f32, y as f32);
        if !inside(fx, fy) {
            return [0, 0, 0, 0];
        }
        let edge = !inside(fx - 1.0, fy) || !inside(fx + 1.0, fy) || !inside(fx, fy - 1.0) || !inside(fx, fy + 1.0);
        let spot = matches!((x, y), (6, 5) | (9, 7) | (5, 9) | (6, 9) | (10, 11) | (7, 13) | (8, 13) | (9, 4) | (4, 11));
        let base = if spot { sc } else { p };
        let shade = |v: u8, f: f32| (v as f32 * f).min(255.0) as u8;
        let f = if edge { 0.62 } else if x >= 9 && y >= 10 { 0.85 } else if x <= 5 && y <= 7 { 1.15 } else { 1.0 };
        [shade(base[0], f), shade(base[1], f), shade(base[2], f), 255]
    })
}

fn mob_placeholder(model: &str, color: u32) -> Vec<u8> {
    let h = if model == "zombie" { 64 } else { 32 };
    let [r, g, b] = [(color >> 16) as u8, (color >> 8) as u8, color as u8];
    png_rgba(64, h, |x, y| {
        let d = if (x / 2 + y / 2) % 3 == 0 { 20 } else { 0 };
        [r.saturating_sub(d), g.saturating_sub(d), b.saturating_sub(d), 255]
    })
}

fn generate_client_java(p: &Project, c: &Content) -> String {
    let api = api(p);
    let mut regs = String::new();
    let mut classes = String::new();
    for m in &c.mobs {
        let class = format!("{}Entity", camel(&m.id));
        let rclass = format!("{}EntityRenderer", camel(&m.id));
        let (_, _, _, _, base_renderer, _) = mob_base(&m.model);
        let parent = if m.model == "spider" { format!("SpiderRenderer<AnvilContent.{class}>") } else { base_renderer.to_string() };
        let param = render_param(&m.model, &format!("AnvilContent.{class}"), &api);
        regs.push_str(&format!("        event.registerEntityRenderer(AnvilContent.{}.get(), {rclass}::new);\n", m.id.to_uppercase()));
        classes.push_str(&format!(
            "    public static class {rclass} extends {parent} {{\n        private static final ResourceLocation TEXTURE = ResourceLocation.fromNamespaceAndPath(AnvilContent.MODID, \"textures/entity/{id}.png\");\n\n        public {rclass}(EntityRendererProvider.Context context) {{\n            super(context);\n        }}\n\n        @Override\n        public ResourceLocation getTextureLocation({param} state) {{\n            return TEXTURE;\n        }}\n    }}\n\n",
            id = m.id
        ));
    }
    let state_import = if api.materials_v2 { "import net.minecraft.client.renderer.entity.state.*;\n" } else { "" };
    format!(
        r#"// =============================================================================
// AUTOMATISCH ERZEUGT von Anvil Studio – nur auf dem Client geladen.
// =============================================================================
package {pkg}.anvil;

import net.minecraft.client.renderer.entity.*;
{state_import}import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.animal.*;
import net.minecraft.world.entity.monster.*;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;
import net.neoforged.neoforge.client.event.EntityRenderersEvent;

@SuppressWarnings("unused")
@Mod(value = AnvilContent.MODID, dist = Dist.CLIENT)
public final class AnvilClient {{
    public AnvilClient(IEventBus modEventBus) {{
        modEventBus.addListener(AnvilClient::registerRenderers);
    }}

    private static void registerRenderers(EntityRenderersEvent.RegisterRenderers event) {{
{regs}    }}

{classes}}}
"#,
        pkg = p.package
    )
}


/// Block mit eigenem 3D-Modell?
fn is_model(b: &BlockDef) -> bool {
    b.kind == "normal" && !b.ore.enabled && !b.model.is_empty()
}

/// Quader geordnet (from ≤ to) und auf 0–16 begrenzt
fn cuboid_box(c: &Cuboid) -> [f32; 6] {
    let mut r = [0.0; 6];
    for i in 0..3 {
        let (a, b) = (c.from[i].clamp(0.0, 16.0), c.to[i].clamp(0.0, 16.0));
        r[i] = a.min(b);
        r[i + 3] = a.max(b).max(a.min(b) + 0.01);
    }
    r
}

/// Quader um die Y-Achse drehen (Blickrichtung Norden = 0)
fn rotate_box(b: [f32; 6], facing: &str) -> [f32; 6] {
    let [x0, y0, z0, x1, y1, z1] = b;
    match facing {
        "east" => [16.0 - z1, y0, x0, 16.0 - z0, y1, x1],
        "south" => [16.0 - x1, y0, 16.0 - z1, 16.0 - x0, y1, 16.0 - z0],
        "west" => [z0, y0, 16.0 - x1, z1, y1, 16.0 - x0],
        _ => b,
    }
}

fn shape_expr(b: &BlockDef, facing: &str) -> String {
    let boxes: Vec<String> = b
        .model
        .iter()
        .map(|c| {
            let r = rotate_box(cuboid_box(c), facing);
            format!("Block.box({})", r.iter().map(|v| java_float(*v)).collect::<Vec<_>>().join(", "))
        })
        .collect();
    if boxes.len() == 1 {
        boxes[0].clone()
    } else {
        format!("Shapes.or({}, {})", boxes[0], boxes[1..].join(", "))
    }
}

fn model_class(b: &BlockDef) -> String {
    let name: String = b
        .id
        .split('_')
        .map(|w| {
            let mut c = w.chars();
            c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default()
        })
        .collect();
    format!("AnvilModel{name}")
}

/// Block-Modell aus Quadern; jede Textur bekommt eine eigene Variable
fn cuboid_model(b: &BlockDef, own_tex: &str, modid: &str, own_blocks: &[String]) -> Value {
    let mut textures = serde_json::Map::new();
    textures.insert("particle".into(), json!(own_tex));
    textures.insert("t0".into(), json!(own_tex));
    let mut keys: Vec<String> = vec![String::new()];
    let mut elements = vec![];
    for c in &b.model {
        let tex = c.tex.trim().to_string();
        let idx = match keys.iter().position(|k| *k == tex) {
            Some(i) => i,
            None => {
                let path = if let Some((ns, name)) = tex.split_once(':') {
                    if ns == modid || own_blocks.iter().any(|x| x == name) && ns == modid {
                        format!("{ns}:block/{name}")
                    } else {
                        format!("{ns}:block/{name}")
                    }
                } else if own_blocks.iter().any(|x| *x == tex) {
                    format!("{modid}:block/{tex}")
                } else {
                    format!("minecraft:block/{tex}")
                };
                keys.push(tex.clone());
                textures.insert(format!("t{}", keys.len() - 1), json!(path));
                keys.len() - 1
            }
        };
        let [x0, y0, z0, x1, y1, z1] = cuboid_box(c);
        let t = format!("#t{idx}");
        let face = |cull: Option<&str>, uv: [f32; 4]| {
            let mut f = json!({ "texture": t, "uv": uv });
            if let Some(cf) = cull {
                f["cullface"] = json!(cf);
            }
            f
        };
        elements.push(json!({
            "from": [x0, y0, z0],
            "to": [x1, y1, z1],
            "faces": {
                "down": face((y0 <= 0.0).then_some("down"), [x0, 16.0 - z1, x1, 16.0 - z0]),
                "up": face((y1 >= 16.0).then_some("up"), [x0, z0, x1, z1]),
                "north": face((z0 <= 0.0).then_some("north"), [16.0 - x1, 16.0 - y1, 16.0 - x0, 16.0 - y0]),
                "south": face((z1 >= 16.0).then_some("south"), [x0, 16.0 - y1, x1, 16.0 - y0]),
                "west": face((x0 <= 0.0).then_some("west"), [z0, 16.0 - y1, z1, 16.0 - y0]),
                "east": face((x1 >= 16.0).then_some("east"), [16.0 - z1, 16.0 - y1, 16.0 - z0, 16.0 - y0])
            }
        }));
    }
    json!({ "parent": "minecraft:block/block", "textures": textures, "elements": elements })
}

fn java_str(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n").replace('\r', "")
}

/// Zusätzlicher Java-Code: Lager-Truhen, Brau-Rezepte und Ereignisse.
/// Rückgabe: (Felder, Importe, Aufrufe in register(), Methoden und Klassen)
fn generate_extras(p: &Project, c: &Content, api: &Api) -> (String, Vec<&'static str>, String, String) {
    let modid = &p.mod_id;
    let mut fields = String::new();
    let mut imports: Vec<&'static str> = vec![];
    let mut calls = String::new();
    let mut methods = String::new();
    let up = |s: &str| s.to_uppercase();

    // ---- Blöcke mit eigenem 3D-Modell ----
    let models: Vec<&BlockDef> = c.blocks.iter().filter(|b| is_model(b)).collect();
    if !models.is_empty() {
        imports.extend([
            "com.mojang.serialization.MapCodec",
            "net.minecraft.core.BlockPos",
            "net.minecraft.core.Direction",
            "net.minecraft.world.item.context.BlockPlaceContext",
            "net.minecraft.world.level.BlockGetter",
            "net.minecraft.world.level.block.HorizontalDirectionalBlock",
            "net.minecraft.world.level.block.state.BlockState",
            "net.minecraft.world.level.block.state.StateDefinition",
            "net.minecraft.world.phys.shapes.CollisionContext",
            "net.minecraft.world.phys.shapes.Shapes",
            "net.minecraft.world.phys.shapes.VoxelShape",
        ]);
        for b in models {
            let cls = model_class(b);
            if b.rotate {
                methods.push_str(&format!(
                    r#"
    public static class {cls} extends HorizontalDirectionalBlock {{
        public static final MapCodec<{cls}> CODEC = simpleCodec({cls}::new);
        private static final VoxelShape NORTH = {n};
        private static final VoxelShape EAST = {e};
        private static final VoxelShape SOUTH = {s};
        private static final VoxelShape WEST = {w};

        public {cls}(BlockBehaviour.Properties properties) {{
            super(properties);
            registerDefaultState(stateDefinition.any().setValue(FACING, Direction.NORTH));
        }}

        @Override
        public MapCodec<{cls}> codec() {{
            return CODEC;
        }}

        @Override
        protected void createBlockStateDefinition(StateDefinition.Builder<net.minecraft.world.level.block.Block, BlockState> builder) {{
            builder.add(FACING);
        }}

        @Override
        public BlockState getStateForPlacement(BlockPlaceContext context) {{
            return defaultBlockState().setValue(FACING, context.getHorizontalDirection().getOpposite());
        }}

        @Override
        protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {{
            return switch (state.getValue(FACING)) {{
                case EAST -> EAST;
                case SOUTH -> SOUTH;
                case WEST -> WEST;
                default -> NORTH;
            }};
        }}
    }}
"#,
                    n = shape_expr(b, "north"),
                    e = shape_expr(b, "east"),
                    s = shape_expr(b, "south"),
                    w = shape_expr(b, "west"),
                ));
            } else {
                methods.push_str(&format!(
                    r#"
    public static class {cls} extends net.minecraft.world.level.block.Block {{
        public static final MapCodec<{cls}> CODEC = simpleCodec({cls}::new);
        private static final VoxelShape SHAPE = {shape};

        public {cls}(BlockBehaviour.Properties properties) {{
            super(properties);
        }}

        @Override
        public MapCodec<{cls}> codec() {{
            return CODEC;
        }}

        @Override
        protected VoxelShape getShape(BlockState state, BlockGetter level, BlockPos pos, CollisionContext context) {{
            return SHAPE;
        }}
    }}
"#,
                    shape = shape_expr(b, "north"),
                ));
            }
        }
    }

    // ---- Block-Entities (Lager, Maschinen) teilen sich ein Register ----
    let storage: Vec<&BlockDef> = c.blocks.iter().filter(|b| b.kind == "storage").collect();
    let machines: Vec<&BlockDef> = c.blocks.iter().filter(|b| b.kind == "machine").collect();
    if !storage.is_empty() || !machines.is_empty() {
        fields.push_str("    public static final DeferredRegister<BlockEntityType<?>> BLOCK_ENTITIES = DeferredRegister.create(Registries.BLOCK_ENTITY_TYPE, MODID);\n");
        calls.push_str("        BLOCK_ENTITIES.register(modEventBus);\n");
        imports.extend(["net.minecraft.world.level.block.entity.BlockEntityType"]);
    }
    let be_type = |cls: &str, blocks: &[&BlockDef]| -> String {
        let list: Vec<String> = blocks.iter().map(|b| format!("{}.get()", b.id.to_uppercase())).collect();
        if api.materials_v2 {
            format!("new BlockEntityType<>({cls}::new, {})", list.join(", "))
        } else {
            format!("BlockEntityType.Builder.of({cls}::new, {}).build(null)", list.join(", "))
        }
    };
    let on_remove_drop = if api.props_tools {
        String::new() // ab 1.21.5 lässt der Container seinen Inhalt selbst fallen
    } else {
        "        @Override\n        protected void onRemove(BlockState state, Level level, BlockPos pos, BlockState newState, boolean moved) {\n            if (!state.is(newState.getBlock()) && level.getBlockEntity(pos) instanceof Container container) Containers.dropContents(level, pos, container);\n            super.onRemove(state, level, pos, newState, moved);\n        }\n".to_string()
    };

    // ---- Lager-Truhen ----
    if !storage.is_empty() {
        imports.extend([
            "com.mojang.serialization.MapCodec",
            "net.minecraft.core.BlockPos",
            "net.minecraft.core.NonNullList",
            "net.minecraft.world.Container",
            "net.minecraft.world.Containers",
            "net.minecraft.world.ContainerHelper",
            "net.minecraft.world.InteractionResult",
            "net.minecraft.world.entity.player.Inventory",
            "net.minecraft.world.entity.player.Player",
            "net.minecraft.world.inventory.AbstractContainerMenu",
            "net.minecraft.world.inventory.ChestMenu",
            "net.minecraft.world.inventory.MenuType",
            "net.minecraft.world.level.Level",
            "net.minecraft.world.level.block.entity.BlockEntity",
            "net.minecraft.world.level.block.entity.BlockEntityType",
            "net.minecraft.world.level.block.entity.RandomizableContainerBlockEntity",
            "net.minecraft.world.level.block.state.BlockState",
            "net.minecraft.world.phys.BlockHitResult",
        ]);
        let ctor = be_type("AnvilStorageBlockEntity", &storage);
        fields.push_str(&format!(
            "    public static final DeferredHolder<BlockEntityType<?>, BlockEntityType<AnvilStorageBlockEntity>> STORAGE_BE = BLOCK_ENTITIES.register(\"storage\", () -> {ctor});\n\n"
        ));
        let on_remove = on_remove_drop.clone();
        let save_load = if api.value_io {
            imports.extend(["net.minecraft.world.level.storage.ValueInput", "net.minecraft.world.level.storage.ValueOutput"]);
            "        @Override\n        protected void loadAdditional(ValueInput input) {\n            super.loadAdditional(input);\n            items = NonNullList.withSize(getContainerSize(), ItemStack.EMPTY);\n            if (!tryLoadLootTable(input)) ContainerHelper.loadAllItems(input, items);\n        }\n\n        @Override\n        protected void saveAdditional(ValueOutput output) {\n            super.saveAdditional(output);\n            if (!trySaveLootTable(output)) ContainerHelper.saveAllItems(output, items);\n        }\n"
        } else {
            imports.extend(["net.minecraft.core.HolderLookup", "net.minecraft.nbt.CompoundTag"]);
            "        @Override\n        protected void loadAdditional(CompoundTag tag, HolderLookup.Provider registries) {\n            super.loadAdditional(tag, registries);\n            items = NonNullList.withSize(getContainerSize(), ItemStack.EMPTY);\n            if (!tryLoadLootTable(tag)) ContainerHelper.loadAllItems(tag, items, registries);\n        }\n\n        @Override\n        protected void saveAdditional(CompoundTag tag, HolderLookup.Provider registries) {\n            super.saveAdditional(tag, registries);\n            if (!trySaveLootTable(tag)) ContainerHelper.saveAllItems(tag, items, registries);\n        }\n"
        };
        methods.push_str(&format!(r#"
    /** Lager-Block: öffnet beim Rechtsklick eine Truhen-Oberfläche. */
    public static class AnvilStorageBlock extends BaseEntityBlock {{
        public static final MapCodec<AnvilStorageBlock> CODEC = simpleCodec(p -> new AnvilStorageBlock(3, p));
        private final int rows;

        public AnvilStorageBlock(int rows, BlockBehaviour.Properties properties) {{
            super(properties);
            this.rows = rows;
        }}

        public int rows() {{
            return rows;
        }}

        @Override
        protected MapCodec<? extends BaseEntityBlock> codec() {{
            return CODEC;
        }}

        @Override
        protected RenderShape getRenderShape(BlockState state) {{
            return RenderShape.MODEL;
        }}

        @Override
        public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {{
            return new AnvilStorageBlockEntity(pos, state);
        }}

        @Override
        protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {{
            if (!level.isClientSide() && level.getBlockEntity(pos) instanceof AnvilStorageBlockEntity storage) player.openMenu(storage);
            return InteractionResult.SUCCESS;
        }}
{on_remove}    }}

    public static class AnvilStorageBlockEntity extends RandomizableContainerBlockEntity {{
        private NonNullList<ItemStack> items;

        public AnvilStorageBlockEntity(BlockPos pos, BlockState state) {{
            super(STORAGE_BE.get(), pos, state);
            int rows = state.getBlock() instanceof AnvilStorageBlock block ? block.rows() : 3;
            this.items = NonNullList.withSize(rows * 9, ItemStack.EMPTY);
        }}

        private int rows() {{
            return Math.max(1, Math.min(6, items.size() / 9));
        }}

        @Override
        public int getContainerSize() {{
            return items.size();
        }}

        @Override
        protected NonNullList<ItemStack> getItems() {{
            return items;
        }}

        @Override
        protected void setItems(NonNullList<ItemStack> items) {{
            this.items = items;
        }}

        @Override
        protected Component getDefaultName() {{
            return getBlockState().getBlock().getName();
        }}

        @Override
        protected AbstractContainerMenu createMenu(int id, Inventory inventory) {{
            MenuType<ChestMenu> type = switch (rows()) {{
                case 1 -> MenuType.GENERIC_9x1;
                case 2 -> MenuType.GENERIC_9x2;
                case 4 -> MenuType.GENERIC_9x4;
                case 5 -> MenuType.GENERIC_9x5;
                case 6 -> MenuType.GENERIC_9x6;
                default -> MenuType.GENERIC_9x3;
            }};
            return new ChestMenu(type, id, inventory, this, rows());
        }}

{save_load}    }}
"#));
    }

    let jq = |x: &str| format!("\"{}\"", java_str(x));
    // ---- Gemeinsame Helfer für eigene Rezepte (Werkbank, Maschine) ----
    let workbenches: Vec<&BlockDef> = c.blocks.iter().filter(|b| b.kind == "workbench").collect();
    if !workbenches.is_empty() || !machines.is_empty() {
        let get_item = if api.materials_v2 { "getValue" } else { "get" };
        methods.push_str(&format!(r##"
    /** Passt der Stapel zu "ns:id" oder "#ns:tag"? Leer passt nur zu leer. */
    static boolean anvilMatches(ItemStack stack, String ingredient) {{
        if (ingredient == null || ingredient.isEmpty()) return stack.isEmpty();
        if (stack.isEmpty()) return false;
        if (ingredient.startsWith("#")) {{
            return stack.is(net.minecraft.tags.TagKey.create(net.minecraft.core.registries.Registries.ITEM, net.minecraft.resources.ResourceLocation.parse(ingredient.substring(1))));
        }}
        return net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(stack.getItem()).toString().equals(ingredient);
    }}

    static ItemStack anvilStack(String id, int count) {{
        net.minecraft.world.item.Item item = net.minecraft.core.registries.BuiltInRegistries.ITEM.{get_item}(net.minecraft.resources.ResourceLocation.parse(id));
        return item == net.minecraft.world.item.Items.AIR ? ItemStack.EMPTY : new ItemStack(item, Math.max(1, count));
    }}

    static String anvilBlockKey(net.minecraft.world.level.block.Block block) {{
        return net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(block).getPath();
    }}
"##));
    }

    // ---- Werkbänke: Crafting-Oberfläche mit eigenen Rezepten ----
    if !workbenches.is_empty() {
        let mut recipes = String::new();
        for b in &workbenches {
            for r in &b.workbench_recipes {
                if !valid_ref(&r.result) || r.grid.iter().all(|g| g.trim().is_empty()) {
                    continue;
                }
                let mut grid: Vec<String> = r.grid.iter().take(9).map(|g| if valid_ref(g.trim()) { g.trim().to_string() } else { String::new() }).collect();
                grid.resize(9, String::new());
                let cells: Vec<String> = grid.iter().map(|g| jq(g)).collect();
                recipes.push_str(&format!(
                    "        new AnvilWorkbenchRecipe({}, {}, new String[]{{{}}}, {}, {}),\n",
                    jq(&b.id),
                    r.shaped,
                    cells.join(", "),
                    jq(&r.result),
                    r.count.clamp(1, 64)
                ));
            }
        }
        imports.extend([
            "com.mojang.serialization.MapCodec",
            "net.minecraft.core.BlockPos",
            "net.minecraft.world.InteractionResult",
            "net.minecraft.world.entity.player.Inventory",
            "net.minecraft.world.entity.player.Player",
            "net.minecraft.world.level.Level",
            "net.minecraft.world.level.block.state.BlockState",
            "net.minecraft.world.phys.BlockHitResult",
        ]);
        methods.push_str(&format!(r##"
    record AnvilWorkbenchRecipe(String block, boolean shaped, String[] grid, String result, int count) {{}}

    static final AnvilWorkbenchRecipe[] ANVIL_WORKBENCH_RECIPES = {{
{recipes}    }};

    /** Werkbank: öffnet ein 3×3-Raster. Neben den normalen Rezepten gelten hier eigene. */
    public static class AnvilWorkbenchBlock extends net.minecraft.world.level.block.Block {{
        public static final MapCodec<AnvilWorkbenchBlock> CODEC = simpleCodec(AnvilWorkbenchBlock::new);

        public AnvilWorkbenchBlock(BlockBehaviour.Properties properties) {{
            super(properties);
        }}

        @Override
        public MapCodec<AnvilWorkbenchBlock> codec() {{
            return CODEC;
        }}

        @Override
        protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {{
            if (!level.isClientSide()) {{
                String key = anvilBlockKey(this);
                player.openMenu(new net.minecraft.world.SimpleMenuProvider(
                        (id, inventory, p) -> new AnvilWorkbenchMenu(id, inventory, net.minecraft.world.inventory.ContainerLevelAccess.create(level, pos), p, key),
                        getName()));
            }}
            return InteractionResult.SUCCESS;
        }}
    }}

    public static class AnvilWorkbenchMenu extends net.minecraft.world.inventory.CraftingMenu {{
        private final Player anvilPlayer;
        private final net.minecraft.world.inventory.ContainerLevelAccess anvilAccess;
        private final String anvilKey;
        private AnvilWorkbenchRecipe anvilMatch;

        public AnvilWorkbenchMenu(int id, Inventory inventory, net.minecraft.world.inventory.ContainerLevelAccess access, Player player, String key) {{
            super(id, inventory, access);
            this.anvilPlayer = player;
            this.anvilAccess = access;
            this.anvilKey = key;
            // Ergebnis-Feld: eigene Rezepte selbst abrechnen, sonst wie gewohnt
            net.minecraft.world.inventory.Slot original = this.slots.get(0);
            net.minecraft.world.inventory.Slot result = new net.minecraft.world.inventory.Slot(original.container, original.getContainerSlot(), original.x, original.y) {{
                @Override
                public boolean mayPlace(ItemStack stack) {{
                    return false;
                }}

                @Override
                public ItemStack remove(int amount) {{
                    return anvilMatch != null ? super.remove(amount) : original.remove(amount);
                }}

                @Override
                public void onQuickCraft(ItemStack a, ItemStack b) {{
                    if (anvilMatch == null) original.onQuickCraft(a, b);
                }}

                @Override
                public void onTake(Player p, ItemStack stack) {{
                    if (anvilMatch != null) {{
                        for (int i = 1; i <= 9; i++) {{
                            if (!slots.get(i).getItem().isEmpty()) slots.get(i).remove(1);
                        }}
                        setChanged();
                    }} else {{
                        original.onTake(p, stack);
                    }}
                }}
            }};
            result.index = 0;
            this.slots.set(0, result);
        }}

        @Override
        public boolean stillValid(Player player) {{
            return anvilAccess.evaluate((level, pos) -> level.getBlockState(pos).getBlock() instanceof AnvilWorkbenchBlock
                    && player.distanceToSqr(pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5) <= 64.0, true);
        }}

        @Override
        public void slotsChanged(net.minecraft.world.Container container) {{
            super.slotsChanged(container);
            if (!(anvilPlayer instanceof net.minecraft.server.level.ServerPlayer serverPlayer)) return;
            anvilMatch = anvilFind();
            if (anvilMatch != null) {{
                ItemStack out = anvilStack(anvilMatch.result(), anvilMatch.count());
                slots.get(0).container.setItem(0, out);
                setRemoteSlot(0, out);
                serverPlayer.connection.send(new net.minecraft.network.protocol.game.ClientboundContainerSetSlotPacket(containerId, incrementStateId(), 0, out));
            }}
        }}

        private AnvilWorkbenchRecipe anvilFind() {{
            ItemStack[] grid = new ItemStack[9];
            for (int i = 0; i < 9; i++) grid[i] = slots.get(1 + i).getItem();
            for (AnvilWorkbenchRecipe r : ANVIL_WORKBENCH_RECIPES) {{
                if (!r.block().equals(anvilKey)) continue;
                if (r.shaped() ? anvilShaped(r.grid(), grid) : anvilShapeless(r.grid(), grid)) return r;
            }}
            return null;
        }}

        /** Form zählt, Lage im Raster nicht (verschiebbar). */
        private static boolean anvilShaped(String[] pattern, ItemStack[] grid) {{
            int minX = 3, minY = 3, maxX = -1, maxY = -1;
            for (int i = 0; i < 9; i++) {{
                if (!pattern[i].isEmpty()) {{
                    minX = Math.min(minX, i % 3); maxX = Math.max(maxX, i % 3);
                    minY = Math.min(minY, i / 3); maxY = Math.max(maxY, i / 3);
                }}
            }}
            if (maxX < 0) return false;
            int w = maxX - minX + 1, h = maxY - minY + 1;
            for (int dy = 0; dy + h <= 3; dy++) {{
                for (int dx = 0; dx + w <= 3; dx++) {{
                    boolean ok = true;
                    for (int y = 0; y < 3 && ok; y++) {{
                        for (int x = 0; x < 3 && ok; x++) {{
                            int px = x - dx + minX, py = y - dy + minY;
                            boolean inside = x >= dx && x < dx + w && y >= dy && y < dy + h;
                            String want = inside ? pattern[py * 3 + px] : "";
                            ok = anvilMatches(grid[y * 3 + x], want);
                        }}
                    }}
                    if (ok) return true;
                }}
            }}
            return false;
        }}

        private static boolean anvilShapeless(String[] ingredients, ItemStack[] grid) {{
            java.util.List<String> need = new java.util.ArrayList<>();
            for (String s : ingredients) if (!s.isEmpty()) need.add(s);
            java.util.List<ItemStack> have = new java.util.ArrayList<>();
            for (ItemStack s : grid) if (!s.isEmpty()) have.add(s);
            if (need.size() != have.size() || need.isEmpty()) return false;
            return anvilAssign(need, have, 0, new boolean[have.size()]);
        }}

        private static boolean anvilAssign(java.util.List<String> need, java.util.List<ItemStack> have, int i, boolean[] used) {{
            if (i == need.size()) return true;
            for (int j = 0; j < have.size(); j++) {{
                if (!used[j] && anvilMatches(have.get(j), need.get(i))) {{
                    used[j] = true;
                    if (anvilAssign(need, have, i + 1, used)) return true;
                    used[j] = false;
                }}
            }}
            return false;
        }}
    }}
"##));
    }

    // ---- Maschinen: Ofen-Oberfläche mit eigenen Rezepten ----
    if !machines.is_empty() {
        let ctor = be_type("AnvilMachineBlockEntity", &machines);
        fields.push_str(&format!(
            "    public static final DeferredHolder<BlockEntityType<?>, BlockEntityType<AnvilMachineBlockEntity>> MACHINE_BE = BLOCK_ENTITIES.register(\"machine\", () -> {ctor});\n\n"
        ));
        let mut recipes = String::new();
        let mut fuel = String::new();
        for b in &machines {
            if b.machine.fuel {
                fuel.push_str(&format!("{}, ", jq(&b.id)));
            }
            for r in &b.machine.recipes {
                if !valid_ref(r.input.trim()) || !valid_ref(r.output.trim()) || r.output.starts_with('#') {
                    continue;
                }
                recipes.push_str(&format!(
                    "        new AnvilMachineRecipe({}, {}, {}, {}, {}, {}),\n",
                    jq(&b.id),
                    jq(r.input.trim()),
                    r.input_count.clamp(1, 64),
                    jq(r.output.trim()),
                    r.output_count.clamp(1, 64),
                    r.time.clamp(1, 72000)
                ));
            }
        }
        imports.extend([
            "com.mojang.serialization.MapCodec",
            "net.minecraft.core.BlockPos",
            "net.minecraft.core.NonNullList",
            "net.minecraft.world.Container",
            "net.minecraft.world.Containers",
            "net.minecraft.world.ContainerHelper",
            "net.minecraft.world.InteractionResult",
            "net.minecraft.world.entity.player.Inventory",
            "net.minecraft.world.entity.player.Player",
            "net.minecraft.world.inventory.AbstractContainerMenu",
            "net.minecraft.world.level.Level",
            "net.minecraft.world.level.block.entity.BlockEntity",
            "net.minecraft.world.level.block.state.BlockState",
            "net.minecraft.world.phys.BlockHitResult",
        ]);
        let burn = if api.materials_v2 { "level.fuelValues().burnDuration(stack)" } else { "stack.getBurnTime(net.minecraft.world.item.crafting.RecipeType.SMELTING)" };
        let save_load = if api.value_io {
            "        @Override\n        protected void loadAdditional(net.minecraft.world.level.storage.ValueInput input) {\n            super.loadAdditional(input);\n            items = NonNullList.withSize(3, ItemStack.EMPTY);\n            ContainerHelper.loadAllItems(input, items);\n            litTime = input.getIntOr(\"AnvilLit\", 0);\n            litDuration = input.getIntOr(\"AnvilLitTotal\", 0);\n            progress = input.getIntOr(\"AnvilProgress\", 0);\n            total = input.getIntOr(\"AnvilTotal\", 0);\n        }\n\n        @Override\n        protected void saveAdditional(net.minecraft.world.level.storage.ValueOutput output) {\n            super.saveAdditional(output);\n            ContainerHelper.saveAllItems(output, items);\n            output.putInt(\"AnvilLit\", litTime);\n            output.putInt(\"AnvilLitTotal\", litDuration);\n            output.putInt(\"AnvilProgress\", progress);\n            output.putInt(\"AnvilTotal\", total);\n        }\n".to_string()
        } else {
            let get = |k: &str| if api.props_tools { format!("tag.getIntOr(\"{k}\", 0)") } else { format!("tag.getInt(\"{k}\")") };
            format!(
                "        @Override\n        protected void loadAdditional(net.minecraft.nbt.CompoundTag tag, net.minecraft.core.HolderLookup.Provider registries) {{\n            super.loadAdditional(tag, registries);\n            items = NonNullList.withSize(3, ItemStack.EMPTY);\n            ContainerHelper.loadAllItems(tag, items, registries);\n            litTime = {};\n            litDuration = {};\n            progress = {};\n            total = {};\n        }}\n\n        @Override\n        protected void saveAdditional(net.minecraft.nbt.CompoundTag tag, net.minecraft.core.HolderLookup.Provider registries) {{\n            super.saveAdditional(tag, registries);\n            ContainerHelper.saveAllItems(tag, items, registries);\n            tag.putInt(\"AnvilLit\", litTime);\n            tag.putInt(\"AnvilLitTotal\", litDuration);\n            tag.putInt(\"AnvilProgress\", progress);\n            tag.putInt(\"AnvilTotal\", total);\n        }}\n",
                get("AnvilLit"), get("AnvilLitTotal"), get("AnvilProgress"), get("AnvilTotal")
            )
        };
        let on_remove = on_remove_drop.clone();
        methods.push_str(&format!(r##"
    record AnvilMachineRecipe(String block, String input, int inputCount, String output, int outputCount, int time) {{}}

    static final AnvilMachineRecipe[] ANVIL_MACHINE_RECIPES = {{
{recipes}    }};

    static final java.util.Set<String> ANVIL_MACHINE_FUEL = java.util.Set.of({fuel_list});

    /** Maschine: verarbeitet Eingabe → Ausgabe über die Zeit (Ofen-Oberfläche). */
    public static class AnvilMachineBlock extends BaseEntityBlock {{
        public static final MapCodec<AnvilMachineBlock> CODEC = simpleCodec(AnvilMachineBlock::new);

        public AnvilMachineBlock(BlockBehaviour.Properties properties) {{
            super(properties);
        }}

        @Override
        protected MapCodec<? extends BaseEntityBlock> codec() {{
            return CODEC;
        }}

        @Override
        protected RenderShape getRenderShape(BlockState state) {{
            return RenderShape.MODEL;
        }}

        @Override
        public BlockEntity newBlockEntity(BlockPos pos, BlockState state) {{
            return new AnvilMachineBlockEntity(pos, state);
        }}

        @Override
        public <T extends BlockEntity> net.minecraft.world.level.block.entity.BlockEntityTicker<T> getTicker(Level level, BlockState state, BlockEntityType<T> type) {{
            return level.isClientSide() ? null : createTickerHelper(type, MACHINE_BE.get(), AnvilMachineBlockEntity::serverTick);
        }}

        @Override
        protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {{
            if (!level.isClientSide() && level.getBlockEntity(pos) instanceof AnvilMachineBlockEntity machine) player.openMenu(machine);
            return InteractionResult.SUCCESS;
        }}
{on_remove}    }}

    public static class AnvilMachineBlockEntity extends net.minecraft.world.level.block.entity.BaseContainerBlockEntity {{
        private NonNullList<ItemStack> items = NonNullList.withSize(3, ItemStack.EMPTY);
        private int litTime, litDuration, progress, total;
        private final net.minecraft.world.inventory.ContainerData data = new net.minecraft.world.inventory.ContainerData() {{
            @Override
            public int get(int index) {{
                return switch (index) {{
                    case 0 -> litTime;
                    case 1 -> litDuration;
                    case 2 -> progress;
                    default -> total;
                }};
            }}

            @Override
            public void set(int index, int value) {{
                switch (index) {{
                    case 0 -> litTime = value;
                    case 1 -> litDuration = value;
                    case 2 -> progress = value;
                    default -> total = value;
                }}
            }}

            @Override
            public int getCount() {{
                return 4;
            }}
        }};

        public AnvilMachineBlockEntity(BlockPos pos, BlockState state) {{
            super(MACHINE_BE.get(), pos, state);
        }}

        @Override
        public int getContainerSize() {{
            return 3;
        }}

        @Override
        protected NonNullList<ItemStack> getItems() {{
            return items;
        }}

        @Override
        protected void setItems(NonNullList<ItemStack> items) {{
            this.items = items;
        }}

        @Override
        protected Component getDefaultName() {{
            return getBlockState().getBlock().getName();
        }}

        @Override
        protected AbstractContainerMenu createMenu(int id, Inventory inventory) {{
            return new net.minecraft.world.inventory.FurnaceMenu(id, inventory, this, data);
        }}

        private static AnvilMachineRecipe find(String key, ItemStack input) {{
            for (AnvilMachineRecipe r : ANVIL_MACHINE_RECIPES) {{
                if (r.block().equals(key) && anvilMatches(input, r.input()) && input.getCount() >= r.inputCount()) return r;
            }}
            return null;
        }}

        private static int burnTime(Level level, ItemStack stack) {{
            return stack.isEmpty() ? 0 : {burn};
        }}

        public static void serverTick(Level level, BlockPos pos, BlockState state, AnvilMachineBlockEntity be) {{
            String key = anvilBlockKey(state.getBlock());
            boolean needsFuel = ANVIL_MACHINE_FUEL.contains(key);
            boolean changed = false;
            if (be.litTime > 0) be.litTime--;
            AnvilMachineRecipe r = find(key, be.items.get(0));
            ItemStack out = be.items.get(2);
            ItemStack result = r == null ? ItemStack.EMPTY : anvilStack(r.output(), r.outputCount());
            boolean fits = !result.isEmpty() && (out.isEmpty() || (ItemStack.isSameItemSameComponents(out, result) && out.getCount() + result.getCount() <= out.getMaxStackSize()));
            if (fits) {{
                if (!needsFuel) {{
                    be.litTime = be.litDuration = 1;
                }} else if (be.litTime <= 0) {{
                    ItemStack fuel = be.items.get(1);
                    int burn = burnTime(level, fuel);
                    if (burn > 0) {{
                        be.litTime = be.litDuration = burn;
                        boolean bucket = fuel.is(net.minecraft.world.item.Items.LAVA_BUCKET);
                        fuel.shrink(1);
                        if (bucket) be.items.set(1, new ItemStack(net.minecraft.world.item.Items.BUCKET));
                        changed = true;
                    }}
                }}
                if (be.litTime > 0) {{
                    be.total = r.time();
                    be.progress++;
                    if (be.progress >= be.total) {{
                        be.progress = 0;
                        be.items.get(0).shrink(r.inputCount());
                        if (out.isEmpty()) be.items.set(2, result);
                        else out.grow(result.getCount());
                    }}
                    changed = true;
                }} else if (be.progress > 0) {{
                    be.progress = Math.max(0, be.progress - 2);
                    changed = true;
                }}
            }} else if (be.progress > 0) {{
                be.progress = 0;
                changed = true;
            }}
            if (changed) be.setChanged();
        }}

{save_load}    }}
"##, fuel_list = fuel.trim_end_matches(", ")));
    }

    // ---- Nachschlagen per ID (Registries sind zur Laufzeit fertig) ----
    let needs_lookup = !c.brewing.is_empty() || !c.events.is_empty();
    if needs_lookup {
        imports.extend([
            "net.minecraft.core.Holder",
            "net.minecraft.core.registries.BuiltInRegistries",
            "net.minecraft.sounds.SoundEvent",
            "net.minecraft.world.effect.MobEffect",
            "net.neoforged.neoforge.common.NeoForge",
        ]);
        let (eff, item, sound) = if api.materials_v2 {
            (
                "BuiltInRegistries.MOB_EFFECT.get(ResourceLocation.parse(id)).orElseThrow()",
                "BuiltInRegistries.ITEM.getValue(ResourceLocation.parse(id))",
                "BuiltInRegistries.SOUND_EVENT.getValue(ResourceLocation.parse(id))",
            )
        } else {
            (
                "BuiltInRegistries.MOB_EFFECT.getHolder(ResourceLocation.parse(id)).orElseThrow()",
                "BuiltInRegistries.ITEM.get(ResourceLocation.parse(id))",
                "BuiltInRegistries.SOUND_EVENT.get(ResourceLocation.parse(id))",
            )
        };
        methods.push_str(&format!(
            "\n    private static Holder<MobEffect> anvilEffect(String id) {{\n        return {eff};\n    }}\n\n    private static Item anvilItem(String id) {{\n        return {item};\n    }}\n\n    private static SoundEvent anvilSound(String id) {{\n        return {sound};\n    }}\n"
        ));
    }

    // ---- Blueprints ----
    if c.blueprints.iter().any(|b| b.enabled) {
        let mut own: std::collections::HashSet<String> = all_variants(c).iter().map(|v| v.id.clone()).collect();
        own.extend(c.items.iter().map(|i| i.id.clone()));
        own.extend(c.mobs.iter().map(|m| m.id.clone()));
        own.extend(c.dimensions.iter().map(|d| d.id.clone()));
        let bp_api = crate::blueprint::BpApi { get_value: api.materials_v2, modid: p.mod_id.clone(), own };
        let (bi, bc, bm) = crate::blueprint::generate(&c.blueprints, &bp_api);
        imports.extend(bi);
        calls.push_str(&bc);
        methods.push_str(&bm);
    }

    // ---- Brau-Rezepte ----
    if !c.brewing.is_empty() {
        imports.extend(["net.minecraft.world.item.alchemy.Potions", "net.neoforged.neoforge.event.brewing.RegisterBrewingRecipesEvent"]);
        calls.push_str("        NeoForge.EVENT_BUS.addListener(AnvilContent::registerBrewing);\n");
        let mut lines = String::new();
        for b in &c.brewing {
            let (i, o) = (b.input.trim().trim_start_matches("minecraft:"), b.output.trim().trim_start_matches("minecraft:"));
            if !valid_id(i) || !valid_id(o) || !valid_ref(b.ingredient.trim()) {
                continue;
            }
            lines.push_str(&format!(
                "        event.getBuilder().addMix(Potions.{}, anvilItem(\"{}\"), Potions.{});\n",
                up(i),
                java_str(b.ingredient.trim()),
                up(o)
            ));
        }
        methods.push_str(&format!("\n    private static void registerBrewing(RegisterBrewingRecipesEvent event) {{\n{lines}    }}\n"));
    }

    // ---- Ereignisse ----
    if !c.events.is_empty() {
        imports.extend([
            "net.minecraft.core.BlockPos",
            "net.minecraft.sounds.SoundSource",
            "net.minecraft.world.InteractionHand",
            "net.minecraft.world.effect.MobEffectInstance",
            "net.minecraft.world.entity.Entity",
            "net.minecraft.world.entity.LivingEntity",
            "net.minecraft.world.entity.player.Player",
            "net.minecraft.world.level.Level",
            "net.neoforged.neoforge.event.entity.living.LivingDeathEvent",
            "net.neoforged.neoforge.event.entity.living.LivingEntityUseItemEvent",
            "net.neoforged.neoforge.event.entity.living.LivingIncomingDamageEvent",
            "net.neoforged.neoforge.event.entity.player.PlayerInteractEvent",
            "net.neoforged.neoforge.event.level.BlockEvent",
            "net.minecraft.world.level.block.state.BlockState",
        ]);
        let is_block = |id: &str| all_variants(c).iter().any(|v| v.id == id);
        let is_item = |id: &str| c.items.iter().any(|i| i.id == id);
        let is_mob = |id: &str| c.mobs.iter().any(|m| m.id == id);
        // Aktionen als Java-Code; Variablen: level, player (evtl. null), target (evtl. null), x, y, z
        let action_code = |a: &ActionDef| -> String {
            let who = if a.to == "target" { "target" } else { "player" };
            let v = java_str(a.value.trim());
            let amt = a.amount;
            match a.kind.as_str() {
                "effect" if valid_ref(a.value.trim()) => format!(
                    "            if ({who} != null) {who}.addEffect(new MobEffectInstance(anvilEffect(\"{v}\"), {}, {}));\n",
                    a.duration.clamp(1, 3600) * 20,
                    (amt.round() as i32 - 1).clamp(0, 9)
                ),
                "give_item" if valid_ref(a.value.trim()) => format!(
                    "            if (player != null) {{ ItemStack stack = new ItemStack(anvilItem(\"{v}\"), {}); if (!player.getInventory().add(stack)) player.drop(stack, false); }}\n",
                    (amt.round() as i32).clamp(1, 64)
                ),
                "message" => format!("            if (player != null) player.displayClientMessage(Component.literal(\"{v}\"), false);\n"),
                "sound" if valid_ref(a.value.trim()) => format!("            level.playSound(null, x, y, z, anvilSound(\"{v}\"), SoundSource.PLAYERS, 1.0f, 1.0f);\n"),
                "explode" => format!("            level.explode(null, x, y, z, {}, Level.ExplosionInteraction.TNT);\n", java_float(amt.clamp(0.5, 10.0))),
                "fire" => format!("            if ({who} != null) {who}.igniteForSeconds({}f);\n", a.duration.clamp(1, 60)),
                "xp" => format!("            if (player != null) player.giveExperiencePoints({});\n", (amt.round() as i32).clamp(1, 10000)),
                "heal" => format!("            if ({who} != null) {who}.heal({});\n", java_float(amt.clamp(0.5, 1000.0))),
                "launch" => format!(
                    "            if ({who} != null) {{ {who}.setDeltaMovement({who}.getDeltaMovement().add(0, {}, 0)); {who}.hurtMarked = true; }}\n",
                    java_float((amt * 0.5).clamp(0.1, 10.0))
                ),
                _ => String::new(),
            }
        };
        let body = |e: &EventDef| -> String { e.actions.iter().map(action_code).collect::<String>() };
        let mut handlers: Vec<(&str, &str, String, String)> = vec![];
        // (Methodenname, Ereignisklasse, Vorspann, Bedingungen)
        for (trigger, method, class, head) in [
            ("right_click_block", "onRightClickBlock", "PlayerInteractEvent.RightClickBlock",
             "        if (event.getHand() != InteractionHand.MAIN_HAND) return;\n        Level level = event.getLevel();\n        if (level.isClientSide()) return;\n        Player player = event.getEntity();\n        LivingEntity target = player;\n        BlockPos pos = event.getPos();\n        double x = pos.getX() + 0.5, y = pos.getY() + 0.5, z = pos.getZ() + 0.5;\n        BlockState state = level.getBlockState(pos);\n"),
            ("right_click_item", "onRightClickItem", "PlayerInteractEvent.RightClickItem",
             "        Level level = event.getLevel();\n        if (level.isClientSide()) return;\n        Player player = event.getEntity();\n        LivingEntity target = player;\n        double x = player.getX(), y = player.getY(), z = player.getZ();\n        ItemStack stack0 = event.getItemStack();\n"),
            ("break_block", "onBreakBlock", "BlockEvent.BreakEvent",
             "        if (!(event.getLevel() instanceof Level level) || level.isClientSide()) return;\n        Player player = event.getPlayer();\n        LivingEntity target = player;\n        BlockPos pos = event.getPos();\n        double x = pos.getX() + 0.5, y = pos.getY() + 0.5, z = pos.getZ() + 0.5;\n        BlockState state = event.getState();\n"),
            ("place_block", "onPlaceBlock", "BlockEvent.EntityPlaceEvent",
             "        if (!(event.getLevel() instanceof Level level) || level.isClientSide()) return;\n        Player player = event.getEntity() instanceof Player p0 ? p0 : null;\n        LivingEntity target = player;\n        BlockPos pos = event.getPos();\n        double x = pos.getX() + 0.5, y = pos.getY() + 0.5, z = pos.getZ() + 0.5;\n        BlockState state = event.getPlacedBlock();\n"),
            ("use_item", "onUseItem", "LivingEntityUseItemEvent.Finish",
             "        Level level = event.getEntity().level();\n        if (level.isClientSide()) return;\n        Player player = event.getEntity() instanceof Player p0 ? p0 : null;\n        LivingEntity target = event.getEntity();\n        double x = target.getX(), y = target.getY(), z = target.getZ();\n        ItemStack stack0 = event.getItem();\n"),
            ("entity_hurt", "onEntityHurt", "LivingIncomingDamageEvent",
             "        LivingEntity target = event.getEntity();\n        Level level = target.level();\n        if (level.isClientSide()) return;\n        Player player = event.getSource().getEntity() instanceof Player p0 ? p0 : null;\n        double x = target.getX(), y = target.getY(), z = target.getZ();\n        ItemStack stack0 = player != null ? player.getMainHandItem() : ItemStack.EMPTY;\n"),
            ("entity_killed", "onEntityKilled", "LivingDeathEvent",
             "        LivingEntity target = event.getEntity();\n        Level level = target.level();\n        if (level.isClientSide()) return;\n        Player player = event.getSource().getEntity() instanceof Player p0 ? p0 : null;\n        double x = target.getX(), y = target.getY(), z = target.getZ();\n        ItemStack stack0 = player != null ? player.getMainHandItem() : ItemStack.EMPTY;\n"),
        ] {
            let mut conds = String::new();
            for e in c.events.iter().filter(|e| e.trigger == trigger) {
                let t = e.target.trim();
                let k = up(t);
                let check = match trigger {
                    "right_click_block" | "break_block" | "place_block" if is_block(t) => format!("state.is({k}.get())"),
                    "right_click_item" | "use_item" if is_item(t) => format!("stack0.is({k}.get())"),
                    "entity_hurt" | "entity_killed" if is_mob(t) => format!("target.getType() == {k}.get()"),
                    "entity_hurt" | "entity_killed" if is_item(t) => format!("stack0.is({k}.get())"),
                    _ => continue,
                };
                let cancel = if e.cancel && trigger != "use_item" && trigger != "entity_killed" { "            event.setCanceled(true);\n" } else { "" };
                conds.push_str(&format!("        if ({check}) {{\n{}{cancel}        }}\n", body(e)));
            }
            if !conds.is_empty() {
                handlers.push((method, class, head.to_string(), conds));
            }
        }
        for (method, class, head, conds) in handlers {
            calls.push_str(&format!("        NeoForge.EVENT_BUS.addListener(AnvilContent::{method});\n"));
            methods.push_str(&format!("\n    private static void {method}({class} event) {{\n{head}{conds}    }}\n"));
        }
        let _ = modid;
    }
    (fields, imports, calls, methods)
}

fn generate_java(p: &Project, c: &Content) -> String {
    let modid = &p.mod_id;
    let api = api(p);
    let mut fields = String::new();
    let mut tab = String::new();
    let up = |s: &str| s.to_uppercase();
    let lazy = api.lazy_props;
    let lz = move |e: String| if lazy { format!("() -> {e}") } else { e };

    for v in all_variants(c) {
        let b = v.base;
        let k = up(&v.id);
        let base_k = up(&b.id);
        let mut props = block_props(b, v.shape == "deepslate");
        if matches!(v.shape, "button" | "pressure_plate") {
            props.push_str(if api.lazy_props { ".noCollision()" } else { ".noCollission()" });
        }
        let props = if api.lazy_props { format!("() -> {props}") } else { props };
        let set_type = if b.material == "wood" { "OAK" } else if b.material == "metal" { "IRON" } else { "STONE" };
        let (ty, reg) = match v.shape {
            "block" if is_model(b) => (model_class(b), format!("BLOCKS.registerBlock(\"{}\", {}::new, {props})", v.id, model_class(b))),
            "block" if b.kind == "lamp" => ("RedstoneLampBlock".to_string(), format!("BLOCKS.registerBlock(\"{}\", RedstoneLampBlock::new, {props})", v.id)),
            "block" if b.kind == "workbench" => ("AnvilWorkbenchBlock".to_string(), format!("BLOCKS.registerBlock(\"{}\", AnvilWorkbenchBlock::new, {props})", v.id)),
            "block" if b.kind == "machine" => ("AnvilMachineBlock".to_string(), format!("BLOCKS.registerBlock(\"{}\", AnvilMachineBlock::new, {props})", v.id)),
            "block" if b.kind == "storage" => (
                "AnvilStorageBlock".to_string(),
                format!("BLOCKS.registerBlock(\"{}\", p -> new AnvilStorageBlock({}, p), {props})", v.id, b.rows.clamp(1, 6)),
            ),
            "button" => (
                "ButtonBlock".into(),
                format!("BLOCKS.registerBlock(\"{}\", p -> new ButtonBlock(BlockSetType.{set_type}, {}, p), {props})", v.id, if b.material == "wood" { 30 } else { 20 }),
            ),
            "pressure_plate" => ("PressurePlateBlock".into(), format!("BLOCKS.registerBlock(\"{}\", p -> new PressurePlateBlock(BlockSetType.{set_type}, p), {props})", v.id)),
            "block" if b.ore.enabled => (
                "DropExperienceBlock".to_string(),
                format!("BLOCKS.registerBlock(\"{}\", p -> new DropExperienceBlock(UniformInt.of({}, {}), p), {props})", v.id, b.ore.xp_min, b.ore.xp_max.max(b.ore.xp_min)),
            ),
            "deepslate" => (
                "DropExperienceBlock".to_string(),
                format!("BLOCKS.registerBlock(\"{}\", p -> new DropExperienceBlock(UniformInt.of({}, {}), p), {props})", v.id, b.ore.xp_min, b.ore.xp_max.max(b.ore.xp_min)),
            ),
            "stairs" => ("StairBlock".into(), format!("BLOCKS.registerBlock(\"{}\", p -> new StairBlock({base_k}.get().defaultBlockState(), p), {props})", v.id)),
            "slab" => ("SlabBlock".into(), format!("BLOCKS.registerBlock(\"{}\", SlabBlock::new, {props})", v.id)),
            "wall" => ("WallBlock".into(), format!("BLOCKS.registerBlock(\"{}\", WallBlock::new, {props})", v.id)),
            "fence" => ("FenceBlock".into(), format!("BLOCKS.registerBlock(\"{}\", FenceBlock::new, {props})", v.id)),
            _ => ("Block".into(), format!("BLOCKS.registerSimpleBlock(\"{}\", {props})", v.id)),
        };
        fields.push_str(&format!(
            "    public static final DeferredBlock<{ty}> {k} = {reg};\n    public static final DeferredItem<BlockItem> {k}_ITEM = ITEMS.registerSimpleBlockItem(\"{id}\", {k});\n\n",
            id = v.id
        ));
        tab.push_str(&format!("                output.accept({k}_ITEM.get());\n"));
    }

    // Reparatur-Tags (data/<modid>/tags/item/repairs_<x>.json)
    let repair_tag = |key: &str| format!("TagKey.create(Registries.ITEM, ResourceLocation.fromNamespaceAndPath(MODID, \"repairs_{key}\"))");

    // Rüstungsmaterialien
    for (mat, pieces) in armor_sets(c) {
        let first = pieces[0];
        let mk = format!("ARMOR_{}", up(&mat));
        let defense = |slot: &str| pieces.iter().find(|i| i.armor_slot == slot).map(|i| i.defense.min(30)).unwrap_or(0);
        let ench = first.enchantability.clamp(1, 50);
        let tough = java_float(first.toughness.clamp(0.0, 20.0));
        let kb = java_float(first.knockback_resistance.clamp(0.0, 1.0));
        if api.materials_v2 {
            fields.push_str(&format!(
                "    public static final ArmorMaterial {mk} = new ArmorMaterial({dur}, Map.of(ArmorType.BOOTS, {b}, ArmorType.LEGGINGS, {l}, ArmorType.CHESTPLATE, {c}, ArmorType.HELMET, {h}, ArmorType.BODY, {c}), {ench}, SoundEvents.ARMOR_EQUIP_IRON, {tough}, {kb}, {tag}, ResourceKey.create(EquipmentAssets.ROOT_ID, ResourceLocation.fromNamespaceAndPath(MODID, \"{mat}\")));\n\n",
                dur = first.durability.clamp(1, 200),
                b = defense("boots"),
                l = defense("leggings"),
                c = defense("chestplate"),
                h = defense("helmet"),
                tag = repair_tag(&mat)
            ));
        } else {
            fields.push_str(&format!(
                "    public static final DeferredHolder<ArmorMaterial, ArmorMaterial> {mk} = ARMOR_MATERIALS.register(\"{mat}\", () -> new ArmorMaterial(Util.make(new EnumMap<>(ArmorItem.Type.class), m -> {{\n        m.put(ArmorItem.Type.BOOTS, {b});\n        m.put(ArmorItem.Type.LEGGINGS, {l});\n        m.put(ArmorItem.Type.CHESTPLATE, {c});\n        m.put(ArmorItem.Type.HELMET, {h});\n        m.put(ArmorItem.Type.BODY, {c});\n    }}), {ench}, SoundEvents.ARMOR_EQUIP_IRON, () -> Ingredient.of({tag}), List.of(new ArmorMaterial.Layer(ResourceLocation.fromNamespaceAndPath(MODID, \"{mat}\"))), {tough}, {kb}));\n\n",
                b = defense("boots"),
                l = defense("leggings"),
                c = defense("chestplate"),
                h = defense("helmet"),
                tag = repair_tag(&mat)
            ));
        }
    }

    for i in &c.items {
        let k = up(&i.id);
        let mut props = String::from("new Item.Properties()");
        if i.kind == "basic" {
            props.push_str(&format!(".stacksTo({})", i.stack_size.clamp(1, 99)));
        }
        if i.rarity != "common" {
            props.push_str(&format!(".rarity(Rarity.{})", i.rarity.to_uppercase()));
        }
        if i.food && i.kind == "basic" {
            props.push_str(&format!(
                ".food(new FoodProperties.Builder().nutrition({}).saturationModifier({}).build())",
                i.nutrition.min(20),
                java_float(i.saturation.max(0.0))
            ));
        }
        match i.kind.as_str() {
            "tool" => {
                let mk = format!("TOOL_{k}");
                let tag = incorrect_tag(&i.tool_tier);
                let uses = i.durability.clamp(1, 100_000);
                let speed = java_float(i.mining_speed.clamp(0.1, 100.0));
                let ench = i.enchantability.clamp(1, 50);
                let dmg = (i.attack_damage - 1.0).clamp(0.0, 1000.0);
                let spd = java_float((i.attack_speed - 4.0).clamp(-3.95, 20.0));
                if api.materials_v2 {
                    fields.push_str(&format!(
                        "    private static final ToolMaterial {mk} = new ToolMaterial(BlockTags.{tag}, {uses}, {speed}, 0.0f, {ench}, {});\n",
                        repair_tag(&i.id)
                    ));
                } else {
                    fields.push_str(&format!(
                        "    private static final Tier {mk} = new SimpleTier(BlockTags.{tag}, {uses}, {speed}, 0.0f, {ench}, () -> Ingredient.of({}));\n",
                        repair_tag(&i.id)
                    ));
                }
                let class = match i.tool_type.as_str() {
                    "pickaxe" => "PickaxeItem",
                    "axe" => "AxeItem",
                    "shovel" => "ShovelItem",
                    "hoe" => "HoeItem",
                    _ => "SwordItem",
                };
                let d = java_float(dmg);
                let reg = if api.props_tools {
                    match i.tool_type.as_str() {
                        "sword" | "pickaxe" => {
                            format!("ITEMS.registerItem(\"{id}\", p -> new Item(p.{t}({mk}, {d}, {spd})), {})", lz(props.clone()), t = i.tool_type, id = i.id)
                        }
                        _ => format!("ITEMS.registerItem(\"{id}\", p -> new {class}({mk}, {d}, {spd}, p), {})", lz(props.clone()), id = i.id),
                    }
                } else if api.materials_v2 {
                    format!("ITEMS.registerItem(\"{id}\", p -> new {class}({mk}, {d}, {spd}, p), {})", lz(props.clone()), id = i.id)
                } else {
                    let attrs = if i.tool_type == "sword" {
                        format!("SwordItem.createAttributes({mk}, {}, {spd})", dmg.round() as i64)
                    } else {
                        format!("DiggerItem.createAttributes({mk}, {d}, {spd})")
                    };
                    format!("ITEMS.registerItem(\"{id}\", p -> new {class}({mk}, p), {props}.attributes({attrs}))", id = i.id)
                };
                let ty = if api.props_tools && matches!(i.tool_type.as_str(), "sword" | "pickaxe") { "Item" } else { class };
                fields.push_str(&format!("    public static final DeferredItem<{ty}> {k} = {reg};\n\n"));
            }
            "armor" => {
                let mk = format!("ARMOR_{}", up(&i.armor_material));
                let at = armor_type(&i.armor_slot, &api);
                let (ty, reg) = if api.props_tools {
                    ("Item", format!("ITEMS.registerItem(\"{id}\", p -> new Item(p.humanoidArmor({mk}, {at})), {})", lz(props.clone()), id = i.id))
                } else if api.materials_v2 {
                    ("ArmorItem", format!("ITEMS.registerItem(\"{id}\", p -> new ArmorItem({mk}, {at}, p), {props})", id = i.id))
                } else {
                    let dur = c.items.iter().find(|x| x.kind == "armor" && x.armor_material == i.armor_material).map(|x| x.durability).unwrap_or(15).clamp(1, 200);
                    ("ArmorItem", format!("ITEMS.registerItem(\"{id}\", p -> new ArmorItem({mk}, {at}, p), {props}.durability({at}.getDurability({dur})))", id = i.id))
                };
                fields.push_str(&format!("    public static final DeferredItem<{ty}> {k} = {reg};\n\n"));
            }
            _ => {
                fields.push_str(&format!("    public static final DeferredItem<Item> {k} = ITEMS.registerSimpleItem(\"{id}\", {});\n\n", lz(props.clone()), id = i.id));
            }
        }
        tab.push_str(&format!("                output.accept({k}.get());\n"));
    }

    // Kreaturen
    let mut mob_classes = String::new();
    let mut attr_lines = String::new();
    let mut spawn_lines = String::new();
    for m in &c.mobs {
        let k = up(&m.id);
        let class = format!("{}Entity", camel(&m.id));
        let (base, cat, w, h, _, rule) = mob_base(&m.model);
        let key = if api.materials_v2 {
            format!("ResourceKey.create(Registries.ENTITY_TYPE, ResourceLocation.fromNamespaceAndPath(MODID, \"{}\"))", m.id)
        } else {
            format!("\"{}\"", m.id)
        };
        fields.push_str(&format!(
            "    public static final DeferredHolder<EntityType<?>, EntityType<{class}>> {k} = ENTITIES.register(\"{id}\", () -> EntityType.Builder.of({class}::new, MobCategory.{cat}).sized({w}, {h}).build({key}));\n",
            id = m.id,
            w = java_float(w),
            h = java_float(h)
        ));
        let egg = if api.lazy_props {
            // ab 1.21.9: Kreatur steckt in den Item-Eigenschaften
            format!("p -> new SpawnEggItem(p.spawnEgg({k}.get()))")
        } else if api.materials_v2 {
            // 1.21.2–1.21.8: Farben kommen aus items/*.json
            format!("p -> new SpawnEggItem({k}.get(), p)")
        } else {
            format!("p -> new DeferredSpawnEggItem({k}, 0x{:06x}, 0x{:06x}, p)", parse_color(&m.egg_primary), parse_color(&m.egg_secondary))
        };
        fields.push_str(&format!(
            "    public static final DeferredItem<Item> {k}_SPAWN_EGG = ITEMS.registerItem(\"{id}_spawn_egg\", {egg}, {});\n\n",
            lz("new Item.Properties()".to_string()),
            id = m.id
        ));
        tab.push_str(&format!("                output.accept({k}_SPAWN_EGG.get());\n"));

        let create = if api.materials_v2 { "create(level, EntitySpawnReason.BREEDING)" } else { "create(level)" };
        let body = match m.model.as_str() {
            "cow" | "pig" | "chicken" => format!(
                "\n        @Override\n        public {base} getBreedOffspring(ServerLevel level, AgeableMob partner) {{\n            return {k}.get().{create};\n        }}\n"
            ),
            "zombie" => "\n        @Override\n        protected boolean convertsInWater() {\n            return false;\n        }\n".to_string(),
            _ => String::new(),
        };
        mob_classes.push_str(&format!(
            "    public static class {class} extends {base} {{\n        public {class}(EntityType<? extends {base}> type, Level level) {{\n            super(type, level);\n        }}\n{body}    }}\n\n"
        ));
        let mut attrs = format!(
            "{base}.createAttributes().add(Attributes.MAX_HEALTH, {:.1}).add(Attributes.MOVEMENT_SPEED, {:.3})",
            m.health.clamp(1.0, 1024.0),
            m.speed.clamp(0.01, 2.0)
        );
        if is_hostile(&m.model) {
            attrs.push_str(&format!(".add(Attributes.ATTACK_DAMAGE, {:.1})", m.attack_damage.clamp(0.0, 1000.0)));
        }
        attr_lines.push_str(&format!("        event.put({k}.get(), {attrs}.build());\n"));
        spawn_lines.push_str(&format!(
            "        event.register({k}.get(), SpawnPlacementTypes.ON_GROUND, Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, {rule}, RegisterSpawnPlacementsEvent.Operation.REPLACE);\n"
        ));
    }

    let icon = c
        .items
        .first()
        .map(|i| i.id.to_uppercase())
        .or_else(|| c.blocks.first().map(|b| format!("{}_ITEM", b.id.to_uppercase())))
        .or_else(|| c.mobs.first().map(|m| format!("{}_SPAWN_EGG", m.id.to_uppercase())));
    let icon = match c.tab_icon.as_str() {
        "" => icon,
        id => {
            if c.items.iter().any(|i| i.id == id) {
                Some(id.to_uppercase())
            } else if all_variants(c).iter().any(|v| v.id == id) {
                Some(format!("{}_ITEM", id.to_uppercase()))
            } else {
                icon
            }
        }
    };
    let tab_def = match icon {
        Some(icon) => format!(
            "    public static final DeferredHolder<CreativeModeTab, CreativeModeTab> TAB = TABS.register(\"anvil_tab\", () -> CreativeModeTab.builder()\n            .title(Component.translatable(\"itemGroup.{modid}.anvil\"))\n            .icon(() -> {icon}.get().getDefaultInstance())\n            .displayItems((parameters, output) -> {{\n{tab}            }})\n            .build());\n\n"
        ),
        None => String::new(),
    };

    let mut imports = vec![
        "java.util.*",
        "net.minecraft.core.registries.Registries",
        "net.minecraft.network.chat.Component",
        "net.minecraft.resources.ResourceKey",
        "net.minecraft.resources.ResourceLocation",
        "net.minecraft.sounds.SoundEvents",
        "net.minecraft.tags.BlockTags",
        "net.minecraft.tags.TagKey",
        "net.minecraft.util.valueproviders.UniformInt",
        "net.minecraft.world.food.FoodProperties",
        "net.minecraft.world.item.*",
        "net.minecraft.world.item.crafting.Ingredient",
        "net.minecraft.world.level.block.*",
        "net.minecraft.world.level.block.state.BlockBehaviour",
        "net.minecraft.world.level.block.state.properties.BlockSetType",
        "net.minecraft.world.level.material.MapColor",
        "net.neoforged.bus.api.IEventBus",
        "net.neoforged.neoforge.registries.DeferredBlock",
        "net.neoforged.neoforge.registries.DeferredHolder",
        "net.neoforged.neoforge.registries.DeferredItem",
        "net.neoforged.neoforge.registries.DeferredRegister",
    ];
    if api.materials_v2 {
        imports.push("net.minecraft.world.item.equipment.*");
    } else {
        imports.push("net.minecraft.Util");
        imports.push("net.neoforged.neoforge.common.SimpleTier");
    }
    if !c.mobs.is_empty() {
        imports.extend([
            "net.minecraft.server.level.ServerLevel",
            "net.minecraft.world.entity.*",
            "net.minecraft.world.entity.ai.attributes.Attributes",
            "net.minecraft.world.entity.animal.*",
            "net.minecraft.world.entity.monster.*",
            "net.minecraft.world.level.Level",
            "net.minecraft.world.level.levelgen.Heightmap",
            "net.neoforged.neoforge.event.entity.EntityAttributeCreationEvent",
            "net.neoforged.neoforge.event.entity.RegisterSpawnPlacementsEvent",
        ]);
        if !api.materials_v2 {
            imports.push("net.neoforged.neoforge.common.DeferredSpawnEggItem");
        }
    }
    let (extra_fields, extra_imports, extra_calls, extra_methods) = generate_extras(p, c, &api);
    for i in extra_imports {
        if !imports.contains(&i) {
            imports.push(i);
        }
    }
    let imports: String = imports.iter().map(|i| format!("import {i};\n")).collect();
    let (mob_reg_field, mob_reg_call, mob_methods) = if c.mobs.is_empty() {
        (String::new(), String::new(), String::new())
    } else {
        (
            "    public static final DeferredRegister<EntityType<?>> ENTITIES = DeferredRegister.create(Registries.ENTITY_TYPE, MODID);\n".to_string(),
            "        ENTITIES.register(modEventBus);\n        modEventBus.addListener(AnvilContent::registerAttributes);\n        modEventBus.addListener(AnvilContent::registerSpawnPlacements);\n".to_string(),
            format!(
                "\n    private static void registerAttributes(EntityAttributeCreationEvent event) {{\n{attr_lines}    }}\n\n    private static void registerSpawnPlacements(RegisterSpawnPlacementsEvent event) {{\n{spawn_lines}    }}\n\n{mob_classes}"
            ),
        )
    };
    let (armor_reg_field, armor_reg_call) = if api.materials_v2 {
        (String::new(), String::new())
    } else {
        (
            "    public static final DeferredRegister<ArmorMaterial> ARMOR_MATERIALS = DeferredRegister.create(Registries.ARMOR_MATERIAL, MODID);\n".to_string(),
            "        ARMOR_MATERIALS.register(modEventBus);\n".to_string(),
        )
    };

    format!(
        r#"// =============================================================================
// AUTOMATISCH ERZEUGT von Anvil Studio – Änderungen in dieser Datei werden beim
// nächsten Speichern im Inhalte-Editor überschrieben. Eigenen Code bitte in
// andere Klassen schreiben.
// =============================================================================
package {pkg}.anvil;

{imports}
@SuppressWarnings("unused")
public final class AnvilContent {{
    public static final String MODID = "{modid}";

    public static final DeferredRegister.Blocks BLOCKS = DeferredRegister.createBlocks(MODID);
    public static final DeferredRegister.Items ITEMS = DeferredRegister.createItems(MODID);
    public static final DeferredRegister<CreativeModeTab> TABS = DeferredRegister.create(Registries.CREATIVE_MODE_TAB, MODID);
{armor_reg_field}{mob_reg_field}
{fields}{extra_fields}{tab_def}    private AnvilContent() {{}}

    /** Wird aus der Hauptklasse der Mod aufgerufen. */
    public static void register(IEventBus modEventBus) {{
{armor_reg_call}        BLOCKS.register(modEventBus);
        ITEMS.register(modEventBus);
        TABS.register(modEventBus);
        AnvilDevReload.init();
{mob_reg_call}{extra_calls}    }}
{mob_methods}{extra_methods}}}
"#,
        pkg = p.package
    )
}

/// Trägt `AnvilContent.register(...)` einmalig in den Konstruktor der Hauptklasse ein.
/// Rückgabe: "ok" (schon da), "added" oder eine Anleitung für den Fall, dass es nicht klappt.
fn ensure_registration(p: &Project) -> Result<String, String> {
    let java_root = root(p).join("src/main/java");
    let call = format!("{}.anvil.AnvilContent.register", p.package);
    let files: Vec<PathBuf> = walkdir::WalkDir::new(&java_root)
        .into_iter()
        .flatten()
        .filter(|e| e.path().extension().map(|x| x == "java").unwrap_or(false))
        .map(|e| e.into_path())
        .collect();
    for f in &files {
        if std::fs::read_to_string(f).map(|t| t.contains("AnvilContent.register(")).unwrap_or(false) {
            return Ok("ok".into());
        }
    }
    let ctor = regex::Regex::new(r"public\s+(\w+)\s*\(([^)]*\bIEventBus\s+(\w+)[^)]*)\)\s*\{").unwrap();
    for f in &files {
        let Ok(text) = std::fs::read_to_string(f) else { continue };
        if !text.contains("@Mod(") || text.contains("Dist.CLIENT") {
            continue;
        }
        if let Some(cap) = ctor.captures(&text) {
            let whole = cap.get(0).unwrap();
            let bus = cap.get(3).unwrap().as_str();
            let insert = format!("\n        // Anvil Studio: Blöcke & Items aus dem Inhalte-Editor\n        {call}({bus});\n");
            let new_text = format!("{}{}{}", &text[..whole.end()], insert, &text[whole.end()..]);
            std::fs::write(f, new_text).map_err(err)?;
            return Ok("added".into());
        }
    }
    Ok(format!(
        "Die Hauptklasse wurde nicht gefunden. Füge im Konstruktor deiner @Mod-Klasse diese Zeile ein: {call}(modEventBus);"
    ))
}

// ---- Assets & Daten ------------------------------------------------------------

fn texture_path(p: &Project, kind: &str, id: &str) -> PathBuf {
    let assets = root(p).join(format!("src/main/resources/assets/{}", p.mod_id));
    let modern = mc_at_least(&p.mc_version, (1, 21, 2));
    match kind {
        // Getragene Rüstung: id = Material
        "armor" if modern => assets.join(format!("textures/entity/equipment/humanoid/{id}.png")),
        "armor_legs" if modern => assets.join(format!("textures/entity/equipment/humanoid_leggings/{id}.png")),
        "armor" => assets.join(format!("textures/models/armor/{id}_layer_1.png")),
        "armor_legs" => assets.join(format!("textures/models/armor/{id}_layer_2.png")),
        _ => assets.join(format!("textures/{kind}/{id}.png")),
    }
}

fn ensure_texture(p: &Project, kind: &str, id: &str) -> Result<(), String> {
    let path = texture_path(p, kind, id);
    if !path.exists() {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(err)?;
        }
        let bytes = base64::engine::general_purpose::STANDARD.decode(PLACEHOLDER_PNG).map_err(err)?;
        std::fs::write(&path, bytes).map_err(err)?;
    }
    Ok(())
}

fn recipe_json(p: &Project, id: &str, r: &Recipe) -> Value {
    let modern = mc_at_least(&p.mc_version, (1, 21, 2));
    let ingredient = |s: &str| -> Value {
        if modern {
            json!(s)
        } else if let Some(tag) = s.strip_prefix('#') {
            json!({ "tag": tag })
        } else {
            json!({ "item": s })
        }
    };
    let result = json!({ "id": format!("{}:{id}", p.mod_id), "count": r.count.clamp(1, 64) });
    let grid: Vec<String> = (0..9).map(|i| r.grid.get(i).map(|s| s.trim().to_string()).unwrap_or_default()).collect();
    let first = grid.iter().find(|g| !g.is_empty()).cloned().unwrap_or_default();
    if r.kind == "stonecutting" {
        return json!({ "type": "minecraft:stonecutting", "ingredient": ingredient(&first), "result": result });
    }
    if r.kind == "smithing" {
        let item = |i: usize| ingredient(&grid[i]);
        return json!({
            "type": "minecraft:smithing_transform",
            "template": item(0),
            "base": item(1),
            "addition": item(2),
            "result": { "id": format!("{}:{id}", p.mod_id), "count": r.count.clamp(1, 64) }
        });
    }
    if matches!(r.kind.as_str(), "smelting" | "blasting" | "smoking" | "campfire") {
        let input = first;
        let (kind, factor) = match r.kind.as_str() {
            "blasting" => ("minecraft:blasting", 1),
            "smoking" => ("minecraft:smoking", 1),
            "campfire" => ("minecraft:campfire_cooking", 3),
            _ => ("minecraft:smelting", 1),
        };
        let _ = factor;
        return json!({
            "type": kind,
            "category": "misc",
            "ingredient": ingredient(&input),
            "result": { "id": format!("{}:{id}", p.mod_id) },
            "experience": (r.experience.max(0.0) * 100.0).round() / 100.0,
            "cookingtime": r.cooking_time.clamp(1, 32000)
        });
    }
    if !r.shaped {
        let ingredients: Vec<Value> = grid.iter().filter(|g| !g.is_empty()).map(|g| ingredient(g)).collect();
        return json!({ "type": "minecraft:crafting_shapeless", "category": "misc", "ingredients": ingredients, "result": result });
    }
    // Leere Zeilen/Spalten am Rand entfernen, damit das Rezept überall im Raster passt
    let rows: Vec<usize> = (0..3).filter(|r| (0..3).any(|c| !grid[r * 3 + c].is_empty())).collect();
    let cols: Vec<usize> = (0..3).filter(|c| (0..3).any(|r| !grid[r * 3 + c].is_empty())).collect();
    let (r0, r1) = (*rows.first().unwrap_or(&0), *rows.last().unwrap_or(&0));
    let (c0, c1) = (*cols.first().unwrap_or(&0), *cols.last().unwrap_or(&0));
    let mut keys: Vec<String> = vec![];
    let mut pattern = vec![];
    for row in r0..=r1 {
        let mut line = String::new();
        for col in c0..=c1 {
            let cell = &grid[row * 3 + col];
            if cell.is_empty() {
                line.push(' ');
            } else {
                let idx = keys.iter().position(|k| k == cell).unwrap_or_else(|| {
                    keys.push(cell.clone());
                    keys.len() - 1
                });
                line.push((b'A' + idx as u8) as char);
            }
        }
        pattern.push(line);
    }
    let mut key = Map::new();
    for (i, k) in keys.iter().enumerate() {
        key.insert(((b'A' + i as u8) as char).to_string(), ingredient(k));
    }
    json!({ "type": "minecraft:crafting_shaped", "category": "misc", "pattern": pattern, "key": key, "result": result })
}

/// Übersetzungen zusammenführen: eigene Schlüssel setzen, gelöschte entfernen, Fremdes behalten.
fn merge_lang(file: &Path, set: &[(String, String)], remove: &[String]) -> Result<(), String> {
    let mut map = read_json(file).and_then(|v| v.as_object().cloned()).unwrap_or_default();
    for k in remove {
        map.remove(k);
    }
    for (k, v) in set {
        if !v.trim().is_empty() {
            map.insert(k.clone(), json!(v.trim()));
        }
    }
    write_json(file, &Value::Object(map))
}

fn merge_tag(file: &Path, ours: &[String], all_ours: &[String]) -> Result<(), String> {
    let existing = read_json(file);
    let mut values: Vec<Value> = existing
        .as_ref()
        .and_then(|v| v["values"].as_array().cloned())
        .unwrap_or_default()
        .into_iter()
        .filter(|v| !v.as_str().map(|s| all_ours.iter().any(|o| o == s)).unwrap_or(false))
        .collect();
    values.extend(ours.iter().map(|s| json!(s)));
    if values.is_empty() {
        if file.exists() {
            std::fs::remove_file(file).map_err(err)?;
        }
        return Ok(());
    }
    write_json(file, &json!({ "replace": false, "values": values }))
}

fn remove_if_exists(path: PathBuf) {
    let _ = std::fs::remove_file(path);
}

const MODEL_SUFFIXES: [&str; 11] = ["", "_inner", "_outer", "_top", "_post", "_side", "_side_tall", "_inventory", "_pressed", "_down", "_on"];

/// Weitere Sprachen für Mod-Namen: Kürzel → Minecraft-Sprachdatei
const EXTRA_LANGS: [(&str, &str); 6] = [("fr", "fr_fr"), ("es", "es_es"), ("pl", "pl_pl"), ("nl", "nl_nl"), ("tr", "tr_tr"), ("ru", "ru_ru")];

/// Namensmuster für Varianten in weiteren Sprachen ({n} = Name des Grundblocks)
fn variant_pattern(lang: &str, shape: &str) -> &'static str {
    match (lang, shape) {
        ("fr", "deepslate") => "{n} des abîmes",
        ("fr", "stairs") => "Escalier en {n}",
        ("fr", "slab") => "Dalle en {n}",
        ("fr", "wall") => "Muret en {n}",
        ("fr", "fence") => "Barrière en {n}",
        ("fr", "button") => "Bouton en {n}",
        ("fr", "pressure_plate") => "Plaque de pression en {n}",
        ("fr", "egg") => "Œuf d'apparition de {n}",
        ("es", "deepslate") => "{n} de pizarra profunda",
        ("es", "stairs") => "Escaleras de {n}",
        ("es", "slab") => "Losa de {n}",
        ("es", "wall") => "Muro de {n}",
        ("es", "fence") => "Valla de {n}",
        ("es", "button") => "Botón de {n}",
        ("es", "pressure_plate") => "Placa de presión de {n}",
        ("es", "egg") => "Huevo generador de {n}",
        ("pl", "deepslate") => "{n} (łupek)",
        ("pl", "stairs") => "{n} – schody",
        ("pl", "slab") => "{n} – płyta",
        ("pl", "wall") => "{n} – murek",
        ("pl", "fence") => "{n} – płot",
        ("pl", "button") => "{n} – przycisk",
        ("pl", "pressure_plate") => "{n} – płyta naciskowa",
        ("pl", "egg") => "{n} – jajo spawnu",
        ("nl", "deepslate") => "Diepleisteen-{n}",
        ("nl", "stairs") => "{n} – trap",
        ("nl", "slab") => "{n} – plaat",
        ("nl", "wall") => "{n} – muur",
        ("nl", "fence") => "{n} – hek",
        ("nl", "button") => "{n} – knop",
        ("nl", "pressure_plate") => "{n} – drukplaat",
        ("nl", "egg") => "{n} – spawn-ei",
        ("tr", "deepslate") => "Derin Kayrak {n}",
        ("tr", "stairs") => "{n} Merdiven",
        ("tr", "slab") => "{n} Basamak",
        ("tr", "wall") => "{n} Duvar",
        ("tr", "fence") => "{n} Çit",
        ("tr", "button") => "{n} Düğme",
        ("tr", "pressure_plate") => "{n} Baskı Plakası",
        ("tr", "egg") => "{n} Çağırma Yumurtası",
        ("ru", "deepslate") => "{n} (глубинный сланец)",
        ("ru", "stairs") => "{n}: ступеньки",
        ("ru", "slab") => "{n}: плита",
        ("ru", "wall") => "{n}: ограда",
        ("ru", "fence") => "{n}: забор",
        ("ru", "button") => "{n}: кнопка",
        ("ru", "pressure_plate") => "{n}: нажимная плита",
        ("ru", "egg") => "Яйцо призыва: {n}",
        _ => "{n}",
    }
}

fn ingredient_json(p: &Project, s: &str) -> Value {
    if mc_at_least(&p.mc_version, (1, 21, 2)) {
        json!(s)
    } else if let Some(tag) = s.strip_prefix('#') {
        json!({ "tag": tag })
    } else {
        json!({ "item": s })
    }
}

fn shaped_json(p: &Project, result: &str, pattern: &[&str], keys: &[(&str, &str)], count: u32) -> Value {
    let mut key = Map::new();
    for (k, v) in keys {
        key.insert(k.to_string(), ingredient_json(p, v));
    }
    json!({ "type": "minecraft:crafting_shaped", "category": "building", "pattern": pattern, "key": key, "result": { "id": result, "count": count } })
}

fn loot_self(name: &str) -> Value {
    json!({
        "type": "minecraft:block",
        "pools": [{
            "rolls": 1,
            "entries": [{ "type": "minecraft:item", "name": name }],
            "conditions": [{ "condition": "minecraft:survives_explosion" }]
        }]
    })
}

fn loot_slab(name: &str) -> Value {
    json!({
        "type": "minecraft:block",
        "pools": [{
            "rolls": 1,
            "entries": [{
                "type": "minecraft:item",
                "name": name,
                "functions": [
                    { "function": "minecraft:set_count", "count": 2, "add": false,
                      "conditions": [{ "condition": "minecraft:block_state_property", "block": name, "properties": { "type": "double" } }] },
                    { "function": "minecraft:explosion_decay" }
                ]
            }]
        }]
    })
}

fn loot_ore(name: &str, ore: &OreDef) -> Value {
    if ore.drop.trim().is_empty() {
        return loot_self(name);
    }
    let (min, max) = (ore.drop_min.clamp(1, 64), ore.drop_max.clamp(1, 64).max(ore.drop_min.clamp(1, 64)));
    let mut functions = vec![];
    if min != 1 || max != 1 {
        functions.push(json!({ "function": "minecraft:set_count", "count": { "type": "minecraft:uniform", "min": min, "max": max }, "add": false }));
    }
    functions.push(json!({ "function": "minecraft:apply_bonus", "enchantment": "minecraft:fortune", "formula": "minecraft:ore_drops" }));
    functions.push(json!({ "function": "minecraft:explosion_decay" }));
    json!({
        "type": "minecraft:block",
        "pools": [{
            "rolls": 1,
            "bonus_rolls": 0,
            "entries": [{
                "type": "minecraft:alternatives",
                "children": [
                    {
                        "type": "minecraft:item",
                        "name": name,
                        "conditions": [{
                            "condition": "minecraft:match_tool",
                            "predicate": { "predicates": { "minecraft:enchantments": [{ "enchantments": "minecraft:silk_touch", "levels": { "min": 1 } }] } }
                        }]
                    },
                    { "type": "minecraft:item", "name": ore.drop.trim(), "functions": functions }
                ]
            }]
        }]
    })
}

fn rotated(model: &str, x: u32, y: u32) -> Value {
    let mut v = json!({ "model": model });
    if x != 0 {
        v["x"] = json!(x);
    }
    if y != 0 {
        v["y"] = json!(y);
    }
    if x != 0 || y != 0 {
        v["uvlock"] = json!(true);
    }
    v
}

fn stairs_blockstate(m: &str) -> Value {
    let mut variants = Map::new();
    for (facing, base) in [("east", 0), ("south", 90), ("west", 180), ("north", 270)] {
        for half in ["bottom", "top"] {
            for shape in ["straight", "inner_left", "inner_right", "outer_left", "outer_right"] {
                let model = match shape {
                    "straight" => m.to_string(),
                    s if s.starts_with("inner") => format!("{m}_inner"),
                    _ => format!("{m}_outer"),
                };
                let left = shape.ends_with("left");
                let right = shape.ends_with("right");
                let mut y = base;
                if half == "bottom" && left {
                    y += 270;
                }
                if half == "top" && right {
                    y += 90;
                }
                let x = if half == "top" { 180 } else { 0 };
                variants.insert(format!("facing={facing},half={half},shape={shape}"), rotated(&model, x, y % 360));
            }
        }
    }
    json!({ "variants": variants })
}

fn sides_multipart(post: Value, side: &str, values: &[(&str, &str)]) -> Value {
    let mut parts = vec![post];
    for (value, model) in values {
        for (dir, y) in [("north", 0), ("east", 90), ("south", 180), ("west", 270)] {
            let model = if model.is_empty() { side.to_string() } else { model.to_string() };
            parts.push(json!({ "when": { dir: value }, "apply": rotated(&model, 0, y) }));
        }
    }
    json!({ "multipart": parts })
}

/// Minimale PNG-Datei (RGBA) – für Platzhalter-Texturen.
fn png_rgba(w: u32, h: u32, pixel: impl Fn(u32, u32) -> [u8; 4]) -> Vec<u8> {
    use std::io::Write;
    fn crc32(data: &[u8]) -> u32 {
        let mut c = 0xffff_ffffu32;
        for &b in data {
            c ^= b as u32;
            for _ in 0..8 {
                c = if c & 1 != 0 { 0xedb8_8320 ^ (c >> 1) } else { c >> 1 };
            }
        }
        !c
    }
    fn chunk(out: &mut Vec<u8>, kind: &[u8], data: &[u8]) {
        out.extend((data.len() as u32).to_be_bytes());
        let mut c = kind.to_vec();
        c.extend(data);
        out.extend(&c);
        out.extend(crc32(&c).to_be_bytes());
    }
    let mut raw = vec![];
    for y in 0..h {
        raw.push(0u8);
        for x in 0..w {
            raw.extend(pixel(x, y));
        }
    }
    let mut z = flate2::write::ZlibEncoder::new(vec![], flate2::Compression::default());
    let _ = z.write_all(&raw);
    let idat = z.finish().unwrap_or_default();
    let mut out = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    let mut ihdr = vec![];
    ihdr.extend(w.to_be_bytes());
    ihdr.extend(h.to_be_bytes());
    ihdr.extend([8, 6, 0, 0, 0]);
    chunk(&mut out, b"IHDR", &ihdr);
    chunk(&mut out, b"IDAT", &idat);
    chunk(&mut out, b"IEND", &[]);
    out
}

/// Platzhalter für die getragene Rüstung (einfarbig, Farbe aus dem Materialnamen).
fn armor_placeholder(mat: &str) -> Vec<u8> {
    let h = mat.bytes().fold(7u32, |a, b| a.wrapping_mul(31).wrapping_add(b as u32));
    let base = [80 + (h % 140) as u8, 80 + ((h >> 8) % 140) as u8, 80 + ((h >> 16) % 140) as u8];
    png_rgba(64, 32, |x, y| {
        let shade = if (x + y) % 2 == 0 { 0 } else { 18 };
        [base[0].saturating_sub(shade), base[1].saturating_sub(shade), base[2].saturating_sub(shade), 255]
    })
}

fn write_if_missing(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(err)?;
    }
    std::fs::write(path, bytes).map_err(err)
}

fn validate_extra(c: &Content) -> Result<(), String> {
    let mut seen = std::collections::HashSet::new();
    for v in all_variants(c) {
        if !seen.insert(v.id.clone()) {
            return Err(format!("Die ID „{}“ entsteht doppelt (z. B. durch eine Form oder Tiefenschiefer-Variante).", v.id));
        }
    }
    for i in &c.items {
        if seen.contains(&i.id) {
            return Err(format!("Die ID „{}“ ist doppelt vergeben.", i.id));
        }
        if matches!(i.kind.as_str(), "tool" | "armor") && !i.repair_item.trim().is_empty() && !valid_ref(i.repair_item.trim()) {
            return Err(format!("Reparatur-Item von „{}“ ist keine gültige ID.", i.id));
        }
        if i.kind == "armor" && !valid_id(&i.armor_material) {
            return Err(format!("„{}“: Bitte ein Rüstungsmaterial angeben (z. B. ruby).", i.id));
        }
    }
    let item_ids: std::collections::HashSet<&String> = c.items.iter().map(|i| &i.id).collect();
    for m in &c.mobs {
        if !valid_id(&m.id) {
            return Err(format!("„{}“ ist keine gültige ID (Kleinbuchstaben, Ziffern, _; mit Buchstaben beginnen).", m.id));
        }
        if seen.contains(&m.id) || item_ids.contains(&m.id) || c.mobs.iter().filter(|x| x.id == m.id).count() > 1 {
            return Err(format!("Die ID „{}“ ist doppelt vergeben.", m.id));
        }
        let egg = format!("{}_spawn_egg", m.id);
        if seen.contains(&egg) || item_ids.contains(&egg) {
            return Err(format!("Die ID „{egg}“ (Spawn-Ei) ist schon vergeben.", ));
        }
        if !m.drop.trim().is_empty() && !valid_ref(m.drop.trim()) {
            return Err(format!("Kreatur „{}“: „{}“ ist keine gültige Item-ID.", m.id, m.drop));
        }
    }
    for b in &c.blocks {
        if b.ore.enabled && !b.ore.drop.trim().is_empty() && !valid_ref(b.ore.drop.trim()) {
            return Err(format!("Erz „{}“: „{}“ ist keine gültige Item-ID.", b.id, b.ore.drop));
        }
    }
    Ok(())
}

/// Erzeugt alle Dateien aus dem Inhalte-Modell.
pub fn generate(p: &Project, c: &mut Content) -> Result<String, String> {
    validate(c)?;
    validate_extra(c)?;
    let modid = &p.mod_id;
    let api = api(p);
    let res = root(p).join("src/main/resources");
    let assets = res.join("assets").join(modid);
    let data = res.join("data").join(modid);
    let client_items = mc_at_least(&p.mc_version, (1, 21, 4));

    // Java
    let java = root(p).join("src/main/java").join(p.package.replace('.', "/")).join("anvil").join("AnvilContent.java");
    if let Some(parent) = java.parent() {
        std::fs::create_dir_all(parent).map_err(err)?;
    }
    let java_code = generate_java(p, c);
    let java_changed = std::fs::read_to_string(&java).map(|old| old != java_code).unwrap_or(true);
    std::fs::write(&java, java_code).map_err(err)?;
    write_dev_reload(p, &java)?;
    let client_java = java.with_file_name("AnvilClient.java");
    if c.mobs.is_empty() {
        remove_if_exists(client_java);
    } else {
        std::fs::write(&client_java, generate_client_java(p, c)).map_err(err)?;
    }
    let registration = ensure_registration(p)?;

    let variants = all_variants(c);
    let block_ids: Vec<String> = variants.iter().map(|v| v.id.clone()).collect();
    let item_ids: Vec<String> = c.items.iter().map(|i| i.id.clone()).collect();

    // Gelöschte Einträge aufräumen (Texturen bleiben als Sicherung liegen)
    let mut removed_keys = vec![];
    for id in c.generated_blocks.iter().filter(|id| !block_ids.contains(id)) {
        remove_if_exists(assets.join(format!("blockstates/{id}.json")));
        for suf in MODEL_SUFFIXES {
            remove_if_exists(assets.join(format!("models/block/{id}{suf}.json")));
        }
        remove_if_exists(assets.join(format!("models/item/{id}.json")));
        remove_if_exists(assets.join(format!("items/{id}.json")));
        remove_if_exists(data.join(format!("loot_table/blocks/{id}.json")));
        remove_if_exists(data.join(format!("recipe/{id}.json")));
        removed_keys.push(format!("block.{modid}.{id}"));
    }
    for id in c.generated_items.iter().filter(|id| !item_ids.contains(id)) {
        remove_if_exists(assets.join(format!("models/item/{id}.json")));
        remove_if_exists(assets.join(format!("items/{id}.json")));
        remove_if_exists(data.join(format!("recipe/{id}.json")));
        removed_keys.push(format!("item.{modid}.{id}"));
    }
    // Weltgenerierung von Blöcken, die kein Erz (mehr) sind
    for id in c.generated_blocks.iter().chain(block_ids.iter()) {
        if !c.blocks.iter().any(|b| &b.id == id && b.ore.enabled) {
            remove_if_exists(data.join(format!("worldgen/configured_feature/{id}.json")));
            remove_if_exists(data.join(format!("worldgen/placed_feature/{id}.json")));
            remove_if_exists(data.join(format!("neoforge/biome_modifier/{id}.json")));
        }
    }

    let name_of = |de: &str, en: &str, german: bool| -> String {
        let (a, b) = if german { (de, en) } else { (en, de) };
        if a.trim().is_empty() { b.trim().to_string() } else { a.trim().to_string() }
    };
    let tab_name = if c.tab_name.trim().is_empty() { p.name.clone() } else { c.tab_name.trim().to_string() };
    let mut lang_de = vec![(format!("itemGroup.{modid}.anvil"), tab_name.clone())];
    let mut lang_en = vec![(format!("itemGroup.{modid}.anvil"), tab_name)];
    let mut lang_x: std::collections::BTreeMap<&str, Vec<(String, String)>> = Default::default();
    let mut add_x = |names: &std::collections::BTreeMap<String, String>, key: String, shape: &str| {
        for (code, _) in EXTRA_LANGS {
            if let Some(n) = names.get(code).map(|n| n.trim()).filter(|n| !n.is_empty()) {
                lang_x.entry(code).or_default().push((key.clone(), variant_pattern(code, shape).replace("{n}", n)));
            }
        }
    };

    for v in &variants {
        let b = v.base;
        let id = &v.id;
        let full = format!("{modid}:{id}");
        let m = format!("{modid}:block/{id}");
        let tex = if v.shape == "deepslate" { format!("{modid}:block/{id}") } else { format!("{modid}:block/{}", b.id) };
        let base_model = format!("{modid}:block/{}", b.id);
        let model = |parent: &str, keys: &[&str]| -> Value {
            let mut t = Map::new();
            for k in keys {
                t.insert(k.to_string(), json!(tex));
            }
            let mut v = json!({ "parent": parent, "textures": t });
            if b.material == "glass" {
                v["render_type"] = json!("minecraft:cutout");
            }
            v
        };
        let mb = |suf: &str| assets.join(format!("models/block/{id}{suf}.json"));
        let item_model: String;
        match v.shape {
            "stairs" => {
                write_json(&assets.join(format!("blockstates/{id}.json")), &stairs_blockstate(&m))?;
                write_json(&mb(""), &model("minecraft:block/stairs", &["bottom", "top", "side"]))?;
                write_json(&mb("_inner"), &model("minecraft:block/inner_stairs", &["bottom", "top", "side"]))?;
                write_json(&mb("_outer"), &model("minecraft:block/outer_stairs", &["bottom", "top", "side"]))?;
                item_model = m.clone();
            }
            "slab" => {
                write_json(
                    &assets.join(format!("blockstates/{id}.json")),
                    &json!({ "variants": {
                        "type=bottom": { "model": m },
                        "type=top": { "model": format!("{m}_top") },
                        "type=double": { "model": base_model }
                    } }),
                )?;
                write_json(&mb(""), &model("minecraft:block/slab", &["bottom", "top", "side"]))?;
                write_json(&mb("_top"), &model("minecraft:block/slab_top", &["bottom", "top", "side"]))?;
                item_model = m.clone();
            }
            "wall" => {
                write_json(
                    &assets.join(format!("blockstates/{id}.json")),
                    &sides_multipart(json!({ "when": { "up": "true" }, "apply": { "model": format!("{m}_post") } }), &format!("{m}_side"), &[("low", ""), ("tall", &format!("{m}_side_tall"))]),
                )?;
                write_json(&mb("_post"), &model("minecraft:block/template_wall_post", &["wall"]))?;
                write_json(&mb("_side"), &model("minecraft:block/template_wall_side", &["wall"]))?;
                write_json(&mb("_side_tall"), &model("minecraft:block/template_wall_side_tall", &["wall"]))?;
                write_json(&mb("_inventory"), &model("minecraft:block/wall_inventory", &["wall"]))?;
                item_model = format!("{m}_inventory");
            }
            "fence" => {
                write_json(
                    &assets.join(format!("blockstates/{id}.json")),
                    &sides_multipart(json!({ "apply": { "model": format!("{m}_post") } }), &format!("{m}_side"), &[("true", "")]),
                )?;
                write_json(&mb("_post"), &model("minecraft:block/fence_post", &["texture"]))?;
                write_json(&mb("_side"), &model("minecraft:block/fence_side", &["texture"]))?;
                write_json(&mb("_inventory"), &model("minecraft:block/fence_inventory", &["texture"]))?;
                item_model = format!("{m}_inventory");
            }
            "button" => {
                let mut variants = Map::new();
                for (face, x) in [("floor", 0), ("wall", 90), ("ceiling", 180)] {
                    for (facing, y) in [("east", 90), ("north", 0), ("south", 180), ("west", 270)] {
                        let y = if face == "ceiling" { (y + 180) % 360 } else { y };
                        for powered in [false, true] {
                            let model_id = if powered { format!("{m}_pressed") } else { m.clone() };
                            let mut v = json!({ "model": model_id });
                            if x != 0 {
                                v["x"] = json!(x);
                            }
                            if y != 0 {
                                v["y"] = json!(y);
                            }
                            if face == "wall" {
                                v["uvlock"] = json!(true);
                            }
                            variants.insert(format!("face={face},facing={facing},powered={powered}"), v);
                        }
                    }
                }
                write_json(&assets.join(format!("blockstates/{id}.json")), &json!({ "variants": variants }))?;
                write_json(&mb(""), &model("minecraft:block/button", &["texture"]))?;
                write_json(&mb("_pressed"), &model("minecraft:block/button_pressed", &["texture"]))?;
                write_json(&mb("_inventory"), &model("minecraft:block/button_inventory", &["texture"]))?;
                item_model = format!("{m}_inventory");
            }
            "pressure_plate" => {
                write_json(
                    &assets.join(format!("blockstates/{id}.json")),
                    &json!({ "variants": { "powered=false": { "model": m }, "powered=true": { "model": format!("{m}_down") } } }),
                )?;
                write_json(&mb(""), &model("minecraft:block/pressure_plate_up", &["texture"]))?;
                write_json(&mb("_down"), &model("minecraft:block/pressure_plate_down", &["texture"]))?;
                item_model = m.clone();
            }
            "block" if b.kind == "lamp" => {
                // Leuchtende Textur: <id>_on.png, sonst die normale
                let on_tex = if texture_path(p, "block", &format!("{}_on", b.id)).exists() { format!("{modid}:block/{}_on", b.id) } else { tex.clone() };
                write_json(
                    &assets.join(format!("blockstates/{id}.json")),
                    &json!({ "variants": { "lit=false": { "model": m }, "lit=true": { "model": format!("{m}_on") } } }),
                )?;
                write_json(&mb(""), &model("minecraft:block/cube_all", &["all"]))?;
                write_json(&mb("_on"), &json!({ "parent": "minecraft:block/cube_all", "textures": { "all": on_tex } }))?;
                item_model = m.clone();
            }
            "block" if is_model(b) => {
                let blockstate = if b.rotate {
                    json!({ "variants": {
                        "facing=north": { "model": m },
                        "facing=east": { "model": m, "y": 90 },
                        "facing=south": { "model": m, "y": 180 },
                        "facing=west": { "model": m, "y": 270 }
                    } })
                } else {
                    json!({ "variants": { "": { "model": m } } })
                };
                write_json(&assets.join(format!("blockstates/{id}.json")), &blockstate)?;
                let own_blocks: Vec<String> = c.blocks.iter().map(|x| x.id.clone()).collect();
                write_json(&mb(""), &cuboid_model(b, &tex, modid, &own_blocks))?;
                item_model = m.clone();
            }
            _ => {
                write_json(&assets.join(format!("blockstates/{id}.json")), &json!({ "variants": { "": { "model": m } } }))?;
                write_json(&mb(""), &model("minecraft:block/cube_all", &["all"]))?;
                item_model = m.clone();
            }
        }
        write_json(&assets.join(format!("models/item/{id}.json")), &json!({ "parent": item_model }))?;
        if client_items {
            write_json(&assets.join(format!("items/{id}.json")), &json!({ "model": { "type": "minecraft:model", "model": item_model } }))?;
        }

        // Loot
        let loot = match v.shape {
            "slab" => loot_slab(&full),
            "block" | "deepslate" if b.ore.enabled => loot_ore(&full, &b.ore),
            _ => loot_self(&full),
        };
        write_json(&data.join(format!("loot_table/blocks/{id}.json")), &loot)?;

        // Rezepte
        let recipe = data.join(format!("recipe/{id}.json"));
        let src = format!("{modid}:{}", b.id);
        match v.shape {
            "block" if b.recipe.enabled => write_json(&recipe, &recipe_json(p, id, &b.recipe))?,
            "stairs" => write_json(&recipe, &shaped_json(p, &full, &["A  ", "AA ", "AAA"], &[("A", &src)], 4))?,
            "slab" => write_json(&recipe, &shaped_json(p, &full, &["AAA"], &[("A", &src)], 6))?,
            "wall" => write_json(&recipe, &shaped_json(p, &full, &["AAA", "AAA"], &[("A", &src)], 6))?,
            "fence" => write_json(&recipe, &shaped_json(p, &full, &["ABA", "ABA"], &[("A", &src), ("B", "minecraft:stick")], 3))?,
            "button" => write_json(&recipe, &json!({ "type": "minecraft:crafting_shapeless", "category": "redstone", "ingredients": [ingredient_json(p, &src)], "result": { "id": full, "count": 1 } }))?,
            "pressure_plate" => write_json(&recipe, &shaped_json(p, &full, &["AA"], &[("A", &src)], 1))?,
            _ => remove_if_exists(recipe),
        }

        // Namen
        let (de, en) = (name_of(&b.name_de, &b.name_en, true), name_of(&b.name_de, &b.name_en, false));
        let (de, en) = match v.shape {
            "deepslate" => (format!("Tiefenschiefer-{de}"), format!("Deepslate {en}")),
            "stairs" => (format!("{de}-Treppe"), format!("{en} Stairs")),
            "slab" => (format!("{de}-Stufe"), format!("{en} Slab")),
            "wall" => (format!("{de}-Mauer"), format!("{en} Wall")),
            "fence" => (format!("{de}-Zaun"), format!("{en} Fence")),
            "button" => (format!("{de}-Knopf"), format!("{en} Button")),
            "pressure_plate" => (format!("{de}-Druckplatte"), format!("{en} Pressure Plate")),
            _ => (de, en),
        };
        lang_de.push((format!("block.{modid}.{id}"), de));
        lang_en.push((format!("block.{modid}.{id}"), en));
        add_x(&b.names, format!("block.{modid}.{id}"), v.shape);
    }

    for b in &c.blocks {
        ensure_texture(p, "block", &b.id)?;
        if b.ore.enabled && b.ore.deepslate && b.ore.dimension == "overworld" {
            // Eigene Tiefenschiefer-Textur, anfangs eine Kopie der Erz-Textur
            let deep = texture_path(p, "block", &format!("deepslate_{}", b.id));
            if !deep.exists() {
                let _ = std::fs::copy(texture_path(p, "block", &b.id), &deep);
            }
        }
        if !b.ore.enabled {
            continue;
        }
        // Weltgenerierung
        let o = &b.ore;
        let ore = format!("{modid}:{}", b.id);
        let targets = match o.dimension.as_str() {
            "nether" => vec![json!({ "target": { "predicate_type": "minecraft:block_match", "block": "minecraft:netherrack" }, "state": { "Name": ore } })],
            "end" => vec![json!({ "target": { "predicate_type": "minecraft:block_match", "block": "minecraft:end_stone" }, "state": { "Name": ore } })],
            _ => {
                let deep = if o.deepslate { format!("{modid}:deepslate_{}", b.id) } else { ore.clone() };
                vec![
                    json!({ "target": { "predicate_type": "minecraft:tag_match", "tag": "minecraft:stone_ore_replaceables" }, "state": { "Name": ore } }),
                    json!({ "target": { "predicate_type": "minecraft:tag_match", "tag": "minecraft:deepslate_ore_replaceables" }, "state": { "Name": deep } }),
                ]
            }
        };
        write_json(
            &data.join(format!("worldgen/configured_feature/{}.json", b.id)),
            &json!({ "type": "minecraft:ore", "config": { "size": o.vein_size.clamp(1, 64), "discard_chance_on_air_exposure": 0.0, "targets": targets } }),
        )?;
        let (lo, hi) = (o.min_y.min(o.max_y).clamp(-64, 320), o.max_y.max(o.min_y).clamp(-64, 320));
        write_json(
            &data.join(format!("worldgen/placed_feature/{}.json", b.id)),
            &json!({
                "feature": ore,
                "placement": [
                    { "type": "minecraft:count", "count": o.veins_per_chunk.clamp(1, 128) },
                    { "type": "minecraft:in_square" },
                    { "type": "minecraft:height_range", "height": { "type": "minecraft:uniform", "min_inclusive": { "absolute": lo }, "max_inclusive": { "absolute": hi } } },
                    { "type": "minecraft:biome" }
                ]
            }),
        )?;
        let biomes = match o.dimension.as_str() {
            "nether" => "#minecraft:is_nether",
            "end" => "#minecraft:is_end",
            _ => "#minecraft:is_overworld",
        };
        write_json(
            &data.join(format!("neoforge/biome_modifier/{}.json", b.id)),
            &json!({ "type": "neoforge:add_features", "biomes": biomes, "features": ore, "step": "underground_ores" }),
        )?;
    }

    for i in &c.items {
        let id = &i.id;
        let parent = if i.kind == "tool" { "minecraft:item/handheld" } else { "minecraft:item/generated" };
        write_json(&assets.join(format!("models/item/{id}.json")), &json!({ "parent": parent, "textures": { "layer0": format!("{modid}:item/{id}") } }))?;
        if client_items {
            write_json(&assets.join(format!("items/{id}.json")), &json!({ "model": { "type": "minecraft:model", "model": format!("{modid}:item/{id}") } }))?;
        }
        ensure_texture(p, "item", id)?;
        let recipe = data.join(format!("recipe/{id}.json"));
        if i.recipe.enabled {
            write_json(&recipe, &recipe_json(p, id, &i.recipe))?;
        } else {
            remove_if_exists(recipe);
        }
        lang_de.push((format!("item.{modid}.{id}"), name_of(&i.name_de, &i.name_en, true)));
        lang_en.push((format!("item.{modid}.{id}"), name_of(&i.name_de, &i.name_en, false)));
        add_x(&i.names, format!("item.{modid}.{id}"), "item");
    }

    // Reparatur-Tags (Werkzeuge je Item, Rüstung je Material); alte entfernen
    let repair_dir = data.join("tags/item");
    let mut repair_keys: Vec<(String, String)> = c.items.iter().filter(|i| i.kind == "tool").map(|i| (i.id.clone(), i.repair_item.trim().to_string())).collect();
    for (mat, pieces) in armor_sets(c) {
        repair_keys.push((mat, pieces[0].repair_item.trim().to_string()));
    }
    if let Ok(entries) = std::fs::read_dir(&repair_dir) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if let Some(key) = name.strip_prefix("repairs_").and_then(|n| n.strip_suffix(".json")) {
                if !repair_keys.iter().any(|(k, _)| k == key) {
                    let _ = std::fs::remove_file(e.path());
                }
            }
        }
    }
    for (key, item) in &repair_keys {
        let values: Vec<Value> = if item.is_empty() { vec![] } else { vec![json!(item)] };
        write_json(&repair_dir.join(format!("repairs_{key}.json")), &json!({ "replace": false, "values": values }))?;
    }

    // Getragene Rüstung: Platzhalter-Texturen und (ab 1.21.4) Equipment-Definition
    for mat in armor_sets(c).keys() {
        let png = armor_placeholder(mat);
        write_if_missing(&texture_path(p, "armor", mat), &png)?;
        write_if_missing(&texture_path(p, "armor_legs", mat), &png)?;
        if api.materials_v2 {
            write_json(
                &assets.join(format!("equipment/{mat}.json")),
                &json!({ "layers": {
                    "humanoid": [{ "texture": format!("{modid}:{mat}") }],
                    "humanoid_leggings": [{ "texture": format!("{modid}:{mat}") }]
                } }),
            )?;
        }
    }

    // Kreaturen
    let mob_ids: Vec<String> = c.mobs.iter().map(|m| m.id.clone()).collect();
    for id in c.generated_mobs.iter().filter(|id| !mob_ids.contains(id)) {
        let egg = format!("{id}_spawn_egg");
        remove_if_exists(assets.join(format!("models/item/{egg}.json")));
        remove_if_exists(assets.join(format!("items/{egg}.json")));
        remove_if_exists(data.join(format!("loot_table/entities/{id}.json")));
        remove_if_exists(data.join(format!("neoforge/biome_modifier/{id}_spawns.json")));
        removed_keys.push(format!("entity.{modid}.{id}"));
        removed_keys.push(format!("item.{modid}.{egg}"));
    }
    for m in &c.mobs {
        let id = &m.id;
        let egg = format!("{id}_spawn_egg");
        let (prim, sec) = (parse_color(&m.egg_primary), parse_color(&m.egg_secondary));
        // Spawn-Ei
        if api.props_tools {
            let tex = texture_path(p, "item", &egg);
            if let Some(parent) = tex.parent() {
                std::fs::create_dir_all(parent).map_err(err)?;
            }
            std::fs::write(&tex, egg_png(prim, sec)).map_err(err)?;
            write_json(&assets.join(format!("models/item/{egg}.json")), &json!({ "parent": "minecraft:item/generated", "textures": { "layer0": format!("{modid}:item/{egg}") } }))?;
            write_json(&assets.join(format!("items/{egg}.json")), &json!({ "model": { "type": "minecraft:model", "model": format!("{modid}:item/{egg}") } }))?;
        } else if client_items {
            remove_if_exists(assets.join(format!("models/item/{egg}.json")));
            write_json(
                &assets.join(format!("items/{egg}.json")),
                &json!({ "model": { "type": "minecraft:model", "model": "minecraft:item/template_spawn_egg", "tints": [
                    { "type": "minecraft:constant", "value": prim as i64 - 0x1000000 },
                    { "type": "minecraft:constant", "value": sec as i64 - 0x1000000 }
                ] } }),
            )?;
        } else {
            write_json(&assets.join(format!("models/item/{egg}.json")), &json!({ "parent": "minecraft:item/template_spawn_egg" }))?;
        }
        // Textur der Kreatur (Platzhalter, bis eine gemalt oder übernommen wird)
        write_if_missing(&texture_path(p, "entity", id), &mob_placeholder(&m.model, prim))?;
        // Beute
        let pools = if m.drop.trim().is_empty() {
            json!([])
        } else {
            json!([{
                "rolls": 1,
                "entries": [{
                    "type": "minecraft:item",
                    "name": m.drop.trim(),
                    "functions": [
                        { "function": "minecraft:set_count", "count": { "type": "minecraft:uniform", "min": m.drop_min.min(64), "max": m.drop_max.max(m.drop_min).min(64) }, "add": false },
                        { "function": "minecraft:enchanted_count_increase", "enchantment": "minecraft:looting", "count": { "type": "minecraft:uniform", "min": 0, "max": 1 } }
                    ]
                }]
            }])
        };
        write_json(&data.join(format!("loot_table/entities/{id}.json")), &json!({ "type": "minecraft:entity", "pools": pools }))?;
        // Natürliches Spawnen
        let modifier = data.join(format!("neoforge/biome_modifier/{id}_spawns.json"));
        if m.spawn {
            let (min, max) = (m.group_min.clamp(1, 16), m.group_max.clamp(1, 16).max(m.group_min.clamp(1, 16)));
            let weight = m.weight.clamp(1, 1000);
            // NeoForge liest Gewicht und Gruppengröße in allen Versionen flach aus einem Objekt
            let spawners = json!({ "type": format!("{modid}:{id}"), "weight": weight, "minCount": min, "maxCount": max });
            write_json(&modifier, &json!({ "type": "neoforge:add_spawns", "biomes": biome_target(&m.biomes), "spawners": spawners }))?;
        } else {
            remove_if_exists(modifier);
        }
        let (de, en) = (name_of(&m.name_de, &m.name_en, true), name_of(&m.name_de, &m.name_en, false));
        lang_de.push((format!("entity.{modid}.{id}"), de.clone()));
        lang_en.push((format!("entity.{modid}.{id}"), en.clone()));
        lang_de.push((format!("item.{modid}.{egg}"), format!("{de}-Spawn-Ei")));
        lang_en.push((format!("item.{modid}.{egg}"), format!("{en} Spawn Egg")));
        add_x(&m.names, format!("entity.{modid}.{id}"), "entity");
        add_x(&m.names, format!("item.{modid}.{egg}"), "egg");
    }

    merge_lang(&assets.join("lang/de_de.json"), &lang_de, &removed_keys)?;
    merge_lang(&assets.join("lang/en_us.json"), &lang_en, &removed_keys)?;
    for (code, file) in EXTRA_LANGS {
        let set = lang_x.remove(code).unwrap_or_default();
        let path = assets.join(format!("lang/{file}.json"));
        if !set.is_empty() || path.exists() {
            merge_lang(&path, &set, &removed_keys)?;
        }
    }

    // Tags (Namensraum minecraft, Minecraft führt sie zusammen)
    let all_ours: Vec<String> = block_ids.iter().chain(c.generated_blocks.iter()).chain(item_ids.iter()).chain(c.generated_items.iter()).map(|id| format!("{modid}:{id}")).collect();
    let btags = res.join("data/minecraft/tags/block");
    let itags = res.join("data/minecraft/tags/item");
    let ids_where = |f: &dyn Fn(&Variant) -> bool| -> Vec<String> { variants.iter().filter(|v| f(v)).map(|v| format!("{modid}:{}", v.id)).collect() };
    for tool in ["pickaxe", "axe", "shovel", "hoe"] {
        merge_tag(&btags.join(format!("mineable/{tool}.json")), &ids_where(&|v| v.base.tool == tool), &all_ours)?;
    }
    for tier in ["stone", "iron", "diamond"] {
        merge_tag(&btags.join(format!("needs_{tier}_tool.json")), &ids_where(&|v| v.base.tool != "none" && v.base.tier == tier), &all_ours)?;
    }
    for (shape, tag) in [("stairs", "stairs"), ("slab", "slabs"), ("wall", "walls"), ("button", "buttons")] {
        let ours = ids_where(&|v| v.shape == shape);
        merge_tag(&btags.join(format!("{tag}.json")), &ours, &all_ours)?;
        merge_tag(&itags.join(format!("{tag}.json")), &ours, &all_ours)?;
    }
    let wooden = ids_where(&|v| v.shape == "fence" && v.base.material == "wood");
    let other_fences = ids_where(&|v| v.shape == "fence" && v.base.material != "wood");
    merge_tag(&btags.join("wooden_fences.json"), &wooden, &all_ours)?;
    merge_tag(&itags.join("wooden_fences.json"), &wooden, &all_ours)?;
    merge_tag(&btags.join("fences.json"), &other_fences, &all_ours)?;
    merge_tag(&itags.join("fences.json"), &other_fences, &all_ours)?;
    let ores = ids_where(&|v| v.base.ore.enabled && matches!(v.shape, "block" | "deepslate"));
    merge_tag(&res.join("data/c/tags/block/ores.json"), &ores, &all_ours)?;
    merge_tag(&res.join("data/c/tags/item/ores.json"), &ores, &all_ours)?;
    let item_ids_where = |f: &dyn Fn(&ItemDef) -> bool| -> Vec<String> { c.items.iter().filter(|i| f(i)).map(|i| format!("{modid}:{}", i.id)).collect() };
    for (t, tag) in [("sword", "swords"), ("pickaxe", "pickaxes"), ("axe", "axes"), ("shovel", "shovels"), ("hoe", "hoes")] {
        merge_tag(&itags.join(format!("{tag}.json")), &item_ids_where(&|i| i.kind == "tool" && i.tool_type == t), &all_ours)?;
    }
    for (slot, tag) in [("helmet", "head_armor"), ("chestplate", "chest_armor"), ("leggings", "leg_armor"), ("boots", "foot_armor")] {
        merge_tag(&itags.join(format!("{tag}.json")), &item_ids_where(&|i| i.kind == "armor" && i.armor_slot == slot), &all_ours)?;
    }

    // Dimensionen
    let dim_ids: Vec<String> = c.dimensions.iter().filter(|d| valid_id(&d.id)).map(|d| d.id.clone()).collect();
    for id in c.generated_dims.iter().filter(|id| !dim_ids.contains(id)) {
        remove_if_exists(data.join(format!("dimension_type/{id}.json")));
        remove_if_exists(data.join(format!("worldgen/noise_settings/{id}.json")));
        remove_if_exists(data.join(format!("dimension/{id}.json")));
    }
    {
        let own_blocks: Vec<String> = variants.iter().map(|v| v.id.clone()).collect();
        let resolve = |s: &str| -> String {
            if let Some(dim) = s.strip_prefix('#') {
                format!("{modid}:{dim}")
            } else if s.contains(':') {
                s.to_string()
            } else if own_blocks.iter().any(|b| b == s) {
                format!("{modid}:{s}")
            } else {
                format!("minecraft:{s}")
            }
        };
        let at_least = |v: (u32, u32, u32)| mc_at_least(&p.mc_version, v);
        for d in c.dimensions.iter().filter(|d| valid_id(&d.id)) {
            for (rel, v) in crate::dimension::files(d, &at_least, &resolve) {
                let path = data.join(rel);
                if let Some(parent) = path.parent() {
                    std::fs::create_dir_all(parent).map_err(err)?;
                }
                write_json(&path, &v)?;
            }
        }
    }

    c.generated_blocks = block_ids;
    c.generated_items = item_ids;
    c.generated_mobs = mob_ids;
    c.generated_dims = dim_ids;
    c.generator_version = GENERATOR_VERSION;
    save_file(p, c)?;
    LAST_JAVA_CHANGED.store(java_changed, std::sync::atomic::Ordering::SeqCst);
    Ok(registration)
}

/// Ob beim letzten Erzeugen der Java-Code geändert wurde (dann ist ein Neustart nötig)
static LAST_JAVA_CHANGED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(true);

/// Kleiner Helfer in der Mod: lädt Texturen, Namen, Rezepte usw. im laufenden Spiel neu,
/// sobald Anvil Studio die Datei `.anvil-reload` im Spielordner aktualisiert.
fn write_dev_reload(p: &Project, java: &Path) -> Result<(), String> {
    let pkg = &p.package;
    let common = format!(
        r#"// AUTOMATISCH ERZEUGT von Anvil Studio – Schnelles Testen (Neu laden ohne Neustart).
package {pkg}.anvil;

import java.nio.file.Files;
import java.nio.file.Path;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.tick.ServerTickEvent;

/** Nur aktiv, wenn Anvil Studio die Datei .anvil-reload schreibt – im normalen Spiel passiert nichts. */
public final class AnvilDevReload {{
    static final Path MARKER = Path.of(".anvil-reload");
    private static long last = -1;
    private static int ticks;

    private AnvilDevReload() {{}}

    static long stamp() {{
        try {{
            return Files.exists(MARKER) ? Files.getLastModifiedTime(MARKER).toMillis() : 0;
        }} catch (Exception e) {{
            return 0;
        }}
    }}

    public static void init() {{
        NeoForge.EVENT_BUS.addListener(AnvilDevReload::onServerTick);
        try {{
            Class.forName("net.minecraft.client.Minecraft");
            Class.forName("{pkg}.anvil.AnvilDevReloadClient").getMethod("init").invoke(null);
        }} catch (Throwable ignored) {{
            // Server ohne Client-Klassen
        }}
    }}

    private static void onServerTick(ServerTickEvent.Post event) {{
        if (++ticks % 20 != 0) return;
        long now = stamp();
        if (last < 0) {{
            last = now;
            return;
        }}
        if (now == last) return;
        last = now;
        MinecraftServer server = event.getServer();
        server.getCommands().performPrefixedCommand(server.createCommandSourceStack().withSuppressedOutput(), "reload");
        server.getPlayerList().broadcastSystemMessage(Component.literal("\u00a7a[Anvil Studio]\u00a7r Rezepte, Loot und Daten neu geladen"), false);
    }}
}}
"#
    );
    let client = format!(
        r#"// AUTOMATISCH ERZEUGT von Anvil Studio – Schnelles Testen (nur Client).
package {pkg}.anvil;

import net.minecraft.client.Minecraft;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.common.NeoForge;

public final class AnvilDevReloadClient {{
    private static long last = -1;
    private static int ticks;

    private AnvilDevReloadClient() {{}}

    public static void init() {{
        NeoForge.EVENT_BUS.addListener(AnvilDevReloadClient::onClientTick);
    }}

    private static void onClientTick(ClientTickEvent.Post event) {{
        if (++ticks % 20 != 0) return;
        long now = AnvilDevReload.stamp();
        if (last < 0) {{
            last = now;
            return;
        }}
        if (now == last) return;
        last = now;
        Minecraft.getInstance().reloadResourcePacks();
    }}
}}
"#
    );
    std::fs::write(java.with_file_name("AnvilDevReload.java"), common).map_err(err)?;
    std::fs::write(java.with_file_name("AnvilDevReloadClient.java"), client).map_err(err)?;
    Ok(())
}

/// Geänderte Texturen, Modelle, Namen, Rezepte und Loot ins laufende Spiel bringen.
/// Rückgabe: Anzahl kopierter Dateien.
#[tauri::command]
pub fn content_hot_reload(app: AppHandle, project_id: String) -> Result<usize, String> {
    let p = crate::projects::get(&app, &project_id)?;
    let src = root(&p).join("src/main/resources");
    let dst = root(&p).join("build/resources/main");
    let mut copied = 0;
    for sub in ["assets", "data"] {
        let from = src.join(sub);
        if !from.exists() {
            continue;
        }
        for e in walkdir::WalkDir::new(&from).into_iter().flatten() {
            if !e.file_type().is_file() {
                continue;
            }
            let rel = e.path().strip_prefix(&src).map_err(err)?;
            let target = dst.join(rel);
            let same = std::fs::metadata(&target).ok().map(|m| m.len()) == e.metadata().ok().map(|m| m.len())
                && std::fs::read(&target).ok() == std::fs::read(e.path()).ok();
            if same {
                continue;
            }
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(err)?;
            }
            std::fs::copy(e.path(), &target).map_err(err)?;
            copied += 1;
        }
    }
    // Spielordner benachrichtigen
    let mut dirs = vec![root(&p).join("run")];
    if let Ok(entries) = std::fs::read_dir(root(&p).join("runs")) {
        dirs.extend(entries.flatten().map(|e| e.path()));
    }
    let stamp = crate::util::now().to_string();
    for d in dirs.into_iter().filter(|d| d.is_dir()) {
        let _ = std::fs::write(d.join(".anvil-reload"), &stamp);
    }
    Ok(copied)
}

// ---- Befehle -------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    content: Content,
    /// Java-Code geändert → Neustart nötig, sonst reicht Neu laden
    java_changed: bool,
    /// "ok" | "added" | Anleitung
    registration: String,
}

#[tauri::command]
pub fn content_load(app: AppHandle, project_id: String) -> Result<Content, String> {
    let p = crate::projects::get(&app, &project_id)?;
    Ok(load(&p)?.0)
}

#[tauri::command]
pub fn content_save(app: AppHandle, project_id: String, content: Content) -> Result<SaveResult, String> {
    let p = crate::projects::get(&app, &project_id)?;
    // Bisher erzeugte IDs aus der Datei übernehmen (nicht aus der Oberfläche)
    let (old, _) = load(&p)?;
    let mut c = content;
    c.generated_blocks = old.generated_blocks;
    c.generated_items = old.generated_items;
    c.generated_mobs = old.generated_mobs;
    c.generated_dims = old.generated_dims;
    let registration = generate(&p, &mut c)?;
    let java_changed = LAST_JAVA_CHANGED.load(std::sync::atomic::Ordering::SeqCst);
    Ok(SaveResult { content: c, registration, java_changed })
}

fn check_kind(kind: &str, id: &str) -> Result<(), String> {
    if !matches!(kind, "block" | "item" | "armor" | "armor_legs" | "entity") || !valid_id(id) {
        return Err("Ungültige Textur".into());
    }
    Ok(())
}

#[tauri::command]
pub fn texture_get(app: AppHandle, project_id: String, kind: String, id: String) -> Result<Option<String>, String> {
    check_kind(&kind, &id)?;
    let p = crate::projects::get(&app, &project_id)?;
    let path = texture_path(&p, &kind, &id);
    if !path.exists() {
        return Ok(None);
    }
    Ok(Some(base64::engine::general_purpose::STANDARD.encode(std::fs::read(path).map_err(err)?)))
}

#[tauri::command]
pub fn texture_save(app: AppHandle, project_id: String, kind: String, id: String, png_base64: String) -> Result<(), String> {
    check_kind(&kind, &id)?;
    let p = crate::projects::get(&app, &project_id)?;
    let b64 = png_base64.split_once(',').map(|(_, b)| b).unwrap_or(&png_base64);
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64.trim()).map_err(err)?;
    if bytes.len() > 1024 * 1024 || !bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Err("Keine gültige PNG-Datei".into());
    }
    let path = texture_path(&p, &kind, &id);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(err)?;
    }
    std::fs::write(path, bytes).map_err(err)
}

/// Beim Öffnen eines Projekts: Formate migrieren und bei neuen Vorlagen neu erzeugen.
/// Gibt Hinweise für die Oberfläche zurück.
#[tauri::command]
pub fn project_open(app: AppHandle, project_id: String) -> Result<Vec<String>, String> {
    let p = crate::projects::get(&app, &project_id)?;
    let mut notes = vec![];
    let (mut c, migrated) = load(&p)?;
    if migrated {
        notes.push("Die Projektdaten wurden auf das neue Format umgestellt (Sicherung in .anvil/backups).".to_string());
    }
    let has_content = !c.blocks.is_empty() || !c.items.is_empty() || !c.mobs.is_empty();
    if has_content && (migrated || c.generator_version < GENERATOR_VERSION) {
        let file = content_file(&p);
        if file.exists() {
            backup(&p, &file, "content-before-regenerate");
        }
        generate(&p, &mut c)?;
        notes.push("Blöcke & Items wurden mit den Vorlagen dieser Anvil-Studio-Version neu erzeugt.".to_string());
    } else if migrated {
        save_file(&p, &c)?;
    }
    Ok(notes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project(dir: &Path, mc: &str) -> Project {
        Project {
            id: "t".into(),
            name: "Test Mod".into(),
            mod_id: "testmod".into(),
            package: "de.test.testmod".into(),
            mc_version: mc.into(),
            loader: "neoforge".into(),
            path: dir.to_string_lossy().to_string(),
            created_at: 0,
            last_run: None,
        }
    }

    #[test]
    fn versions() {
        assert!(mc_at_least("1.21.4", (1, 21, 4)));
        assert!(mc_at_least("1.21.10", (1, 21, 4)));
        assert!(!mc_at_least("1.21.1", (1, 21, 2)));
    }

    #[test]
    fn recipes_follow_version() {
        let dir = std::env::temp_dir();
        let mut r = Recipe { enabled: true, shaped: true, grid: vec![String::new(); 9], count: 2, ..Default::default() };
        r.grid[4] = "minecraft:diamond".into();
        r.grid[7] = "#minecraft:planks".into();
        let old = recipe_json(&project(&dir, "1.21.1"), "ruby", &r);
        assert_eq!(old["pattern"], json!(["A", "B"]));
        assert_eq!(old["key"]["A"], json!({ "item": "minecraft:diamond" }));
        assert_eq!(old["key"]["B"], json!({ "tag": "minecraft:planks" }));
        let new = recipe_json(&project(&dir, "1.21.4"), "ruby", &r);
        assert_eq!(new["key"]["A"], json!("minecraft:diamond"));
        assert_eq!(new["result"], json!({ "id": "testmod:ruby", "count": 2 }));
        let mut s = Recipe { enabled: true, kind: "smelting".into(), grid: vec![String::new(); 9], ..Default::default() };
        s.grid[4] = "minecraft:raw_iron".into();
        let old = recipe_json(&project(&dir, "1.21.1"), "ruby", &s);
        assert_eq!(old["ingredient"], json!({ "item": "minecraft:raw_iron" }));
        assert_eq!(old["cookingtime"], json!(200));
        let new = recipe_json(&project(&dir, "1.21.4"), "ruby", &s);
        assert_eq!(new["ingredient"], json!("minecraft:raw_iron"));
    }

    /// Erzeugt Inhalte in ein entpacktes MDK (ANVIL_TEST_PROJECT=Ordner, vorher kopiert).
    #[test]
    fn generate_into_mdk() {
        let Ok(dir) = std::env::var("ANVIL_TEST_PROJECT") else { return };
        let dir = PathBuf::from(dir);
        let mc = std::env::var("ANVIL_TEST_MC").unwrap_or("1.21.1".into());
        let mut p = project(&dir, &mc);
        p.mod_id = std::env::var("ANVIL_TEST_MODID").unwrap_or("kristallhoehlen".into());
        p.package = std::env::var("ANVIL_TEST_PACKAGE").unwrap_or("de.sebigames.kristallhoehlen".into());
        let mut c = Content::default();
        c.blocks.push(BlockDef { id: "ruby_block".into(), name_de: "Rubinblock".into(), light: 7, tier: "iron".into(), ..Default::default() });
        c.blocks.push(BlockDef { id: "dream_glass".into(), name_de: "Traumglas".into(), material: "glass".into(), tool: "none".into(), ..Default::default() });
        let mut recipe = Recipe { enabled: true, shaped: true, grid: vec![String::new(); 9], count: 1, ..Default::default() };
        for i in 0..9 {
            recipe.grid[i] = format!("{}:ruby", p.mod_id);
        }
        c.blocks[0].recipe = recipe;
        c.items.push(ItemDef { id: "ruby".into(), name_de: "Rubin".into(), rarity: "rare".into(), ..Default::default() });
        let mut smelt = Recipe { enabled: true, kind: "smelting".into(), grid: vec![String::new(); 9], ..Default::default() };
        smelt.grid[0] = "minecraft:sweet_berries".into();
        c.items.push(ItemDef { id: "dream_berry".into(), name_de: "Traumbeere".into(), food: true, recipe: smelt, ..Default::default() });
        // Formen, Erz mit Weltgenerierung, Werkzeuge und Rüstung
        c.blocks[0].shapes = vec!["stairs".into(), "slab".into(), "wall".into(), "fence".into()];
        c.blocks.push(BlockDef {
            id: "ruby_ore".into(),
            name_de: "Rubinerz".into(),
            hardness: 3.0,
            tier: "iron".into(),
            ore: OreDef { enabled: true, drop: format!("{}:ruby", p.mod_id), xp_min: 3, xp_max: 7, ..Default::default() },
            ..Default::default()
        });
        c.blocks.push(BlockDef { id: "nether_ruby_ore".into(), ore: OreDef { enabled: true, dimension: "nether".into(), ..Default::default() }, ..Default::default() });
        for (t, dmg, spd) in [("sword", 7.0, 1.6), ("pickaxe", 5.0, 1.2), ("axe", 9.0, 1.0), ("shovel", 5.5, 1.0), ("hoe", 1.0, 4.0)] {
            c.items.push(ItemDef {
                id: format!("ruby_{t}"),
                kind: "tool".into(),
                tool_type: t.into(),
                attack_damage: dmg,
                attack_speed: spd,
                repair_item: format!("{}:ruby", p.mod_id),
                ..Default::default()
            });
        }
        for (slot, def) in [("helmet", 3), ("chestplate", 8), ("leggings", 6), ("boots", 3)] {
            c.items.push(ItemDef {
                id: format!("ruby_{slot}"),
                kind: "armor".into(),
                armor_slot: slot.into(),
                armor_material: "ruby".into(),
                defense: def,
                durability: 25,
                toughness: 1.0,
                repair_item: format!("{}:ruby", p.mod_id),
                ..Default::default()
            });
        }
        c.tab_icon = "ruby_sword".into();
        // Redstone, Lager, Rezeptarten, Brauen, Ereignisse, weitere Sprachen
        c.blocks[0].shapes.extend(["button".to_string(), "pressure_plate".to_string()]);
        c.blocks[0].names.insert("fr".into(), "Cristal".into());
        c.blocks.push(BlockDef { id: "crystal_lamp".into(), kind: "lamp".into(), ..Default::default() });
        let cub = |f: [f32; 3], t: [f32; 3], tex: &str| Cuboid { from: f, to: t, tex: tex.into() };
        c.blocks.push(BlockDef {
            id: "ruby_table".into(),
            material: "wood".into(),
            model: vec![cub([0.0, 13.0, 0.0], [16.0, 16.0, 16.0], ""), cub([1.0, 0.0, 1.0], [3.0, 13.0, 3.0], "minecraft:oak_planks"), cub([13.0, 0.0, 13.0], [15.0, 13.0, 15.0], "ruby_block")],
            rotate: true,
            ..Default::default()
        });
        c.blocks.push(BlockDef { id: "ruby_pillar".into(), model: vec![cub([12.0, 0.0, 4.0], [4.0, 16.0, 12.0], "")], ..Default::default() });
        c.blocks.push(BlockDef { id: "crystal_chest".into(), kind: "storage".into(), rows: 6, material: "wood".into(), tool: "axe".into(), ..Default::default() });
        // Werkbank und Maschine mit eigenen Rezepten
        let m = p.mod_id.clone();
        let mut wb_grid = vec![String::new(); 9];
        wb_grid[0] = format!("{m}:ruby");
        wb_grid[4] = "#minecraft:planks".into();
        c.blocks.push(BlockDef {
            id: "ruby_workbench".into(),
            kind: "workbench".into(),
            material: "wood".into(),
            tool: "axe".into(),
            workbench_recipes: vec![
                WorkbenchRecipe { shaped: true, grid: wb_grid.clone(), result: format!("{m}:dream_glass"), count: 2 },
                WorkbenchRecipe { shaped: false, grid: wb_grid, result: "minecraft:diamond".into(), count: 1 },
            ],
            ..Default::default()
        });
        c.blocks.push(BlockDef {
            id: "ruby_press".into(),
            kind: "machine".into(),
            material: "metal".into(),
            machine: MachineDef {
                fuel: true,
                recipes: vec![MachineRecipe { input: format!("{m}:ruby"), input_count: 2, output: format!("{m}:ruby_block"), output_count: 1, time: 100 }],
            },
            ..Default::default()
        });
        c.blocks.push(BlockDef {
            id: "ruby_grinder".into(),
            kind: "machine".into(),
            machine: MachineDef { fuel: false, recipes: vec![MachineRecipe { input: "#minecraft:logs".into(), output: "minecraft:stick".into(), output_count: 8, ..Default::default() }] },
            ..Default::default()
        });
        for (kind, id) in [("blasting", "blast_gem"), ("smoking", "smoked_gem"), ("campfire", "camp_gem"), ("stonecutting", "cut_gem"), ("smithing", "smith_gem")] {
            let mut r = Recipe { enabled: true, kind: kind.into(), grid: vec![String::new(); 9], ..Default::default() };
            r.grid[0] = "minecraft:netherite_upgrade_smithing_template".into();
            r.grid[1] = "minecraft:diamond".into();
            r.grid[2] = "minecraft:netherite_ingot".into();
            if kind != "smithing" {
                r.grid[0] = "minecraft:cobblestone".into();
            }
            c.items.push(ItemDef { id: id.into(), recipe: r, ..Default::default() });
        }
        c.brewing.push(BrewDef { input: "awkward".into(), ingredient: format!("{}:ruby", p.mod_id), output: "swiftness".into() });
        let act = |kind: &str, value: &str, amount: f32| ActionDef { kind: kind.into(), value: value.into(), amount, duration: 5, to: "player".into() };
        let all = vec![
            act("effect", "minecraft:speed", 2.0),
            act("give_item", "minecraft:diamond", 1.0),
            act("message", "Hallo \"Welt\"", 0.0),
            act("sound", "minecraft:entity.experience_orb.pickup", 0.0),
            act("explode", "", 1.0),
            act("fire", "", 0.0),
            act("xp", "", 5.0),
            act("heal", "", 4.0),
            act("launch", "", 2.0),
        ];
        for (trigger, target) in [
            ("right_click_block", "crystal_lamp"),
            ("right_click_item", "ruby"),
            ("break_block", "ruby_block"),
            ("place_block", "ruby_block"),
            ("use_item", "dream_berry"),
            ("entity_hurt", "crystal_cow"),
            ("entity_killed", "crystal_zombie"),
        ] {
            c.events.push(EventDef { trigger: trigger.into(), target: target.into(), cancel: trigger == "break_block", actions: all.clone() });
        }
        // Eigene Dimensionen
        c.dimensions.push(crate::dimension::DimDef {
            id: "traumland".into(),
            name_de: "Traumland".into(),
            name_en: "Dreamland".into(),
            top_block: "ruby_block".into(),
            fill_block: "minecraft:clay".into(),
            stone_block: "ruby_ore".into(),
            fluid: "water".into(),
            biome: "overworld".into(),
            time: "normal".into(),
            sky: "overworld".into(),
            ambient_light: 0.1,
            sea_level: 63,
        });
        c.dimensions.push(crate::dimension::DimDef { id: "lavawelt".into(), top_block: "#minecraft:soul_fire_base_blocks".into(), fluid: "lava".into(), biome: "minecraft:desert".into(), time: "night".into(), sky: "nether".into(), sea_level: 40, ..Default::default() });
        // Blueprint mit allen Knoten
        {
            use crate::blueprint::{BpLink, BpNode, Blueprint, EVENT_KINDS};
            let node = |id: &str, kind: &str, props: &[(&str, &str)]| BpNode {
                id: id.into(),
                kind: kind.into(),
                x: 0.0,
                y: 0.0,
                props: props.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
            };
            let link = |a: &str, o: &str, b: &str| BpLink { from: a.into(), out: o.into(), to: b.into() };
            let actions: Vec<(&str, Vec<(&str, &str)>)> = vec![
                ("message", vec![("text", "Hallo {player} \"!\""), ("to", "all")]),
                ("message", vec![("text", "Nur du")]),
                ("actionbar", vec![("text", "Aktionsleiste")]),
                ("title", vec![("text", "Willkommen \"hier\"")]),
                ("command", vec![("command", "/say hi")]),
                ("weather", vec![("weather", "thunder"), ("seconds", "60")]),
                ("time", vec![("time", "night")]),
                ("summon", vec![("entity", "crystal_cow"), ("count", "2")]),
                ("lightning", vec![]),
                ("setblock", vec![("block", "ruby_block"), ("dy", "-1")]),
                ("particle", vec![("particle", "minecraft:flame"), ("count", "30")]),
                ("teleport", vec![("dy", "5")]),
                ("give", vec![("item", "ruby"), ("count", "3")]),
                ("effect", vec![("effect", "speed"), ("seconds", "5"), ("level", "2")]),
                ("clear_effects", vec![]),
                ("sound", vec![("sound", "minecraft:entity.player.levelup")]),
                ("explode", vec![("power", "1.5")]),
                ("fire", vec![("seconds", "3"), ("who", "target")]),
                ("heal", vec![("amount", "4")]),
                ("damage", vec![("amount", "1"), ("who", "target")]),
                ("launch", vec![("strength", "2")]),
                ("xp", vec![("amount", "5")]),
                ("gamemode", vec![("mode", "adventure")]),
                ("difficulty", vec![("difficulty", "hard")]),
                ("clear_inventory", vec![]),
                ("kill", vec![("who", "target")]),
                ("title", vec![("text", "Alle"), ("subtitle", "Untertitel"), ("to", "all")]),
                ("var_set", vec![("var", "Punkte"), ("op", "add"), ("value", "2")]),
                ("var_set", vec![("var", "runde"), ("scope", "global"), ("op", "random"), ("value", "10")]),
                ("var_show", vec![("var", "Punkte")]),
                ("var_hide", vec![]),
                ("message", vec![("text", "Du hast {var:punkte} Punkte, Runde {global:runde} {unbekannt}")]),
                ("remove_item", vec![("item", "ruby"), ("count", "2")]),
                ("drop_item", vec![("item", "minecraft:apple"), ("count", "3")]),
                ("fill", vec![("block", "minecraft:glass"), ("radius", "2"), ("dy", "-1"), ("height", "1")]),
                ("bossbar", vec![("text", "Boss \"X\""), ("color", "red"), ("progress", "40"), ("seconds", "5"), ("to", "all")]),
                ("firework", vec![]),
                ("spawnpoint", vec![]),
                ("feed", vec![]),
                ("enchant", vec![("enchant", "sharpness"), ("level", "2")]),
                ("travel", vec![("dim", "traumland"), ("mode", "toggle")]),
            ];
            let conds = [
                ("chance", "30"), ("sneaking", ""), ("raining", ""), ("thundering", ""), ("day", ""), ("night", ""), ("creative", ""),
                ("holding", "ruby"), ("health_below", "5"), ("dimension", "nether"), ("block_below", "stone"), ("message_contains", "hallo"),
                ("var", "3"), ("has_item", "ruby"), ("level_at_least", "5"), ("in_water", ""), ("on_fire", ""), ("is_player_target", ""),
            ];
            let mut nodes = vec![];
            let mut links = vec![];
            for (ei, ev) in EVENT_KINDS.iter().enumerate() {
                let target = match *ev {
                    "ev_click_block" | "ev_break" | "ev_place" | "ev_left_click_block" => "ruby_block",
                    "ev_click_item" | "ev_use" | "ev_craft" | "ev_pickup" => "ruby",
                    "ev_click_entity" => "minecraft:cow",
                    "ev_hurt" | "ev_kill" => "minecraft:zombie",
                    _ => "",
                };
                let e = format!("e{ei}");
                nodes.push(node(&e, ev, &[("target", target), ("seconds", "30")]));
                let (cond, val) = conds[ei % conds.len()];
                let iff = format!("if{ei}");
                nodes.push(node(&iff, "if", &[("cond", cond), ("value", val), ("var", "punkte"), ("cmp", "ge")]));
                links.push(link(&e, "next", &iff));
                let cancel = format!("c{ei}");
                nodes.push(node(&cancel, "cancel", &[]));
                links.push(link(&iff, "false", &cancel));
                let rep = format!("r{ei}");
                nodes.push(node(&rep, "repeat", &[("times", "2")]));
                links.push(link(&iff, "true", &rep));
                let del = format!("d{ei}");
                nodes.push(node(&del, "delay", &[("seconds", "1.5")]));
                links.push(link(&rep, "done", &del));
                let mut prev = (rep.clone(), "body".to_string());
                for (ai, (kind, props)) in actions.iter().enumerate() {
                    if ai == actions.len() / 2 {
                        prev = (del.clone(), "next".to_string());
                    }
                    let id = format!("a{ei}_{ai}");
                    nodes.push(node(&id, kind, props));
                    links.push(link(&prev.0, &prev.1, &id));
                    prev = (id, "next".into());
                }
            }
            c.blueprints.push(Blueprint { name: "Alles".into(), enabled: true, nodes, links });
        }
        for (i, model) in ["cow", "pig", "chicken", "zombie", "spider", "creeper"].iter().enumerate() {
            c.mobs.push(MobDef {
                id: format!("crystal_{model}"),
                name_de: format!("Kristall-{model}"),
                model: model.to_string(),
                drop: if i % 2 == 0 { format!("{}:ruby", p.mod_id) } else { String::new() },
                biomes: ["plains", "forest", "overworld", "desert", "nether", "snowy"][i].into(),
                spawn: i != 5,
                ..Default::default()
            });
        }
        let reg = generate(&p, &mut c).unwrap();
        println!("{}", std::fs::read_to_string(dir.join("src/main/java").join(p.package.replace('.', "/")).join("anvil/AnvilContent.java")).unwrap());
        assert!(reg == "added" || reg == "ok", "{reg}");
        // Zweiter Lauf ohne Glas: Aufräumen prüfen
        c.blocks.retain(|b| b.id != "dream_glass");
        generate(&p, &mut c).unwrap();
        assert!(!dir.join(format!("src/main/resources/assets/{}/blockstates/dream_glass.json", p.mod_id)).exists());
        assert_eq!(generate(&p, &mut c).unwrap(), "ok");
    }

    #[test]
    fn stairs_states_complete() {
        let v = stairs_blockstate("m:block/s");
        assert_eq!(v["variants"].as_object().unwrap().len(), 40);
        assert_eq!(v["variants"]["facing=east,half=bottom,shape=inner_left"]["y"], json!(270));
        assert_eq!(v["variants"]["facing=east,half=top,shape=outer_right"]["y"], json!(90));
        assert_eq!(v["variants"]["facing=north,half=bottom,shape=straight"]["y"], json!(270));
    }

    #[test]
    fn png_is_valid() {
        let png = armor_placeholder("ruby");
        assert!(png.starts_with(&[0x89, b'P', b'N', b'G']));
        assert!(png.len() > 50);
    }
}
