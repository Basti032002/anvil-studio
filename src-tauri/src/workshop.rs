//! Verbindung zum Workshop-Server: Liste, Details, Hochladen, Herunterladen,
//! Quellcode als Projekt öffnen und Admin-Funktionen.

use crate::util::{err, http_client, net_err};
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::AppHandle;

static TOKEN: Mutex<Option<String>> = Mutex::new(None);

pub fn reset_session() {
    *TOKEN.lock().unwrap() = None;
}

fn base(app: &AppHandle) -> String {
    crate::settings::load(app).workshop_url
}

/// Workshop-Sitzung über das Minecraft-Konto holen
async fn session(app: &AppHandle) -> Result<String, String> {
    if let Some(t) = TOKEN.lock().unwrap().clone() {
        return Ok(t);
    }
    let (mc, _) = crate::minecraft::token().await?;
    let r = http_client()?
        .post(format!("{}/api/auth", base(app)))
        .json(&json!({ "minecraftToken": mc }))
        .send()
        .await
        .map_err(|e| unreachable_msg(app, &e))?;
    let v = read(r).await?;
    let t = v["token"].as_str().ok_or("Der Workshop hat keine Sitzung geliefert.")?.to_string();
    *TOKEN.lock().unwrap() = Some(t.clone());
    Ok(t)
}

fn unreachable_msg(app: &AppHandle, e: &reqwest::Error) -> String {
    format!("Workshop nicht erreichbar ({}): {}", base(app), net_err(e))
}

async fn read(r: reqwest::Response) -> Result<Value, String> {
    let status = r.status().as_u16();
    let text = r.text().await.map_err(|e| net_err(&e))?;
    let v: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
    if status >= 400 {
        return Err(v["error"].as_str().map(|s| s.to_string()).unwrap_or(format!("Workshop antwortet mit HTTP {status}.")));
    }
    Ok(v)
}

/// Anfrage an den Server; bei abgelaufener Sitzung einmal neu anmelden.
async fn call(app: &AppHandle, method: reqwest::Method, path: &str, body: Option<Value>, auth: bool) -> Result<Value, String> {
    for attempt in 0..2 {
        let mut req = http_client()?.request(method.clone(), format!("{}{path}", base(app)));
        if auth {
            req = req.bearer_auth(session(app).await?);
        } else if let Some(t) = TOKEN.lock().unwrap().clone() {
            req = req.bearer_auth(t);
        }
        if let Some(b) = &body {
            req = req.json(b);
        }
        let r = req.send().await.map_err(|e| unreachable_msg(app, &e))?;
        if r.status().as_u16() == 401 && auth && attempt == 0 {
            reset_session();
            continue;
        }
        return read(r).await;
    }
    Err("Anmeldung beim Workshop fehlgeschlagen.".into())
}

fn enc(s: &str) -> String {
    s.bytes()
        .map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") })
        .collect()
}

#[tauri::command]
pub fn ws_base_url(app: AppHandle) -> String {
    base(&app)
}

#[tauri::command]
pub async fn ws_list(app: AppHandle, kind: String, q: String, mc: String, category: String, sort: String, offset: u32) -> Result<Value, String> {
    let path = format!(
        "/api/items?type={}&q={}&mc={}&category={}&sort={}&offset={offset}&limit=60",
        enc(&kind),
        enc(&q),
        enc(&mc),
        enc(&category),
        enc(&sort)
    );
    call(&app, reqwest::Method::GET, &path, None, false).await
}

#[tauri::command]
pub async fn ws_item(app: AppHandle, id: String) -> Result<Value, String> {
    call(&app, reqwest::Method::GET, &format!("/api/items/{}", enc(&id)), None, false).await
}

/// Angemeldet beim Workshop? (Name, UUID, Admin)
#[tauri::command]
pub async fn ws_me(app: AppHandle) -> Result<Option<Value>, String> {
    if crate::minecraft::mc_account().await?.is_none() {
        return Ok(None);
    }
    call(&app, reqwest::Method::GET, "/api/me", None, true).await.map(Some)
}

#[tauri::command]
pub async fn ws_my_items(app: AppHandle) -> Result<Value, String> {
    call(&app, reqwest::Method::GET, "/api/me/items", None, true).await
}

#[tauri::command]
pub async fn ws_delete(app: AppHandle, id: String) -> Result<(), String> {
    call(&app, reqwest::Method::DELETE, &format!("/api/items/{}", enc(&id)), None, true).await.map(|_| ())
}

