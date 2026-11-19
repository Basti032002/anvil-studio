//! GitHub-Konto (Anmeldung per Device Flow über die GitHub App) sowie der
//! Entwicklerbereich: Versionen, Releases, Builds und Tester verwalten.
//!
//! Rollen:
//! - Admin  = das Konto OWNER (wird bei jedem Admin-Befehl neu geprüft)
//! - Tester = hat Lesezugriff auf das private Repo DEV_REPO und darf damit
//!   Dev-Versionen herunterladen. Das erzwingt GitHub selbst.
//!
//! Alle Aufrufe laufen mit dem Token des angemeldeten Kontos. Weil es ein
//! Token der GitHub App ist, reicht es nur so weit, wie App UND Konto Rechte
//! haben. Das Token liegt in der Windows-Anmeldeinformationsverwaltung.

use crate::util::{err, http_client, net_err};
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const OWNER: &str = "Basti032002";
const CODE_REPO: &str = "Basti032002/anvil-studio";
pub const RELEASE_REPO: &str = "Basti032002/anvil-studio-releases";
pub const DEV_REPO: &str = "Basti032002/anvil-studio-dev";
/// Client-ID der GitHub App, wird beim Build über die Umgebung gesetzt.
const CLIENT_ID: Option<&str> = option_env!("ANVIL_GITHUB_CLIENT_ID");
const KEYRING_SERVICE: &str = "AnvilStudio";
const KEYRING_USER: &str = "github-admin";

const VERSION_FILES: &[&str] = &[
    "package.json",
    "package-lock.json",
    "src-tauri/tauri.conf.json",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
];

// ---- Token ----------------------------------------------------------------

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(err)
}
pub fn load_token() -> Option<String> {
    entry().ok()?.get_password().ok().filter(|t| !t.is_empty())
}
fn store_token(t: &str) -> Result<(), String> {
    entry()?.set_password(t).map_err(err)
}
fn clear_token() {
    if let Ok(e) = entry() {
        let _ = e.delete_credential();
    }
}
fn token() -> Result<String, String> {
    load_token().ok_or_else(|| "Nicht angemeldet.".to_string())
}

// ---- GitHub-API -------------------------------------------------------------

async fn gh(method: reqwest::Method, path: &str, body: Option<Value>) -> Result<Value, String> {
    let url = if path.starts_with("https://") { path.to_string() } else { format!("https://api.github.com{path}") };
    let mut req = http_client()?
        .request(method, &url)
        .bearer_auth(token()?)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28");
    if let Some(b) = body {
        req = req.json(&b);
    }
    let resp = req.send().await.map_err(|e| net_err(&e))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| net_err(&e))?;
    if status.as_u16() == 401 {
        clear_token();
        return Err("Die Anmeldung ist abgelaufen. Bitte neu anmelden.".into());
    }
    if !status.is_success() {
        let msg = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| v["message"].as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| text.chars().take(200).collect());
        return Err(format!("GitHub: {msg} (HTTP {})", status.as_u16()));
    }
    if text.trim().is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_str(&text).map_err(err)
}

async fn get(path: &str) -> Result<Value, String> {
    gh(reqwest::Method::GET, path, None).await
}

// ---- Anmeldung ----------------------------------------------------------------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AdminUser {
    login: String,
    name: Option<String>,
    avatar_url: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AccountInfo {
    user: AdminUser,
    is_admin: bool,
    is_tester: bool,
}

async fn account_info(user: AdminUser) -> AccountInfo {
    let is_admin = user.login.eq_ignore_ascii_case(OWNER);
    // Tester = Konto kann das private Dev-Repo sehen
    let is_tester = is_admin || get(&format!("/repos/{DEV_REPO}")).await.is_ok();
    AccountInfo { user, is_admin, is_tester }
}

async fn require_admin() -> Result<(), String> {
    let u = fetch_user().await?;
    if u.login.eq_ignore_ascii_case(OWNER) {
        Ok(())
    } else {
        Err("Nur der Entwickler darf das.".into())
    }
}

