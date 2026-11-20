//! Übersetzungen für Meldungen aus dem Backend. Schlüssel ist der deutsche
//! Text; die Wörterbücher teilt sich das Backend mit der Oberfläche
//! (src/i18n/*.json). Fehlt eine Übersetzung, bleibt der deutsche Text.

use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};

static LANG: RwLock<String> = RwLock::new(String::new());

fn dicts() -> &'static HashMap<&'static str, HashMap<String, String>> {
    static D: OnceLock<HashMap<&'static str, HashMap<String, String>>> = OnceLock::new();
    D.get_or_init(|| {
        let mut m = HashMap::new();
        for (lang, json) in [
            ("en", include_str!("../../src/i18n/en.json")),
            ("fr", include_str!("../../src/i18n/fr.json")),
            ("es", include_str!("../../src/i18n/es.json")),
            ("pl", include_str!("../../src/i18n/pl.json")),
            ("nl", include_str!("../../src/i18n/nl.json")),
            ("tr", include_str!("../../src/i18n/tr.json")),
            ("ru", include_str!("../../src/i18n/ru.json")),
        ] {
            m.insert(lang, serde_json::from_str(json).unwrap_or_default());
        }
        m
    })
}

pub fn set_language(lang: &str) {
    if let Ok(mut l) = LANG.write() {
        *l = lang.to_string();
    }
}

/// Übersetzt einen deutschen Text in die eingestellte Sprache.
pub fn tr(text: &str) -> String {
    let lang = LANG.read().map(|l| l.clone()).unwrap_or_default();
    if lang.is_empty() || lang == "de" {
        return text.to_string();
    }
    dicts().get(lang.as_str()).and_then(|d| d.get(text)).cloned().unwrap_or_else(|| text.to_string())
}

/// Übersetzt und ersetzt Platzhalter wie {name}.
pub fn trf(text: &str, args: &[(&str, &dyn std::fmt::Display)]) -> String {
    let mut s = tr(text);
    for (k, v) in args {
        s = s.replace(&format!("{{{k}}}"), &v.to_string());
    }
    s
}

#[tauri::command]
pub fn set_language_cmd(lang: String) {
    set_language(&lang);
}
