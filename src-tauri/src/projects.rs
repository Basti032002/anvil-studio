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

pub fn unescape_properties(s: &str) -> String {
    let mut out = String::new();
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\\' && chars.peek() == Some(&'n') {
            chars.next();
            out.push('\n');
            continue;
        }
        if c == '\\' && chars.peek() == Some(&'u') {
            chars.next();
            let hex: String = chars.by_ref().take(4).collect();
            if let Some(ch) = u32::from_str_radix(&hex, 16).ok().and_then(char::from_u32) {
                out.push(ch);
                continue;
            }
            out.push_str("\\u");
            out.push_str(&hex);
        } else {
            out.push(c);
        }
    }
    out
}

/// Bestehendes NeoForge-Projekt (ModDevGradle) aufnehmen.
#[tauri::command]
pub fn import_project(app: AppHandle, path: String, setup_world: bool) -> Result<Project, String> {
    let dir = PathBuf::from(path.trim());
    let props_file = dir.join("gradle.properties");
    let build = dir.join("build.gradle");
    if !props_file.exists() || !build.exists() {
        return Err("Kein Gradle-Projekt: gradle.properties oder build.gradle fehlt.".into());
    }
    let build_text = std::fs::read_to_string(&build).map_err(err)?;
    if !build_text.contains("net.neoforged.moddev") {
        return Err("Anvil Studio unterstützt bisher nur NeoForge-Projekte mit ModDevGradle (wie im offiziellen MDK).".into());
    }
    let props = std::fs::read_to_string(&props_file).map_err(err)?;
    let prop = |key: &str| {
        props
            .lines()
            .find_map(|l| l.trim().strip_prefix(&format!("{key}=")).map(|v| unescape_properties(v.trim())))
            .unwrap_or_default()
    };
    let mod_id = prop("mod_id");
    if mod_id.is_empty() {
        return Err("mod_id fehlt in gradle.properties.".into());
    }
    let canonical = dir.canonicalize().unwrap_or(dir.clone()).to_string_lossy().to_string();
    {
        let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
        if load(&app)?.iter().any(|p| PathBuf::from(&p.path).canonicalize().map(|c| c.to_string_lossy() == canonical).unwrap_or(false)) {
            return Err("Dieses Projekt ist bereits in der Liste.".into());
        }
    }
    if setup_world && !build_text.contains("anvilWorld") {
        std::fs::write(&build, format!("{build_text}{}", crate::template::GRADLE_SNIPPET)).map_err(err)?;
    }
    let name = prop("mod_name");
    let project = Project {
        id: format!("{mod_id}-{}", crate::util::now()),
        name: if name.is_empty() { mod_id.clone() } else { name },
        package: prop("mod_group_id"),
        mc_version: prop("minecraft_version"),
        loader: "neoforge".into(),
        path: dir.to_string_lossy().to_string(),
        created_at: crate::util::now(),
        last_run: None,
        mod_id,
    };
    add(&app, project.clone())?;
    Ok(project)
}
