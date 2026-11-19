//! Update-System über GitHub-Releases.
//!
//! Der Quellcode liegt in einem privaten Repo. Die fertigen Installer werden
//! deshalb in das öffentliche Repo RELEASE_REPO veröffentlicht, das ohne Login
//! abgefragt werden kann.
//!
//! Ablauf: Releases von GitHub abfragen → neueste passende Version mit
//! NSIS-Installer finden → herunterladen → SHA-256 gegen die von GitHub
//! angegebene Prüfsumme vergleichen → Installer im Passiv-Modus starten,
//! Anvil Studio beenden und danach automatisch neu starten.

use crate::util::{err, now};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use tauri::{AppHandle, Emitter};

const RELEASE_REPO: &str = "Basti032002/anvil-studio-releases";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current: String,
    pub notes: String,
    pub published_at: String,
    pub html_url: String,
    pub asset_url: String,
    pub asset_name: String,
    pub size: u64,
    pub digest: Option<String>,
    pub prerelease: bool,
}

#[derive(Serialize, Clone)]
struct Progress {
    downloaded: u64,
    total: Option<u64>,
}

#[derive(PartialEq, Eq, Debug)]
struct Version {
    nums: [u64; 3],
    pre: Option<String>,
}

fn parse_version(s: &str) -> Option<Version> {
    let s = s.trim().trim_start_matches('v');
    let (main, pre) = match s.split_once('-') {
        Some((m, p)) => (m, Some(p.to_string())),
        None => (s, None),
    };
    let mut nums = [0u64; 3];
    for (i, part) in main.split('.').enumerate() {
        if i > 2 {
            return None;
        }
        nums[i] = part.parse().ok()?;
    }
    Some(Version { nums, pre })
}

fn compare(a: &Version, b: &Version) -> Ordering {
    a.nums.cmp(&b.nums).then_with(|| match (&a.pre, &b.pre) {
        (None, None) => Ordering::Equal,
        (None, Some(_)) => Ordering::Greater, // 1.0.0 > 1.0.0-beta
        (Some(_), None) => Ordering::Less,
        (Some(x), Some(y)) => x.cmp(y),
    })
}

fn client() -> Result<reqwest::Client, String> {
    crate::util::http_client()
}

