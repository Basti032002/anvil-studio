//! Mods zum Testen mitladen (Modrinth).
//!
//! Heruntergeladene Mods liegen im Projekt unter `.anvil/mods/`, die Liste in
//! `.anvil/mods.json`. Vor jedem Testlauf werden die aktiven Mods nach
//! `run/mods/` kopiert. Dateien, die der Nutzer selbst dort abgelegt hat,
//! bleiben unangetastet – entfernt wird nur, was Anvil Studio selbst kopiert hat.

use crate::projects::Project;
use crate::util::{err, net_err};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha512};
use std::path::PathBuf;
use tauri::AppHandle;

const API: &str = "https://api.modrinth.com/v2";
const MODS_SCHEMA: u32 = 1;

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ModEntry {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub icon_url: String,
    pub version_id: String,
    pub version_number: String,
    pub file_name: String,
    /// required | optional | unsupported
    pub client_side: String,
    pub server_side: String,
    pub enabled: bool,
    /// Wurde als Abhängigkeit dieser Mod mitinstalliert
    pub dependency_of: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ModsFile {
    pub schema_version: u32,
    pub mods: Vec<ModEntry>,
    /// Von Anvil Studio nach run/mods kopierte Dateien
    pub placed: Vec<String>,
}

fn dir(p: &Project) -> PathBuf {
    PathBuf::from(&p.path).join(".anvil")
}
fn cache(p: &Project) -> PathBuf {
    dir(p).join("mods")
}

fn load(p: &Project) -> ModsFile {
    let mut f: ModsFile = std::fs::read_to_string(dir(p).join("mods.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    f.schema_version = MODS_SCHEMA;
    f
}

fn save(p: &Project, f: &ModsFile) -> Result<(), String> {
    std::fs::create_dir_all(dir(p)).map_err(err)?;
    std::fs::write(dir(p).join("mods.json"), serde_json::to_string_pretty(f).map_err(err)?).map_err(err)
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!("Basti032002/anvil-studio/", env!("CARGO_PKG_VERSION"), " (github.com/Basti032002/anvil-studio-releases)"))
        .connect_timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| net_err(&e))
}

async fn api(path: &str, query: &[(&str, String)]) -> Result<Value, String> {
    let resp = client()?
        .get(format!("{API}{path}"))
        .query(query)
        .send()
        .await
        .map_err(|e| format!("Modrinth nicht erreichbar: {}", net_err(&e)))?;
    if !resp.status().is_success() {
        return Err(format!("Modrinth antwortet mit HTTP {}", resp.status()));
    }
    serde_json::from_str(&resp.text().await.map_err(|e| net_err(&e))?).map_err(err)
}

fn safe_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Ungültige Mod-ID".into());
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    project_id: String,
    slug: String,
    title: String,
    description: String,
    icon_url: String,
    downloads: u64,
    author: String,
}

