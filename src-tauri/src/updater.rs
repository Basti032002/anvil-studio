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

use crate::admin::{DEV_REPO, RELEASE_REPO};

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
    /// "stable" | "beta" | "dev"
    pub channel: String,
    /// Nur für Dev: API-Adresse des Installers (privates Repo, braucht Token)
    #[serde(default)]
    pub asset_api_url: String,
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

/// Vorabkennungen nach SemVer vergleichen: Teile mit Zahlen numerisch
/// (beta.10 > beta.9), sonst alphabetisch (dev > beta).
fn compare_pre(x: &str, y: &str) -> Ordering {
    let xs: Vec<&str> = x.split('.').collect();
    let ys: Vec<&str> = y.split('.').collect();
    for (a, b) in xs.iter().zip(ys.iter()) {
        let o = match (a.parse::<u64>(), b.parse::<u64>()) {
            (Ok(n), Ok(m)) => n.cmp(&m),
            (Ok(_), Err(_)) => Ordering::Less,
            (Err(_), Ok(_)) => Ordering::Greater,
            _ => a.cmp(b),
        };
        if o != Ordering::Equal {
            return o;
        }
    }
    xs.len().cmp(&ys.len())
}

fn compare(a: &Version, b: &Version) -> Ordering {
    a.nums.cmp(&b.nums).then_with(|| match (&a.pre, &b.pre) {
        (None, None) => Ordering::Equal,
        (None, Some(_)) => Ordering::Greater, // 1.0.0 > 1.0.0-beta
        (Some(_), None) => Ordering::Less,
        (Some(x), Some(y)) => compare_pre(x, y),
    })
}

fn client() -> Result<reqwest::Client, String> {
    crate::util::http_client()
}

async fn fetch_releases(repo: &str, token: Option<&str>) -> Result<Vec<serde_json::Value>, String> {
    let mut req = client()?
        .get(format!("https://api.github.com/repos/{repo}/releases?per_page=20"))
        .header("Accept", "application/vnd.github+json");
    if let Some(t) = token {
        req = req.bearer_auth(t);
    }
    let resp = req.send().await.map_err(|e| format!("GitHub nicht erreichbar: {}", crate::util::net_err(&e)))?;
    if resp.status().as_u16() == 404 {
        return Err(format!("Release-Repo {repo} nicht gefunden oder kein Zugriff."));
    }
    if resp.status().as_u16() == 403 || resp.status().as_u16() == 429 {
        return Err("GitHub-Limit erreicht – bitte später erneut versuchen.".into());
    }
    if !resp.status().is_success() {
        return Err(format!("GitHub antwortet mit HTTP {}", resp.status()));
    }
    let text = resp.text().await.map_err(err)?;
    serde_json::from_str(&text).map_err(err)
}

/// channel: "stable" (nur stabile), "beta" (+ Vorabversionen), "dev" (+ Dev-Versionen
/// aus dem privaten Repo, nur mit Tester-Zugang). `include_prerelease` ist der
/// alte Schalter und zählt wie "beta".
#[tauri::command]
pub async fn check_update(app: AppHandle, channel: Option<String>, include_prerelease: Option<bool>) -> Result<Option<UpdateInfo>, String> {
    let channel = channel.unwrap_or_else(|| if include_prerelease.unwrap_or(false) { "beta".into() } else { "stable".into() });
    let current_str = app.package_info().version.to_string();
    let current = parse_version(&current_str).ok_or("Eigene Version unlesbar")?;

    let mut sources: Vec<(Vec<serde_json::Value>, bool)> = vec![(fetch_releases(RELEASE_REPO, None).await?, false)];
    if channel == "dev" {
        match crate::admin::load_token() {
            Some(t) => match fetch_releases(DEV_REPO, Some(&t)).await {
                Ok(r) => sources.push((r, true)),
                Err(e) => eprintln!("Dev-Kanal nicht verfügbar: {e}"),
            },
            None => eprintln!("Dev-Kanal: nicht angemeldet"),
        }
    }

    // Ergebnis der Prüfung merken (für „täglich/wöchentlich“)
    let mut s = crate::settings::load(&app);
    s.last_update_check = now();
    let _ = crate::settings::save_settings(app.clone(), s);

    let mut best: Option<(Version, UpdateInfo)> = None;
    for (releases, is_dev) in sources {
        for r in releases {
            if r["draft"].as_bool().unwrap_or(false) {
                continue;
            }
            let prerelease = r["prerelease"].as_bool().unwrap_or(false);
            if prerelease && !is_dev && channel == "stable" {
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
                    channel: if is_dev { "dev" } else if prerelease { "beta" } else { "stable" }.into(),
                    asset_api_url: if is_dev { asset["url"].as_str().unwrap_or_default().to_string() } else { String::new() },
                };
                best = Some((v, info));
            }
        }
    }
    Ok(best.map(|(_, i)| i))
}

#[tauri::command]
pub async fn install_update(app: AppHandle, info: UpdateInfo) -> Result<(), String> {
    if !cfg!(windows) {
        return Err("Automatische Installation gibt es nur unter Windows.".into());
    }
    let is_dev = info.channel == "dev";
    let (url, headers): (String, Vec<(&str, String)>) = if is_dev {
        if !info.asset_api_url.starts_with(&format!("https://api.github.com/repos/{DEV_REPO}/releases/assets/")) {
            return Err("Unerwartete Download-Adresse – Update abgebrochen.".into());
        }
        let token = crate::admin::load_token().ok_or("Für Dev-Versionen bitte mit GitHub anmelden.")?;
        (
            info.asset_api_url.clone(),
            vec![("Authorization", format!("Bearer {token}")), ("Accept", "application/octet-stream".to_string())],
        )
    } else {
        if !info.asset_url.starts_with(&format!("https://github.com/{RELEASE_REPO}/releases/download/")) {
            return Err("Unerwartete Download-Adresse – Update abgebrochen.".into());
        }
        (info.asset_url.clone(), vec![])
    };
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
    crate::util::download_with(&url, &headers, &installer, &progress)
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
        assert_eq!(compare(&v("0.4.0-dev.10"), &v("0.4.0-dev.9")), Ordering::Greater);
        assert_eq!(compare(&v("0.4.0-dev.1"), &v("0.4.0-beta.3")), Ordering::Greater);
        assert_eq!(compare(&v("0.4.0"), &v("0.4.0-dev.5")), Ordering::Greater);
    }
}