#[tauri::command]
pub async fn ws_report(app: AppHandle, id: String, reason: String) -> Result<(), String> {
    call(&app, reqwest::Method::POST, &format!("/api/items/{}/report", enc(&id)), Some(json!({ "reason": reason })), true).await.map(|_| ())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadRequest {
    project_id: String,
    /// vorhandener Eintrag → aktualisieren
    item_id: Option<String>,
    include_mod: bool,
    include_source: bool,
    title: String,
    summary: String,
    description: String,
    categories: Vec<String>,
    trailer_url: String,
    /// Bilddateien auf der Festplatte (leer = Bilder unverändert lassen)
    images: Vec<String>,
}

#[tauri::command]
pub async fn ws_upload(app: AppHandle, req: UploadRequest) -> Result<Value, String> {
    let p = crate::projects::get(&app, &req.project_id)?;
    let root = PathBuf::from(&p.path);
    let settings = crate::modsettings::mod_settings_get(app.clone(), req.project_id.clone())?;
    if !req.include_mod && !req.include_source {
        return Err("Wähle aus, ob die fertige Mod, der Quellcode oder beides hochgeladen werden soll.".into());
    }
    let meta = json!({
        "title": req.title, "summary": req.summary, "description": req.description,
        "categories": req.categories, "trailerUrl": req.trailer_url,
        "mcVersion": p.mc_version, "modVersion": settings.version, "modId": p.mod_id, "license": settings.license,
    });
    let mut form = reqwest::multipart::Form::new().text("meta", meta.to_string());
    if req.include_mod {
        let jars = crate::export::export_jars(app.clone(), req.project_id.clone())?;
        let jar = jars.first().ok_or("Es gibt noch keine fertige Mod-Datei. Baue sie zuerst (Export → Mod-Datei bauen).")?;
        let bytes = std::fs::read(&jar.path).map_err(err)?;
        form = form.part("mod", reqwest::multipart::Part::bytes(bytes).file_name(jar.name.clone()));
    }
    if req.include_source {
        let tmp = std::env::temp_dir().join(format!("anvil-src-{}.zip", p.mod_id));
        let r2 = root.clone();
        let t2 = tmp.clone();
        tauri::async_runtime::spawn_blocking(move || crate::export::zip_project(&r2, &t2)).await.map_err(err)??;
        let bytes = std::fs::read(&tmp).map_err(err)?;
        let _ = std::fs::remove_file(&tmp);
        form = form.part("source", reqwest::multipart::Part::bytes(bytes).file_name("source.zip"));
    }
    let logo = root.join("src/main/resources/logo.png");
    if logo.exists() {
        form = form.part("icon", reqwest::multipart::Part::bytes(std::fs::read(&logo).map_err(err)?).file_name("icon.png"));
    }
    for img in req.images.iter().take(8) {
        let bytes = std::fs::read(img).map_err(|e| format!("Bild „{img}“ kann nicht gelesen werden: {e}"))?;
        let name = PathBuf::from(img).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or("bild.png".into());
        form = form.part("images", reqwest::multipart::Part::bytes(bytes).file_name(name));
    }
    let (method, path) = match &req.item_id {
        Some(id) => (reqwest::Method::PUT, format!("/api/items/{}", enc(id))),
        None => (reqwest::Method::POST, "/api/items".to_string()),
    };
    let token = session(&app).await?;
    let r = http_client()?
        .request(method, format!("{}{path}", base(&app)))
        .bearer_auth(token)
        .timeout(std::time::Duration::from_secs(600))
        .multipart(form)
        .send()
        .await
        .map_err(|e| unreachable_msg(&app, &e))?;
    read(r).await
}

/// Datei herunterladen (kind: mod | source) und unter dest speichern
async fn download_to(app: &AppHandle, id: &str, kind: &str, dest: &PathBuf) -> Result<(), String> {
    let mut req = http_client()?.get(format!("{}/api/items/{}/download/{kind}", base(app), enc(id)));
    if let Some(t) = TOKEN.lock().unwrap().clone() {
        req = req.bearer_auth(t);
    }
    let r = req.timeout(std::time::Duration::from_secs(900)).send().await.map_err(|e| unreachable_msg(app, &e))?;
    if !r.status().is_success() {
        return read(r).await.map(|_| ());
    }
    let bytes = r.bytes().await.map_err(|e| net_err(&e))?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(err)?;
    }
    std::fs::write(dest, &bytes).map_err(err)
}

#[tauri::command]
pub async fn ws_download(app: AppHandle, id: String, kind: String, dest: String) -> Result<(), String> {
    if !matches!(kind.as_str(), "mod" | "source") {
        return Err("Unbekannte Datei.".into());
    }
    download_to(&app, &id, &kind, &PathBuf::from(dest)).await
}

