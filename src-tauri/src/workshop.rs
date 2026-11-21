//! Verbindung zum Workshop-Server: Liste, Details, Hochladen, Herunterladen,
//! Quellcode als Projekt öffnen und Admin-Funktionen.

use crate::util::{err, http_client, net_err};
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

static TOKEN: Mutex<Option<String>> = Mutex::new(None);

pub fn reset_session() {
    *TOKEN.lock().unwrap() = None;
}

fn base(app: &AppHandle) -> String {
    crate::settings::load(app).workshop_url
}

/// Workshop-Sitzung über das Minecraft-Konto (oder übergangsweise Xbox) holen
async fn session(app: &AppHandle) -> Result<String, String> {
    if let Some(t) = TOKEN.lock().unwrap().clone() {
        return Ok(t);
    }
    let c = crate::minecraft::credentials().await?;
    let (uhs, xbox) = c.xbox.unwrap_or_default();
    let r = http_client()?
        .post(format!("{}/api/auth", base(app)))
        .json(&json!({ "minecraftToken": c.mc_token, "xboxUhs": uhs, "xboxToken": xbox }))
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

// ---- Zentrale Einstellung (Datei im GitHub-Repo, Zweig „config“) --------------------

pub const REMOTE_CONFIG_URL: &str = "https://raw.githubusercontent.com/Basti032002/anvil-studio/config/workshop.json";

#[derive(serde::Serialize, serde::Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct RemoteConfig {
    pub enabled: bool,
    pub url: String,
}

impl Default for RemoteConfig {
    fn default() -> Self {
        Self { enabled: true, url: crate::settings::DEFAULT_WORKSHOP.into() }
    }
}

/// Gültige Workshop-Adresse? (https, ohne Pfad-Tricks)
pub fn valid_workshop_url(u: &str) -> bool {
    let u = u.trim();
    (u.starts_with("https://") || u.starts_with("http://localhost") || u.starts_with("http://127.0.0.1")) && u.len() < 200 && !u.contains(char::is_whitespace)
}

async fn fetch_remote() -> Result<RemoteConfig, String> {
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let r = http_client()?
        .get(format!("{REMOTE_CONFIG_URL}?t={t}"))
        .header("Cache-Control", "no-cache")
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !r.status().is_success() {
        return Err(format!("HTTP {}", r.status()));
    }
    let c: RemoteConfig = r.json().await.map_err(|e| e.to_string())?;
    if !valid_workshop_url(&c.url) {
        return Err("ungültige Adresse".into());
    }
    Ok(c)
}

/// Neue zentrale Einstellung anwenden und alle Fenster informieren
pub fn apply_remote(app: &AppHandle, c: &RemoteConfig) {
    if let Ok(true) = crate::settings::set_workshop(app, &c.url, c.enabled) {
        reset_session();
        let _ = app.emit("workshop-config", c.clone());
    }
}

/// Beim Start und danach jede Minute die zentrale Einstellung abholen
pub fn start_remote_poll(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            if let Ok(c) = fetch_remote().await {
                apply_remote(&app, &c);
            }
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
        }
    });
}

#[tauri::command]
pub fn ws_remote_config(app: AppHandle) -> RemoteConfig {
    let s = crate::settings::load(&app);
    RemoteConfig { enabled: s.workshop_enabled, url: s.workshop_url }
}

/// Prüft, ob unter der Adresse ein Workshop-Server antwortet
#[tauri::command]
pub async fn ws_check_url(url: String) -> Result<(), String> {
    let url = url.trim().trim_end_matches('/').to_string();
    if !valid_workshop_url(&url) {
        return Err("Die Adresse muss mit https:// beginnen.".into());
    }
    let r = http_client()?.get(format!("{url}/api/health")).timeout(std::time::Duration::from_secs(10)).send().await.map_err(|e| format!("Nicht erreichbar: {e}"))?;
    if !r.status().is_success() {
        return Err(format!("Der Server antwortet mit HTTP {}.", r.status().as_u16()));
    }
    let v: Value = r.json().await.map_err(|_| "Das ist kein Workshop-Server.".to_string())?;
    if v["ok"].as_bool() != Some(true) {
        return Err("Das ist kein Workshop-Server.".into());
    }
    Ok(())
}

