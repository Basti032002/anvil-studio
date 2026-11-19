use crate::util::{data_dir, err};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

/// Java-Version für Minecraft 1.21.x
pub const JAVA_MAJOR: u32 = 21;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JavaStatus {
    pub installed: bool,
    /// Ordner vorhanden, aber unvollständig/kaputt → „Reparieren“ anbieten
    pub broken: bool,
    pub version: u32,
    pub path: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct JavaProgress {
    phase: String,
    downloaded: u64,
    total: Option<u64>,
}

fn jdk_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("jdks").join(format!("temurin-{JAVA_MAJOR}")))
}

fn java_bin(home: &Path) -> PathBuf {
    home.join("bin").join(if cfg!(windows) { "java.exe" } else { "java" })
}

/// Vollständigkeit eines JDK-Ordners (die wichtigsten Dateien).
fn looks_complete(home: &Path) -> bool {
    java_bin(home).exists()
        && home.join("lib").join("jvm.cfg").exists()
        && home.join("lib").join("modules").exists()
        && home.join("release").exists()
}

/// Probelauf: java -version muss funktionieren.
fn runs(home: &Path) -> bool {
    let mut cmd = std::process::Command::new(java_bin(home));
    cmd.arg("-version");
    crate::util::hide_window_std(&mut cmd).output().map(|o| o.status.success()).unwrap_or(false)
}

/// JAVA_HOME des von Anvil Studio verwalteten JDKs, falls vollständig installiert.
pub fn java_home(app: &AppHandle) -> Option<PathBuf> {
    let dir = jdk_dir(app).ok()?;
    looks_complete(&dir).then_some(dir)
}

#[tauri::command]
pub fn java_status(app: AppHandle) -> JavaStatus {
    let dir = jdk_dir(&app).ok();
    let home = java_home(&app);
    let broken = home.is_none() && dir.as_ref().map(|d| d.exists()).unwrap_or(false);
    JavaStatus {
        installed: home.is_some(),
        broken,
        version: JAVA_MAJOR,
        path: home.map(|h| h.to_string_lossy().to_string()),
    }
}

/// Download-Adresse, Prüfsumme und Format von der Adoptium-API.
async fn adoptium_package() -> Result<(String, Option<String>, bool), String> {
    let os = match std::env::consts::OS {
        "windows" => "windows",
        "linux" => "linux",
        "macos" => "mac",
        o => return Err(format!("Betriebssystem {o} wird nicht unterstützt")),
    };
    let arch = match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "aarch64",
        a => return Err(format!("Architektur {a} wird nicht unterstützt")),
    };
    let url = format!(
        "https://api.adoptium.net/v3/assets/latest/{JAVA_MAJOR}/hotspot?architecture={arch}&image_type=jdk&os={os}&vendor=eclipse"
    );
    let fallback = format!("https://api.adoptium.net/v3/binary/latest/{JAVA_MAJOR}/ga/{os}/{arch}/jdk/hotspot/normal/eclipse");
    let is_zip = os == "windows";
    let resp = match crate::util::http_client()?.get(&url).send().await {
        Ok(r) if r.status().is_success() => r,
        _ => return Ok((fallback, None, is_zip)),
    };
    let v: serde_json::Value = serde_json::from_str(&resp.text().await.map_err(err)?).map_err(err)?;
    let pkg = &v[0]["binary"]["package"];
    match pkg["link"].as_str() {
        Some(link) => Ok((link.to_string(), pkg["checksum"].as_str().map(|s| s.to_string()), link.ends_with(".zip"))),
        None => Ok((fallback, None, is_zip)),
    }
}

/// Lädt Eclipse Temurin herunter und entpackt es in den App-Datenordner.
#[tauri::command]
pub async fn install_java(app: AppHandle) -> Result<JavaStatus, String> {
    let (url, checksum, is_zip) = adoptium_package().await?;
    let downloads = data_dir(&app)?.join("downloads");
    std::fs::create_dir_all(&downloads).map_err(err)?;
    let archive = downloads.join(if is_zip { "jdk.zip" } else { "jdk.tar.gz" });

    let emit = |phase: &str, downloaded: u64, total: Option<u64>| {
        let _ = app.emit(
            "java-progress",
            JavaProgress { phase: phase.into(), downloaded, total },
        );
    };

    emit("download", 0, None);
    let app_p = app.clone();
    let progress = move |downloaded: u64, total: Option<u64>| {
        let _ = app_p.emit("java-progress", JavaProgress { phase: "download".into(), downloaded, total });
    };
    crate::util::download(&url, &archive, &progress)
        .await
        .map_err(|e| format!("Java-Download fehlgeschlagen: {e}"))?;
    if let Some(expected) = checksum {
        let actual = crate::util::sha256_file(&archive)?;
        if !actual.eq_ignore_ascii_case(&expected) {
            let _ = std::fs::remove_file(&archive);
            return Err("Der Java-Download ist unvollständig oder beschädigt (Prüfsumme stimmt nicht). Bitte erneut versuchen.".into());
        }
    }
    let downloaded = std::fs::metadata(&archive).map(|m| m.len()).unwrap_or(0);
    let total = Some(downloaded);

    emit("extract", downloaded, total);
    let target = jdk_dir(&app)?;
    let tmp = target.with_extension("tmp");
    let archive_c = archive.clone();
    let target_c = target.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        if tmp.exists() {
            std::fs::remove_dir_all(&tmp).map_err(err)?;
        }
        std::fs::create_dir_all(&tmp).map_err(err)?;
        let f = std::fs::File::open(&archive_c).map_err(err)?;
        if is_zip {
            zip::ZipArchive::new(f).map_err(err)?.extract(&tmp).map_err(err)?;
        } else {
            tar::Archive::new(flate2::read::GzDecoder::new(f)).unpack(&tmp).map_err(err)?;
        }
        // Das Archiv enthält genau einen Ordner, z. B. jdk-21.0.5+11
        let top = std::fs::read_dir(&tmp)
            .map_err(err)?
            .flatten()
            .find(|e| e.path().is_dir())
            .ok_or("Unerwarteter Inhalt im JDK-Archiv")?
            .path();
        let mac_home = top.join("Contents").join("Home");
        let home = if mac_home.exists() { mac_home } else { top };
        if target_c.exists() {
            std::fs::remove_dir_all(&target_c).map_err(err)?;
        }
        std::fs::rename(&home, &target_c).map_err(err)?;
        let _ = std::fs::remove_dir_all(&tmp);
        let _ = std::fs::remove_file(&archive_c);
        Ok(())
    })
    .await
    .map_err(err)??;

    if !looks_complete(&target) || !runs(&target) {
        let _ = std::fs::remove_dir_all(&target);
        return Err("Java wurde entpackt, ist aber nicht lauffähig. Bitte erneut versuchen.".into());
    }
    emit("done", downloaded, total);
    Ok(java_status(app))
}
