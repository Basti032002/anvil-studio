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
    /// Auch Vorabversionen (Pre-Releases) anbieten
    pub include_prerelease: bool,
    /// "code" | "idea"
    pub default_ide: String,
    /// Leer = Dokumente\Anvil Studio
    pub projects_dir: String,
    pub reduce_motion: bool,
    pub console_font_size: u32,
    /// Unix-Zeit der letzten Update-Prüfung
    pub last_update_check: u64,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            update_check: "startup".into(),
            auto_install: true,
            include_prerelease: false,
            default_ide: "code".into(),
            projects_dir: String::new(),
            reduce_motion: false,
            console_font_size: 12,
            last_update_check: 0,
        }
    }
}

pub fn load(app: &AppHandle) -> Settings {
    let Ok(dir) = data_dir(app) else { return Settings::default() };
    std::fs::read_to_string(dir.join("settings.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    load(&app)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<Settings, String> {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut s = settings;
    if !matches!(s.update_check.as_str(), "startup" | "daily" | "weekly" | "manual") {
        s.update_check = "startup".into();
    }
    if !matches!(s.default_ide.as_str(), "code" | "idea") {
        s.default_ide = "code".into();
    }
    s.console_font_size = s.console_font_size.clamp(10, 18);
    let file = data_dir(&app)?.join("settings.json");
    let tmp = file.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(&s).map_err(err)?).map_err(err)?;
    std::fs::rename(&tmp, &file).map_err(err)?;
    Ok(s)
}