/// Vorschaubild für eine Bilddatei auf der Festplatte (für die Upload-Seite)
#[tauri::command]
pub fn ws_image_preview(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    let meta = std::fs::metadata(&p).map_err(err)?;
    if meta.len() > 8 * 1024 * 1024 {
        return Err("Das Bild ist zu groß.".into());
    }
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => return Err("Kein Bild.".into()),
    };
    let bytes = std::fs::read(&p).map_err(err)?;
    use base64::Engine;
    Ok(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[tauri::command]
pub fn ws_reset() {
    reset_session();
}

#[tauri::command]
pub fn ws_base_url(app: AppHandle) -> String {
    base(&app)
}

#[tauri::command]
pub async fn ws_list(app: AppHandle, kind: String, q: String, mc: String, category: String, sort: String, offset: u32, owner: Option<String>, exclude: Option<String>, limit: Option<u32>) -> Result<Value, String> {
    let path = format!(
        "/api/items?type={}&q={}&mc={}&category={}&sort={}&offset={offset}&limit={}&owner={}&exclude={}",
        enc(&kind),
        enc(&q),
        enc(&mc),
        enc(&category),
        enc(&sort),
        limit.unwrap_or(60).clamp(1, 100),
        enc(owner.as_deref().unwrap_or("")),
        enc(exclude.as_deref().unwrap_or(""))
    );
    call(&app, reqwest::Method::GET, &path, None, false).await
}

#[tauri::command]
pub async fn ws_public_stats(app: AppHandle) -> Result<Value, String> {
    call(&app, reqwest::Method::GET, "/api/stats/public", None, false).await
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
    let mut me = call(&app, reqwest::Method::GET, "/api/me", None, true).await?;
    // Sitzung für Bild-Adressen (Bilder noch nicht freigegebener Uploads brauchen sie)
    if let (Some(o), Some(t)) = (me.as_object_mut(), TOKEN.lock().unwrap().clone()) {
        o.insert("sessionToken".into(), Value::String(t));
    }
    Ok(Some(me))
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

// ---- Bewertungen, Kommentare, Abos, Benachrichtigungen ----

#[tauri::command]
pub async fn ws_rate(app: AppHandle, id: String, stars: u8) -> Result<Value, String> {
    call(&app, reqwest::Method::PUT, &format!("/api/items/{}/rating", enc(&id)), Some(json!({ "stars": stars })), true).await
}

#[tauri::command]
pub async fn ws_comments(app: AppHandle, id: String) -> Result<Value, String> {
    call(&app, reqwest::Method::GET, &format!("/api/items/{}/comments", enc(&id)), None, false).await
}

#[tauri::command]
pub async fn ws_comment_add(app: AppHandle, id: String, text: String) -> Result<Value, String> {
    call(&app, reqwest::Method::POST, &format!("/api/items/{}/comments", enc(&id)), Some(json!({ "text": text })), true).await
}

#[tauri::command]
pub async fn ws_comment_delete(app: AppHandle, comment_id: i64) -> Result<(), String> {
    call(&app, reqwest::Method::DELETE, &format!("/api/comments/{comment_id}"), None, true).await.map(|_| ())
}

#[tauri::command]
pub async fn ws_subscribe(app: AppHandle, id: String, on: bool) -> Result<Value, String> {
    let method = if on { reqwest::Method::POST } else { reqwest::Method::DELETE };
    let body = if on { Some(json!({})) } else { None };
    call(&app, method, &format!("/api/items/{}/subscribe", enc(&id)), body, true).await
}

#[tauri::command]
pub async fn ws_subscriptions(app: AppHandle) -> Result<Value, String> {
    let mut v = call(&app, reqwest::Method::GET, "/api/me/subscriptions", None, true).await?;
    // Ist die neueste Fassung schon heruntergeladen?
    if let Some(items) = v["items"].as_array_mut() {
        for it in items.iter_mut() {
            let id = it["id"].as_str().unwrap_or_default().to_string();
            let fresh = cached_mod(&app, &id, &mod_key(it)).map(|p| p.exists()).unwrap_or(false);
            it["installed"] = json!(fresh);
        }
    }
    Ok(v)
}

/// Neue Fassungen abonnierter Mods (samt Abhängigkeiten) im Hintergrund laden
#[tauri::command]
pub async fn ws_sync_subscriptions(app: AppHandle) -> Result<u32, String> {
    if crate::minecraft::mc_account().await?.is_none() {
        return Ok(0);
    }
    let v = call(&app, reqwest::Method::GET, "/api/me/subscriptions", None, true).await?;
    let mut updated = 0;
    for it in v["items"].as_array().into_iter().flatten() {
        if !it["hasMod"].as_bool().unwrap_or(false) {
            continue;
        }
        let id = it["id"].as_str().unwrap_or_default();
        let key = mod_key(it);
        if cached_mod(&app, id, &key).map(|p| p.exists()).unwrap_or(true) {
            continue;
        }
        if fetch_mod(&app, id, &key).await.is_ok() {
            updated += 1;
        }
    }
    Ok(updated)
}

#[tauri::command]
pub async fn ws_notifications(app: AppHandle) -> Result<Value, String> {
    call(&app, reqwest::Method::GET, "/api/me/notifications", None, true).await
}

#[tauri::command]
pub async fn ws_notifications_read(app: AppHandle) -> Result<(), String> {
    call(&app, reqwest::Method::POST, "/api/me/notifications/read", Some(json!({})), true).await.map(|_| ())
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
    /// YouTube-Links
    #[serde(default)]
    videos: Option<Vec<String>>,
    /// Neue Bilddateien auf der Festplatte
    images: Vec<String>,
    /// Reihenfolge: "old:N" (vorhandenes Bild) oder "new:N" (aus `images`)
    #[serde(default)]
    image_order: Option<Vec<String>>,
    /// Workshop-IDs anderer Mods, die zum Spielen gebraucht werden
    #[serde(default)]
    dependencies: Option<Vec<String>>,
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
    let mut meta = meta;
    if let Some(d) = &req.dependencies {
        meta["dependencies"] = json!(d);
    }
    if let Some(v) = &req.videos {
        meta["videos"] = json!(v);
    }
    if let Some(o) = &req.image_order {
        meta["imageOrder"] = json!(o);
    }
    // Erst alle Dateien einsammeln, dann mit Fortschritt hochladen
    let emit = |step: &str, sent: u64, total: u64| {
        let _ = app.emit("ws-upload-progress", json!({ "step": step, "sent": sent, "total": total }));
    };
    let mut files: Vec<(&'static str, String, Vec<u8>)> = vec![];
    if req.include_mod {
        emit("mod", 0, 0);
        let jars = crate::export::export_jars(app.clone(), req.project_id.clone())?;
        let jar = jars.first().ok_or("Es gibt noch keine fertige Mod-Datei. Baue sie zuerst (Export → Mod-Datei bauen).")?;
        files.push(("mod", jar.name.clone(), std::fs::read(&jar.path).map_err(err)?));
    }
    if req.include_source {
        emit("source", 0, 0);
        let tmp = std::env::temp_dir().join(format!("anvil-src-{}.zip", p.mod_id));
        let r2 = root.clone();
        let t2 = tmp.clone();
        tauri::async_runtime::spawn_blocking(move || crate::export::zip_project(&r2, &t2)).await.map_err(err)??;
        let bytes = std::fs::read(&tmp).map_err(err)?;
        let _ = std::fs::remove_file(&tmp);
        files.push(("source", "source.zip".into(), bytes));
    }
    let logo = root.join("src/main/resources/logo.png");
    if logo.exists() {
        files.push(("icon", "icon.png".into(), std::fs::read(&logo).map_err(err)?));
    }
    for img in req.images.iter().take(8) {
        let bytes = std::fs::read(img).map_err(|e| format!("Bild „{img}“ kann nicht gelesen werden: {e}"))?;
        let name = PathBuf::from(img).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or("bild.png".into());
        files.push(("images", name, bytes));
    }
    // Cloudflare (Free) lässt höchstens 100 MB pro Anfrage durch
    const MAX_TOTAL: u64 = 95 * 1024 * 1024;
    let total: u64 = files.iter().map(|f| f.2.len() as u64).sum();
    if total > MAX_TOTAL {
        let what = match files.iter().max_by_key(|f| f.2.len()).map(|f| f.0) {
            Some("mod") => "Mod-Datei",
            Some("source") => "Quellcode",
            _ => "Bilder",
        };
        return Err(format!("Der Upload ist zu groß (über 95 MB, zuletzt: {what}). Lass Bilder weg oder lade Mod und Quellcode getrennt hoch."));
    }

    let (method, path) = match &req.item_id {
        Some(id) => (reqwest::Method::PUT, format!("/api/items/{}", enc(id))),
        None => (reqwest::Method::POST, "/api/items".to_string()),
    };
    let sent = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
    let last_pct = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(u64::MAX));
    let build_form = || {
        sent.store(0, std::sync::atomic::Ordering::SeqCst);
        let mut form = reqwest::multipart::Form::new().text("meta", meta.to_string());
        for (field, name, bytes) in &files {
            let len = bytes.len() as u64;
            let chunks: Vec<Vec<u8>> = bytes.chunks(128 * 1024).map(|c| c.to_vec()).collect();
            let (sent, last_pct, app) = (sent.clone(), last_pct.clone(), app.clone());
            let stream = futures_util::stream::iter(chunks.into_iter().map(move |c| {
                let now = sent.fetch_add(c.len() as u64, std::sync::atomic::Ordering::SeqCst) + c.len() as u64;
                let pct = if total > 0 { now * 100 / total } else { 100 };
                if last_pct.swap(pct, std::sync::atomic::Ordering::SeqCst) != pct {
                    let _ = app.emit("ws-upload-progress", json!({ "step": "upload", "sent": now, "total": total }));
                }
                Ok::<Vec<u8>, std::io::Error>(c)
            }));
            let part = reqwest::multipart::Part::stream_with_length(reqwest::Body::wrap_stream(stream), len).file_name(name.clone());
            form = form.part(*field, part);
        }
        form
    };
    let send = |token: String, form: reqwest::multipart::Form| {
        let url = format!("{}{path}", base(&app));
        let method = method.clone();
        let app = app.clone();
        async move {
            http_client()?
                .request(method, url)
                .bearer_auth(token)
                .timeout(std::time::Duration::from_secs(900))
                .multipart(form)
                .send()
                .await
                .map_err(|e| unreachable_msg(&app, &e))
        }
    };
    emit("upload", 0, total);
    let mut r = send(session(&app).await?, build_form()).await?;
    if r.status().as_u16() == 401 {
        // Sitzung abgelaufen → einmal neu anmelden und erneut senden
        reset_session();
        emit("upload", 0, total);
        r = send(session(&app).await?, build_form()).await?;
    }
    emit("done", total, total);
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
/// Schlüssel einer Mod-Fassung: Version + Zeitpunkt der letzten Änderung
pub fn mod_key(item: &Value) -> String {
    format!("{}-{}", item["modVersion"].as_str().unwrap_or("1.0"), item["updatedAt"].as_i64().unwrap_or(0))
}

fn cached_mod(app: &AppHandle, id: &str, key: &str) -> Result<PathBuf, String> {
    let dir = crate::util::data_dir(app)?.join("workshop").join(id);
    Ok(dir.join(format!("{}.jar", key.replace(|c: char| !c.is_ascii_alphanumeric() && c != '.' && c != '-', "_"))))
}

pub async fn fetch_mod(app: &AppHandle, id: &str, key: &str) -> Result<PathBuf, String> {
    let jar = cached_mod(app, id, key)?;
    let dir = jar.parent().map(|p| p.to_path_buf()).unwrap_or_default();
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
