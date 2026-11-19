use crate::util::{data_dir, err};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::AppHandle;

static LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LastRun {
    pub task: String,
    pub success: bool,
    pub finished_at: u64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub mod_id: String,
    pub package: String,
    pub mc_version: String,
    pub loader: String,
    pub path: String,
    pub created_at: u64,
    #[serde(default)]
    pub last_run: Option<LastRun>,
}

fn file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("projects.json"))
}

fn load(app: &AppHandle) -> Result<Vec<Project>, String> {
    let f = file(app)?;
    if !f.exists() {
        return Ok(vec![]);
    }
    let s = std::fs::read_to_string(&f).map_err(err)?;
    serde_json::from_str(&s).map_err(|e| format!("projects.json ist beschädigt: {e}"))
}

fn save(app: &AppHandle, list: &[Project]) -> Result<(), String> {
    let f = file(app)?;
    let tmp = f.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(list).map_err(err)?).map_err(err)?;
    std::fs::rename(&tmp, &f).map_err(err)
}

pub fn get(app: &AppHandle, id: &str) -> Result<Project, String> {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    load(app)?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "Projekt nicht gefunden".to_string())
}

pub fn add(app: &AppHandle, project: Project) -> Result<(), String> {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut list = load(app)?;
    list.push(project);
    save(app, &list)
}

pub fn update<F: FnOnce(&mut Project)>(app: &AppHandle, id: &str, f: F) -> Result<(), String> {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut list = load(app)?;
    if let Some(p) = list.iter_mut().find(|p| p.id == id) {
        f(p);
    }
    save(app, &list)
}

#[tauri::command]
pub fn list_projects(app: AppHandle) -> Result<Vec<Project>, String> {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut list = load(&app)?;
    list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(list)
}

/// Entfernt das Projekt nur aus der Liste – die Dateien auf der Festplatte bleiben erhalten.
#[tauri::command]
pub fn remove_project(app: AppHandle, project_id: String) -> Result<(), String> {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut list = load(&app)?;
    list.retain(|p| p.id != project_id);
    save(&app, &list)
}