#[tauri::command]
pub fn account_configured() -> bool {
    CLIENT_ID.map(|c| !c.is_empty()).unwrap_or(false)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCode {
    device_code: String,
    user_code: String,
    verification_uri: String,
    interval: u64,
    expires_in: u64,
}

#[tauri::command]
pub async fn account_start_login() -> Result<DeviceCode, String> {
    let client_id = CLIENT_ID.filter(|c| !c.is_empty()).ok_or("Diese Version wurde ohne GitHub-Client-ID gebaut.")?;
    let resp = http_client()?
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&[("client_id", client_id)])
        .send()
        .await
        .map_err(|e| net_err(&e))?;
    let v: Value = serde_json::from_str(&resp.text().await.map_err(|e| net_err(&e))?).map_err(err)?;
    if let Some(e) = v["error_description"].as_str().or(v["error"].as_str()) {
        return Err(format!("GitHub: {e}"));
    }
    Ok(DeviceCode {
        device_code: v["device_code"].as_str().unwrap_or_default().into(),
        user_code: v["user_code"].as_str().unwrap_or_default().into(),
        verification_uri: v["verification_uri"].as_str().unwrap_or("https://github.com/login/device").into(),
        interval: v["interval"].as_u64().unwrap_or(5),
        expires_in: v["expires_in"].as_u64().unwrap_or(900),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PollResult {
    /// "pending" | "slow_down" | "done" | "denied" | "expired"
    status: String,
    account: Option<AccountInfo>,
}

async fn fetch_user() -> Result<AdminUser, String> {
    let u = get("/user").await?;
    Ok(AdminUser {
        login: u["login"].as_str().unwrap_or_default().into(),
        name: u["name"].as_str().map(|s| s.into()),
        avatar_url: u["avatar_url"].as_str().unwrap_or_default().into(),
    })
}

#[tauri::command]
pub async fn account_poll_login(device_code: String) -> Result<PollResult, String> {
    let client_id = CLIENT_ID.ok_or("Keine Client-ID")?;
    let resp = http_client()?
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&[
            ("client_id", client_id),
            ("device_code", device_code.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|e| net_err(&e))?;
    let v: Value = serde_json::from_str(&resp.text().await.map_err(|e| net_err(&e))?).map_err(err)?;
    let status = |s: &str| PollResult { status: s.into(), account: None };
    if let Some(e) = v["error"].as_str() {
        return Ok(match e {
            "authorization_pending" => status("pending"),
            "slow_down" => status("slow_down"),
            "expired_token" => status("expired"),
            "access_denied" => status("denied"),
            other => return Err(format!("GitHub: {}", v["error_description"].as_str().unwrap_or(other))),
        });
    }
    let Some(access) = v["access_token"].as_str() else { return Err("Kein Token erhalten.".into()) };

    store_token(access)?;
    let user = match fetch_user().await {
        Ok(u) => u,
        Err(e) => {
            clear_token();
            return Err(e);
        }
    };
    Ok(PollResult { status: "done".into(), account: Some(account_info(user).await) })
}

#[tauri::command]
pub async fn account_session() -> Result<Option<AccountInfo>, String> {
    if load_token().is_none() {
        return Ok(None);
    }
    match fetch_user().await {
        Ok(u) => Ok(Some(account_info(u).await)),
        Err(e) if e.contains("abgelaufen") => Ok(None),
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub fn account_logout() {
    clear_token();
}

// ---- Übersicht ------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseRow {
    id: u64,
    repo: String,
    /// "stable" | "beta" | "dev"
    channel: String,
    tag: String,
    name: String,
    prerelease: bool,
    draft: bool,
    published_at: String,
    html_url: String,
    body: String,
    downloads: u64,
    assets: Vec<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRow {
    id: u64,
    title: String,
    status: String,
    conclusion: Option<String>,
    head_sha: String,
    created_at: String,
    updated_at: String,
    html_url: String,
    event: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    repo_version: String,
    head_sha: String,
    releases: Vec<ReleaseRow>,
    runs: Vec<RunRow>,
    unreleased: Vec<String>,
}

async fn read_file(path: &str, r#ref: &str) -> Result<String, String> {
    let v = get(&format!("/repos/{CODE_REPO}/contents/{path}?ref={ref}", ref = r#ref)).await?;
    let b64: String = v["content"].as_str().unwrap_or_default().chars().filter(|c| !c.is_whitespace()).collect();
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).map_err(err)?;
    String::from_utf8(bytes).map_err(err)
}

#[tauri::command]
pub async fn admin_overview() -> Result<Overview, String> {
    require_admin().await?;
    let head = get(&format!("/repos/{CODE_REPO}/git/ref/heads/main")).await?;
    let head_sha = head["object"]["sha"].as_str().unwrap_or_default().to_string();
    let conf: Value = serde_json::from_str(&read_file("src-tauri/tauri.conf.json", &head_sha).await?).map_err(err)?;
    let repo_version = conf["version"].as_str().unwrap_or_default().to_string();

    let mut releases: Vec<ReleaseRow> = vec![];
    for repo in [RELEASE_REPO, DEV_REPO] {
        let Ok(rel) = get(&format!("/repos/{repo}/releases?per_page=30")).await else {
            continue; // z. B. Dev-Repo noch nicht angelegt
        };
        for r in rel.as_array().cloned().unwrap_or_default() {
            let assets = r["assets"].as_array().cloned().unwrap_or_default();
            let prerelease = r["prerelease"].as_bool().unwrap_or(false);
            releases.push(ReleaseRow {
                id: r["id"].as_u64().unwrap_or(0),
                repo: repo.to_string(),
                channel: if repo == DEV_REPO { "dev" } else if prerelease { "beta" } else { "stable" }.into(),
                tag: r["tag_name"].as_str().unwrap_or_default().into(),
                name: r["name"].as_str().unwrap_or_default().into(),
                prerelease,
                draft: r["draft"].as_bool().unwrap_or(false),
                published_at: r["published_at"].as_str().unwrap_or_default().into(),
                html_url: r["html_url"].as_str().unwrap_or_default().into(),
                body: r["body"].as_str().unwrap_or_default().into(),
                downloads: assets.iter().map(|a| a["download_count"].as_u64().unwrap_or(0)).sum(),
                assets: assets
                    .iter()
                    .map(|a| json!({ "name": a["name"], "downloads": a["download_count"], "size": a["size"] }))
                    .collect(),
            });
        }
    }
    releases.sort_by(|a, b| b.published_at.cmp(&a.published_at));

    let runs_v = get(&format!("/repos/{CODE_REPO}/actions/runs?per_page=12")).await?;
    let runs = runs_v["workflow_runs"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|r| RunRow {
            id: r["id"].as_u64().unwrap_or(0),
            title: r["display_title"].as_str().unwrap_or_default().into(),
            status: r["status"].as_str().unwrap_or_default().into(),
            conclusion: r["conclusion"].as_str().map(|s| s.into()),
            head_sha: r["head_sha"].as_str().unwrap_or_default().into(),
            created_at: r["created_at"].as_str().unwrap_or_default().into(),
            updated_at: r["updated_at"].as_str().unwrap_or_default().into(),
            html_url: r["html_url"].as_str().unwrap_or_default().into(),
            event: r["event"].as_str().unwrap_or_default().into(),
        })
        .collect();

    // Commits seit dem letzten Release (dessen Commit steht in den Notizen)
    let mut unreleased = vec![];
    let last_commit = releases
        .iter()
        .find_map(|r| r.body.split("Commit: ").nth(1).map(|s| s.chars().take(40).collect::<String>()));
    if let Some(base) = last_commit.filter(|s| s.len() == 40) {
        if let Ok(cmp) = get(&format!("/repos/{CODE_REPO}/compare/{base}...{head_sha}")).await {
            for c in cmp["commits"].as_array().cloned().unwrap_or_default().iter().rev() {
                if let Some(msg) = c["commit"]["message"].as_str() {
                    unreleased.push(msg.lines().next().unwrap_or_default().to_string());
                }
            }
        }
    }

    Ok(Overview { repo_version, head_sha, releases, runs, unreleased })
}

// ---- Veröffentlichen ----------------------------------------------------------------

fn valid_version(v: &str) -> bool {
    let (main, pre) = match v.split_once('-') {
        Some((m, p)) => (m, Some(p)),
        None => (v, None),
    };
    let parts: Vec<&str> = main.split('.').collect();
    parts.len() == 3
        && parts.iter().all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()))
        && pre.map(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_alphanumeric() || c == '.')).unwrap_or(true)
}

fn set_json_version(text: &str, version: &str, lockfile: bool) -> Result<String, String> {
    let mut v: Value = serde_json::from_str(text).map_err(err)?;
    v["version"] = json!(version);
    if lockfile {
        if let Some(root) = v.get_mut("packages").and_then(|p| p.get_mut("")) {
            root["version"] = json!(version);
        }
    }
    Ok(serde_json::to_string_pretty(&v).map_err(err)? + "\n")
}

/// Setzt die Versionsnummer in einer der VERSION_FILES (wie scripts/version.mjs).
fn bump_file(path: &str, text: &str, version: &str) -> Result<String, String> {
    match path {
        "package.json" | "src-tauri/tauri.conf.json" => set_json_version(text, version, false),
        "package-lock.json" => set_json_version(text, version, true),
        "src-tauri/Cargo.toml" => {
            let mut done = false;
            let out: Vec<String> = text
                .lines()
                .map(|l| {
                    if !done && l.starts_with("version = \"") {
                        done = true;
                        format!("version = \"{version}\"")
                    } else {
                        l.to_string()
                    }
                })
                .collect();
            Ok(out.join("\n") + "\n")
        }
        "src-tauri/Cargo.lock" => {
            let mut out = Vec::new();
            let mut next = false;
            for l in text.lines() {
                if next && l.starts_with("version = \"") {
                    out.push(format!("version = \"{version}\""));
                    next = false;
                    continue;
                }
                next = l == "name = \"anvil-studio\"";
                out.push(l.to_string());
            }
            Ok(out.join("\n") + "\n")
        }
        _ => Err(format!("Unbekannte Datei {path}")),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishResult {
    commit_sha: String,
    commit_url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishRequest {
    version: String,
    notes: String,
}

/// Erstellt einen Commit „Version X“ auf main. Der Workflow baut daraufhin
/// den Installer und veröffentlicht das Release.
#[tauri::command]
pub async fn admin_publish(req: PublishRequest) -> Result<PublishResult, String> {
    require_admin().await?;
    let version = req.version.trim().trim_start_matches('v').to_string();
    if !valid_version(&version) {
        return Err("Ungültige Versionsnummer (Beispiel: 0.3.0 oder 0.3.0-beta.1).".into());
    }
    let head = get(&format!("/repos/{CODE_REPO}/git/ref/heads/main")).await?;
    let head_sha = head["object"]["sha"].as_str().ok_or("main nicht gefunden")?.to_string();
    let commit = get(&format!("/repos/{CODE_REPO}/git/commits/{head_sha}")).await?;
    let base_tree = commit["tree"]["sha"].as_str().ok_or("Tree nicht gefunden")?.to_string();

    let conf: Value = serde_json::from_str(&read_file("src-tauri/tauri.conf.json", &head_sha).await?).map_err(err)?;
    let current = conf["version"].as_str().unwrap_or_default();
    if current == version {
        return Err(format!("Version {version} ist bereits eingetragen."));
    }

    let mut tree = vec![];
    for path in VERSION_FILES {
        let text = read_file(path, &head_sha).await?;
        let new_text = bump_file(path, &text, &version)?;
        tree.push(json!({ "path": path, "mode": "100644", "type": "blob", "content": new_text }));
    }
    let new_tree = gh(reqwest::Method::POST, &format!("/repos/{CODE_REPO}/git/trees"), Some(json!({ "base_tree": base_tree, "tree": tree }))).await?;

    let notes = req.notes.trim();
    let message = if notes.is_empty() { format!("Version {version}") } else { format!("Version {version}\n\n{notes}") };
    let new_commit = gh(
        reqwest::Method::POST,
        &format!("/repos/{CODE_REPO}/git/commits"),
        Some(json!({ "message": message, "tree": new_tree["sha"], "parents": [head_sha] })),
    )
    .await?;
    let sha = new_commit["sha"].as_str().ok_or("Commit fehlgeschlagen")?.to_string();
    gh(
        reqwest::Method::PATCH,
        &format!("/repos/{CODE_REPO}/git/refs/heads/main"),
        Some(json!({ "sha": sha, "force": false })),
    )
    .await?;
    Ok(PublishResult { commit_url: format!("https://github.com/{CODE_REPO}/commit/{sha}"), commit_sha: sha })
}

// ---- Releases & Builds verwalten --------------------------------------------------

fn check_repo(repo: &str) -> Result<(), String> {
    if repo == RELEASE_REPO || repo == DEV_REPO {
        Ok(())
    } else {
        Err("Unbekanntes Repo".into())
    }
}

#[tauri::command]
pub async fn admin_set_prerelease(repo: String, id: u64, prerelease: bool) -> Result<(), String> {
    require_admin().await?;
    check_repo(&repo)?;
    gh(reqwest::Method::PATCH, &format!("/repos/{repo}/releases/{id}"), Some(json!({ "prerelease": prerelease }))).await?;
    Ok(())
}

#[tauri::command]
pub async fn admin_update_notes(repo: String, id: u64, body: String) -> Result<(), String> {
    require_admin().await?;
    check_repo(&repo)?;
    gh(reqwest::Method::PATCH, &format!("/repos/{repo}/releases/{id}"), Some(json!({ "body": body }))).await?;
    Ok(())
}

/// Löscht ein Release samt Tag – Nutzer bekommen es danach nicht mehr angeboten.
#[tauri::command]
pub async fn admin_delete_release(repo: String, id: u64, tag: String) -> Result<(), String> {
    require_admin().await?;
    check_repo(&repo)?;
    gh(reqwest::Method::DELETE, &format!("/repos/{repo}/releases/{id}"), None).await?;
    let _ = gh(reqwest::Method::DELETE, &format!("/repos/{repo}/git/refs/tags/{tag}"), None).await;
    Ok(())
}

// ---- Tester ---------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tester {
    login: String,
    avatar_url: String,
    /// Einladung noch nicht angenommen
    pending: bool,
    invitation_id: Option<u64>,
}

fn valid_login(login: &str) -> bool {
    !login.is_empty() && login.len() <= 39 && login.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

#[tauri::command]
pub async fn admin_testers() -> Result<Vec<Tester>, String> {
    require_admin().await?;
    let mut out = vec![];
    let collabs = get(&format!("/repos/{DEV_REPO}/collaborators?affiliation=direct&per_page=100")).await?;
    for c in collabs.as_array().cloned().unwrap_or_default() {
        let login = c["login"].as_str().unwrap_or_default().to_string();
        if login.eq_ignore_ascii_case(OWNER) {
            continue;
        }
        out.push(Tester { login, avatar_url: c["avatar_url"].as_str().unwrap_or_default().into(), pending: false, invitation_id: None });
    }
    if let Ok(inv) = get(&format!("/repos/{DEV_REPO}/invitations?per_page=100")).await {
        for i in inv.as_array().cloned().unwrap_or_default() {
            out.push(Tester {
                login: i["invitee"]["login"].as_str().unwrap_or_default().into(),
                avatar_url: i["invitee"]["avatar_url"].as_str().unwrap_or_default().into(),
                pending: true,
                invitation_id: i["id"].as_u64(),
            });
        }
    }
    Ok(out)
}

/// Lädt jemanden mit Lesezugriff auf das Dev-Repo ein (nur Installer, kein Quellcode).
#[tauri::command]
pub async fn admin_add_tester(login: String) -> Result<(), String> {
    require_admin().await?;
    let login = login.trim().trim_start_matches('@').to_string();
    if !valid_login(&login) {
        return Err("Ungültiger GitHub-Name.".into());
    }
    gh(reqwest::Method::PUT, &format!("/repos/{DEV_REPO}/collaborators/{login}"), Some(json!({ "permission": "pull" }))).await?;
    Ok(())
}

#[tauri::command]
pub async fn admin_remove_tester(login: String, invitation_id: Option<u64>) -> Result<(), String> {
    require_admin().await?;
    if let Some(id) = invitation_id {
        gh(reqwest::Method::DELETE, &format!("/repos/{DEV_REPO}/invitations/{id}"), None).await?;
    } else {
        if !valid_login(&login) {
            return Err("Ungültiger GitHub-Name.".into());
        }
        gh(reqwest::Method::DELETE, &format!("/repos/{DEV_REPO}/collaborators/{login}"), None).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn admin_rerun(run_id: u64) -> Result<(), String> {
    require_admin().await?;
    gh(reqwest::Method::POST, &format!("/repos/{CODE_REPO}/actions/runs/{run_id}/rerun"), None).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_and_bumps() {
        assert!(valid_version("0.3.0"));
        assert!(valid_version("1.0.0-beta.1"));
        assert!(!valid_version("0.3"));
        assert!(!valid_version("0.3.0-"));
        let toml = "[package]\nname = \"anvil-studio\"\nversion = \"0.2.3\"\n\n[dependencies]\nserde = { version = \"1\" }\n";
        let out = bump_file("src-tauri/Cargo.toml", toml, "0.3.0").unwrap();
        assert!(out.contains("version = \"0.3.0\"") && out.contains("serde = { version = \"1\" }"));
        let lock = "[[package]]\nname = \"anvil-studio\"\nversion = \"0.2.3\"\n\n[[package]]\nname = \"other\"\nversion = \"0.2.3\"\n";
        let out = bump_file("src-tauri/Cargo.lock", lock, "0.3.0").unwrap();
        assert_eq!(out.matches("0.3.0").count(), 1);
        let pkg = "{\n  \"name\": \"anvil-studio\",\n  \"private\": true,\n  \"version\": \"0.2.3\"\n}\n";
        let out = bump_file("package.json", pkg, "0.3.0").unwrap();
        assert!(out.starts_with("{\n  \"name\""), "Reihenfolge der Schlüssel bleibt erhalten");
        assert!(out.contains("\"version\": \"0.3.0\""));
    }
}
