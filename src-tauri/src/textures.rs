//! Textur-Bibliothek (Tab „Texturen“): Texturen mit Ebenen und Frames,
//! gespeichert in <Projekt>/.anvil/textures/<id>.json (Editor-Daten) und <id>.png (fertiges Bild).

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[derive(Serialize, Deserialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct LibTexMeta {
    pub id: String,
    pub size: u32,
    pub frames: u32,
    /// Ticks pro Frame (20 = 1 Sekunde)
    pub frametime: u32,
    pub interpolate: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LibTex {
    #[serde(flatten)]
    pub meta: LibTexMeta,
    /// fertiges Bild (Frames untereinander) als Base64-PNG
    pub png: String,
}

pub fn lib_dir(root: &Path) -> PathBuf {
    root.join(".anvil").join("textures")
}

pub fn valid(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

fn decode_png(b64: &str) -> Result<Vec<u8>, String> {
    let b64 = b64.split_once(',').map(|(_, b)| b).unwrap_or(b64);
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64.trim()).map_err(err)?;
    if bytes.len() > 8 * 1024 * 1024 || !bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Err("Keine gültige PNG-Datei".into());
    }
    Ok(bytes)
}

fn meta_of(doc: &serde_json::Value, id: &str) -> LibTexMeta {
    let n = |k: &str, d: u64| doc.get(k).and_then(|v| v.as_u64()).unwrap_or(d) as u32;
    LibTexMeta {
        id: id.to_string(),
        size: n("size", 16).clamp(1, 512),
        frames: doc.get("frames").and_then(|f| f.as_array()).map(|a| a.len() as u32).unwrap_or(1).max(1),
        frametime: n("frametime", 4).clamp(1, 1200),
        interpolate: doc.get("interpolate").and_then(|v| v.as_bool()).unwrap_or(false),
    }
}

/// Alle Bibliotheks-Texturen (für die Generierung): (Metadaten, Pfad zum PNG)
pub fn all(root: &Path) -> Vec<(LibTexMeta, PathBuf)> {
    let dir = lib_dir(root);
    let mut out = vec![];
    let Ok(rd) = std::fs::read_dir(&dir) else { return out };
    for e in rd.flatten() {
        let path = e.path();
        if path.extension().and_then(|x| x.to_str()) != Some("png") {
            continue;
        }
        let id = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
        if !valid(&id) {
            continue;
        }
        let doc: serde_json::Value = std::fs::read(dir.join(format!("{id}.json"))).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        out.push((meta_of(&doc, &id), path));
    }
    out.sort_by(|a, b| a.0.id.cmp(&b.0.id));
    out
}

fn project_root(app: &AppHandle, project_id: &str) -> Result<PathBuf, String> {
    Ok(PathBuf::from(crate::projects::get(app, project_id)?.path))
}

#[tauri::command]
pub fn lib_tex_list(app: AppHandle, project_id: String) -> Result<Vec<LibTex>, String> {
    let root = project_root(&app, &project_id)?;
    Ok(all(&root)
        .into_iter()
        .filter_map(|(meta, path)| std::fs::read(path).ok().map(|b| LibTex { meta, png: base64::engine::general_purpose::STANDARD.encode(b) }))
        .collect())
}

/// Editor-Daten (Ebenen, Frames) als JSON-Text
#[tauri::command]
pub fn lib_tex_load(app: AppHandle, project_id: String, id: String) -> Result<Option<String>, String> {
    if !valid(&id) {
        return Err("Ungültiger Name".into());
    }
    let dir = lib_dir(&project_root(&app, &project_id)?);
    Ok(std::fs::read_to_string(dir.join(format!("{id}.json"))).ok())
}

#[tauri::command]
pub fn lib_tex_save(app: AppHandle, project_id: String, id: String, doc: String, png: String) -> Result<(), String> {
    if !valid(&id) {
        return Err("Ungültiger Name – nur a–z, 0–9 und _".into());
    }
    if doc.len() > 32 * 1024 * 1024 {
        return Err("Textur zu groß".into());
    }
    serde_json::from_str::<serde_json::Value>(&doc).map_err(err)?;
    let bytes = decode_png(&png)?;
    let dir = lib_dir(&project_root(&app, &project_id)?);
    std::fs::create_dir_all(&dir).map_err(err)?;
    std::fs::write(dir.join(format!("{id}.json")), doc).map_err(err)?;
    std::fs::write(dir.join(format!("{id}.png")), bytes).map_err(err)?;
    sync(&app, &project_id)
}

/// Sofort in den Mod-Ordner übernehmen (für „Neu laden“ im laufenden Spiel)
fn sync(app: &AppHandle, project_id: &str) -> Result<(), String> {
    let p = crate::projects::get(app, project_id)?;
    let root = PathBuf::from(&p.path);
    let assets = root.join(format!("src/main/resources/assets/{}", p.mod_id));
    if assets.exists() {
        write_assets(&root, &assets)?;
    }
    Ok(())
}

#[tauri::command]
pub fn lib_tex_delete(app: AppHandle, project_id: String, id: String) -> Result<(), String> {
    if !valid(&id) {
        return Err("Ungültiger Name".into());
    }
    let dir = lib_dir(&project_root(&app, &project_id)?);
    for ext in ["json", "png"] {
        let _ = std::fs::remove_file(dir.join(format!("{id}.{ext}")));
    }
    sync(&app, &project_id)
}

#[tauri::command]
pub fn png_read(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(err)?;
    if bytes.len() > 8 * 1024 * 1024 || !bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Err("Keine gültige PNG-Datei".into());
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
pub fn png_write(path: String, png: String) -> Result<(), String> {
    let bytes = decode_png(&png)?;
    if !path.to_lowercase().ends_with(".png") {
        return Err("Bitte als .png speichern".into());
    }
    std::fs::write(path, bytes).map_err(err)
}

/// Texturen in den Mod-Ordner kopieren: assets/<modid>/textures/block/lib/<id>.png (+ .mcmeta bei Animation).
/// Gibt die vorhandenen IDs zurück.
pub fn write_assets(root: &Path, assets: &Path) -> Result<Vec<String>, String> {
    let out = assets.join("textures/block/lib");
    let list = all(root);
    let ids: Vec<String> = list.iter().map(|(m, _)| m.id.clone()).collect();
    if list.is_empty() && !out.exists() {
        return Ok(ids);
    }
    std::fs::create_dir_all(&out).map_err(err)?;
    for (m, src) in &list {
        let dest = out.join(format!("{}.png", m.id));
        let bytes = std::fs::read(src).map_err(err)?;
        if std::fs::read(&dest).ok().as_deref() != Some(&bytes[..]) {
            std::fs::write(&dest, &bytes).map_err(err)?;
        }
        let meta = out.join(format!("{}.png.mcmeta", m.id));
        if m.frames > 1 {
            let j = serde_json::json!({ "animation": { "frametime": m.frametime, "interpolate": m.interpolate } });
            std::fs::write(&meta, serde_json::to_string_pretty(&j).map_err(err)?).map_err(err)?;
        } else {
            let _ = std::fs::remove_file(&meta);
        }
    }
    // Gelöschte aufräumen
    if let Ok(rd) = std::fs::read_dir(&out) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            let stem = name.trim_end_matches(".mcmeta").trim_end_matches(".png");
            if !ids.iter().any(|i| i == stem) {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
    Ok(ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_and_cleans() {
        let root = std::env::temp_dir().join(format!("anvil-tex-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let dir = lib_dir(&root);
        std::fs::create_dir_all(&dir).unwrap();
        let png = crate::content::test_png();
        std::fs::write(dir.join("stein.png"), &png).unwrap();
        std::fs::write(dir.join("lava.png"), &png).unwrap();
        std::fs::write(dir.join("lava.json"), r#"{"size":16,"frametime":3,"frames":[{},{}]}"#).unwrap();
        std::fs::write(dir.join("Böse.png"), &png).unwrap();
        let assets = root.join("assets");
        let ids = write_assets(&root, &assets).unwrap();
        assert_eq!(ids, vec!["lava".to_string(), "stein".to_string()]);
        let mc = std::fs::read_to_string(assets.join("textures/block/lib/lava.png.mcmeta")).unwrap();
        assert!(mc.contains("\"frametime\": 3"));
        assert!(!assets.join("textures/block/lib/stein.png.mcmeta").exists());
        std::fs::remove_file(dir.join("stein.png")).unwrap();
        write_assets(&root, &assets).unwrap();
        assert!(!assets.join("textures/block/lib/stein.png").exists());
        let _ = std::fs::remove_dir_all(&root);
    }
}
