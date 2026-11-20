use crate::util::{data_dir, err};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::AppHandle;

static LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// "startup" | "daily" | "weekly" | "manual"
    pub update_check: String,
    /// Gefundene Updates direkt herunterladen und installieren
    pub auto_install: bool,
    /// Alter Schalter (bis 0.3.0) – wird in update_channel übernommen
    pub include_prerelease: bool,
    /// "stable" | "beta" | "dev"
    pub update_channel: String,
    /// "code" | "idea"
    pub default_ide: String,
    /// Leer = Dokumente\Anvil Studio
    pub projects_dir: String,
    pub reduce_motion: bool,
    /// "dark" | "light" | "system"
    pub theme: String,
    /// "green" | "blue" | "violet" | "orange"
    pub accent: String,
    pub console_font_size: u32,
    /// Unix-Zeit der letzten Update-Prüfung (nimmt auch Kommazahlen an)
    #[serde(deserialize_with = "lenient_u64")]
    pub last_update_check: u64,
    /// Adresse des Workshop-Servers
    pub workshop_url: String,
    /// Seite beim Start: "workshop" | "projects"
    pub start_page: String,
    /// Arbeitsspeicher beim Spielen aus dem Workshop (MB)
    pub play_memory_mb: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            update_check: "startup".into(),
            auto_install: true,
            include_prerelease: false,
            update_channel: String::new(),
            default_ide: "code".into(),
            projects_dir: String::new(),
            reduce_motion: false,
            theme: "dark".into(),
            accent: "green".into(),
            console_font_size: 12,
            last_update_check: 0,
            workshop_url: DEFAULT_WORKSHOP.into(),
            start_page: "workshop".into(),
            play_memory_mb: 4096,
        }
    }
}

pub fn load(app: &AppHandle) -> Settings {
    let Ok(dir) = data_dir(app) else { return normalize(Settings::default()) };
    normalize(
        std::fs::read_to_string(dir.join("settings.json"))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default(),
    )
}

pub const DEFAULT_WORKSHOP: &str = "https://workshop.forge-host.net";

fn normalize(mut s: Settings) -> Settings {
    if s.workshop_url.trim().is_empty() {
        s.workshop_url = DEFAULT_WORKSHOP.into();
    }
    s.workshop_url = s.workshop_url.trim().trim_end_matches('/').to_string();
    if !matches!(s.start_page.as_str(), "workshop" | "projects") {
        s.start_page = "workshop".into();
    }
    if s.play_memory_mb == 0 {
        s.play_memory_mb = 4096;
    }
    s.play_memory_mb = s.play_memory_mb.clamp(1024, 32768);
    if !matches!(s.update_channel.as_str(), "stable" | "beta" | "dev") {
        s.update_channel = if s.include_prerelease { "beta".into() } else { "stable".into() };
    }
    s
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    load(&app)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<Settings, String> {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut s = normalize(settings);
    s.include_prerelease = s.update_channel != "stable";
    if !matches!(s.update_check.as_str(), "startup" | "daily" | "weekly" | "manual") {
        s.update_check = "startup".into();
    }
    if !matches!(s.default_ide.as_str(), "code" | "idea") {
        s.default_ide = "code".into();
    }
    s.console_font_size = s.console_font_size.clamp(10, 18);
    if !matches!(s.theme.as_str(), "dark" | "light" | "system") {
        s.theme = "dark".into();
    }
    if !matches!(s.accent.as_str(), "green" | "blue" | "violet" | "orange") {
        s.accent = "green".into();
    }
    let file = data_dir(&app)?.join("settings.json");
    let tmp = file.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(&s).map_err(err)?).map_err(err)?;
    std::fs::rename(&tmp, &file).map_err(err)?;
    Ok(s)
}

/// Akzeptiert ganze Zahlen und Kommazahlen (z. B. 1795118342.13).
fn lenient_u64<'de, D: serde::Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
    let v = serde_json::Value::deserialize(d)?;
    Ok(match v {
        serde_json::Value::Number(n) => n.as_u64().or_else(|| n.as_f64().map(|f| f.max(0.0) as u64)).unwrap_or(0),
        _ => 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_float_timestamp() {
        let s: Settings = serde_json::from_str(r#"{"lastUpdateCheck": 1795118342.13}"#).unwrap();
        assert_eq!(s.last_update_check, 1795118342);
        let s: Settings = serde_json::from_str(r#"{"lastUpdateCheck": 5}"#).unwrap();
        assert_eq!(s.last_update_check, 5);
    }
}