#[tauri::command]
pub async fn check_update(app: AppHandle, include_prerelease: bool) -> Result<Option<UpdateInfo>, String> {
    let current_str = app.package_info().version.to_string();
    let current = parse_version(&current_str).ok_or("Eigene Version unlesbar")?;

    let resp = client()?
        .get(format!("https://api.github.com/repos/{RELEASE_REPO}/releases?per_page=20"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("GitHub nicht erreichbar: {}", crate::util::net_err(&e)))?;
    if resp.status().as_u16() == 404 {
        return Err(format!("Release-Repo {RELEASE_REPO} nicht gefunden oder nicht öffentlich."));
    }
    if resp.status().as_u16() == 403 || resp.status().as_u16() == 429 {
        return Err("GitHub-Limit erreicht – bitte später erneut versuchen.".into());
    }
    if !resp.status().is_success() {
        return Err(format!("GitHub antwortet mit HTTP {}", resp.status()));
    }
    let text = resp.text().await.map_err(err)?;
    let releases: Vec<serde_json::Value> = serde_json::from_str(&text).map_err(err)?;

    // Ergebnis der Prüfung merken (für „täglich/wöchentlich“)
    let mut s = crate::settings::load(&app);
    s.last_update_check = now();
    let _ = crate::settings::save_settings(app.clone(), s);

    let mut best: Option<(Version, UpdateInfo)> = None;
    for r in releases {
        if r["draft"].as_bool().unwrap_or(false) {
            continue;
        }
        let prerelease = r["prerelease"].as_bool().unwrap_or(false);
        if prerelease && !include_prerelease {
            continue;
        }
        let tag = r["tag_name"].as_str().unwrap_or_default();
        let Some(v) = parse_version(tag) else { continue };
        if compare(&v, &current) != Ordering::Greater {
            continue;
        }
        let Some(asset) = r["assets"].as_array().and_then(|a| {
            a.iter().find(|x| x["name"].as_str().map(|n| n.ends_with("-setup.exe")).unwrap_or(false))
        }) else {
            continue;
        };
        if best.as_ref().map(|(b, _)| compare(&v, b) == Ordering::Greater).unwrap_or(true) {
            let info = UpdateInfo {
                version: tag.trim_start_matches('v').to_string(),
                current: current_str.clone(),
                notes: r["body"].as_str().unwrap_or_default().to_string(),
                published_at: r["published_at"].as_str().unwrap_or_default().to_string(),
                html_url: r["html_url"].as_str().unwrap_or_default().to_string(),
                asset_url: asset["browser_download_url"].as_str().unwrap_or_default().to_string(),
                asset_name: asset["name"].as_str().unwrap_or_default().to_string(),
                size: asset["size"].as_u64().unwrap_or(0),
                digest: asset["digest"].as_str().map(|d| d.to_string()),
                prerelease,
            };
            best = Some((v, info));
        }
    }
    Ok(best.map(|(_, i)| i))
}

#[tauri::command]
pub async fn install_update(app: AppHandle, info: UpdateInfo) -> Result<(), String> {
    if !cfg!(windows) {
        return Err("Automatische Installation gibt es nur unter Windows.".into());
    }
    if !info.asset_url.starts_with(&format!("https://github.com/{RELEASE_REPO}/releases/download/")) {
        return Err("Unerwartete Download-Adresse – Update abgebrochen.".into());
    }
    let safe_name: String = info
        .asset_name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | ' '))
        .collect();
    if !safe_name.ends_with("-setup.exe") {
        return Err("Unerwarteter Dateiname – Update abgebrochen.".into());
    }

    let dir = std::env::temp_dir().join("AnvilStudio-Update");
    std::fs::create_dir_all(&dir).map_err(err)?;
    let installer = dir.join(&safe_name);

    let app_p = app.clone();
    let progress = move |downloaded: u64, total: Option<u64>| {
        let _ = app_p.emit("update-progress", Progress { downloaded, total });
    };
    crate::util::download(&info.asset_url, &installer, &progress)
        .await
        .map_err(|e| format!("Download fehlgeschlagen: {e}"))?;

    if let Some(expected) = info.digest.as_deref().and_then(|d| d.strip_prefix("sha256:")) {
        let actual = crate::util::sha256_file(&installer)?;
        if !actual.eq_ignore_ascii_case(expected) {
            let _ = std::fs::remove_file(&installer);
            return Err("Prüfsumme stimmt nicht – die Datei wurde verworfen.".into());
        }
    }

    // Kleines Skript: Installer passiv ausführen, danach Anvil Studio neu starten
    let exe = std::env::current_exe().map_err(err)?;
    let script = dir.join("install-update.cmd");
    let content = format!(
        "@echo off\r\nchcp 65001 >nul\r\ntimeout /t 1 /nobreak >nul\r\nstart \"\" /wait \"{}\" /P\r\nstart \"\" \"{}\"\r\n",
        installer.display(),
        exe.display()
    );
    std::fs::write(&script, content).map_err(err)?;

    let mut cmd = std::process::Command::new("cmd");
    cmd.arg("/C").arg(&script);
    crate::util::hide_window_std(&mut cmd).spawn().map_err(err)?;

    // Kurz warten, damit die Oberfläche „Wird installiert …“ anzeigen kann
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(700)).await;
        app2.exit(0);
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions() {
        let v = |s| parse_version(s).unwrap();
        assert_eq!(compare(&v("0.2.0"), &v("0.1.9")), Ordering::Greater);
        assert_eq!(compare(&v("v1.0.0"), &v("1.0.0-beta.2")), Ordering::Greater);
        assert_eq!(compare(&v("1.0.0-beta.2"), &v("1.0.0-beta.1")), Ordering::Greater);
        assert_eq!(compare(&v("0.10.0"), &v("0.9.0")), Ordering::Greater);
        assert_eq!(compare(&v("0.2"), &v("0.2.0")), Ordering::Equal);
        assert!(parse_version("abc").is_none());
    }
}
