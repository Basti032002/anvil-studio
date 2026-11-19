//! Katalog aller Vanilla-Blöcke und -Items mit Namen und Icons.
//!
//! Anvil Studio liefert keine Minecraft-Dateien mit. Stattdessen wird – wie
//! bei jedem Launcher – der offizielle Client von Mojangs Servern geladen
//! (einmal pro Minecraft-Version) und lokal ausgewertet:
//! - Item-Liste aus den Item-Modellen (bzw. ab 1.21.4 aus assets/minecraft/items)
//! - Namen aus en_us (im Client) und de_de (aus dem Asset-Index)
//! - Icons: flache Item-Texturen oder ein Würfel aus Ober- und Seitentextur
//!
//! Das Ergebnis liegt als catalog.json im App-Datenordner.

use crate::util::{data_dir, download, err, net_err};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, HashMap};
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

const MANIFEST: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
/// Bei Änderungen an der Auswertung hochzählen → Katalog wird neu erstellt.
const CATALOG_FORMAT: u32 = 1;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Icon {
    /// "flat" | "cube" | "none"
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    tex: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    side: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    front: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    id: String,
    name: String,
    name_en: String,
    /// "block" | "item"
    kind: String,
    icon: Icon,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    format: u32,
    version: String,
    entries: Vec<CatalogEntry>,
    /// Texturpfad → data:image/png;base64,…
    textures: BTreeMap<String, String>,
}

#[derive(Serialize, Clone)]
struct Progress {
    phase: String,
    downloaded: u64,
    total: Option<u64>,
}

async fn get_json(url: &str) -> Result<Value, String> {
    let resp = crate::util::http_client()?.get(url).send().await.map_err(|e| net_err(&e))?;
    if !resp.status().is_success() {
        return Err(format!("Mojang antwortet mit HTTP {}", resp.status()));
    }
    serde_json::from_str(&resp.text().await.map_err(|e| net_err(&e))?).map_err(err)
}

struct Jar {
    zip: zip::ZipArchive<std::fs::File>,
}

impl Jar {
    fn read(&mut self, path: &str) -> Option<Vec<u8>> {
        let mut f = self.zip.by_name(path).ok()?;
        let mut buf = vec![];
        f.read_to_end(&mut buf).ok()?;
        Some(buf)
    }
    fn json(&mut self, path: &str) -> Option<Value> {
        serde_json::from_slice(&self.read(path)?).ok()
    }
    fn names(&self) -> Vec<String> {
        self.zip.file_names().map(|s| s.to_string()).collect()
    }
}

/// "minecraft:block/stone" | "block/stone" → ("minecraft", "block/stone")
fn split_ref(r: &str) -> (String, String) {
    match r.split_once(':') {
        Some((ns, p)) => (ns.to_string(), p.to_string()),
        None => ("minecraft".to_string(), r.to_string()),
    }
}

/// Folgt der parent-Kette eines Modells; liefert zusammengeführte Texturen
/// und ob es ein flaches Item-Modell ist.
fn resolve_model(jar: &mut Jar, model_ref: &str) -> (Map<String, Value>, bool, bool) {
    let mut textures = Map::new();
    let mut flat = false;
    let mut builtin = false;
    let mut current = Some(model_ref.to_string());
    for _ in 0..8 {
        let Some(r) = current.take() else { break };
        let (_, path) = split_ref(&r);
        if path == "item/generated" || path == "builtin/generated" || path == "item/handheld" || path == "item/handheld_rod" {
            flat = true;
        }
        if path == "builtin/entity" {
            builtin = true;
        }
        let Some(model) = jar.json(&format!("assets/minecraft/models/{path}.json")) else { break };
        if let Some(t) = model["textures"].as_object() {
            for (k, v) in t {
                textures.entry(k.clone()).or_insert(v.clone());
            }
        }
        current = model["parent"].as_str().map(|s| s.to_string());
    }
    (textures, flat, builtin)
}

fn lookup_tex(textures: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    for k in keys {
        let mut v = textures.get(*k)?.as_str().map(|s| s.to_string());
        // "#side" → auf anderen Schlüssel verweisen
        for _ in 0..5 {
            match v {
                Some(ref s) if s.starts_with('#') => v = textures.get(&s[1..]).and_then(|x| x.as_str()).map(|s| s.to_string()),
                _ => break,
            }
        }
        if let Some(s) = v {
            if !s.starts_with('#') {
                return Some(split_ref(&s).1);
            }
        }
    }
    None
}

fn first_tex(textures: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    for k in keys {
        if textures.contains_key(*k) {
            if let Some(t) = lookup_tex(textures, &[k]) {
                return Some(t);
            }
        }
    }
    None
}

