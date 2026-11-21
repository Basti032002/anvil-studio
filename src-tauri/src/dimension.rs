//! Eigene Dimensionen: Vorlagen (Oberwelt, Nether, End, schwebende Inseln, Höhlen,
//! Flachland, Leere) und ein Baukasten für Gelände, Blöcke, Biome, Höhlen, Erze,
//! Strukturen, Pflanzen, Flüssigkeiten, Himmel und Kreaturen.
//! Erzeugt nur Datendateien (dimension_type, noise_settings, dimension, biome,
//! configured_feature, placed_feature und Biom-Tags für Strukturen).

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DimBiome {
    /// Kurzname, wird zu <modid>:<dim>_<id>
    pub id: String,
    pub name_de: String,
    pub name_en: String,
    /// Vanilla-Biom als Vorbild (Pflanzen, Tiere, Farben), z. B. "plains"
    pub base: String,
    /// Oberfläche / darunter nur in diesem Biom (leer = wie die Dimension)
    pub top_block: String,
    pub fill_block: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DimOre {
    pub block: String,
    /// Variante im tiefen Gestein (leer = gleicher Block)
    pub deep_block: String,
    /// Blöcke pro Ader
    pub size: u32,
    /// Adern pro Chunk (unter 1 = nur in manchen Chunks)
    pub count: f32,
    pub min_y: i32,
    pub max_y: i32,
    pub disabled: bool,
    /// "" / "uniform" | "triangle" | "bottom" | "top"
    pub distribution: String,
    /// Nur in diesen eigenen Biomen (Kurznamen, leer = alle)
    pub biomes: Vec<String>,
    /// Weniger an der Luft (versteckter)
    pub hidden: bool,
    /// Weitere ersetzte Blöcke
    pub extra: Vec<DimOreTarget>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DimOreTarget {
    /// Block, der ersetzt wird
    pub target: String,
    /// Erz an dieser Stelle
    pub ore: String,
}

/// Knoten der Geländeformel
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct TNode {
    pub id: String,
    pub kind: String,
    pub x: f64,
    pub y: f64,
    pub props: std::collections::BTreeMap<String, Value>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct TLink {
    pub from: String,
    pub to: String,
    /// Eingang am Ziel: "a", "b", "t" oder "in"
    pub port: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct TGraph {
    pub nodes: Vec<TNode>,
    pub links: Vec<TLink>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DimSpawn {
    pub entity: String,
    /// monster | creature | ambient | water_creature | water_ambient
    pub category: String,
    pub weight: u32,
    pub min: u32,
    pub max: u32,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DimDef {
    pub id: String,
    pub name_de: String,
    pub name_en: String,

    /// overworld | amplified | nether | end | floating | caves | flat | void ("" = alte Dimension → overworld)
    pub template: String,

    /// "" (Form der Vorlage) | "builder" (Baukasten) | "nodes" (Knoten-Modus)
    pub terrain_mode: String,
    /// Einstellungen des Baukastens (gehören der Oberfläche)
    pub terrain: Value,
    /// Aus dem Baukasten erzeugte Formel
    pub builder_graph: TGraph,
    /// Formel im Knoten-Modus
    pub graph: TGraph,
    /// Weltgrenzen (0/0 = wie die Vorlage)
    pub min_y: i32,
    pub max_y: i32,

    // Gelände
    /// -0.5 … 0.5: mehr oder weniger Land
    pub land: f32,
    /// Zusätzliche schwebende Inseln
    pub islands: bool,
    pub islands_y: i32,
    /// 0 … 1: wie viele Inseln
    pub islands_amount: f32,
    /// Unter- und Obergrenze der Inseln (0 = automatisch)
    pub islands_min_y: i32,
    pub islands_max_y: i32,
    /// Durchmesser in Blöcken
    pub islands_size_min: i32,
    pub islands_size_max: i32,
    /// Dicke in Blöcken
    pub islands_thickness: i32,
    /// 0 … 1
    pub islands_rough: f32,
    pub islands_top: String,
    pub islands_waterfalls: bool,

    // Schichten & Blöcke
    /// Ersatz für Grasblock (Oberfläche)
    pub top_block: String,
    /// Ersatz für Erde (unter der Oberfläche)
    pub fill_block: String,
    /// Ersatz für Stein (Grundgestein der Vorlage)
    pub stone_block: String,
    /// Ersatz für Tiefenschiefer (leer = wie Gestein)
    pub deep_block: String,
    pub no_bedrock: bool,
    /// "water" | "lava" | "none"
    pub fluid: String,
    pub sea_level: i32,

    // Biome
    /// "" (alt) | "vanilla" | "own"
    pub biome_mode: String,
    /// Vanilla-Modus: "overworld" | "nether" | "end" oder eine Biom-ID für ein einziges Biom
    pub biome: String,
    pub biomes: Vec<DimBiome>,
    /// 0.25 … 4: Größe der eigenen Biome
    pub biome_size: f32,

    // Höhlen & Schluchten
    pub no_noise_caves: bool,
    pub no_caves: bool,
    pub no_canyons: bool,
    pub no_ore_veins: bool,

    // Erze (nur eigene Biome)
    pub ores: Vec<DimOre>,

    // Strukturen & Pflanzen (nur eigene Biome)
    pub structures: Vec<String>,
    pub no_plants: bool,

    // Flüssigkeiten
    pub no_lakes: bool,
    pub no_springs: bool,

    // Himmel & Licht
    /// "normal" | "day" | "night"
    pub time: String,
    /// "overworld" | "nether" | "end"
    pub sky: String,
    /// 0.0 – 1.0
    pub ambient_light: f32,
    /// "#rrggbb" oder leer (= Vorbild-Biom)
    pub sky_color: String,
    pub fog_color: String,
    pub water_color: String,
    pub grass_color: String,
    pub foliage_color: String,
    /// "" (Vorbild) | "none" | "rain" | "snow"
    pub weather: String,

    // Kreaturen (nur eigene Biome)
    pub no_base_spawns: bool,
    pub spawns: Vec<DimSpawn>,
}

/// Ausgabe des Generators
pub struct DimFiles {
    /// (Pfad relativ zu data/<modid>/, Inhalt)
    pub files: Vec<(String, Value)>,
    /// (Struktur-Tag ohne Namensraum, Biom-ID) → data/minecraft/tags/worldgen/biome/has_structure/<tag>.json
    pub structure_tags: Vec<(String, String)>,
}

const NOISE_OLD: &str = include_str!("worldgen/noise_old.json");
const NOISE_NEW: &str = include_str!("worldgen/noise_new.json");
const BIOMES_1_21_1: &str = include_str!("worldgen/biomes_1_21_1.json");
const BIOMES_1_21_4: &str = include_str!("worldgen/biomes_1_21_4.json");
const BIOMES_1_21_8: &str = include_str!("worldgen/biomes_1_21_8.json");
const BIOMES_1_21_10: &str = include_str!("worldgen/biomes_1_21_10.json");

pub const STRUCTURES: &[&str] = &[
    "village_plains", "village_desert", "village_savanna", "village_snowy", "village_taiga", "pillager_outpost", "mineshaft",
    "mineshaft_mesa", "stronghold", "desert_pyramid", "jungle_temple", "igloo", "swamp_hut", "ocean_monument", "ocean_ruin_cold",
    "ocean_ruin_warm", "shipwreck", "shipwreck_beached", "ruined_portal_standard", "ruined_portal_desert", "ruined_portal_jungle",
    "ruined_portal_mountain", "ruined_portal_nether", "ruined_portal_ocean", "ruined_portal_swamp", "woodland_mansion",
    "nether_fortress", "bastion_remnant", "nether_fossil", "end_city", "ancient_city", "trail_ruins", "trial_chambers", "buried_treasure",
];

const SPAWN_CATEGORIES: &[&str] = &["monster", "creature", "ambient", "water_creature", "water_ambient", "underground_water_creature", "axolotls", "misc"];

/// Alle Blockzustände mit Name `from` durch `to` ersetzen (Eigenschaften entfallen)
fn replace_block(v: &mut Value, from: &str, to: &str) {
    match v {
        Value::Object(map) => {
            if map.get("Name").and_then(|n| n.as_str()) == Some(from) {
                map.insert("Name".into(), Value::String(to.into()));
                map.remove("Properties");
            }
            for (_, child) in map.iter_mut() {
                replace_block(child, from, to);
            }
        }
        Value::Array(a) => a.iter_mut().for_each(|x| replace_block(x, from, to)),
        _ => {}
    }
}

/// Höhlen aus Rauschen entfernen: range_choice um sloped_cheese → nur sloped_cheese,
/// min(…, noodle) → nur der erste Teil
fn strip_noise_caves(v: &mut Value) {
    let replace = match v {
        Value::Object(map) => {
            let ty = map.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if ty == "minecraft:range_choice" && map.get("input").and_then(|i| i.as_str()).is_some_and(|i| i.ends_with("/sloped_cheese")) {
                map.get("input").cloned()
            } else if ty == "minecraft:min" && map.get("argument2").and_then(|i| i.as_str()).is_some_and(|i| i.ends_with("caves/noodle")) {
                map.get("argument1").cloned()
            } else {
                None
            }
        }
        _ => None,
    };
    if let Some(r) = replace {
        *v = r;
        strip_noise_caves(v);
        return;
    }
    match v {
        Value::Object(map) => map.iter_mut().for_each(|(_, c)| strip_noise_caves(c)),
        Value::Array(a) => a.iter_mut().for_each(strip_noise_caves),
        _ => {}
    }
}

/// Klima-Rauschen strecken (größere oder kleinere Biome)
fn scale_climate(v: &mut Value, factor: f64) {
    if let Some(m) = v.as_object_mut() {
        if m.get("type").and_then(|t| t.as_str()) == Some("minecraft:shifted_noise") {
            if let Some(x) = m.get("xz_scale").and_then(|x| x.as_f64()) {
                m.insert("xz_scale".into(), json!(x * factor));
            }
        }
    }
}

fn block(name: &str) -> Value {
    json!({ "type": "minecraft:block", "result_state": { "Name": name } })
}

fn floor_rule(top: Option<&str>, fill: Option<&str>) -> Vec<Value> {
    let mut seq = vec![];
    if let Some(t) = top {
        seq.push(json!({
            "type": "minecraft:condition",
            "if_true": { "type": "minecraft:stone_depth", "offset": 0, "surface_type": "floor", "add_surface_depth": false, "secondary_depth_range": 0 },
            "then_run": block(t)
        }));
    }
    if let Some(f) = fill {
        seq.push(json!({
            "type": "minecraft:condition",
            "if_true": { "type": "minecraft:stone_depth", "offset": 0, "surface_type": "floor", "add_surface_depth": true, "secondary_depth_range": 0 },
            "then_run": block(f)
        }));
    }
    seq
}

fn color(s: &str) -> Option<i64> {
    let h = s.trim().trim_start_matches('#');
    if h.len() == 6 {
        i64::from_str_radix(h, 16).ok()
    } else {
        None
    }
}

fn is_ore_feature(f: &str) -> bool {
    f.starts_with("minecraft:ore_")
        && ["coal", "iron", "gold", "redstone", "diamond", "lapis", "copper", "emerald", "quartz", "debris"].iter().any(|o| f.contains(o))
}

pub fn template_of(d: &DimDef) -> &str {
    match d.template.as_str() {
        "" => "overworld",
        t => t,
    }
}

fn default_base(template: &str) -> &'static str {
    match template {
        "nether" => "nether_wastes",
        "end" | "void" => "the_end",
        "caves" => "lush_caves",
        _ => "plains",
    }
}

pub fn files(d: &DimDef, mc_at_least: &dyn Fn((u32, u32, u32)) -> bool, resolve: &dyn Fn(&str) -> String) -> DimFiles {
    let modid_dim = resolve(&format!("#{}", d.id));
    let modid = modid_dim.split(':').next().unwrap_or("").to_string();
    let template = template_of(d).to_string();
    let mut out = vec![];
    let mut structure_tags = vec![];

    // Nur echte Blöcke: Tags (#…) gehen im Gelände nicht → Standardblock
    let pick = |s: &str| -> Option<String> {
        let s = s.trim();
        if s.is_empty() || s.starts_with('#') {
            None
        } else {
            Some(resolve(s))
        }
    };

    // ---- Geländeeinstellungen ----------------------------------------------------
    let pack: Value = serde_json::from_str(if mc_at_least((1, 21, 9)) { NOISE_NEW } else { NOISE_OLD }).unwrap_or(Value::Null);
    let ns_key = match template.as_str() {
        "amplified" => "amplified",
        "nether" => "nether",
        "end" | "void" => "end",
        "floating" => "floating_islands",
        "caves" => "caves",
        _ => "overworld",
    };
    let mut ns = pack.get(ns_key).cloned().unwrap_or(Value::Null);
    let (vanilla_stone, vanilla_deep) = match template.as_str() {
        "nether" => ("minecraft:netherrack", ""),
        "end" | "void" => ("minecraft:end_stone", ""),
        _ => ("minecraft:stone", "minecraft:deepslate"),
    };
    let stone = pick(&d.stone_block).unwrap_or_else(|| vanilla_stone.to_string());
    // Alte Dimensionen: „Gestein“ ersetzte auch Tiefenschiefer
    let deep = pick(&d.deep_block).or_else(|| if d.template.is_empty() { pick(&d.stone_block) } else { None });
    let top = pick(&d.top_block);
    let fill = pick(&d.fill_block);
    let own_biomes = d.biome_mode == "own";

    if template == "void" {
        ns["noise_router"]["final_density"] = json!(-1.0);
        ns["surface_rule"] = block("minecraft:air");
    }
    if let Some(rule) = ns.get_mut("surface_rule") {
        match template.as_str() {
            "nether" => {
                if let Some(t) = &top {
                    replace_block(rule, "minecraft:crimson_nylium", t);
                    replace_block(rule, "minecraft:warped_nylium", t);
                }
                if let Some(f) = &fill {
                    replace_block(rule, "minecraft:soul_sand", f);
                    replace_block(rule, "minecraft:soul_soil", f);
                }
                replace_block(rule, "minecraft:netherrack", &stone);
            }
            "end" => {
                replace_block(rule, "minecraft:end_stone", &stone);
                let seq = floor_rule(top.as_deref(), fill.as_deref());
                if !seq.is_empty() {
                    let mut all = seq;
                    all.push(rule.clone());
                    *rule = json!({ "type": "minecraft:sequence", "sequence": all });
                }
            }
            "void" => {}
            _ => {
                if let Some(t) = &top {
                    replace_block(rule, "minecraft:grass_block", t);
                }
                if let Some(f) = &fill {
                    replace_block(rule, "minecraft:dirt", f);
                }
                if let Some(dp) = &deep {
                    replace_block(rule, "minecraft:deepslate", dp);
                }
            }
        }
        if d.no_bedrock {
            replace_block(rule, "minecraft:bedrock", &stone);
        }
        // Eigene Oberfläche je Biom
        if own_biomes {
            let mut extra = vec![];
            for b in &d.biomes {
                let seq = floor_rule(pick(&b.top_block).as_deref(), pick(&b.fill_block).as_deref());
                if seq.is_empty() || b.id.is_empty() {
                    continue;
                }
                extra.push(json!({
                    "type": "minecraft:condition",
                    "if_true": { "type": "minecraft:biome", "biome_is": [format!("{modid_dim}_{}", b.id)] },
                    "then_run": { "type": "minecraft:sequence", "sequence": seq }
                }));
            }
            if !extra.is_empty() {
                let mut inner = json!({ "type": "minecraft:sequence", "sequence": extra });
                if matches!(template.as_str(), "overworld" | "amplified") {
                    inner = json!({ "type": "minecraft:condition", "if_true": { "type": "minecraft:above_preliminary_surface" }, "then_run": inner });
                }
                *rule = json!({ "type": "minecraft:sequence", "sequence": [inner, rule.clone()] });
            }
        }
    }
    ns["default_block"] = json!({ "Name": stone });
    ns["default_fluid"] = match (d.fluid.as_str(), template.as_str()) {
        ("lava", _) => json!({ "Name": "minecraft:lava", "Properties": { "level": "0" } }),
        ("none", _) | (_, "end") | (_, "void") => json!({ "Name": "minecraft:air" }),
        _ => json!({ "Name": "minecraft:water", "Properties": { "level": "0" } }),
    };
    // Weltgrenzen
    let custom_bounds = d.max_y > d.min_y && !matches!(template.as_str(), "flat");
    if custom_bounds {
        let lo = ((d.min_y.clamp(-2032, 2000) as f64 / 16.0).floor() * 16.0) as i32;
        let hi = ((d.max_y.clamp(lo + 16, 2031) as f64 / 16.0).ceil() * 16.0) as i32;
        ns["noise"]["min_y"] = json!(lo);
        ns["noise"]["height"] = json!((hi - lo).clamp(16, 4064));
    }
    let min_y = ns["noise"]["min_y"].as_i64().unwrap_or(-64) as i32;
    let noise_h = ns["noise"]["height"].as_i64().unwrap_or(384) as i32;
    let max_y = min_y + noise_h;
    ns["sea_level"] = json!(d.sea_level.clamp(min_y - 64, min_y + noise_h));
    if d.fluid == "none" {
        ns["aquifers_enabled"] = json!(false);
    }
    if d.no_ore_veins {
        ns["ore_veins_enabled"] = json!(false);
    }
    let custom_terrain = matches!(d.terrain_mode.as_str(), "builder" | "nodes") && !matches!(template.as_str(), "flat" | "void");
    let new_router = mc_at_least((1, 21, 9));
    if let Some(router) = ns.get_mut("noise_router") {
        if custom_terrain {
            let g = if d.terrain_mode == "nodes" { &d.graph } else { &d.builder_graph };
            if let Some((terrain, noises, _)) = compile_graph(g, &modid, &d.id, min_y, max_y) {
                out.extend(noises);
                let t = json!({ "type": "minecraft:interpolated", "argument": terrain });
                let mut fd = t.clone();
                if !d.no_noise_caves {
                    let cheese = json!({ "type": "minecraft:add", "argument1": 0.27, "argument2": { "type": "minecraft:noise", "noise": "minecraft:cave_cheese", "xz_scale": 1.0, "y_scale": 0.6666666666666666 } });
                    let deep = json!({ "type": "minecraft:min", "argument1": t.clone(), "argument2": { "type": "minecraft:min", "argument1": cheese,
                        "argument2": { "type": "minecraft:min", "argument1": "minecraft:overworld/caves/spaghetti_2d", "argument2": "minecraft:overworld/caves/entrances" } } });
                    let near = json!({ "type": "minecraft:min", "argument1": t.clone(), "argument2": { "type": "minecraft:mul", "argument1": 5.0, "argument2": "minecraft:overworld/caves/entrances" } });
                    fd = json!({ "type": "minecraft:min",
                        "argument1": { "type": "minecraft:range_choice", "input": t.clone(), "min_inclusive": -1000000.0, "max_exclusive": 1.5625, "when_in_range": near, "when_out_of_range": deep },
                        "argument2": "minecraft:overworld/caves/noodle" });
                }
                router["final_density"] = fd;
                if new_router {
                    router["preliminary_surface_level"] = json!({ "type": "minecraft:find_top_surface", "density": t, "upper_bound": max_y as f64, "lower_bound": min_y, "cell_height": 8 });
                } else {
                    router["initial_density_without_jaggedness"] = t;
                }
            }
        } else if d.no_noise_caves {
            strip_noise_caves(&mut router["final_density"]);
        }
        if d.land.abs() > 0.001 && template != "void" {
            let fd = router["final_density"].take();
            router["final_density"] = json!({ "type": "minecraft:add", "argument1": fd, "argument2": d.land.clamp(-1.0, 1.0) });
        }
        if d.islands {
            let (lo, hi) = islands_range(d, min_y, max_y);
            let amount = if d.islands_amount <= 0.0 { 0.5 } else { d.islands_amount.clamp(0.05, 1.0) } as f64;
            let size = if d.islands_size_max > 0 { (d.islands_size_min.max(4) + d.islands_size_max.max(4)) as f64 / 2.0 } else { 40.0 };
            let thick = if d.islands_thickness > 0 { d.islands_thickness as f64 } else { 12.0 };
            let fade = ((hi - lo) as f64 / 4.0).clamp(4.0, 24.0) as i32;
            // Band zwischen Unter- und Obergrenze (0 außerhalb, 1 innen)
            let band = json!({
                "type": "minecraft:min",
                "argument1": { "type": "minecraft:y_clamped_gradient", "from_y": lo, "to_y": lo + fade, "from_value": 0.0, "to_value": 1.0 },
                "argument2": { "type": "minecraft:y_clamped_gradient", "from_y": hi - fade, "to_y": hi, "from_value": 1.0, "to_value": 0.0 }
            });
            let first = -((size * 2.0).log2().round() as i32);
            let xz = 1.0 / (size * 2.0 * 2f64.powi(first));
            let name = format!("{}_islands", d.id);
            out.push((format!("worldgen/noise/{name}.json"), json!({ "firstOctave": first, "amplitudes": [1.0, 0.5, 0.25] })));
            let mut noise = json!({ "type": "minecraft:noise", "noise": format!("{modid}:{name}"), "xz_scale": xz, "y_scale": xz * (size / thick).clamp(0.5, 8.0) });
            if d.islands_rough > 0.01 {
                let rname = format!("{}_islands_rough", d.id);
                out.push((format!("worldgen/noise/{rname}.json"), json!({ "firstOctave": -3, "amplitudes": [1.0, 0.5] })));
                noise = json!({ "type": "minecraft:add", "argument1": noise, "argument2": { "type": "minecraft:mul", "argument1": d.islands_rough.clamp(0.0, 1.0) * 0.35,
                    "argument2": { "type": "minecraft:noise", "noise": format!("{modid}:{rname}"), "xz_scale": 1.0, "y_scale": 1.0 } } });
            }
            // w·(n + 0.3 + 0.5·Menge) − 1 → fest, wo das Rauschen hoch genug ist
            let islands = json!({
                "type": "minecraft:interpolated",
                "argument": {
                    "type": "minecraft:add",
                    "argument1": -1.0,
                    "argument2": { "type": "minecraft:mul", "argument1": band, "argument2": { "type": "minecraft:add", "argument1": noise, "argument2": 0.25 + 0.6 * amount } }
                }
            });
            let fd = router["final_density"].take();
            router["final_density"] = json!({ "type": "minecraft:max", "argument1": fd, "argument2": islands });
        }
        if own_biomes && d.biomes.len() > 1 {
            let size = if d.biome_size <= 0.0 { 1.0 } else { d.biome_size.clamp(0.25, 4.0) as f64 };
            for key in ["temperature", "vegetation"] {
                if router[key].is_number() {
                    router[key] = json!({ "type": "minecraft:shifted_noise", "noise": format!("minecraft:{key}"), "xz_scale": 0.25, "y_scale": 0.0, "shift_x": "minecraft:shift_x", "shift_y": 0.0, "shift_z": "minecraft:shift_z" });
                }
                scale_climate(&mut router[key], 1.0 / size);
            }
        }
    }
    let flat = template == "flat";
    let islands_range_v = islands_range(d, min_y, max_y);
    if d.islands {
        if let Some(top_isl) = pick(&d.islands_top) {
            let rule = ns["surface_rule"].take();
            ns["surface_rule"] = json!({ "type": "minecraft:sequence", "sequence": [
                { "type": "minecraft:condition",
                  "if_true": { "type": "minecraft:y_above", "anchor": { "absolute": islands_range_v.0 }, "surface_depth_multiplier": 0, "add_stone_depth": false },
                  "then_run": { "type": "minecraft:sequence", "sequence": floor_rule(Some(&top_isl), None) } },
                rule
            ]});
        }
    }
    if !flat {
        out.push((format!("worldgen/noise_settings/{}.json", d.id), ns));
    }

    // ---- Dimensionstyp -----------------------------------------------------------
    let (dt_min, dt_h, logical) = match template.as_str() {
        _ if custom_bounds => (min_y, noise_h, noise_h),
        "nether" => (0, 256, 128),
        "end" | "void" => (0, 256, 256),
        "flat" => (-64, 384, 384),
        _ => (min_y, noise_h.max(256), noise_h.max(256)),
    };
    let ceiling = matches!(template.as_str(), "nether" | "caves");
    let hell = template == "nether";
    let far = matches!(template.as_str(), "end" | "void");
    let default_sky = if hell { "nether" } else if far { "end" } else { "overworld" };
    let sky = if d.sky.is_empty() { default_sky } else { d.sky.as_str() };
    let mut dt = json!({
        "ambient_light": d.ambient_light.clamp(0.0, 1.0),
        "bed_works": !(hell || far),
        "coordinate_scale": 1.0,
        "effects": match sky { "nether" => "minecraft:the_nether", "end" => "minecraft:the_end", _ => "minecraft:overworld" },
        "has_ceiling": ceiling,
        "has_raids": !hell,
        "has_skylight": !ceiling,
        "height": dt_h,
        "infiniburn": if hell { "#minecraft:infiniburn_nether" } else if far { "#minecraft:infiniburn_end" } else { "#minecraft:infiniburn_overworld" },
        "logical_height": logical,
        "min_y": dt_min,
        "monster_spawn_block_light_limit": 0,
        "monster_spawn_light_level": { "type": "minecraft:uniform", "max_inclusive": 7, "min_inclusive": 0 },
        "natural": !(hell || far),
        "piglin_safe": hell,
        "respawn_anchor_works": hell,
        "ultrawarm": hell || d.fluid == "lava"
    });
    match d.time.as_str() {
        "day" => dt["fixed_time"] = json!(6000),
        "night" => dt["fixed_time"] = json!(18000),
        _ => {}
    }
    if mc_at_least((1, 21, 6)) {
        dt["cloud_height"] = json!(192);
    }
    out.push((format!("dimension_type/{}.json", d.id), dt));

    // ---- Biome -------------------------------------------------------------------
    let mut biome_ids: Vec<String> = vec![];
    if own_biomes {
        let biomes_src = if mc_at_least((1, 21, 9)) {
            BIOMES_1_21_10
        } else if mc_at_least((1, 21, 5)) {
            BIOMES_1_21_8
        } else if mc_at_least((1, 21, 2)) {
            BIOMES_1_21_4
        } else {
            BIOMES_1_21_1
        };
        let bases: Value = serde_json::from_str(biomes_src).unwrap_or(Value::Null);
        let mut list = d.biomes.iter().filter(|b| !b.id.trim().is_empty()).cloned().collect::<Vec<_>>();
        if list.is_empty() {
            list.push(DimBiome { id: "main".into(), base: default_base(&template).into(), ..Default::default() });
        }

        // Erze als eigene Merkmale
        let mut ore_features = vec![];
        for (i, o) in d.ores.iter().enumerate() {
            if o.disabled {
                continue;
            }
            let Some(ore) = pick(&o.block) else { continue };
            let deep_ore = pick(&o.deep_block).unwrap_or_else(|| ore.clone());
            let mut targets = vec![json!({ "target": { "predicate_type": "minecraft:block_match", "block": stone }, "state": { "Name": ore } })];
            let deep_stone = deep.clone().unwrap_or_else(|| vanilla_deep.to_string());
            if !deep_stone.is_empty() && deep_stone != stone {
                targets.push(json!({ "target": { "predicate_type": "minecraft:block_match", "block": deep_stone }, "state": { "Name": deep_ore } }));
            }
            for x in &o.extra {
                if let (Some(tg), Some(st)) = (pick(&x.target), pick(&x.ore).or_else(|| Some(ore.clone()))) {
                    targets.push(json!({ "target": { "predicate_type": "minecraft:block_match", "block": tg }, "state": { "Name": st } }));
                }
            }
            let name = format!("{}_ore_{}", d.id, i + 1);
            out.push((
                format!("worldgen/configured_feature/{name}.json"),
                json!({ "type": "minecraft:ore", "config": { "size": o.size.clamp(1, 64), "discard_chance_on_air_exposure": if o.hidden { 0.5 } else { 0.0 }, "targets": targets } }),
            ));
            let mut placement = vec![];
            if o.count >= 1.0 {
                placement.push(json!({ "type": "minecraft:count", "count": o.count.round().min(256.0) as i32 }));
            } else {
                let chance = (1.0 / o.count.max(0.01)).round() as i32;
                placement.push(json!({ "type": "minecraft:rarity_filter", "chance": chance.max(1) }));
            }
            let (lo, hi) = (o.min_y.min(o.max_y), o.min_y.max(o.max_y));
            placement.push(json!({ "type": "minecraft:in_square" }));
            let height = match o.distribution.as_str() {
                "triangle" => json!({ "type": "minecraft:trapezoid", "min_inclusive": { "absolute": lo }, "max_inclusive": { "absolute": hi }, "plateau": 0 }),
                "bottom" => json!({ "type": "minecraft:biased_to_bottom", "min_inclusive": { "absolute": lo }, "max_inclusive": { "absolute": hi.max(lo + 2) }, "inner": 1 }),
                "top" => json!({ "type": "minecraft:uniform", "min_inclusive": { "absolute": lo + (hi - lo) / 2 }, "max_inclusive": { "absolute": hi } }),
                _ => json!({ "type": "minecraft:uniform", "min_inclusive": { "absolute": lo }, "max_inclusive": { "absolute": hi } }),
            };
            placement.push(json!({ "type": "minecraft:height_range", "height": height }));
            placement.push(json!({ "type": "minecraft:biome" }));
            out.push((format!("worldgen/placed_feature/{name}.json"), json!({ "feature": format!("{modid}:{name}"), "placement": placement })));
            ore_features.push((format!("{modid}:{name}"), o.biomes.clone()));
        }

        // Wasserfälle an den schwebenden Inseln
        let waterfall = if d.islands && d.islands_waterfalls {
            let name = format!("{}_waterfall", d.id);
            let mut valid = vec![stone.clone()];
            for b in [pick(&d.islands_top), top.clone(), fill.clone(), Some("minecraft:dirt".into()), Some("minecraft:grass_block".into())].into_iter().flatten() {
                if !valid.contains(&b) {
                    valid.push(b);
                }
            }
            out.push((
                format!("worldgen/configured_feature/{name}.json"),
                json!({ "type": "minecraft:spring_feature", "config": { "state": { "Name": "minecraft:water", "Properties": { "falling": "true" } },
                    "requires_block_below": false, "rock_count": 3, "hole_count": 1, "valid_blocks": valid } }),
            ));
            let (lo, hi) = islands_range_v;
            out.push((
                format!("worldgen/placed_feature/{name}.json"),
                json!({ "feature": format!("{modid}:{name}"), "placement": [
                    { "type": "minecraft:count", "count": 40 }, { "type": "minecraft:in_square" },
                    { "type": "minecraft:height_range", "height": { "type": "minecraft:uniform", "min_inclusive": { "absolute": lo }, "max_inclusive": { "absolute": hi } } },
                    { "type": "minecraft:biome" } ] }),
            ));
            Some(format!("{modid}:{name}"))
        } else {
            None
        };

        for b in &list {
            let base_name = if b.base.trim().is_empty() { default_base(&template) } else { b.base.trim().trim_start_matches("minecraft:") };
            let mut bj = bases.get(base_name).or_else(|| bases.get(default_base(&template))).cloned().unwrap_or(json!({}));
            let id = format!("{}_{}", d.id, b.id);
            // Höhlen & Schluchten
            let mut carvers = vec![];
            if !d.no_caves {
                if hell {
                    carvers.push("minecraft:nether_cave");
                } else if !far {
                    carvers.push("minecraft:cave");
                    carvers.push("minecraft:cave_extra_underground");
                }
            }
            if !d.no_canyons && !hell && !far {
                carvers.push("minecraft:canyon");
            }
            bj["carvers"] = if mc_at_least((1, 21, 2)) { json!(carvers) } else { json!({ "air": carvers }) };
            // Merkmale
            let mut steps: Vec<Vec<String>> = bj["features"]
                .as_array()
                .map(|a| a.iter().map(|s| s.as_array().map(|x| x.iter().filter_map(|f| f.as_str().map(String::from)).collect()).unwrap_or_default()).collect())
                .unwrap_or_default();
            steps.resize(11, vec![]);
            for (i, step) in steps.iter_mut().enumerate() {
                step.retain(|f| {
                    !(is_ore_feature(f)
                        || (d.no_lakes && f.starts_with("minecraft:lake_"))
                        || (d.no_springs && f.starts_with("minecraft:spring_"))
                        || (d.no_plants && i == 9 && f != "minecraft:freeze_top_layer"))
                });
            }
            for (feature, only) in &ore_features {
                if only.is_empty() || only.iter().any(|x| x == &b.id) {
                    steps[6].push(feature.clone());
                }
            }
            if let Some(w) = &waterfall {
                steps[8].push(w.clone());
            }
            bj["features"] = json!(steps);
            // Kreaturen
            let mut spawners = if d.no_base_spawns { Map::new() } else { bj["spawners"].as_object().cloned().unwrap_or_default() };
            for c in SPAWN_CATEGORIES {
                spawners.entry(c.to_string()).or_insert(json!([]));
            }
            for s in &d.spawns {
                let Some(ent) = pick(&s.entity) else { continue };
                let cat = if SPAWN_CATEGORIES.contains(&s.category.as_str()) { s.category.as_str() } else { "creature" };
                let (lo, hi) = (s.min.max(1).min(s.max.max(1)), s.min.max(s.max).max(1));
                if let Some(a) = spawners.get_mut(cat).and_then(|a| a.as_array_mut()) {
                    a.push(json!({ "type": ent, "weight": s.weight.max(1), "minCount": lo, "maxCount": hi }));
                }
            }
            bj["spawners"] = Value::Object(spawners);
            // Himmel & Wetter
            if let Some(e) = bj["effects"].as_object_mut() {
                for (key, val) in [("sky_color", &d.sky_color), ("fog_color", &d.fog_color), ("water_color", &d.water_color), ("grass_color", &d.grass_color), ("foliage_color", &d.foliage_color)] {
                    if let Some(c) = color(val) {
                        e.insert(key.into(), json!(c));
                    }
                }
            }
            match d.weather.as_str() {
                "none" => bj["has_precipitation"] = json!(false),
                "rain" => {
                    bj["has_precipitation"] = json!(true);
                    bj["temperature"] = json!(0.8);
                }
                "snow" => {
                    bj["has_precipitation"] = json!(true);
                    bj["temperature"] = json!(0.0);
                }
                _ => {}
            }
            out.push((format!("worldgen/biome/{id}.json"), bj));
            let full = format!("{modid}:{id}");
            for s in &d.structures {
                let s = s.trim().trim_start_matches("minecraft:");
                if STRUCTURES.contains(&s) {
                    structure_tags.push((s.to_string(), full.clone()));
                }
            }
            biome_ids.push(full);
        }
    }

    // ---- Biomquelle und Dimension ------------------------------------------------
    let biome_source = if own_biomes {
        if biome_ids.len() == 1 {
            json!({ "type": "minecraft:fixed", "biome": biome_ids[0] })
        } else {
            let n = biome_ids.len() as f64;
            let entries: Vec<Value> = biome_ids
                .iter()
                .enumerate()
                .map(|(i, b)| {
                    let t = -1.0 + (2.0 * i as f64 + 1.0) / n;
                    json!({ "biome": b, "parameters": {
                        "temperature": t, "humidity": 0.0, "continentalness": 0.0, "erosion": 0.0,
                        "weirdness": 0.0, "depth": 0.0, "offset": 0.0
                    }})
                })
                .collect();
            json!({ "type": "minecraft:multi_noise", "biomes": entries })
        }
    } else {
        let b = d.biome.trim();
        match b {
            "" | "overworld" => {
                if hell {
                    json!({ "type": "minecraft:multi_noise", "preset": "minecraft:nether" })
                } else if far {
                    json!({ "type": "minecraft:the_end" })
                } else {
                    json!({ "type": "minecraft:multi_noise", "preset": "minecraft:overworld" })
                }
            }
            "nether" => json!({ "type": "minecraft:multi_noise", "preset": "minecraft:nether" }),
            "end" => json!({ "type": "minecraft:the_end" }),
            _ => json!({ "type": "minecraft:fixed", "biome": resolve(b) }),
        }
    };
    let generator = if flat {
        let first = biome_ids.first().cloned().unwrap_or_else(|| {
            let b = d.biome.trim();
            if b.is_empty() || !b.contains(':') && matches!(b, "overworld" | "nether" | "end") { "minecraft:plains".to_string() } else { resolve(b) }
        });
        let surface = d.sea_level.clamp(-60, 250);
        let stone_h = (surface - (-64) - 5).max(1);
        let mut layers = vec![];
        if !d.no_bedrock {
            layers.push(json!({ "block": "minecraft:bedrock", "height": 1 }));
        }
        layers.push(json!({ "block": stone, "height": stone_h }));
        layers.push(json!({ "block": fill.clone().unwrap_or_else(|| "minecraft:dirt".into()), "height": 3 }));
        layers.push(json!({ "block": top.clone().unwrap_or_else(|| "minecraft:grass_block".into()), "height": 1 }));
        json!({ "type": "minecraft:flat", "settings": { "biome": first, "layers": layers, "lakes": !d.no_lakes, "features": !d.no_plants } })
    } else {
        json!({ "type": "minecraft:noise", "settings": modid_dim, "biome_source": biome_source })
    };
    out.push((format!("dimension/{}.json", d.id), json!({ "type": modid_dim, "generator": generator })));
    DimFiles { files: out, structure_tags }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn resolve(s: &str) -> String {
        if let Some(x) = s.strip_prefix('#') {
            format!("test:{x}")
        } else if s.contains(':') {
            s.to_string()
        } else {
            format!("minecraft:{s}")
        }
    }

    #[test]
    fn tags_fall_back_to_default_block() {
        let d = DimDef { id: "welt".into(), top_block: "#minecraft:soul_fire_base_blocks".into(), stone_block: "minecraft:netherrack".into(), fluid: "water".into(), ..Default::default() };
        let files = files(&d, &|_| false, &resolve).files;
        let ns = &files.iter().find(|(p, _)| p.starts_with("worldgen/noise_settings")).unwrap().1;
        let text = ns.to_string();
        assert!(!text.contains("soul_fire_base_blocks"), "Tag darf nicht im Gelände landen");
        assert!(text.contains("minecraft:grass_block"));
        assert_eq!(ns["default_block"]["Name"], "minecraft:netherrack");
    }

    #[test]
    fn own_biomes_ores_and_structures() {
        for new in [false, true] {
            let d = DimDef {
                id: "welt".into(),
                template: "overworld".into(),
                biome_mode: "own".into(),
                biomes: vec![
                    DimBiome { id: "wiese".into(), base: "plains".into(), ..Default::default() },
                    DimBiome { id: "sand".into(), base: "desert".into(), top_block: "sand".into(), ..Default::default() },
                ],
                ores: vec![DimOre { block: "diamond_ore".into(), deep_block: "deepslate_diamond_ore".into(), size: 8, count: 0.5, min_y: -60, max_y: 16, ..Default::default() }],
                structures: vec!["village_plains".into()],
                spawns: vec![DimSpawn { entity: "zombie".into(), category: "monster".into(), weight: 50, min: 1, max: 3 }],
                no_noise_caves: true,
                islands: true,
                land: 0.1,
                sky_color: "#ff0000".into(),
                ..Default::default()
            };
            let r = files(&d, &|v| new && v <= (1, 21, 10), &resolve);
            let get = |p: &str| r.files.iter().find(|(x, _)| x == p).map(|(_, v)| v.clone()).unwrap();
            let b = get("worldgen/biome/welt_sand.json");
            let txt = b.to_string();
            assert!(!txt.contains("ore_diamond"), "Vanilla-Erze müssen raus");
            assert!(txt.contains("test:welt_ore_1"));
            assert_eq!(b["effects"]["sky_color"], 0xff0000);
            assert!(if new { b["carvers"].is_array() } else { b["carvers"]["air"].is_array() });
            let ns = get("worldgen/noise_settings/welt.json").to_string();
            assert!(!ns.contains("caves/noodle"));
            assert!(ns.contains("test:welt_sand"));
            let dim = get("dimension/welt.json");
            assert_eq!(dim["generator"]["biome_source"]["type"], "minecraft:multi_noise");
            assert_eq!(r.structure_tags.len(), 2);
            assert!(get("worldgen/placed_feature/welt_ore_1.json").to_string().contains("rarity_filter"));
        }
    }

    #[test]
    fn all_templates_produce_files() {
        for t in ["overworld", "amplified", "nether", "end", "floating", "caves", "flat", "void"] {
            for mode in ["vanilla", "own"] {
                let d = DimDef { id: "w".into(), template: t.into(), biome_mode: mode.into(), fluid: "water".into(), ..Default::default() };
                let r = files(&d, &|_| true, &resolve);
                assert!(r.files.iter().any(|(p, _)| p == "dimension/w.json"), "{t}");
                assert!(r.files.iter().any(|(p, _)| p == "dimension_type/w.json"), "{t}");
            }
        }
    }
}

// ---- Geländeformel (Baukasten und Knoten-Modus) ---------------------------------

fn num(props: &std::collections::BTreeMap<String, Value>, key: &str, def: f64) -> f64 {
    match props.get(key) {
        Some(Value::Number(n)) => n.as_f64().unwrap_or(def),
        Some(Value::String(s)) => s.trim().replace(',', ".").parse().unwrap_or(def),
        _ => def,
    }
}

fn text<'a>(props: &'a std::collections::BTreeMap<String, Value>, key: &str, def: &'a str) -> &'a str {
    props.get(key).and_then(|v| v.as_str()).unwrap_or(def)
}

/// Punkte (Ort, Wert) einer Kurvenform, Eingang und Ausgang je -1 … 1
pub fn curve_points(shape: &str, steps: usize) -> Vec<(f64, f64)> {
    match shape {
        "linear" => vec![(-1.0, -1.0), (1.0, 1.0)],
        "steps" => {
            let n = steps.clamp(2, 12);
            let mut pts = vec![];
            for k in 0..n {
                let a = -1.0 + 2.0 * k as f64 / n as f64;
                let b = -1.0 + 2.0 * (k as f64 + 0.7) / n as f64;
                let v = -1.0 + 2.0 * k as f64 / (n - 1) as f64;
                pts.push((a, v));
                pts.push((b, v));
            }
            pts
        }
        "ridge" => vec![(-1.0, -1.0), (-0.3, 0.2), (0.0, 1.0), (0.3, 0.2), (1.0, -1.0)],
        "valley" => vec![(-1.0, 1.0), (-0.3, -0.2), (0.0, -1.0), (0.3, -0.2), (1.0, 1.0)],
        "canyon" => vec![(-1.0, 0.3), (-0.12, 0.3), (-0.04, -1.0), (0.04, -1.0), (0.12, 0.3), (1.0, 0.3)],
        "exp" => vec![(-1.0, -1.0), (0.0, -0.75), (0.5, -0.2), (1.0, 1.0)],
        "plateau" => vec![(-1.0, -1.0), (-0.2, -0.6), (0.1, 0.8), (1.0, 1.0)],
        // S-Kurve
        _ => vec![(-1.0, -1.0), (-0.6, -0.9), (0.0, 0.0), (0.6, 0.9), (1.0, 1.0)],
    }
}

struct GraphCx<'a> {
    graph: &'a TGraph,
    modid: &'a str,
    dim: &'a str,
    min_y: i32,
    max_y: i32,
    noises: Vec<(String, Value)>,
    uses_distance: bool,
}

impl GraphCx<'_> {
    fn input(&mut self, node: &TNode, port: &str, depth: usize) -> Option<Value> {
        let link = self.graph.links.iter().find(|l| l.to == node.id && l.port == port)?;
        let from = self.graph.nodes.iter().find(|n| n.id == link.from)?;
        Some(self.compile(from, depth + 1))
    }

    fn noise_file(&mut self, node: &TNode, size: f64, octaves: usize) -> (String, f64) {
        let size = size.clamp(1.0, 100000.0);
        let first = -(size.log2().round() as i32);
        let name = format!("{}_{}", self.dim, node.id.to_lowercase().replace(|c: char| !c.is_ascii_alphanumeric(), "_"));
        self.noises.push((
            format!("worldgen/noise/{name}.json"),
            json!({ "firstOctave": first, "amplitudes": vec![1.0; octaves.clamp(1, 8)] }),
        ));
        // Frequenz genau treffen: 2^first · scale = 1 / size
        let scale = 1.0 / (size * 2f64.powi(first));
        (format!("{}:{name}", self.modid), scale)
    }

    fn compile(&mut self, node: &TNode, depth: usize) -> Value {
        if depth > 64 {
            return json!(0.0);
        }
        let p = &node.props;
        match node.kind.as_str() {
            "output" => self.input(node, "in", depth).unwrap_or(json!(-1.0)),
            "const" => json!(num(p, "value", 0.0)),
            "noise" => {
                let three_d = text(p, "dim", "2d") == "3d";
                let (id, scale) = self.noise_file(node, num(p, "size", 200.0), num(p, "octaves", 4.0) as usize);
                let y_scale = if three_d { scale * num(p, "stretch", 1.0).max(0.01) } else { 0.0 };
                let mut v = json!({ "type": "minecraft:noise", "noise": id, "xz_scale": scale, "y_scale": y_scale });
                if !three_d {
                    v = json!({ "type": "minecraft:flat_cache", "argument": v });
                }
                let k = num(p, "strength", 1.0);
                if (k - 1.0).abs() > 1e-9 {
                    v = json!({ "type": "minecraft:mul", "argument1": k, "argument2": v });
                }
                v
            }
            "random" => {
                let (id, scale) = self.noise_file(node, num(p, "size", 2.0).max(1.0), 1);
                json!({ "type": "minecraft:mul", "argument1": num(p, "strength", 1.0), "argument2": { "type": "minecraft:noise", "noise": id, "xz_scale": scale, "y_scale": scale } })
            }
            "curve" => {
                let input = self.input(node, "in", depth).unwrap_or(json!(0.0));
                let pts = curve_points(text(p, "shape", "s"), num(p, "points", 5.0) as usize);
                let (lo, hi) = (num(p, "low", -1.0), num(p, "high", 1.0));
                let map = |v: f64| lo + (v + 1.0) / 2.0 * (hi - lo);
                let mut points = vec![];
                for i in 0..pts.len() {
                    let (x, v) = pts[i];
                    let d = if pts.len() < 2 || text(p, "shape", "s") == "steps" {
                        0.0
                    } else {
                        let (a, b) = (pts[i.saturating_sub(1)], pts[(i + 1).min(pts.len() - 1)]);
                        if (b.0 - a.0).abs() < 1e-9 { 0.0 } else { (map(b.1) - map(a.1)) / (b.0 - a.0) }
                    };
                    points.push(json!({ "location": x, "value": map(v), "derivative": d }));
                }
                json!({ "type": "minecraft:spline", "spline": { "coordinate": input, "points": points } })
            }
            "math" => {
                let a = self.input(node, "a", depth).unwrap_or(json!(num(p, "a", 0.0)));
                let b = self.input(node, "b", depth).unwrap_or(json!(num(p, "b", 1.0)));
                match text(p, "op", "add") {
                    "sub" => json!({ "type": "minecraft:add", "argument1": a, "argument2": { "type": "minecraft:mul", "argument1": -1.0, "argument2": b } }),
                    "mul" => json!({ "type": "minecraft:mul", "argument1": a, "argument2": b }),
                    "min" => json!({ "type": "minecraft:min", "argument1": a, "argument2": b }),
                    "max" => json!({ "type": "minecraft:max", "argument1": a, "argument2": b }),
                    "abs" => json!({ "type": "minecraft:abs", "argument": a }),
                    "square" => json!({ "type": "minecraft:square", "argument": a }),
                    "cube" => json!({ "type": "minecraft:cube", "argument": a }),
                    "neg" => json!({ "type": "minecraft:mul", "argument1": -1.0, "argument2": a }),
                    _ => json!({ "type": "minecraft:add", "argument1": a, "argument2": b }),
                }
            }
            "ygrad" => {
                let from = num(p, "fromY", self.min_y as f64) as i32;
                let to = num(p, "toY", self.max_y as f64) as i32;
                let (from, to) = if from == to { (self.min_y, self.max_y) } else { (from, to) };
                json!({ "type": "minecraft:y_clamped_gradient", "from_y": from.min(to), "to_y": from.max(to),
                    "from_value": if from <= to { num(p, "bottom", 1.0) } else { num(p, "top", -1.0) },
                    "to_value": if from <= to { num(p, "top", -1.0) } else { num(p, "bottom", 1.0) } })
            }
            "distance" => {
                self.uses_distance = true;
                json!({ "type": format!("{}:distance", self.modid), "center_x": num(p, "x", 0.0), "center_z": num(p, "z", 0.0), "scale": num(p, "scale", 1000.0).max(1.0) })
            }
            "biome" => match text(p, "value", "continents") {
                "erosion" => json!("minecraft:overworld/erosion"),
                "ridges" => json!("minecraft:overworld/ridges"),
                "temperature" => json!({ "type": "minecraft:shifted_noise", "noise": "minecraft:temperature", "xz_scale": 0.25, "y_scale": 0.0, "shift_x": "minecraft:shift_x", "shift_y": 0.0, "shift_z": "minecraft:shift_z" }),
                "humidity" => json!({ "type": "minecraft:shifted_noise", "noise": "minecraft:vegetation", "xz_scale": 0.25, "y_scale": 0.0, "shift_x": "minecraft:shift_x", "shift_y": 0.0, "shift_z": "minecraft:shift_z" }),
                _ => json!("minecraft:overworld/continents"),
            },
            "clamp" => {
                let input = self.input(node, "in", depth).unwrap_or(json!(0.0));
                let (a, b) = (num(p, "min", -1.0), num(p, "max", 1.0));
                json!({ "type": "minecraft:clamp", "input": input, "min": a.min(b), "max": a.max(b) })
            }
            "mix" => {
                let a = self.input(node, "a", depth).unwrap_or(json!(num(p, "a", 0.0)));
                let b = self.input(node, "b", depth).unwrap_or(json!(num(p, "b", 0.0)));
                let t = self.input(node, "t", depth).unwrap_or(json!(num(p, "t", 0.5)));
                // a + t · (b − a)
                json!({ "type": "minecraft:add", "argument1": a.clone(), "argument2": { "type": "minecraft:mul", "argument1": t,
                    "argument2": { "type": "minecraft:add", "argument1": b, "argument2": { "type": "minecraft:mul", "argument1": -1.0, "argument2": a } } } })
            }
            _ => json!(0.0),
        }
    }
}

/// Unter- und Obergrenze der schwebenden Inseln
fn islands_range(d: &DimDef, min_y: i32, max_y: i32) -> (i32, i32) {
    let (lo, hi) = if d.islands_max_y > d.islands_min_y {
        (d.islands_min_y, d.islands_max_y)
    } else {
        let y = if d.islands_y == 0 { max_y - 96 } else { d.islands_y };
        (y - 24, y + 24)
    };
    let (lo, hi) = (lo.clamp(min_y + 8, max_y - 16), hi.clamp(min_y + 16, max_y - 8));
    (lo.min(hi - 8), hi)
}

/// Formel → (Dichtefunktion, Rausch-Dateien, braucht „Abstand“-Funktion)
pub fn compile_graph(graph: &TGraph, modid: &str, dim: &str, min_y: i32, max_y: i32) -> Option<(Value, Vec<(String, Value)>, bool)> {
    let out = graph.nodes.iter().find(|n| n.kind == "output")?;
    let mut cx = GraphCx { graph, modid, dim, min_y, max_y, noises: vec![], uses_distance: false };
    let v = cx.compile(out, 0);
    Some((v, cx.noises, cx.uses_distance))
}

/// Braucht irgendeine Dimension die Java-Funktion „Abstand zur Mitte“?
pub fn uses_distance(dims: &[DimDef]) -> bool {
    dims.iter().any(|d| {
        let g = if d.terrain_mode == "nodes" { &d.graph } else { &d.builder_graph };
        matches!(d.terrain_mode.as_str(), "nodes" | "builder") && g.nodes.iter().any(|n| n.kind == "distance")
    })
}
