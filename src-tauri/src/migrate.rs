//! Migration der Programmdaten beim Start.
//!
//! `state.json` merkt sich die Datenversion. Ist sie älter als DATA_VERSION,
//! werden projects.json und settings.json zuerst nach `backups/<Zeit>/`
//! gesichert und dann Schritt für Schritt umgestellt. So überstehen Projekte
//! und Einstellungen jedes Update von Anvil Studio.

use crate::util::{data_dir, err, now};
use serde_json::{json, Value};
use tauri::AppHandle;

/// Bei Formatänderungen hochzählen und unten einen Schritt ergänzen.
pub const DATA_VERSION: u64 = 2;

pub fn run(app: &AppHandle) -> Result<(), String> {
    let dir = data_dir(app)?;
    let state_file = dir.join("state.json");
    let state: Value = std::fs::read_to_string(&state_file).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(json!({}));
    let mut version = state["dataVersion"].as_u64().unwrap_or(1);
    if version >= DATA_VERSION {
        return Ok(());
    }

    // Sicherung
    let backup = dir.join("backups").join(format!("{}-v{version}", now()));
    std::fs::create_dir_all(&backup).map_err(err)?;
    for f in ["projects.json", "settings.json"] {
        let src = dir.join(f);
        if src.exists() {
            std::fs::copy(&src, backup.join(f)).map_err(err)?;
        }
    }

    if version < 2 {
        // 1 → 2: Einstellungen bekommen den Update-Kanal (aus dem alten Vorabversionen-Schalter),
        // Projekte bleiben unverändert (neue Felder haben Standardwerte).
        let s = crate::settings::load(app);
        crate::settings::save_settings(app.clone(), s)?;
        version = 2;
    }
    // if version < 3 { … }

    std::fs::write(&state_file, serde_json::to_string_pretty(&json!({ "dataVersion": version, "migratedAt": now() })).map_err(err)?).map_err(err)?;
    Ok(())
}
