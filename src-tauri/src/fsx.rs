//! Dateizugriff für den eingebauten Code-Editor – nur innerhalb des Projektordners.

use crate::util::err;
use serde::Serialize;
use std::path::{Component, Path, PathBuf};
use tauri::AppHandle;

/// Ordner, die im Dateibaum nicht auftauchen (Build-Ausgaben, Caches)
const HIDDEN: &[&str] = &["build", ".gradle", "run", "runs", ".git", ".idea", ".vscode", "out", "bin", "node_modules"];
const MAX_SIZE: u64 = 2 * 1024 * 1024;

fn resolve(app: &AppHandle, project_id: &str, rel: &str) -> Result<(PathBuf, PathBuf), String> {
    let p = crate::projects::get(app, project_id)?;
    let root = PathBuf::from(&p.path);
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() || rel_path.components().any(|c| matches!(c, Component::ParentDir | Component::Prefix(_) | Component::RootDir)) {
        return Err(crate::i18n::tr("Ungültiger Pfad"));
    }
    Ok((root.clone(), root.join(rel_path)))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    name: String,
    rel: String,
    is_dir: bool,
    size: u64,
}

#[tauri::command]
pub fn files_list(app: AppHandle, project_id: String, rel: String) -> Result<Vec<Entry>, String> {
    let (root, dir) = resolve(&app, &project_id, &rel)?;
    let mut out = vec![];
    for e in std::fs::read_dir(&dir).map_err(err)?.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        let meta = e.metadata().map_err(err)?;
        if meta.is_dir() && (HIDDEN.contains(&name.as_str()) || (rel == ".anvil" && name == "mods")) {
            continue;
        }
        let rel_path = e.path().strip_prefix(&root).map_err(err)?.to_string_lossy().replace('\\', "/");
        out.push(Entry { name, rel: rel_path, is_dir: meta.is_dir(), size: meta.len() });
    }
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

#[tauri::command]
pub fn files_read(app: AppHandle, project_id: String, rel: String) -> Result<String, String> {
    let (_, path) = resolve(&app, &project_id, &rel)?;
    let meta = std::fs::metadata(&path).map_err(err)?;
    if meta.len() > MAX_SIZE {
        return Err("Die Datei ist zu groß für den Editor.".into());
    }
    let bytes = std::fs::read(&path).map_err(err)?;
    String::from_utf8(bytes).map_err(|_| "Keine Textdatei – sie lässt sich hier nicht bearbeiten.".to_string())
}

#[tauri::command]
pub fn files_write(app: AppHandle, project_id: String, rel: String, content: String) -> Result<(), String> {
    let (_, path) = resolve(&app, &project_id, &rel)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(err)?;
    }
    std::fs::write(path, content).map_err(err)
}

#[tauri::command]
pub fn files_create(app: AppHandle, project_id: String, rel: String, is_dir: bool) -> Result<(), String> {
    let (_, path) = resolve(&app, &project_id, &rel)?;
    if path.exists() {
        return Err("Existiert bereits.".into());
    }
    if is_dir {
        std::fs::create_dir_all(path).map_err(err)
    } else {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(err)?;
        }
        std::fs::write(path, "").map_err(err)
    }
}

/// Datei oder Ordner in den Papierkorb verschieben.
#[tauri::command]
pub fn files_delete(app: AppHandle, project_id: String, rel: String) -> Result<(), String> {
    if rel.trim().is_empty() {
        return Err(crate::i18n::tr("Ungültiger Pfad"));
    }
    let (_, path) = resolve(&app, &project_id, &rel)?;
    trash::delete(&path).or_else(|_| if path.is_dir() { std::fs::remove_dir_all(&path) } else { std::fs::remove_file(&path) }.map_err(err))
}

#[tauri::command]
pub fn files_rename(app: AppHandle, project_id: String, rel: String, new_rel: String) -> Result<(), String> {
    let (_, from) = resolve(&app, &project_id, &rel)?;
    let (_, to) = resolve(&app, &project_id, &new_rel)?;
    if to.exists() {
        return Err(crate::i18n::tr("Ziel existiert bereits."));
    }
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent).map_err(err)?;
    }
    std::fs::rename(from, to).map_err(err)
}

/// Datei/Ordner im Windows-Explorer markieren.
#[tauri::command]
pub fn files_reveal(app: AppHandle, project_id: String, rel: String) -> Result<(), String> {
    let (_, path) = resolve(&app, &project_id, &rel)?;
    let mut cmd = if cfg!(windows) {
        let mut c = std::process::Command::new("explorer");
        c.arg(format!("/select,{}", path.display()));
        c
    } else {
        let mut c = std::process::Command::new(if cfg!(target_os = "macos") { "open" } else { "xdg-open" });
        c.arg(path.parent().unwrap_or(&path));
        c
    };
    cmd.spawn().map(|_| ()).map_err(err)
}
