//! Plugins: Erweiterungen für Anvil Studio als `.anvilplugin` (ZIP mit plugin.json).
//!
//! Ein Plugin kann mitbringen:
//! - Blueprint-Knoten und Fähigkeiten (JSON + Java-Vorlage, landen im Mod-Code)
//! - Editoren (Formulare, deren Einträge als Dateien in die Mod geschrieben werden)
//! - Befehle und Export-Schritte (Skripte, laufen abgeschottet in der Oberfläche)
//! - mitgelieferte Mods (z. B. Bibliotheken), die beim Testen mitgeladen werden
//!
//! Skripte haben keinen direkten Zugriff auf Dateien oder Internet – alles läuft über
//! die Befehle hier, die jede Anfrage gegen die Berechtigungen aus plugin.json prüfen.

use crate::util::{data_dir, err};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use tauri::AppHandle;

#[derive(Clone, Debug, Default)]
pub struct Plugin {
    pub id: String,
    pub dir: PathBuf,
    pub manifest: Value,
    pub enabled: bool,
}

impl Plugin {
    pub fn perms(&self) -> Vec<String> {
        self.manifest["permissions"].as_array().map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default()
    }
    pub fn may(&self, perm: &str) -> bool {
        self.perms().iter().any(|p| p == perm)
    }
    /// Einträge aus `contributes.<key>` – direkt im Manifest oder als Pfad zu einer JSON-Datei
    pub fn contrib(&self, key: &str) -> Vec<Value> {
        let mut out = vec![];
        for v in self.manifest["contributes"][key].as_array().cloned().unwrap_or_default() {
            match v {
                Value::String(rel) => {
                    if let Some(p) = safe_join(&self.dir, &rel) {
                        if let Ok(t) = std::fs::read_to_string(p) {
                            match serde_json::from_str::<Value>(&t) {
                                Ok(Value::Array(a)) => out.extend(a),
                                Ok(o @ Value::Object(_)) => out.push(o),
                                _ => {}
                            }
                        }
                    }
                }
                o @ Value::Object(_) => out.push(o),
                _ => {}
            }
        }
        out
    }
}

static PLUGINS: RwLock<Option<Arc<Vec<Plugin>>>> = RwLock::new(None);

pub fn all() -> Arc<Vec<Plugin>> {
    PLUGINS.read().ok().and_then(|g| g.clone()).unwrap_or_default()
}

pub fn enabled() -> Vec<Plugin> {
    all().iter().filter(|p| p.enabled).cloned().collect()
}

fn root(app: &AppHandle) -> Result<PathBuf, String> {
    let d = data_dir(app)?.join("plugins");
    std::fs::create_dir_all(&d).map_err(err)?;
    Ok(d)
}

#[derive(Serialize, Deserialize, Default)]
struct State {
    disabled: Vec<String>,
}