/// Mod-Datei in den Cache laden (zum Spielen). Rückgabe: Pfad der .jar
pub async fn fetch_mod(app: &AppHandle, id: &str, version: &str) -> Result<PathBuf, String> {
    let dir = crate::util::data_dir(app)?.join("workshop").join(id);
    let jar = dir.join(format!("{}.jar", version.replace(|c: char| !c.is_ascii_alphanumeric() && c != '.', "_")));
    if !jar.exists() {
        let _ = std::fs::remove_dir_all(&dir);
        download_to(app, id, "mod", &jar).await?;
    }
    Ok(jar)
}

/// Quellcode herunterladen, entpacken und als Projekt importieren
#[tauri::command]
pub async fn ws_open_source(app: AppHandle, id: String) -> Result<crate::projects::Project, String> {
    let item = ws_item(app.clone(), id.clone()).await?;
    let title = item["title"].as_str().unwrap_or("Workshop-Projekt");
    let folder: String = title.chars().map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' { c } else { '_' }).collect::<String>().trim().to_string();
    let parent = crate::template::default_parent(&app)?;
    let mut target = parent.join(if folder.is_empty() { "Workshop-Projekt".to_string() } else { folder.clone() });
    let mut n = 2;
    while target.exists() {
        target = parent.join(format!("{folder} ({n})"));
        n += 1;
    }
    let tmp = std::env::temp_dir().join(format!("anvil-ws-{id}.zip"));
    download_to(&app, &id, "source", &tmp).await?;
    let t2 = target.clone();
    let tmp2 = tmp.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let f = std::fs::File::open(&tmp2).map_err(err)?;
        let mut zip = zip::ZipArchive::new(f).map_err(|e| format!("Der Quellcode ist beschädigt: {e}"))?;
        std::fs::create_dir_all(&t2).map_err(err)?;
        for i in 0..zip.len() {
            let mut entry = zip.by_index(i).map_err(err)?;
            // Pfade außerhalb des Zielordners verhindern
            let Some(rel) = entry.enclosed_name() else { continue };
            let out = t2.join(rel);
            if entry.is_dir() {
                std::fs::create_dir_all(&out).map_err(err)?;
                continue;
            }
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent).map_err(err)?;
            }
            let mut file = std::fs::File::create(&out).map_err(err)?;
            std::io::copy(&mut entry, &mut file).map_err(err)?;
        }
        Ok(())
    })
    .await
    .map_err(err)??;
    let _ = std::fs::remove_file(&tmp);
    // Projekte aus dem Workshop haben oft einen Unterordner
    let mut root = target.clone();
    if !root.join("build.gradle").exists() {
        if let Ok(mut entries) = std::fs::read_dir(&root) {
            if let Some(Ok(e)) = entries.next() {
                if e.path().join("build.gradle").exists() {
                    root = e.path();
                }
            }
        }
    }
    crate::projects::import_project(app, root.to_string_lossy().to_string(), true)
}

// ---- Admin ---------------------------------------------------------------------

#[tauri::command]
pub async fn ws_admin_items(app: AppHandle, status: String, q: String) -> Result<Value, String> {
    call(&app, reqwest::Method::GET, &format!("/api/admin/items?status={}&q={}", enc(&status), enc(&q)), None, true).await
}

#[tauri::command]
pub async fn ws_admin_stats(app: AppHandle) -> Result<Value, String> {
    call(&app, reqwest::Method::GET, "/api/admin/stats", None, true).await
}

#[tauri::command]
pub async fn ws_admin_reports(app: AppHandle, id: String) -> Result<Value, String> {
    call(&app, reqwest::Method::GET, &format!("/api/admin/items/{}/reports", enc(&id)), None, true).await
}

#[tauri::command]
pub async fn ws_admin_action(app: AppHandle, id: String, action: String, reason: String, allow_resubmit: bool, featured: bool) -> Result<Value, String> {
    if !matches!(action.as_str(), "approve" | "reject" | "block" | "unblock" | "feature" | "dismiss-reports") {
        return Err("Unbekannte Aktion.".into());
    }
    call(
        &app,
        reqwest::Method::POST,
        &format!("/api/admin/items/{}/{action}", enc(&id)),
        Some(json!({ "reason": reason, "allowResubmit": allow_resubmit, "featured": featured })),
        true,
    )
    .await
}

#[tauri::command]
pub async fn ws_admin_patch(app: AppHandle, id: String, patch: Value) -> Result<Value, String> {
    call(&app, reqwest::Method::PATCH, &format!("/api/admin/items/{}", enc(&id)), Some(patch), true).await
}

#[tauri::command]
pub async fn ws_admin_settings(app: AppHandle, settings: Option<Value>) -> Result<Value, String> {
    match settings {
        Some(s) => call(&app, reqwest::Method::PUT, "/api/admin/settings", Some(s), true).await,
        None => call(&app, reqwest::Method::GET, "/api/admin/settings", None, true).await,
    }
}