/// Sucht in einer Item-Definition (ab 1.21.4) das erste referenzierte Modell.
fn find_model_ref(v: &Value) -> Option<String> {
    match v {
        Value::Object(m) => {
            if m.get("type").and_then(|t| t.as_str()) == Some("minecraft:model") {
                if let Some(s) = m.get("model").and_then(|x| x.as_str()) {
                    return Some(s.to_string());
                }
            }
            m.values().find_map(find_model_ref)
        }
        Value::Array(a) => a.iter().find_map(find_model_ref),
        _ => None,
    }
}

fn icon_for(jar: &mut Jar, model_ref: &str) -> Icon {
    let (textures, flat, builtin) = resolve_model(jar, model_ref);
    let none = Icon { kind: "none".into(), tex: None, top: None, side: None, front: None };
    if flat || textures.contains_key("layer0") {
        return match lookup_tex(&textures, &["layer0"]) {
            Some(t) => Icon { kind: "flat".into(), tex: Some(t), ..none },
            None => none,
        };
    }
    let top = first_tex(&textures, &["top", "end", "up", "all", "texture", "side", "particle"]);
    let side = first_tex(&textures, &["side", "all", "north", "south", "east", "texture", "front", "particle"]);
    let front = first_tex(&textures, &["front", "side", "all", "north", "texture", "particle"]);
    if builtin && top.is_none() {
        return match first_tex(&textures, &["particle"]) {
            Some(t) => Icon { kind: "flat".into(), tex: Some(t), ..none },
            None => none,
        };
    }
    match (top, side) {
        (Some(top), Some(side)) => Icon { kind: "cube".into(), tex: None, top: Some(top), side: Some(side), front },
        (Some(t), None) | (None, Some(t)) => Icon { kind: "flat".into(), tex: Some(t), ..none },
        _ => none,
    }
}

/// Baut den Katalog aus einem Client-Jar und den Sprachdateien.
pub fn build_from_jar(jar_path: &Path, version: &str, de: &HashMap<String, String>) -> Result<Catalog, String> {
    let file = std::fs::File::open(jar_path).map_err(err)?;
    let mut jar = Jar { zip: zip::ZipArchive::new(file).map_err(err)? };
    let en: HashMap<String, String> = jar
        .json("assets/minecraft/lang/en_us.json")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    let names = jar.names();
    let modern = names.iter().any(|n| n.starts_with("assets/minecraft/items/"));
    let mut ids: Vec<String> = names
        .iter()
        .filter_map(|n| {
            let prefix = if modern { "assets/minecraft/items/" } else { "assets/minecraft/models/item/" };
            n.strip_prefix(prefix).and_then(|r| r.strip_suffix(".json")).filter(|r| !r.contains('/')).map(|s| s.to_string())
        })
        .collect();
    ids.sort();
    ids.dedup();

    let mut entries = vec![];
    let mut needed: Vec<String> = vec![];
    for id in ids {
        let block_key = format!("block.minecraft.{id}");
        let item_key = format!("item.minecraft.{id}");
        let (key, kind) = if en.contains_key(&block_key) {
            (block_key, "block")
        } else if en.contains_key(&item_key) {
            (item_key, "item")
        } else {
            continue; // Hilfsmodelle ohne eigenes Item
        };
        let model_ref = if modern {
            jar.json(&format!("assets/minecraft/items/{id}.json"))
                .and_then(|v| find_model_ref(&v))
                .unwrap_or(format!("minecraft:item/{id}"))
        } else {
            format!("minecraft:item/{id}")
        };
        let icon = icon_for(&mut jar, &model_ref);
        for t in [&icon.tex, &icon.top, &icon.side, &icon.front].into_iter().flatten() {
            needed.push(t.clone());
        }
        let name_en = en.get(&key).cloned().unwrap_or(id.clone());
        let name = de.get(&key).cloned().unwrap_or(name_en.clone());
        entries.push(CatalogEntry { id: format!("minecraft:{id}"), name, name_en, kind: kind.into(), icon });
    }

    needed.sort();
    needed.dedup();
    let mut textures = BTreeMap::new();
    for t in needed {
        if let Some(bytes) = jar.read(&format!("assets/minecraft/textures/{t}.png")) {
            textures.insert(t, format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)));
        }
    }
    // Icons mit fehlenden Texturen entschärfen
    for e in entries.iter_mut() {
        let missing = |t: &Option<String>| t.as_ref().map(|t| !textures.contains_key(t)).unwrap_or(false);
        if missing(&e.icon.tex) || missing(&e.icon.top) || missing(&e.icon.side) {
            e.icon = Icon { kind: "none".into(), tex: None, top: None, side: None, front: None };
        }
    }
    Ok(Catalog { format: CATALOG_FORMAT, version: version.to_string(), entries, textures })
}