fn state(app: &AppHandle) -> State {
    root(app).ok().and_then(|r| std::fs::read_to_string(r.join("state.json")).ok()).and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

fn save_state(app: &AppHandle, s: &State) -> Result<(), String> {
    std::fs::write(root(app)?.join("state.json"), serde_json::to_string_pretty(s).map_err(err)?).map_err(err)
}

/// Für Tests: Plugin aus einem Ordner direkt aktivieren
#[allow(dead_code)]
pub fn set_for_test(dirs: &[PathBuf]) {
    let list = dirs
        .iter()
        .filter_map(|d| {
            let m: Value = serde_json::from_str(&std::fs::read_to_string(d.join("plugin.json")).ok()?).ok()?;
            Some(Plugin { id: m["id"].as_str()?.to_string(), dir: d.clone(), manifest: m, enabled: true })
        })
        .collect();
    if let Ok(mut g) = PLUGINS.write() {
        *g = Some(Arc::new(list));
    }
}

/// Installierte Plugins neu einlesen
pub fn reload(app: &AppHandle) {
    let st = state(app);
    let mut list = vec![];
    if let Ok(r) = root(app) {
        if let Ok(rd) = std::fs::read_dir(&r) {
            for e in rd.flatten() {
                let dir = e.path();
                let Ok(t) = std::fs::read_to_string(dir.join("plugin.json")) else { continue };
                let Ok(manifest) = serde_json::from_str::<Value>(&t) else { continue };
                let id = manifest["id"].as_str().unwrap_or_default().to_string();
                if !valid_id(&id) {
                    continue;
                }
                list.push(Plugin { enabled: !st.disabled.contains(&id), id, dir, manifest });
            }
        }
    }
    list.sort_by(|a, b| a.id.cmp(&b.id));
    if let Ok(mut g) = PLUGINS.write() {
        *g = Some(Arc::new(list));
    }
}

pub fn valid_id(id: &str) -> bool {
    (2..=48).contains(&id.len()) && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

/// Pfad innerhalb von `base` – ohne `..` und ohne absolute Pfade
fn safe_join(base: &Path, rel: &str) -> Option<PathBuf> {
    let rel = rel.replace('\\', "/");
    if rel.is_empty() || rel.starts_with('/') || rel.contains(':') || rel.split('/').any(|s| s == ".." || s.is_empty() && false) {
        return None;
    }
    Some(base.join(rel))
}

fn find(id: &str) -> Result<Plugin, String> {
    all().iter().find(|p| p.id == id).cloned().ok_or_else(|| format!("Plugin „{id}“ ist nicht installiert."))
}

fn need(p: &Plugin, perm: &str) -> Result<(), String> {
    if p.may(perm) {
        Ok(())
    } else {
        Err(format!("Das Plugin „{}“ hat keine Berechtigung „{perm}“.", p.id))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    id: String,
    manifest: Value,
    enabled: bool,
    dir: String,
    size: u64,
}

fn dir_size(d: &Path) -> u64 {
    walkdir::WalkDir::new(d).into_iter().flatten().filter_map(|e| e.metadata().ok()).filter(|m| m.is_file()).map(|m| m.len()).sum()
}

#[tauri::command]
pub fn plugins_list(app: AppHandle) -> Vec<PluginInfo> {
    reload(&app);
    all().iter().map(|p| PluginInfo { id: p.id.clone(), manifest: p.manifest.clone(), enabled: p.enabled, dir: p.dir.to_string_lossy().into(), size: dir_size(&p.dir) }).collect()
}

/// Manifest einer Plugin-Datei (oder eines Ordners) lesen, ohne zu installieren
fn read_manifest(path: &Path) -> Result<(Value, u64), String> {
    if path.is_dir() {
        let t = std::fs::read_to_string(path.join("plugin.json")).map_err(|_| "Im Ordner fehlt plugin.json.".to_string())?;
        return Ok((serde_json::from_str(&t).map_err(|e| format!("plugin.json ist ungültig: {e}"))?, dir_size(path)));
    }
    let f = std::fs::File::open(path).map_err(err)?;
    let size = f.metadata().map(|m| m.len()).unwrap_or(0);
    let mut z = zip::ZipArchive::new(f).map_err(|_| "Das ist keine gültige .anvilplugin-Datei.".to_string())?;
    let mut s = String::new();
    z.by_name("plugin.json").map_err(|_| "In der Datei fehlt plugin.json.".to_string())?.read_to_string(&mut s).map_err(err)?;
    Ok((serde_json::from_str(&s).map_err(|e| format!("plugin.json ist ungültig: {e}"))?, size))
}

#[tauri::command]
pub fn plugins_inspect(path: String) -> Result<Value, String> {
    let (m, size) = read_manifest(Path::new(&path))?;
    let id = m["id"].as_str().unwrap_or_default();
    if !valid_id(id) {
        return Err("Die Plugin-ID ist ungültig (nur a–z, 0–9, - und _).".into());
    }
    Ok(json!({ "manifest": m, "size": size, "installed": all().iter().find(|p| p.id == id).map(|p| p.manifest["version"].clone()) }))
}

#[tauri::command]
pub fn plugins_install(app: AppHandle, path: String) -> Result<Value, String> {
    let src = PathBuf::from(&path);
    let (m, _) = read_manifest(&src)?;
    let id = m["id"].as_str().unwrap_or_default().to_string();
    if !valid_id(&id) {
        return Err("Die Plugin-ID ist ungültig.".into());
    }
    let dest = root(&app)?.join(&id);
    let tmp = root(&app)?.join(format!(".{id}.tmp"));
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).map_err(err)?;
    if src.is_dir() {
        for e in walkdir::WalkDir::new(&src).into_iter().flatten() {
            let rel = e.path().strip_prefix(&src).map_err(err)?;
            if rel.components().any(|c| c.as_os_str().to_string_lossy().starts_with('.')) {
                continue;
            }
            let to = tmp.join(rel);
            if e.file_type().is_dir() {
                std::fs::create_dir_all(&to).map_err(err)?;
            } else {
                std::fs::copy(e.path(), &to).map_err(err)?;
            }
        }
    } else {
        let mut z = zip::ZipArchive::new(std::fs::File::open(&src).map_err(err)?).map_err(err)?;
        for i in 0..z.len() {
            let mut f = z.by_index(i).map_err(err)?;
            // nur sichere Pfade entpacken
            let Some(rel) = f.enclosed_name() else { continue };
            let to = tmp.join(rel);
            if f.is_dir() {
                std::fs::create_dir_all(&to).map_err(err)?;
                continue;
            }
            if let Some(parent) = to.parent() {
                std::fs::create_dir_all(parent).map_err(err)?;
            }
            let mut out = std::fs::File::create(&to).map_err(err)?;
            std::io::copy(&mut f, &mut out).map_err(err)?;
        }
    }
    let _ = std::fs::remove_dir_all(&dest);
    std::fs::rename(&tmp, &dest).map_err(err)?;
    reload(&app);
    Ok(m)
}

#[tauri::command]
pub fn plugins_remove(app: AppHandle, id: String) -> Result<(), String> {
    if !valid_id(&id) {
        return Err("Ungültige Plugin-ID.".into());
    }
    let d = root(&app)?.join(&id);
    if d.exists() {
        std::fs::remove_dir_all(&d).map_err(err)?;
    }
    reload(&app);
    Ok(())
}

#[tauri::command]
pub fn plugins_toggle(app: AppHandle, id: String, enabled: bool) -> Result<(), String> {
    let mut s = state(&app);
    s.disabled.retain(|x| x != &id);
    if !enabled {
        s.disabled.push(id);
    }
    save_state(&app, &s)?;
    reload(&app);
    Ok(())
}

/// Gerüst für ein neues Plugin in einen Ordner schreiben
#[tauri::command]
pub fn plugins_scaffold(dest: String, id: String, name: String) -> Result<String, String> {
    if !valid_id(&id) {
        return Err("Die ID darf nur a–z, 0–9, - und _ enthalten.".into());
    }
    let dir = PathBuf::from(dest).join(&id);
    if dir.exists() {
        return Err("Dieser Ordner existiert schon.".into());
    }
    std::fs::create_dir_all(dir.join("scripts")).map_err(err)?;
    std::fs::create_dir_all(dir.join("nodes")).map_err(err)?;
    let manifest = json!({
        "id": id, "name": name, "version": "0.1.0", "author": "", "description": "Mein erstes Anvil-Studio-Plugin",
        "anvilStudio": ">=0.5", "permissions": ["content.read"],
        "contributes": {
            "commands": [{ "id": "hello", "label": "Hallo vom Plugin", "desc": "Zeigt, wie viele Blöcke das Projekt hat", "script": "scripts/hello.js" }],
            "nodes": ["nodes/nodes.json"]
        }
    });
    std::fs::write(dir.join("plugin.json"), serde_json::to_string_pretty(&manifest).map_err(err)?).map_err(err)?;
    std::fs::write(
        dir.join("scripts/hello.js"),
        "// Läuft abgeschottet: kein Internet, keine Dateien – nur über `anvil`.\nexport default async function (anvil) {\n  const c = await anvil.content.get();\n  await anvil.ui.toast(`${c.blocks.length} Blöcke in ${anvil.project.name}`);\n}\n",
    )
    .map_err(err)?;
    std::fs::write(
        dir.join("nodes/nodes.json"),
        serde_json::to_string_pretty(&json!([{
            "kind": "heal_full", "cat": "player", "label": "Ganz heilen", "desc": "Füllt das Leben des Spielers auf",
            "props": [], "java": "if (player != null) player.setHealth(player.getMaxHealth());"
        }]))
        .map_err(err)?,
    )
    .map_err(err)?;
    Ok(dir.to_string_lossy().into())
}

/// Textdatei aus dem Plugin lesen (Skripte)
#[tauri::command]
pub fn plugin_read(id: String, path: String) -> Result<String, String> {
    let p = find(&id)?;
    let f = safe_join(&p.dir, &path).ok_or("Ungültiger Pfad.")?;
    std::fs::read_to_string(f).map_err(err)
}

/// Bild aus dem Plugin als data:-URL (Symbol)
#[tauri::command]
pub fn plugin_icon(id: String) -> Option<String> {
    let p = find(&id).ok()?;
    let rel = p.manifest["icon"].as_str()?;
    let f = safe_join(&p.dir, rel)?;
    let bytes = std::fs::read(f).ok()?;
    Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[derive(Deserialize)]
pub struct Part {
    name: String,
    text: Option<String>,
    base64: Option<String>,
    filename: Option<String>,
    #[serde(rename = "contentType")]
    content_type: Option<String>,
}

/// Internet nur zu Adressen, die das Plugin angemeldet hat (Berechtigung `network:<host>`)
#[tauri::command]
pub async fn plugin_http(id: String, url: String, method: Option<String>, headers: Option<BTreeMap<String, String>>, body: Option<String>, multipart: Option<Vec<Part>>) -> Result<Value, String> {
    let p = find(&id)?;
    let u = reqwest::Url::parse(&url).map_err(|_| "Ungültige Adresse.".to_string())?;
    if u.scheme() != "https" {
        return Err("Plugins dürfen nur https-Adressen aufrufen.".into());
    }
    let host = u.host_str().unwrap_or_default().to_string();
    let allowed = p.perms().iter().filter_map(|x| x.strip_prefix("network:")).any(|h| host == h || host.ends_with(&format!(".{h}")));
    if !allowed {
        return Err(format!("Das Plugin darf „{host}“ nicht aufrufen."));
    }
    let client = reqwest::Client::builder().user_agent(concat!("AnvilStudio/", env!("CARGO_PKG_VERSION"))).build().map_err(err)?;
    let m = reqwest::Method::from_bytes(method.unwrap_or_else(|| "GET".into()).to_uppercase().as_bytes()).map_err(err)?;
    let mut req = client.request(m, u);
    for (k, v) in headers.unwrap_or_default() {
        req = req.header(k, v);
    }
    if let Some(parts) = multipart {
        let mut form = reqwest::multipart::Form::new();
        for part in parts {
            let mut pt = if let Some(b) = part.base64 {
                reqwest::multipart::Part::bytes(base64::engine::general_purpose::STANDARD.decode(b).map_err(err)?)
            } else {
                reqwest::multipart::Part::text(part.text.unwrap_or_default())
            };
            if let Some(f) = part.filename {
                pt = pt.file_name(f);
            }
            if let Some(ct) = part.content_type {
                pt = pt.mime_str(&ct).map_err(err)?;
            }
            form = form.part(part.name, pt);
        }
        req = req.multipart(form);
    } else if let Some(b) = body {
        req = req.body(b);
    }
    let res = req.send().await.map_err(|e| format!("Verbindung fehlgeschlagen: {e}"))?;
    let status = res.status().as_u16();
    let text = res.text().await.unwrap_or_default();
    Ok(json!({ "status": status, "text": text }))
}

fn secret_entry(id: &str, name: &str) -> Result<keyring::Entry, String> {
    if !valid_id(id) || name.is_empty() || name.len() > 64 {
        return Err("Ungültiger Name.".into());
    }
    keyring::Entry::new("AnvilStudio-Plugin", &format!("{id}:{name}")).map_err(err)
}

#[tauri::command]
pub fn plugin_secret_get(id: String, name: String) -> Result<Option<String>, String> {
    need(&find(&id)?, "secrets")?;
    match secret_entry(&id, &name)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn plugin_secret_set(id: String, name: String, value: Option<String>) -> Result<(), String> {
    need(&find(&id)?, "secrets")?;
    let e = secret_entry(&id, &name)?;
    match value {
        Some(v) if !v.is_empty() => e.set_password(&v).map_err(err),
        _ => match e.delete_credential() {
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(x) => Err(x.to_string()),
        },
    }
}

/// Datei ins Projekt schreiben – nur unter src/main/resources oder src/main/java
#[tauri::command]
pub fn plugin_write_file(app: AppHandle, id: String, project_id: String, path: String, text: Option<String>, base64: Option<String>) -> Result<(), String> {
    need(&find(&id)?, "files.write")?;
    let p = crate::projects::get(&app, &project_id)?;
    let rel = path.replace('\\', "/");
    if !(rel.starts_with("src/main/resources/") || rel.starts_with("src/main/java/")) {
        return Err("Plugins dürfen nur unter src/main/resources oder src/main/java schreiben.".into());
    }
    let f = safe_join(Path::new(&p.path), &rel).ok_or("Ungültiger Pfad.")?;
    if let Some(parent) = f.parent() {
        std::fs::create_dir_all(parent).map_err(err)?;
    }
    let bytes = match (text, base64) {
        (Some(t), _) => t.into_bytes(),
        (None, Some(b)) => base64::engine::general_purpose::STANDARD.decode(b).map_err(err)?,
        _ => vec![],
    };
    std::fs::write(f, bytes).map_err(err)
}

/// Neueste gebaute Mod-Datei (für Export-Schritte wie Hochladen)
#[tauri::command]
pub fn plugin_latest_jar(app: AppHandle, id: String, project_id: String) -> Result<Value, String> {
    need(&find(&id)?, "export.jar")?;
    let jars = crate::export::export_jars(app, project_id)?;
    let best = jars.into_iter().filter(|j| !j.name.contains("-sources") && !j.name.contains("-slim")).max_by_key(|j| j.modified).ok_or("Noch keine Mod-Datei gebaut.")?;
    let bytes = std::fs::read(&best.path).map_err(err)?;
    Ok(json!({ "name": best.name, "size": bytes.len(), "base64": base64::engine::general_purpose::STANDARD.encode(bytes) }))
}

/// Vom Nutzer gewählte Datei lesen (nur nach Dateiauswahl in der Oberfläche)
#[tauri::command]
pub fn plugin_read_picked(path: String) -> Result<Value, String> {
    let p = PathBuf::from(&path);
    let meta = std::fs::metadata(&p).map_err(err)?;
    if meta.len() > 50 * 1024 * 1024 {
        return Err("Die Datei ist zu groß (höchstens 50 MB).".into());
    }
    let bytes = std::fs::read(&p).map_err(err)?;
    Ok(json!({ "name": p.file_name().unwrap_or_default().to_string_lossy(), "base64": base64::engine::general_purpose::STANDARD.encode(bytes) }))
}

// ---- Für den Generator ----------------------------------------------------------

/// Knoten-Vorlage eines Plugins (`<plugin>:<kind>`)
pub fn node_def(kind: &str) -> Option<Value> {
    let (pid, k) = kind.split_once(':')?;
    let p = enabled().into_iter().find(|p| p.id == pid)?;
    p.contrib("nodes").into_iter().find(|n| n["kind"].as_str() == Some(k))
}

pub fn is_value_node(kind: &str) -> bool {
    kind.contains(':') && node_def(kind).map(|d| d["expr"].is_string()).unwrap_or(false)
}

/// Fähigkeiten-Vorlage eines Plugins (`<plugin>:<kind>`)
pub fn ability_def(kind: &str) -> Option<Value> {
    let (pid, k) = kind.split_once(':')?;
    let p = enabled().into_iter().find(|p| p.id == pid)?;
    p.contrib("abilities").into_iter().find(|n| n["kind"].as_str() == Some(k))
}

/// Mitgelieferte Mods aller aktiven Plugins: (Dateiname, Quelle)
pub fn bundled_mods() -> Vec<(String, PathBuf, Value)> {
    let mut out = vec![];
    for p in enabled() {
        for m in p.contrib("mods") {
            if let Some(f) = m["file"].as_str().and_then(|f| safe_join(&p.dir, f)) {
                if f.exists() {
                    out.push((format!("anvilplugin-{}-{}", p.id, f.file_name().unwrap_or_default().to_string_lossy()), f, m.clone()));
                }
            }
        }
    }
    out
}

/// Java-Text für eine Plugin-Eigenschaft (ohne Werte-Verbindungen; für Fähigkeiten)
pub fn literal(ty: &str, v: &str) -> Option<String> {
    Some(match ty {
        "num" => format!("{:?}", v.trim().replace(',', ".").parse::<f64>().ok()?),
        "int" => format!("{}", v.trim().replace(',', ".").parse::<f64>().ok()?.round() as i64),
        "bool" => (if v == "true" { "true" } else { "false" }).into(),
        "text" => format!("\"{}\"", v.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n")),
        "ident" if !v.is_empty() && v.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') => v.to_string(),
        "id" if !v.is_empty() && v.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || "_:/.-".contains(c)) => format!("\"{v}\""),
        _ => return None,
    })
}

/// `{{typ:key}}`-Platzhalter ersetzen. `f` liefert den Java-Text oder None (→ ungültig)
pub fn expand(tpl: &str, mut f: impl FnMut(&str, &str) -> Option<String>) -> Option<String> {
    let mut out = String::new();
    let mut rest = tpl;
    while let Some(i) = rest.find("{{") {
        out.push_str(&rest[..i]);
        let after = &rest[i + 2..];
        let j = after.find("}}")?;
        let inner = after[..j].trim();
        let (ty, key) = inner.split_once(':').unwrap_or((inner, ""));
        out.push_str(&f(ty, key)?);
        rest = &after[j + 2..];
    }
    out.push_str(rest);
    Some(out)
}

/// Dateien aus Plugin-Editoren erzeugen: (Pfad unter src/main/resources, Inhalt)
pub fn editor_files(data: &BTreeMap<String, Value>, modid: &str) -> Vec<(String, String)> {
    let mut out = vec![];
    for p in enabled() {
        for ed in p.contrib("editors") {
            let Some(eid) = ed["id"].as_str() else { continue };
            let entries = data.get(&p.id).and_then(|d| d[eid].as_array().cloned()).unwrap_or_default();
            for file in ed["files"].as_array().cloned().unwrap_or_default() {
                let (Some(path), Some(tpl)) = (file["path"].as_str(), file["template"].as_str()) else { continue };
                for e in &entries {
                    let id = e["id"].as_str().unwrap_or_default();
                    if id.is_empty() || !id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_') {
                        continue;
                    }
                    let fill = |ty: &str, key: &str| -> Option<String> {
                        Some(match ty {
                            "id" => id.to_string(),
                            "modid" => modid.to_string(),
                            "json" => serde_json::to_string(&e[key]).ok()?,
                            "raw" => match &e[key] {
                                Value::String(s) => s.clone(),
                                v => v.to_string(),
                            },
                            _ => return None,
                        })
                    };
                    let (Some(path), Some(text)) = (expand(path, fill), expand(tpl, fill)) else { continue };
                    if path.split('/').any(|s| s == ".." || s.is_empty()) || path.contains('\\') || path.contains(':') {
                        continue;
                    }
                    out.push((path, text));
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expand_and_literal() {
        let s = expand("a {{num:r}} b {{ident:p}}", |t, k| literal(t, if k == "r" { "2,5" } else { "FLAME" })).unwrap();
        assert_eq!(s, "a 2.5 b FLAME");
        assert!(expand("{{ident:x}}", |t, _| literal(t, "a;b")).is_none());
        assert_eq!(literal("text", "Hi \"du\""), Some("\"Hi \\\"du\\\"\"".into()));
    }

    #[test]
    fn safe_paths() {
        let b = Path::new("/x");
        assert!(safe_join(b, "../a").is_none());
        assert!(safe_join(b, "/etc").is_none());
        assert!(safe_join(b, "scripts/a.js").is_some());
    }
}
