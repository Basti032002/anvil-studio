//! Export-Seite: fertige Mod-Dateien verwalten und Quellcode als ZIP sichern.

use crate::util::err;
use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JarInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    /// Unix-Zeit in Sekunden
    pub modified: u64,
}

fn libs_dir(app: &AppHandle, project_id: &str) -> Result<PathBuf, String> {
    let project = crate::projects::get(app, project_id)?;
    Ok(PathBuf::from(&project.path).join("build").join("libs"))
}

/// Fertige Mod-Dateien mit Größe und Datum, neueste zuerst.
#[tauri::command]
pub fn export_jars(app: AppHandle, project_id: String) -> Result<Vec<JarInfo>, String> {
    let mut out = vec![];
    if let Ok(entries) = std::fs::read_dir(libs_dir(&app, &project_id)?) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if !name.ends_with(".jar") || name.ends_with("-sources.jar") || name.ends_with("-javadoc.jar") {
                continue;
            }
            let meta = e.metadata().map_err(err)?;
            let modified = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
            out.push(JarInfo { path: e.path().to_string_lossy().to_string(), name, size: meta.len(), modified });
        }
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(out)
}

fn check_in_libs(app: &AppHandle, project_id: &str, path: &str) -> Result<PathBuf, String> {
    let libs = libs_dir(app, project_id)?.canonicalize().map_err(err)?;
    let p = PathBuf::from(path).canonicalize().map_err(err)?;
    if !p.starts_with(&libs) || p.extension().and_then(|e| e.to_str()) != Some("jar") {
        return Err("Diese Datei gehört nicht zu den Mod-Dateien des Projekts.".into());
    }
    Ok(p)
}

/// Mod-Datei an einen gewählten Ort kopieren.
#[tauri::command]
pub fn export_copy_jar(app: AppHandle, project_id: String, path: String, dest: String) -> Result<(), String> {
    let src = check_in_libs(&app, &project_id, &path)?;
    std::fs::copy(src, &dest).map_err(|e| format!("Kopieren fehlgeschlagen: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn export_delete_jar(app: AppHandle, project_id: String, path: String) -> Result<(), String> {
    let p = check_in_libs(&app, &project_id, &path)?;
    std::fs::remove_file(p).map_err(err)
}

/// Ordner, die nicht in die Quellcode-ZIP gehören
const SKIP: [&str; 11] = ["build", ".gradle", "run", "runs", ".idea", "out", "bin", "node_modules", ".vscode", "logs", ".git"];

fn skip(rel: &Path) -> bool {
    rel.components().next().and_then(|c| c.as_os_str().to_str()).map(|first| SKIP.contains(&first)).unwrap_or(false)
}

/// Projektordner (ohne Build- und Spielordner) als ZIP schreiben. Rückgabe: Anzahl Dateien.
pub fn zip_project(root: &Path, dest: &Path) -> Result<u64, String> {
    let file = std::fs::File::create(dest).map_err(|e| format!("ZIP kann nicht angelegt werden: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut count = 0;
    let dest_abs = dest.canonicalize().unwrap_or(dest.to_path_buf());
    for entry in walkdir::WalkDir::new(root).into_iter().filter_entry(|e| {
        let rel = e.path().strip_prefix(root).unwrap_or(e.path());
        rel.as_os_str().is_empty() || !skip(rel)
    }) {
        let entry = entry.map_err(err)?;
        if !entry.file_type().is_file() || entry.path().canonicalize().ok().as_ref() == Some(&dest_abs) {
            continue;
        }
        let rel = entry.path().strip_prefix(root).map_err(err)?;
        let name = rel.to_string_lossy().replace('\\', "/");
        zip.start_file(name, opts).map_err(err)?;
        zip.write_all(&std::fs::read(entry.path()).map_err(err)?).map_err(err)?;
        count += 1;
    }
    zip.finish().map_err(err)?;
    Ok(count)
}

/// Quellcode des Projekts als ZIP speichern (ohne Build- und Spielordner).
#[tauri::command]
pub async fn export_source_zip(app: AppHandle, project_id: String, dest: String) -> Result<u64, String> {
    let project = crate::projects::get(&app, &project_id)?;
    let root = PathBuf::from(&project.path);
    tauri::async_runtime::spawn_blocking(move || zip_project(&root, &PathBuf::from(dest))).await.map_err(err)?
}