#[tauri::command]
pub async fn mods_search(app: AppHandle, project_id: String, query: String) -> Result<Vec<SearchHit>, String> {
    let p = crate::projects::get(&app, &project_id)?;
    let facets = format!(r#"[["project_type:mod"],["categories:neoforge"],["versions:{}"]]"#, p.mc_version);
    let v = api(
        "/search",
        &[("query", query), ("facets", facets), ("limit", "20".into()), ("index", "relevance".into())],
    )
    .await?;
    Ok(v["hits"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|h| SearchHit {
            project_id: h["project_id"].as_str().unwrap_or_default().into(),
            slug: h["slug"].as_str().unwrap_or_default().into(),
            title: h["title"].as_str().unwrap_or_default().into(),
            description: h["description"].as_str().unwrap_or_default().into(),
            icon_url: h["icon_url"].as_str().unwrap_or_default().into(),
            downloads: h["downloads"].as_u64().unwrap_or(0),
            author: h["author"].as_str().unwrap_or_default().into(),
        })
        .collect())
}

#[tauri::command]
pub fn mods_list(app: AppHandle, project_id: String) -> Result<Vec<ModEntry>, String> {
    let p = crate::projects::get(&app, &project_id)?;
    Ok(load(&p).mods)
}

/// Neueste passende Version (Release bevorzugt) für NeoForge + MC-Version des Projekts.
async fn best_version(p: &Project, mod_id: &str) -> Result<Value, String> {
    let versions = api(
        &format!("/project/{mod_id}/version"),
        &[("loaders", r#"["neoforge"]"#.into()), ("game_versions", format!(r#"["{}"]"#, p.mc_version))],
    )
    .await?;
    let list = versions.as_array().cloned().unwrap_or_default();
    list.iter()
        .find(|v| v["version_type"] == "release")
        .or(list.first())
        .cloned()
        .ok_or_else(|| format!("Keine Version für NeoForge {} gefunden.", p.mc_version))
}

async fn download_version(p: &Project, version: &Value) -> Result<String, String> {
    let files = version["files"].as_array().cloned().unwrap_or_default();
    let file = files.iter().find(|f| f["primary"].as_bool().unwrap_or(false)).or(files.first()).ok_or("Version ohne Datei")?;
    let url = file["url"].as_str().ok_or("Keine Download-Adresse")?;
    if !url.starts_with("https://cdn.modrinth.com/") {
        return Err("Unerwartete Download-Adresse".into());
    }
    let name: String = file["filename"].as_str().unwrap_or("mod.jar").chars().filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+')).collect();
    if !name.ends_with(".jar") {
        return Err("Unerwartete Datei".into());
    }
    std::fs::create_dir_all(cache(p)).map_err(err)?;
    let target = cache(p).join(&name);
    if !target.exists() {
        crate::util::download(url, &target, &|_, _| {}).await?;
        if let Some(expected) = file["hashes"]["sha512"].as_str() {
            let bytes = std::fs::read(&target).map_err(err)?;
            let actual: String = Sha512::digest(&bytes).iter().map(|b| format!("{b:02x}")).collect();
            if !actual.eq_ignore_ascii_case(expected) {
                let _ = std::fs::remove_file(&target);
                return Err("Prüfsumme der Mod stimmt nicht – Datei verworfen.".into());
            }
        }
    }
    Ok(name)
}

async fn install(p: &Project, f: &mut ModsFile, mod_id: &str, dependency_of: Option<String>, depth: u32) -> Result<(), String> {
    safe_id(mod_id)?;
    if f.mods.iter().any(|m| m.project_id == mod_id || m.slug == mod_id) {
        return Ok(());
    }
    let info = api(&format!("/project/{mod_id}"), &[]).await?;
    let version = best_version(p, mod_id).await?;
    let file_name = download_version(p, &version).await?;
    let pid = info["id"].as_str().unwrap_or(mod_id).to_string();
    f.mods.push(ModEntry {
        project_id: pid.clone(),
        slug: info["slug"].as_str().unwrap_or_default().into(),
        title: info["title"].as_str().unwrap_or(mod_id).into(),
        icon_url: info["icon_url"].as_str().unwrap_or_default().into(),
        version_id: version["id"].as_str().unwrap_or_default().into(),
        version_number: version["version_number"].as_str().unwrap_or_default().into(),
        file_name,
        client_side: info["client_side"].as_str().unwrap_or("required").into(),
        server_side: info["server_side"].as_str().unwrap_or("required").into(),
        enabled: true,
        dependency_of,
    });
    if depth < 3 {
        for dep in version["dependencies"].as_array().cloned().unwrap_or_default() {
            if dep["dependency_type"] == "required" {
                if let Some(dep_id) = dep["project_id"].as_str() {
                    Box::pin(install(p, f, dep_id, Some(pid.clone()), depth + 1)).await?;
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn mods_add(app: AppHandle, project_id: String, mod_id: String) -> Result<Vec<ModEntry>, String> {
    let p = crate::projects::get(&app, &project_id)?;
    let mut f = load(&p);
    install(&p, &mut f, &mod_id, None, 0).await?;
    save(&p, &f)?;
    Ok(f.mods)
}

#[tauri::command]
pub fn mods_remove(app: AppHandle, project_id: String, mod_id: String) -> Result<Vec<ModEntry>, String> {
    let p = crate::projects::get(&app, &project_id)?;
    let mut f = load(&p);
    let removed: Vec<ModEntry> = f.mods.iter().filter(|m| m.project_id == mod_id).cloned().collect();
    f.mods.retain(|m| m.project_id != mod_id);
    // Abhängigkeiten, die nur für diese Mod da waren, mit entfernen
    f.mods.retain(|m| m.dependency_of.as_deref() != Some(mod_id.as_str()));
    for m in removed {
        if !f.mods.iter().any(|o| o.file_name == m.file_name) {
            let _ = std::fs::remove_file(cache(&p).join(&m.file_name));
        }
    }
    save(&p, &f)?;
    Ok(f.mods)
}

#[tauri::command]
pub fn mods_toggle(app: AppHandle, project_id: String, mod_id: String, enabled: bool) -> Result<Vec<ModEntry>, String> {
    let p = crate::projects::get(&app, &project_id)?;
    let mut f = load(&p);
    for m in f.mods.iter_mut().filter(|m| m.project_id == mod_id) {
        m.enabled = enabled;
    }
    save(&p, &f)?;
    Ok(f.mods)
}

/// Alle Mods auf die neueste passende Version bringen. Gibt die Anzahl der Updates zurück.
#[tauri::command]
pub async fn mods_update(app: AppHandle, project_id: String) -> Result<u32, String> {
    let p = crate::projects::get(&app, &project_id)?;
    let mut f = load(&p);
    let mut count = 0;
    for i in 0..f.mods.len() {
        let id = f.mods[i].project_id.clone();
        let Ok(v) = best_version(&p, &id).await else { continue };
        let vid = v["id"].as_str().unwrap_or_default().to_string();
        if vid != f.mods[i].version_id {
            let name = download_version(&p, &v).await?;
            let old = std::mem::replace(&mut f.mods[i].file_name, name);
            f.mods[i].version_id = vid;
            f.mods[i].version_number = v["version_number"].as_str().unwrap_or_default().into();
            if old != f.mods[i].file_name {
                let _ = std::fs::remove_file(cache(&p).join(old));
            }
            count += 1;
        }
    }
    save(&p, &f)?;
    Ok(count)
}

/// Vor dem Start: aktive Mods nach run/mods kopieren. side = "client" | "server".
pub fn sync(p: &Project, side: &str) -> Result<usize, String> {
    let mut f = load(p);
    if f.mods.is_empty() && f.placed.is_empty() {
        return Ok(0);
    }
    let run_mods = PathBuf::from(&p.path).join("run").join("mods");
    std::fs::create_dir_all(&run_mods).map_err(err)?;
    let wanted: Vec<&ModEntry> = f
        .mods
        .iter()
        .filter(|m| m.enabled)
        .filter(|m| if side == "server" { m.server_side != "unsupported" } else { m.client_side != "unsupported" })
        .collect();
    let wanted_names: Vec<String> = wanted.iter().map(|m| m.file_name.clone()).collect();
    for old in &f.placed {
        if !wanted_names.contains(old) {
            let _ = std::fs::remove_file(run_mods.join(old));
        }
    }
    for m in &wanted {
        let src = cache(p).join(&m.file_name);
        let dst = run_mods.join(&m.file_name);
        if src.exists() && !dst.exists() {
            std::fs::copy(&src, &dst).map_err(err)?;
        }
    }
    f.placed = wanted_names;
    let n = f.placed.len();
    save(p, &f)?;
    Ok(n)
}
