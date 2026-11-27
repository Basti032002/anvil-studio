//! „Problem melden“: sammelt Systeminfos und Logs (Benutzername aus Pfaden entfernt)
//! und schickt sie an den Workshop-Server, der daraus ein GitHub-Issue macht.
//! Außerdem: Absturz von Anvil Studio merken, um beim nächsten Start nachzufragen.

use crate::util::{data_dir, err, http_client, net_err};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const CRASH_FILE: &str = "last-crash.txt";

/// Bei einem Absturz (panic) den Bericht für den nächsten Start ablegen
pub fn install_panic_hook(app: &AppHandle) {
    let Ok(dir) = data_dir(app) else { return };
    let file = dir.join(CRASH_FILE);
    let version = app.package_info().version.to_string();
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let bt = std::backtrace::Backtrace::force_capture();
        let thread = std::thread::current().name().unwrap_or("?").to_string();
        let text = format!("Anvil Studio {version}\nThread: {thread}\n{info}\n\n{bt}");
        let _ = std::fs::write(&file, anonymize(&text));
        prev(info);
    }));
}

/// Benutzernamen aus Pfaden und Texten entfernen
pub fn anonymize(s: &str) -> String {
    let mut out = s.to_string();
    for var in ["USERNAME", "USER"] {
        if let Ok(u) = std::env::var(var) {
            let u = u.trim();
            if u.len() >= 2 {
                for sep in ["\\", "/"] {
                    out = out.replace(&format!("Users{sep}{u}"), &format!("Users{sep}<user>"));
                    out = out.replace(&format!("home{sep}{u}"), &format!("home{sep}<user>"));
                }
            }
        }
    }
    out
}

fn tail(path: &Path, max: usize) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    let start = bytes.len().saturating_sub(max);
    Some(anonymize(&String::from_utf8_lossy(&bytes[start..])))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogPart {
    name: String,
    text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Collected {
    system: Vec<(String, String)>,
    logs: Vec<LogPart>,
}

/// Neuester Absturzbericht von Minecraft seit `since` (Unix-Sekunden)
fn newest_crash(run: &Path, since: u64) -> Option<PathBuf> {
    let dir = run.join("crash-reports");
    let mut best: Option<(u64, PathBuf)> = None;
    for e in std::fs::read_dir(dir).ok()?.flatten() {
        let m = e.metadata().ok()?.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_secs();
        if m + 5 >= since && best.as_ref().map(|(t, _)| m > *t).unwrap_or(true) {
            best = Some((m, e.path()));
        }
    }
    best.map(|(_, p)| p)
}

/// Hat Minecraft seit `since` einen Absturzbericht geschrieben?
#[tauri::command]
pub async fn report_mc_crashed(app: AppHandle, project_id: String, since: u64) -> bool {
    tauri::async_runtime::spawn_blocking(move || crate::projects::get(&app, &project_id).ok().and_then(|p| newest_crash(&PathBuf::from(&p.path).join("run"), since)).is_some()).await.unwrap_or(false)
}

/// Was mitgeschickt würde – der Nutzer sieht es vor dem Senden
#[tauri::command]
pub async fn report_collect(app: AppHandle, project_id: Option<String>, minecraft: bool, since: Option<u64>) -> Collected {
    // läuft im Hintergrund, damit das Formular sofort bedienbar ist
    tauri::async_runtime::spawn_blocking(move || collect(app, project_id, minecraft, since)).await.unwrap_or(Collected { system: vec![], logs: vec![] })
}

fn collect(app: AppHandle, project_id: Option<String>, minecraft: bool, since: Option<u64>) -> Collected {
    let mut system = vec![
        ("Anvil Studio".to_string(), app.package_info().version.to_string()),
        ("Betriebssystem".into(), format!("{} {}", std::env::consts::OS, std::env::consts::ARCH)),
    ];
    let mut ver = std::process::Command::new("cmd");
    ver.args(["/C", "ver"]);
    if let Ok(v) = crate::util::hide_window_std(&mut ver).output() {
        let s = String::from_utf8_lossy(&v.stdout).trim().to_string();
        if !s.is_empty() {
            system.push(("Windows".into(), s));
        }
    }
    let s = crate::settings::load(&app);
    system.push(("Update-Kanal".into(), s.update_channel.clone()));
    let mut logs = vec![];
    if let Some(p) = project_id.as_deref().and_then(|id| crate::projects::get(&app, id).ok()) {
        system.push(("Minecraft".into(), p.mc_version.clone()));
        system.push(("Mod-ID".into(), p.mod_id.clone()));
        if minecraft {
            let run = PathBuf::from(&p.path).join("run");
            if let Some(c) = newest_crash(&run, since.unwrap_or(0)) {
                if let Some(t) = tail(&c, 60_000) {
                    logs.push(LogPart { name: format!("Absturzbericht ({})", c.file_name().unwrap_or_default().to_string_lossy()), text: t });
                }
            }
            if let Some(t) = tail(&run.join("logs").join("latest.log"), 40_000) {
                logs.push(LogPart { name: "latest.log".into(), text: t });
            }
        }
    }
    if let Ok(dir) = data_dir(&app) {
        if let Some(t) = tail(&dir.join(CRASH_FILE), 30_000) {
            logs.push(LogPart { name: "Absturz Anvil Studio".into(), text: t });
        }
    }
    Collected { system, logs }
}

/// Liegt ein Absturz von Anvil Studio vom letzten Mal vor?
#[tauri::command]
pub fn report_pending_crash(app: AppHandle) -> Option<String> {
    let f = data_dir(&app).ok()?.join(CRASH_FILE);
    std::fs::read_to_string(f).ok().filter(|s| !s.trim().is_empty())
}

#[tauri::command]
pub fn report_dismiss_crash(app: AppHandle) {
    if let Ok(d) = data_dir(&app) {
        let _ = std::fs::remove_file(d.join(CRASH_FILE));
    }
}

#[derive(Deserialize)]
pub struct SendLog {
    name: String,
    text: String,
}

/// Meldung abschicken → { issue?: Nummer }
#[tauri::command]
pub async fn report_send(app: AppHandle, kind: String, title: String, description: String, system: Vec<(String, String)>, logs: Vec<SendLog>) -> Result<Value, String> {
    let token = crate::account::session_token().ok_or("Bitte melde dich mit deinem Anvil-Studio-Konto an.")?;
    let sys: serde_json::Map<String, Value> = system.into_iter().map(|(k, v)| (k, Value::String(anonymize(&v)))).collect();
    let logs: Vec<Value> = logs.into_iter().map(|l| json!({ "name": l.name, "text": anonymize(&l.text) })).collect();
    let url = format!("{}/api/report", crate::settings::load(&app).workshop_url);
    let r = http_client()?
        .post(url)
        .bearer_auth(token)
        .json(&json!({ "kind": kind, "title": title, "description": anonymize(&description), "system": sys, "logs": logs }))
        .timeout(std::time::Duration::from_secs(40))
        .send()
        .await
        .map_err(|e| format!("Der Server ist nicht erreichbar: {}", net_err(&e)))?;
    let status = r.status().as_u16();
    let v: Value = serde_json::from_str(&r.text().await.map_err(err)?).unwrap_or(Value::Null);
    if status >= 400 {
        return Err(v["error"].as_str().map(String::from).unwrap_or(format!("Der Server antwortet mit HTTP {status}.")));
    }
    if kind == "app_crash" {
        report_dismiss_crash(app);
    }
    Ok(v)
}
