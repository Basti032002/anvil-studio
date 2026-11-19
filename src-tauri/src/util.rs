use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

pub fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// App-Datenordner (z. B. %APPDATA%\net.forgehost.anvilstudio), wird bei Bedarf angelegt.
pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(err)?;
    std::fs::create_dir_all(&dir).map_err(err)?;
    Ok(dir)
}

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Unter Windows kein schwarzes Konsolenfenster für Hilfsprozesse öffnen.
pub fn hide_window_std(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    cmd
}

fn command_exists(name: &str) -> bool {
    let finder = if cfg!(windows) { "where" } else { "which" };
    let mut cmd = Command::new(finder);
    cmd.arg(name);
    hide_window_std(&mut cmd)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Startet ein Programm, das unter Windows eventuell eine .cmd-Datei ist (z. B. `code`).
fn spawn_tool(tool: &str, arg: &Path) -> Result<(), String> {
    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("cmd");
        c.arg("/C").arg(tool).arg(arg);
        c
    } else {
        let mut c = Command::new(tool);
        c.arg(arg);
        c
    };
    hide_window_std(&mut cmd).spawn().map_err(err)?;
    Ok(())
}

fn intellij_candidates() -> Vec<String> {
    let mut list = vec!["idea64".to_string(), "idea".to_string()];
    if cfg!(windows) {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            let p = PathBuf::from(local).join("JetBrains\\Toolbox\\scripts\\idea.cmd");
            if p.exists() {
                list.insert(0, p.to_string_lossy().to_string());
            }
        }
    }
    list
}

/// Öffnet das Projekt in VS Code, IntelliJ oder im Datei-Explorer.
#[tauri::command]
pub fn open_in(app: AppHandle, project_id: String, target: String) -> Result<(), String> {
    let project = crate::projects::get(&app, &project_id)?;
    let path = PathBuf::from(&project.path);
    match target.as_str() {
        "code" => {
            if !command_exists("code") {
                return Err("VS Code wurde nicht gefunden. Installiere VS Code und aktiviere „Zum PATH hinzufügen“.".into());
            }
            spawn_tool("code", &path)
        }
        "idea" => {
            for c in intellij_candidates() {
                if Path::new(&c).exists() || command_exists(&c) {
                    return spawn_tool(&c, &path);
                }
            }
            Err("IntelliJ IDEA wurde nicht gefunden. Installiere es (am einfachsten über die JetBrains Toolbox) und aktiviere die Shell-Skripte.".into())
        }
        "folder" => open_path(project.path),
        other => Err(format!("Unbekanntes Ziel: {other}")),
    }
}

/// Öffnet einen Ordner im Datei-Explorer bzw. markiert eine Datei darin.
#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("Pfad existiert nicht: {path}"));
    }
    let mut cmd;
    if cfg!(windows) {
        cmd = Command::new("explorer");
        if p.is_file() {
            cmd.arg(format!("/select,{}", p.display()));
        } else {
            cmd.arg(&p);
        }
    } else if cfg!(target_os = "macos") {
        cmd = Command::new("open");
        cmd.arg(if p.is_file() { p.parent().unwrap_or(&p) } else { &p });
    } else {
        cmd = Command::new("xdg-open");
        cmd.arg(if p.is_file() { p.parent().unwrap_or(&p) } else { &p });
    }
    cmd.spawn().map_err(err)?;
    Ok(())
}

/// Fertige Mod-Dateien aus build/libs (ohne -sources/-javadoc).
#[tauri::command]
pub fn list_jars(app: AppHandle, project_id: String) -> Result<Vec<String>, String> {
    let project = crate::projects::get(&app, &project_id)?;
    let libs = PathBuf::from(&project.path).join("build").join("libs");
    let mut jars = vec![];
    if let Ok(entries) = std::fs::read_dir(&libs) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name.ends_with(".jar") && !name.ends_with("-sources.jar") && !name.ends_with("-javadoc.jar") {
                jars.push(e.path().to_string_lossy().to_string());
            }
        }
    }
    jars.sort();
    Ok(jars)
}

#[derive(Serialize)]
pub struct CrashReport {
    pub path: String,
    pub content: String,
    pub modified: u64,
}

