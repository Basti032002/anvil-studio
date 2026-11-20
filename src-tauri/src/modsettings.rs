//! Mod-Einstellungen: Name, Version, Autor, Beschreibung, Lizenz, Logo und
//! Kreativ-Tab. Gespeichert in gradle.properties, neoforge.mods.toml und
//! .anvil/content.json – genau dort, wo NeoForge sie erwartet.

use crate::projects::{unescape_properties, Project};
use crate::util::err;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ModSettings {
    pub name: String,
    pub version: String,
    pub authors: String,
    pub description: String,
    pub license: String,
    /// PNG als Base64 (ohne data:-Präfix). Beim Speichern: None = unverändert, "" = entfernen
    pub logo: Option<String>,
    pub tab_name: String,
    pub tab_icon: String,
}

fn root(p: &Project) -> PathBuf {
    PathBuf::from(&p.path)
}

fn read_props(file: &Path) -> std::collections::HashMap<String, String> {
    let mut m = std::collections::HashMap::new();
    if let Ok(text) = std::fs::read_to_string(file) {
        for line in text.lines() {
            let line = line.trim_start();
            if line.starts_with('#') {
                continue;
            }
            if let Some((k, v)) = line.split_once('=') {
                m.insert(k.trim().to_string(), unescape_properties(v.trim()));
            }
        }
    }
    m
}

fn toml_file(p: &Project) -> Option<PathBuf> {
    [
        "src/main/templates/META-INF/neoforge.mods.toml",
        "src/main/resources/META-INF/neoforge.mods.toml",
    ]
    .iter()
    .map(|r| root(p).join(r))
    .find(|f| f.exists())
}

fn logo_line(toml: &str) -> Option<String> {
    toml.lines().find_map(|l| {
        let t = l.trim_start();
        t.strip_prefix("logoFile").and_then(|r| r.split('"').nth(1)).map(|s| s.to_string())
    })
}

#[tauri::command]
pub fn mod_settings_get(app: AppHandle, project_id: String) -> Result<ModSettings, String> {
    let p = crate::projects::get(&app, &project_id)?;
    let props = read_props(&root(&p).join("gradle.properties"));
    let get = |k: &str| props.get(k).cloned().unwrap_or_default();
    let logo = toml_file(&p)
        .and_then(|f| std::fs::read_to_string(f).ok())
        .and_then(|t| logo_line(&t))
        .and_then(|name| std::fs::read(root(&p).join("src/main/resources").join(name)).ok())
        .map(|b| base64::engine::general_purpose::STANDARD.encode(b));
    let (content, _) = crate::content::load(&p)?;
    Ok(ModSettings {
        name: get("mod_name"),
        version: get("mod_version"),
        authors: get("mod_authors"),
        description: get("mod_description"),
        license: get("mod_license"),
        logo,
        tab_name: content.tab_name,
        tab_icon: content.tab_icon,
    })
}

fn set_logo(p: &Project, png: &str) -> Result<(), String> {
    let Some(file) = toml_file(p) else { return Err("neoforge.mods.toml wurde nicht gefunden.".into()) };
    let text = std::fs::read_to_string(&file).map_err(err)?;
    let res = root(p).join("src/main/resources");
    let mut lines: Vec<String> = text.lines().map(|l| l.to_string()).collect();
    let idx = lines.iter().position(|l| {
        let t = l.trim_start().trim_start_matches('#').trim_start();
        t.starts_with("logoFile")
    });
    if png.is_empty() {
        if let Some(i) = idx {
            lines[i] = "#logoFile=\"logo.png\" #optional".into();
        }
        let _ = std::fs::remove_file(res.join("logo.png"));
    } else {
        let bytes = base64::engine::general_purpose::STANDARD.decode(png.split_once(',').map(|(_, b)| b).unwrap_or(png).trim()).map_err(err)?;
        if bytes.len() > 4 * 1024 * 1024 || !bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
            return Err("Das Logo muss eine PNG-Datei (max. 4 MB) sein.".into());
        }
        std::fs::create_dir_all(&res).map_err(err)?;
        std::fs::write(res.join("logo.png"), bytes).map_err(err)?;
        let line = "logoFile=\"logo.png\"".to_string();
        match idx {
            Some(i) => lines[i] = line,
            None => {
                // nach displayName im [[mods]]-Block einfügen
                let at = lines.iter().position(|l| l.trim_start().starts_with("displayName")).map(|i| i + 1).unwrap_or(lines.len());
                lines.insert(at, line);
            }
        }
    }
    std::fs::write(&file, lines.join("\n") + "\n").map_err(err)
}

#[tauri::command]
pub fn mod_settings_save(app: AppHandle, project_id: String, settings: ModSettings) -> Result<(), String> {
    let p = crate::projects::get(&app, &project_id)?;
    let s = settings;
    if s.name.trim().is_empty() {
        return Err("Der Name darf nicht leer sein.".into());
    }
    if s.version.trim().is_empty() || s.version.contains(char::is_whitespace) {
        return Err("Die Version darf nicht leer sein und keine Leerzeichen enthalten (z. B. 1.0.0).".into());
    }
    let props = root(&p).join("gradle.properties");
    crate::template::set_properties(
        &props,
        &[
            ("mod_name", s.name.trim()),
            ("mod_version", s.version.trim()),
            ("mod_authors", s.authors.trim()),
            ("mod_description", s.description.trim()),
            ("mod_license", s.license.trim()),
        ],
    )?;
    if let Some(logo) = &s.logo {
        set_logo(&p, logo)?;
    }
    let name = s.name.trim().to_string();
    crate::projects::update(&app, &project_id, |pr| pr.name = name)?;
    let p = crate::projects::get(&app, &project_id)?;
    // Kreativ-Tab (Name steht in den Übersetzungen → neu erzeugen)
    let (mut content, _) = crate::content::load(&p)?;
    content.tab_name = s.tab_name.trim().to_string();
    content.tab_icon = s.tab_icon.trim().to_string();
    if content.blocks.is_empty() && content.items.is_empty() && content.mobs.is_empty() {
        crate::content::save_file(&p, &content)?;
    } else {
        crate::content::generate(&p, &mut content)?;
    }
    Ok(())
}
