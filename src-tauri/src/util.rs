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

fn download_client(ipv4: bool, follow: bool) -> Result<reqwest::Client, String> {
    let mut b = reqwest::Client::builder()
        .user_agent(concat!("AnvilStudio/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(std::time::Duration::from_secs(20))
        .read_timeout(std::time::Duration::from_secs(60));
    if ipv4 {
        b = b.local_address(std::net::IpAddr::V4(std::net::Ipv4Addr::UNSPECIFIED));
    }
    if !follow {
        b = b.redirect(reqwest::redirect::Policy::none());
    }
    b.build().map_err(|e| net_err(&e))
}

pub type Headers<'a> = &'a [(&'a str, String)];
type ProgressFn<'a> = &'a (dyn Fn(u64, Option<u64>) + Send + Sync);

/// Folgt Weiterleitungen selbst und gibt die endgültige Adresse zurück.
/// Header (z. B. Authorization) gehen nur an den ersten Host – die
/// signierten Download-Adressen von GitHub brauchen keine.
async fn resolve_final_url(url: &str, headers: Headers<'_>) -> Result<String, String> {
    let client = download_client(false, false)?;
    let mut current = url.to_string();
    for hop in 0..6 {
        let mut req = client.get(&current);
        if hop == 0 {
            for (k, v) in headers {
                req = req.header(*k, v);
            }
        }
        let resp = req.send().await.map_err(|e| net_err(&e))?;
        let status = resp.status();
        if status.is_redirection() {
            let loc = resp.headers().get("location").and_then(|l| l.to_str().ok()).ok_or("Weiterleitung ohne Ziel")?;
            current = reqwest::Url::parse(&current).and_then(|base| base.join(loc)).map_err(err)?.to_string();
            continue;
        }
        if !status.is_success() {
            return Err(format!("HTTP {status}"));
        }
        return Ok(current);
    }
    Err("Zu viele Weiterleitungen".into())
}

/// Download mit Fortsetzen: bricht die Verbindung ab, geht es ab der
/// bereits geladenen Stelle weiter (Range-Anfrage).
async fn download_resumable(url: &str, headers: Headers<'_>, target: &Path, ipv4: bool, tries: u32, progress: ProgressFn<'_>) -> Result<(), String> {
    use std::io::Write;
    let client = download_client(ipv4, true)?;
    let mut last_err = String::new();
    for attempt in 0..tries {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(800 * attempt as u64)).await;
        }
        let have = std::fs::metadata(target).map(|m| m.len()).unwrap_or(0);
        let mut req = client.get(url);
        for (k, v) in headers {
            req = req.header(*k, v);
        }
        if have > 0 {
            req = req.header("Range", format!("bytes={have}-"));
        }
        let mut resp = match req.send().await {
            Ok(r) => r,
            Err(e) => {
                last_err = net_err(&e);
                continue;
            }
        };
        let status = resp.status().as_u16();
        if status == 416 {
            return Ok(()); // schon vollständig
        }
        if !resp.status().is_success() {
            last_err = format!("HTTP {}", resp.status());
            if (400..500).contains(&status) && status != 408 && status != 429 {
                break; // Fehler, der sich durch Wiederholen nicht löst
            }
            continue;
        }
        let resumed = status == 206;
        let total = resp.content_length().map(|l| if resumed { l + have } else { l });
        let mut file = if resumed {
            std::fs::OpenOptions::new().append(true).open(target).map_err(err)?
        } else {
            std::fs::File::create(target).map_err(err)?
        };
        let mut done = if resumed { have } else { 0 };
        let mut last = 0u64;
        let mut failed = false;
        loop {
            match resp.chunk().await {
                Ok(Some(chunk)) => {
                    file.write_all(&chunk).map_err(err)?;
                    done += chunk.len() as u64;
                    if done - last > 512 * 1024 {
                        last = done;
                        progress(done, total);
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    last_err = net_err(&e);
                    failed = true;
                    break;
                }
            }
        }
        if !failed && total.map(|t| done >= t).unwrap_or(true) {
            progress(done, total);
            return Ok(());
        }
        if !failed {
            last_err = "Verbindung vorzeitig beendet".into();
        }
    }
    Err(last_err)
}

fn run_hidden(mut cmd: Command) -> Result<(), String> {
    match hide_window_std(&mut cmd).output() {
        Ok(o) if o.status.success() => Ok(()),
        Ok(o) => Err(String::from_utf8_lossy(if o.stderr.is_empty() { &o.stdout } else { &o.stderr }).trim().chars().take(300).collect()),
        Err(e) => Err(e.to_string()),
    }
}

/// Lädt eine Datei herunter. Reihenfolge, bis es klappt:
/// 1. eingebauter Client mit Fortsetzen
/// 2. derselbe nur über IPv4
/// 3. curl.exe (Windows-Netzwerk/Zertifikate, Fortsetzen, IPv4)
/// 4. Windows-Hintergrunddienst BITS
pub async fn download(url: &str, target: &Path, progress: ProgressFn<'_>) -> Result<(), String> {
    download_with(url, &[], target, progress).await
}

pub async fn download_with(url: &str, headers: Headers<'_>, target: &Path, progress: ProgressFn<'_>) -> Result<(), String> {
    let _ = std::fs::remove_file(target);
    // Endgültige Adresse ermitteln; danach sind keine Header mehr nötig
    let (final_url, hdrs): (String, Vec<(&str, String)>) = match resolve_final_url(url, headers).await {
        Ok(u) => (u, vec![]),
        Err(_) => (url.to_string(), headers.to_vec()),
    };
    let mut errors = vec![];

    match download_resumable(&final_url, &hdrs, target, false, 4, progress).await {
        Ok(()) => return Ok(()),
        Err(e) => errors.push(format!("Direkt: {e}")),
    }
    match download_resumable(&final_url, &hdrs, target, true, 3, progress).await {
        Ok(()) => return Ok(()),
        Err(e) => errors.push(format!("IPv4: {e}")),
    }
    if !cfg!(windows) {
        return Err(errors.join("\n"));
    }

    let url_c = final_url.clone();
    let target_c = target.to_path_buf();
    let header_args: Vec<String> = hdrs.iter().map(|(k, v)| format!("{k}: {v}")).collect();
    let curl = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new("curl.exe");
        cmd.args(["-L", "-4", "--fail", "--silent", "--show-error", "--retry", "5", "--retry-all-errors", "--retry-delay", "2", "-C", "-"]);
        for h in &header_args {
            cmd.arg("-H").arg(h);
        }
        cmd.arg("-o").arg(&target_c).arg(&url_c);
        run_hidden(cmd)
    })
    .await
    .map_err(err)?;
    match curl {
        Ok(()) => {
            let size = std::fs::metadata(target).map(|m| m.len()).unwrap_or(0);
            progress(size, Some(size));
            return Ok(());
        }
        Err(e) => errors.push(format!("curl.exe: {e}")),
    }

    if hdrs.is_empty() {
        let _ = std::fs::remove_file(target);
        let url_c = final_url.replace('\'', "''");
        let target_s = target.to_string_lossy().replace('\'', "''");
        let bits = tauri::async_runtime::spawn_blocking(move || {
            let mut cmd = Command::new("powershell");
            cmd.args(["-NoProfile", "-NonInteractive", "-Command"]).arg(format!(
                "$ProgressPreference='SilentlyContinue'; Start-BitsTransfer -Source '{url_c}' -Destination '{target_s}' -ErrorAction Stop"
            ));
            run_hidden(cmd)
        })
        .await
        .map_err(err)?;
        match bits {
            Ok(()) if target.exists() => {
                let size = std::fs::metadata(target).map(|m| m.len()).unwrap_or(0);
                progress(size, Some(size));
                return Ok(());
            }
            Ok(()) => errors.push("BITS: keine Datei".into()),
            Err(e) => errors.push(format!("BITS: {e}")),
        }
    }
    Err(format!(
        "Alle Download-Wege sind gescheitert. Wahrscheinlich blockiert ein Virenscanner, eine Firewall oder ein DNS-Filter die Verbindung zu GitHub.\n{}",
        errors.join("\n")
    ))
}

/// SHA-256 einer Datei als Hex-String.
pub fn sha256_file(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let mut f = std::fs::File::open(path).map_err(err)?;
    let mut h = Sha256::new();
    std::io::copy(&mut f, &mut h).map_err(err)?;
    Ok(h.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// Öffnet eine GitHub-Seite im Standardbrowser (nur github.com-Adressen).
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://github.com/") || url.starts_with("https://modrinth.com/")) {
        return Err(crate::i18n::tr("Nur GitHub- und Modrinth-Links werden geöffnet."));
    }
    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("rundll32");
        c.args(["url.dll,FileProtocolHandler", &url]);
        c
    } else if cfg!(target_os = "macos") {
        let mut c = Command::new("open");
        c.arg(&url);
        c
    } else {
        let mut c = Command::new("xdg-open");
        c.arg(&url);
        c
    };
    hide_window_std(&mut cmd).spawn().map_err(err)?;
    Ok(())
}