/// Sucht den neuesten Crash-Report in den Run-Ordnern des Projekts.
#[tauri::command]
pub fn latest_crash_report(app: AppHandle, project_id: String) -> Result<Option<CrashReport>, String> {
    let project = crate::projects::get(&app, &project_id)?;
    let root = PathBuf::from(&project.path);
    let mut dirs = vec![root.join("run").join("crash-reports")];
    if let Ok(entries) = std::fs::read_dir(root.join("runs")) {
        for e in entries.flatten() {
            dirs.push(e.path().join("crash-reports"));
        }
    }
    let mut best: Option<(u64, PathBuf)> = None;
    for d in dirs {
        let Ok(entries) = std::fs::read_dir(&d) else { continue };
        for e in entries.flatten() {
            let modified = e
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            if best.as_ref().map(|(m, _)| modified > *m).unwrap_or(true) {
                best = Some((modified, e.path()));
            }
        }
    }
    match best {
        None => Ok(None),
        Some((modified, path)) => {
            let content = std::fs::read_to_string(&path).map_err(err)?;
            Ok(Some(CrashReport { path: path.to_string_lossy().to_string(), content, modified }))
        }
    }
}

// ---- Netzwerk -------------------------------------------------------------

/// Fehlermeldung inklusive aller Ursachen (reqwest zeigt sonst nur
/// „error sending request for url …“ ohne den eigentlichen Grund).
pub fn net_err(e: &(dyn std::error::Error + 'static)) -> String {
    let mut msg = e.to_string();
    let mut src = e.source();
    while let Some(s) = src {
        let part = s.to_string();
        if !msg.contains(&part) {
            msg.push_str(" → ");
            msg.push_str(&part);
        }
        src = s.source();
    }
    msg
}

pub fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!("AnvilStudio/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| net_err(&e))
}

async fn download_reqwest(url: &str, target: &Path, progress: &(dyn Fn(u64, Option<u64>) + Send + Sync)) -> Result<(), String> {
    use std::io::Write;
    let mut resp = http_client()?.get(url).send().await.map_err(|e| net_err(&e))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let total = resp.content_length();
    let mut file = std::fs::File::create(target).map_err(err)?;
    let mut done = 0u64;
    let mut last = 0u64;
    while let Some(chunk) = resp.chunk().await.map_err(|e| net_err(&e))? {
        file.write_all(&chunk).map_err(err)?;
        done += chunk.len() as u64;
        if done - last > 512 * 1024 {
            last = done;
            progress(done, total);
        }
    }
    progress(done, total);
    Ok(())
}

/// Lädt eine Datei herunter. Klappt das mit dem eingebauten Client nicht
/// (z. B. wegen Virenscanner/Proxy), wird unter Windows curl.exe benutzt,
/// das die Netzwerk- und Zertifikatseinstellungen von Windows verwendet.
pub async fn download(url: &str, target: &Path, progress: &(dyn Fn(u64, Option<u64>) + Send + Sync)) -> Result<(), String> {
    let first = download_reqwest(url, target, progress).await;
    let Err(first_err) = first else { return Ok(()) };
    if !cfg!(windows) {
        return Err(first_err);
    }
    let _ = std::fs::remove_file(target);
    let url = url.to_string();
    let target_c = target.to_path_buf();
    let out = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new("curl.exe");
        cmd.args(["-L", "--fail", "--silent", "--show-error", "--retry", "2", "-o"])
            .arg(&target_c)
            .arg(&url);
        hide_window_std(&mut cmd).output()
    })
    .await
    .map_err(err)?;
    match out {
        Ok(o) if o.status.success() && target.exists() => {
            let size = std::fs::metadata(target).map(|m| m.len()).unwrap_or(0);
            progress(size, Some(size));
            Ok(())
        }
        Ok(o) => Err(format!(
            "{first_err}\nAuch curl.exe ist gescheitert: {}",
            String::from_utf8_lossy(&o.stderr).trim()
        )),
        Err(e) => Err(format!("{first_err}\ncurl.exe konnte nicht gestartet werden: {e}")),
    }
}

/// SHA-256 einer Datei als Hex-String.
pub fn sha256_file(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let mut f = std::fs::File::open(path).map_err(err)?;
    let mut h = Sha256::new();
    std::io::copy(&mut f, &mut h).map_err(err)?;
    Ok(h.finalize().iter().map(|b| format!("{b:02x}")).collect())
}