/// Lädt Client-Jar und deutsche Sprachdatei (falls nicht im Cache) und baut den Katalog.
pub async fn build(cache: &Path, version: &str, progress: &(dyn Fn(&str, u64, Option<u64>) + Send + Sync)) -> Result<Catalog, String> {
    std::fs::create_dir_all(cache).map_err(err)?;
    let jar_path = cache.join("client.jar");
    let de_path = cache.join("de_de.json");

    if !jar_path.exists() || !de_path.exists() {
        progress("manifest", 0, None);
        let manifest = get_json(MANIFEST).await?;
        let url = manifest["versions"]
            .as_array()
            .and_then(|a| a.iter().find(|v| v["id"] == version))
            .and_then(|v| v["url"].as_str())
            .ok_or_else(|| format!("Minecraft {version} nicht im Versionsverzeichnis gefunden."))?
            .to_string();
        let info = get_json(&url).await?;
        if !jar_path.exists() {
            let client = info["downloads"]["client"]["url"].as_str().ok_or("Client-Download fehlt")?;
            let tmp = cache.join("client.jar.part");
            download(client, &tmp, &|d, t| progress("client", d, t)).await?;
            std::fs::rename(&tmp, &jar_path).map_err(err)?;
        }
        if !de_path.exists() {
            progress("lang", 0, None);
            let index_url = info["assetIndex"]["url"].as_str().ok_or("Asset-Index fehlt")?;
            let index = get_json(index_url).await?;
            if let Some(hash) = index["objects"]["minecraft/lang/de_de.json"]["hash"].as_str() {
                let url = format!("https://resources.download.minecraft.net/{}/{hash}", &hash[..2]);
                download(&url, &de_path, &|_, _| {}).await?;
            } else {
                std::fs::write(&de_path, "{}").map_err(err)?;
            }
        }
    }

    progress("parse", 0, None);
    let de: HashMap<String, String> = std::fs::read_to_string(&de_path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
    let jar = jar_path.clone();
    let v = version.to_string();
    let catalog = tauri::async_runtime::spawn_blocking(move || build_from_jar(&jar, &v, &de)).await.map_err(err)??;
    std::fs::write(cache.join("catalog.json"), serde_json::to_vec(&catalog).map_err(err)?).map_err(err)?;
    Ok(catalog)
}

fn cache_dir(app: &AppHandle, version: &str) -> Result<PathBuf, String> {
    if version.is_empty() || !version.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
        return Err("Ungültige Minecraft-Version".into());
    }
    Ok(data_dir(app)?.join("minecraft").join(version))
}

/// Katalog für eine Minecraft-Version (aus dem Cache oder neu erstellt).
#[tauri::command]
pub async fn mc_catalog(app: AppHandle, version: String) -> Result<Catalog, String> {
    let cache = cache_dir(&app, &version)?;
    if let Ok(bytes) = std::fs::read(cache.join("catalog.json")) {
        if let Ok(c) = serde_json::from_slice::<Catalog>(&bytes) {
            if c.format == CATALOG_FORMAT {
                return Ok(c);
            }
        }
    }
    let app2 = app.clone();
    let progress = move |phase: &str, downloaded: u64, total: Option<u64>| {
        let _ = app2.emit("mc-catalog-progress", Progress { phase: phase.into(), downloaded, total });
    };
    build(&cache, &version, &progress).await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Lädt echte Daten von Mojang (nur in CI): ANVIL_TEST_CATALOG=1.21.1
    #[test]
    fn real_catalog() {
        let Ok(version) = std::env::var("ANVIL_TEST_CATALOG") else { return };
        let cache = std::env::temp_dir().join(format!("anvil-mc-{version}"));
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        let c = rt.block_on(build(&cache, &version, &|p, d, _| println!("{p} {d}"))).unwrap();
        let get = |id: &str| c.entries.iter().find(|e| e.id == id).unwrap_or_else(|| panic!("{id} fehlt"));
        println!("{} Einträge, {} Texturen", c.entries.len(), c.textures.len());
        assert!(c.entries.len() > 1000, "zu wenige Einträge: {}", c.entries.len());
        assert_eq!(get("minecraft:stone").icon.kind, "cube");
        assert_eq!(get("minecraft:stone").name, "Stein");
        assert_eq!(get("minecraft:diamond").icon.kind, "flat");
        assert_eq!(get("minecraft:oak_log").icon.kind, "cube");
        assert_eq!(get("minecraft:oak_log").kind, "block");
        let none = c.entries.iter().filter(|e| e.icon.kind == "none").count();
        println!("ohne Icon: {none}");
        assert!(none < 80, "zu viele ohne Icon: {none}");
    }
}
