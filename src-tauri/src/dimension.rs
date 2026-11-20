//! Eigene Dimensionen: Gelände wie die Oberwelt, aber mit eigenen Blöcken.
//! Erzeugt nur Datendateien (dimension_type, noise_settings, dimension).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DimDef {
    pub id: String,
    pub name_de: String,
    pub name_en: String,
    /// Ersatz für Grasblock (Oberfläche)
    pub top_block: String,
    /// Ersatz für Erde (unter der Oberfläche)
    pub fill_block: String,
    /// Ersatz für Stein und Tiefenschiefer
    pub stone_block: String,
    /// "water" | "lava" | "none"
    pub fluid: String,
    /// "overworld" (alle Oberwelt-Biome) oder eine Biom-ID für ein einziges Biom
    pub biome: String,
    /// "normal" | "day" | "night"
    pub time: String,
    /// "overworld" | "nether" | "end"
    pub sky: String,
    /// 0.0 – 1.0
    pub ambient_light: f32,
    pub sea_level: i32,
}

const OW_OLD: &str = include_str!("worldgen/overworld_1_21_1.json");
const OW_NEW: &str = include_str!("worldgen/overworld_1_21_9.json");

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

/// (Pfad relativ zu data/<modid>/, Inhalt)
pub fn files(d: &DimDef, mc_at_least: &dyn Fn((u32, u32, u32)) -> bool, resolve: &dyn Fn(&str) -> String) -> Vec<(String, Value)> {
    let modid_dim = resolve(&format!("#{}", d.id));
    let mut out = vec![];

    // Dimensionstyp
    let mut dt = json!({
        "ambient_light": d.ambient_light.clamp(0.0, 1.0),
        "bed_works": true,
        "coordinate_scale": 1.0,
        "effects": match d.sky.as_str() { "nether" => "minecraft:the_nether", "end" => "minecraft:the_end", _ => "minecraft:overworld" },
        "has_ceiling": false,
        "has_raids": true,
        "has_skylight": true,
        "height": 384,
        "infiniburn": "#minecraft:infiniburn_overworld",
        "logical_height": 384,
        "min_y": -64,
        "monster_spawn_block_light_limit": 0,
        "monster_spawn_light_level": { "type": "minecraft:uniform", "max_inclusive": 7, "min_inclusive": 0 },
        "natural": true,
        "piglin_safe": false,
        "respawn_anchor_works": false,
        "ultrawarm": d.fluid == "lava"
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

    // Geländeeinstellungen: Oberwelt mit ausgetauschten Blöcken
    let mut ns: Value = serde_json::from_str(if mc_at_least((1, 21, 9)) { OW_NEW } else { OW_OLD }).unwrap_or(Value::Null);
    // Nur echte Blöcke: Tags (#…) gehen im Gelände nicht → Standardblock
    let pick = |s: &str, def: &str| {
        let s = s.trim();
        if s.is_empty() || s.starts_with('#') {
            def.to_string()
        } else {
            resolve(s)
        }
    };
    let top = pick(&d.top_block, "minecraft:grass_block");
    let fill = pick(&d.fill_block, "minecraft:dirt");
    let stone = pick(&d.stone_block, "minecraft:stone");
    if let Some(rule) = ns.get_mut("surface_rule") {
        if top != "minecraft:grass_block" {
            replace_block(rule, "minecraft:grass_block", &top);
        }
        if fill != "minecraft:dirt" {
            replace_block(rule, "minecraft:dirt", &fill);
        }
        if stone != "minecraft:stone" {
            replace_block(rule, "minecraft:deepslate", &stone);
        }
    }
    ns["default_block"] = json!({ "Name": stone });
    ns["default_fluid"] = match d.fluid.as_str() {
        "lava" => json!({ "Name": "minecraft:lava", "Properties": { "level": "0" } }),
        "none" => json!({ "Name": "minecraft:air" }),
        _ => json!({ "Name": "minecraft:water", "Properties": { "level": "0" } }),
    };
    ns["sea_level"] = json!(d.sea_level.clamp(-60, 250));
    if d.fluid == "none" {
        ns["aquifers_enabled"] = json!(false);
    }
    out.push((format!("worldgen/noise_settings/{}.json", d.id), ns));

    // Dimension
    let biome_source = if d.biome.trim().is_empty() || d.biome == "overworld" {
        json!({ "type": "minecraft:multi_noise", "preset": "minecraft:overworld" })
    } else {
        json!({ "type": "minecraft:fixed", "biome": resolve(d.biome.trim()) })
    };
    out.push((
        format!("dimension/{}.json", d.id),
        json!({
            "type": modid_dim,
            "generator": { "type": "minecraft:noise", "settings": modid_dim, "biome_source": biome_source }
        }),
    ));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tags_fall_back_to_default_block() {
        let d = DimDef { id: "welt".into(), top_block: "#minecraft:soul_fire_base_blocks".into(), stone_block: "minecraft:netherrack".into(), fluid: "water".into(), ..Default::default() };
        let resolve = |s: &str| if let Some(x) = s.strip_prefix('#') { format!("test:{x}") } else { s.to_string() };
        let files = files(&d, &|_| false, &resolve);
        let ns = &files.iter().find(|(p, _)| p.starts_with("worldgen/noise_settings")).unwrap().1;
        let text = ns.to_string();
        assert!(!text.contains("soul_fire_base_blocks"), "Tag darf nicht im Gelände landen");
        assert!(text.contains("minecraft:grass_block"));
        assert_eq!(ns["default_block"]["Name"], "minecraft:netherrack");
    }
}
