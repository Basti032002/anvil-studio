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

pub const CONTENT_SCHEMA: u32 = 1;
/// Bei Änderungen an den Vorlagen hochzählen → Projekte werden neu erzeugt.
pub const GENERATOR_VERSION: u32 = 1;

const PLACEHOLDER_PNG: &str = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALklEQVR42mP8wfDjPwMewMHAgU+agYmBQjBqwGAwgJGBgQFvOvjB8GM0EIe/AQAVpgYNJPiOmAAAAABJRU5ErkJggg==";

// ---- Datenmodell -------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Recipe {
    pub enabled: bool,
    /// "crafting" | "smelting"
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
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct ItemDef {
    pub id: String,
    pub name_de: String,
    pub name_en: String,
    pub stack_size: u32,
    /// common | uncommon | rare | epic
    pub rarity: String,
    pub food: bool,
    pub nutrition: u32,
    pub saturation: f32,
    pub recipe: Recipe,
}

impl Default for ItemDef {
    fn default() -> Self {
        Self {
            id: String::new(),
            name_de: String::new(),
            name_en: String::new(),
            stack_size: 64,
            rarity: "common".into(),
            food: false,
            nutrition: 4,
            saturation: 0.3,
            recipe: Recipe::default(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Content {
    pub schema_version: u32,
    pub generator_version: u32,
    pub blocks: Vec<BlockDef>,
    pub items: Vec<ItemDef>,
    /// Zuletzt erzeugte IDs – zum Aufräumen gelöschter Einträge
    pub generated_blocks: Vec<String>,
    pub generated_items: Vec<String>,
}

impl Default for Content {
    fn default() -> Self {
        Self {
            schema_version: CONTENT_SCHEMA,
            generator_version: 0,
            blocks: vec![],
            items: vec![],
            generated_blocks: vec![],
            generated_items: vec![],
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
    // Künftige Migrationen hier anhängen: if version < 2 { … }
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

fn save_file(p: &Project, c: &Content) -> Result<(), String> {
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

fn generate_java(p: &Project, c: &Content) -> String {
    let modid = &p.mod_id;
    let mut fields = String::new();
    let mut tab = String::new();
    for b in &c.blocks {
        let (sound, color) = sound_and_color(&b.material);
        let mut props = format!(
            "BlockBehaviour.Properties.of().mapColor(MapColor.{color}).strength({}, {}).sound(SoundType.{sound})",
            java_float(b.hardness.max(0.0)),
            java_float(b.resistance.max(0.0))
        );
        if b.light > 0 {
            props.push_str(&format!(".lightLevel(state -> {})", b.light.min(15)));
        }
        if b.tool != "none" {
            props.push_str(".requiresCorrectToolForDrops()");
        }
        if b.material == "glass" {
            props.push_str(".noOcclusion()");
        }
        let k = b.id.to_uppercase();
        fields.push_str(&format!(
            "    public static final DeferredBlock<Block> {k} = BLOCKS.registerSimpleBlock(\"{id}\", {props});\n    public static final DeferredItem<BlockItem> {k}_ITEM = ITEMS.registerSimpleBlockItem(\"{id}\", {k});\n\n",
            id = b.id
        ));
        tab.push_str(&format!("                output.accept({k}_ITEM.get());\n"));
    }
    for i in &c.items {
        let mut props = format!("new Item.Properties().stacksTo({})", i.stack_size.clamp(1, 99));
        if i.rarity != "common" {
            props.push_str(&format!(".rarity(Rarity.{})", i.rarity.to_uppercase()));
        }
        if i.food {
            props.push_str(&format!(
                ".food(new FoodProperties.Builder().nutrition({}).saturationModifier({}).build())",
                i.nutrition.min(20),
                java_float(i.saturation.max(0.0))
            ));
        }
        let k = i.id.to_uppercase();
        fields.push_str(&format!("    public static final DeferredItem<Item> {k} = ITEMS.registerSimpleItem(\"{id}\", {props});\n\n", id = i.id));
        tab.push_str(&format!("                output.accept({k}.get());\n"));
    }
    let icon = c
        .items
        .first()
        .map(|i| i.id.to_uppercase())
        .or_else(|| c.blocks.first().map(|b| format!("{}_ITEM", b.id.to_uppercase())));
    let tab_def = match icon {
        Some(icon) => format!(
            "    public static final DeferredHolder<CreativeModeTab, CreativeModeTab> TAB = TABS.register(\"anvil_tab\", () -> CreativeModeTab.builder()\n            .title(Component.translatable(\"itemGroup.{modid}.anvil\"))\n            .icon(() -> {icon}.get().getDefaultInstance())\n            .displayItems((parameters, output) -> {{\n{tab}            }})\n            .build());\n\n"
        ),
        None => String::new(),
    };

    format!(
        r#"// =============================================================================
// AUTOMATISCH ERZEUGT von Anvil Studio – Änderungen in dieser Datei werden beim
// nächsten Speichern im Inhalte-Editor überschrieben. Eigenen Code bitte in
// andere Klassen schreiben.
// =============================================================================
package {pkg}.anvil;

import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.MapColor;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredBlock;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredItem;
import net.neoforged.neoforge.registries.DeferredRegister;

@SuppressWarnings("unused")
public final class AnvilContent {{
    public static final String MODID = "{modid}";

    public static final DeferredRegister.Blocks BLOCKS = DeferredRegister.createBlocks(MODID);
    public static final DeferredRegister.Items ITEMS = DeferredRegister.createItems(MODID);
    public static final DeferredRegister<CreativeModeTab> TABS = DeferredRegister.create(Registries.CREATIVE_MODE_TAB, MODID);

{fields}{tab_def}    private AnvilContent() {{}}

    /** Wird aus der Hauptklasse der Mod aufgerufen. */
    public static void register(IEventBus modEventBus) {{
        BLOCKS.register(modEventBus);
        ITEMS.register(modEventBus);
        TABS.register(modEventBus);
    }}
}}
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
    root(p).join(format!("src/main/resources/assets/{}/textures/{kind}/{id}.png", p.mod_id))
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
    if r.kind == "smelting" {
        let input = grid.iter().find(|g| !g.is_empty()).cloned().unwrap_or_default();
        return json!({
            "type": "minecraft:smelting",
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

/// Erzeugt alle Dateien aus dem Inhalte-Modell.
pub fn generate(p: &Project, c: &mut Content) -> Result<String, String> {
    validate(c)?;
    let modid = &p.mod_id;
    let res = root(p).join("src/main/resources");
    let assets = res.join("assets").join(modid);
    let data = res.join("data").join(modid);
    let client_items = mc_at_least(&p.mc_version, (1, 21, 4));

    // Java
    let java = root(p).join("src/main/java").join(p.package.replace('.', "/")).join("anvil").join("AnvilContent.java");
    if let Some(parent) = java.parent() {
        std::fs::create_dir_all(parent).map_err(err)?;
    }
    std::fs::write(&java, generate_java(p, c)).map_err(err)?;
    let registration = ensure_registration(p)?;

    // Gelöschte Einträge aufräumen (Texturen bleiben als Sicherung liegen)
    let block_ids: Vec<String> = c.blocks.iter().map(|b| b.id.clone()).collect();
    let item_ids: Vec<String> = c.items.iter().map(|i| i.id.clone()).collect();
    let mut removed_keys = vec![];
    for id in c.generated_blocks.iter().filter(|id| !block_ids.contains(id)) {
        remove_if_exists(assets.join(format!("blockstates/{id}.json")));
        remove_if_exists(assets.join(format!("models/block/{id}.json")));
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

    let mut lang_de = vec![(format!("itemGroup.{modid}.anvil"), p.name.clone())];
    let mut lang_en = vec![(format!("itemGroup.{modid}.anvil"), p.name.clone())];

    for b in &c.blocks {
        let id = &b.id;
        write_json(&assets.join(format!("blockstates/{id}.json")), &json!({ "variants": { "": { "model": format!("{modid}:block/{id}") } } }))?;
        let mut model = json!({ "parent": "minecraft:block/cube_all", "textures": { "all": format!("{modid}:block/{id}") } });
        if b.material == "glass" {
            model["render_type"] = json!("minecraft:cutout");
        }
        write_json(&assets.join(format!("models/block/{id}.json")), &model)?;
        write_json(&assets.join(format!("models/item/{id}.json")), &json!({ "parent": format!("{modid}:block/{id}") }))?;
        if client_items {
            write_json(&assets.join(format!("items/{id}.json")), &json!({ "model": { "type": "minecraft:model", "model": format!("{modid}:block/{id}") } }))?;
        }
        ensure_texture(p, "block", id)?;
        write_json(
            &data.join(format!("loot_table/blocks/{id}.json")),
            &json!({
                "type": "minecraft:block",
                "pools": [{
                    "rolls": 1,
                    "entries": [{ "type": "minecraft:item", "name": format!("{modid}:{id}") }],
                    "conditions": [{ "condition": "minecraft:survives_explosion" }]
                }]
            }),
        )?;
        let recipe = data.join(format!("recipe/{id}.json"));
        if b.recipe.enabled {
            write_json(&recipe, &recipe_json(p, id, &b.recipe))?;
        } else {
            remove_if_exists(recipe);
        }
        lang_de.push((format!("block.{modid}.{id}"), if b.name_de.is_empty() { b.name_en.clone() } else { b.name_de.clone() }));
        lang_en.push((format!("block.{modid}.{id}"), if b.name_en.is_empty() { b.name_de.clone() } else { b.name_en.clone() }));
    }

    for i in &c.items {
        let id = &i.id;
        write_json(
            &assets.join(format!("models/item/{id}.json")),
            &json!({ "parent": "minecraft:item/generated", "textures": { "layer0": format!("{modid}:item/{id}") } }),
        )?;
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
        lang_de.push((format!("item.{modid}.{id}"), if i.name_de.is_empty() { i.name_en.clone() } else { i.name_de.clone() }));
        lang_en.push((format!("item.{modid}.{id}"), if i.name_en.is_empty() { i.name_de.clone() } else { i.name_en.clone() }));
    }

    merge_lang(&assets.join("lang/de_de.json"), &lang_de, &removed_keys)?;
    merge_lang(&assets.join("lang/en_us.json"), &lang_en, &removed_keys)?;

    // Werkzeug-Tags (gehören zum Namensraum minecraft, Minecraft führt sie zusammen)
    let all_ours: Vec<String> = block_ids.iter().chain(c.generated_blocks.iter()).map(|id| format!("{modid}:{id}")).collect();
    let tags = res.join("data/minecraft/tags/block");
    for tool in ["pickaxe", "axe", "shovel", "hoe"] {
        let ours: Vec<String> = c.blocks.iter().filter(|b| b.tool == tool).map(|b| format!("{modid}:{}", b.id)).collect();
        merge_tag(&tags.join(format!("mineable/{tool}.json")), &ours, &all_ours)?;
    }
    for tier in ["stone", "iron", "diamond"] {
        let ours: Vec<String> = c.blocks.iter().filter(|b| b.tool != "none" && b.tier == tier).map(|b| format!("{modid}:{}", b.id)).collect();
        merge_tag(&tags.join(format!("needs_{tier}_tool.json")), &ours, &all_ours)?;
    }

    c.generated_blocks = block_ids;
    c.generated_items = item_ids;
    c.generator_version = GENERATOR_VERSION;
    save_file(p, c)?;
    Ok(registration)
}

// ---- Befehle -------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    content: Content,
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
    let registration = generate(&p, &mut c)?;
    Ok(SaveResult { content: c, registration })
}

fn check_kind(kind: &str, id: &str) -> Result<(), String> {
    if !matches!(kind, "block" | "item") || !valid_id(id) {
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
    let has_content = !c.blocks.is_empty() || !c.items.is_empty();
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
        let reg = generate(&p, &mut c).unwrap();
        assert!(reg == "added" || reg == "ok", "{reg}");
        // Zweiter Lauf ohne Glas: Aufräumen prüfen
        c.blocks.pop();
        generate(&p, &mut c).unwrap();
        assert!(!dir.join(format!("src/main/resources/assets/{}/blockstates/dream_glass.json", p.mod_id)).exists());
        assert_eq!(generate(&p, &mut c).unwrap(), "ok");
    }
}
