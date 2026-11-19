use crate::util::{data_dir, err};
use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

/// Java-Version für Minecraft 1.21.x
pub const JAVA_MAJOR: u32 = 21;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct JavaStatus {
    pub installed: bool,
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

/// JAVA_HOME des von Anvil Studio verwalteten JDKs, falls installiert.
pub fn java_home(app: &AppHandle) -> Option<PathBuf> {
    let dir = jdk_dir(app).ok()?;
    java_bin(&dir).exists().then_some(dir)
}

#[tauri::command]
pub fn java_status(app: AppHandle) -> JavaStatus {
    let home = java_home(&app);
    JavaStatus {
        installed: home.is_some(),
        version: JAVA_MAJOR,
        path: home.map(|h| h.to_string_lossy().to_string()),
    }
}

fn adoptium_url() -> Result<(String, bool), String> {
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
        "https://api.adoptium.net/v3/binary/latest/{JAVA_MAJOR}/ga/{os}/{arch}/jdk/hotspot/normal/eclipse"
    );
    Ok((url, os == "windows"))
}

/// Lädt Eclipse Temurin herunter und entpackt es in den App-Datenordner.
#[tauri::command]
pub async fn install_java(app: AppHandle) -> Result<JavaStatus, String> {
    let (url, is_zip) = adoptium_url()?;
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
    let mut resp = reqwest::get(&url).await.map_err(err)?;
    if !resp.status().is_success() {
        return Err(format!("Download fehlgeschlagen: HTTP {}", resp.status()));
    }
    let total = resp.content_length();
    let mut file = std::fs::File::create(&archive).map_err(err)?;
    let mut downloaded = 0u64;
    let mut last_emit = 0u64;
    while let Some(chunk) = resp.chunk().await.map_err(err)? {
        file.write_all(&chunk).map_err(err)?;
        downloaded += chunk.len() as u64;
        if downloaded - last_emit > 2 * 1024 * 1024 {
            last_emit = downloaded;
            emit("download", downloaded, total);
        }
    }
    drop(file);

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

    if !java_bin(&target).exists() {
        return Err("Java wurde entpackt, aber java ist nicht auffindbar".into());
    }
    emit("done", downloaded, total);
    Ok(java_status(app))
}
