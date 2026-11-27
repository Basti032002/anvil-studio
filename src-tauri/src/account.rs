//! Anvil-Studio-Konto (E-Mail + Passwort) beim Workshop-Server.
//! Ohne Konto kommt man nicht ins Studio. Wer schon angemeldet war, kommt auch offline rein.

use crate::util::{err, http_client, net_err};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

const KEYRING_SERVICE: &str = "AnvilStudio-Account";
const KEYRING_USER: &str = "session";

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub email: String,
    #[serde(default)]
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct Stored {
    token: String,
    account: Account,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountStatus {
    account: Option<Account>,
    /// Server nicht erreichbar – gespeicherte Anmeldung wird benutzt
    offline: bool,
}

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(err)
}
fn load() -> Option<Stored> {
    let raw = entry().ok()?.get_password().ok()?;
    serde_json::from_str(&raw).ok()
}
fn store(s: &Stored) -> Result<(), String> {
    entry()?.set_password(&serde_json::to_string(s).map_err(err)?).map_err(err)
}
fn clear() {
    if let Ok(e) = entry() {
        let _ = e.delete_credential();
    }
}

/// Sitzung für andere Anfragen an den Server (z. B. Problem melden)
pub fn session_token() -> Option<String> {
    load().map(|s| s.token)
}

fn base(app: &AppHandle) -> String {
    crate::settings::load(app).workshop_url
}

async fn post(app: &AppHandle, path: &str, body: Value, token: Option<&str>) -> Result<(u16, Value), String> {
    let mut req = http_client()?.post(format!("{}{path}", base(app))).json(&body).timeout(std::time::Duration::from_secs(20));
    if let Some(t) = token {
        req = req.bearer_auth(t);
    }
    let r = req.send().await.map_err(|e| format!("Der Anmelde-Server ist nicht erreichbar: {}", net_err(&e)))?;
    let status = r.status().as_u16();
    let v: Value = serde_json::from_str(&r.text().await.map_err(|e| net_err(&e))?).unwrap_or(Value::Null);
    Ok((status, v))
}

fn error_of(status: u16, v: &Value) -> String {
    v["error"].as_str().map(String::from).unwrap_or(format!("Der Anmelde-Server antwortet mit HTTP {status}."))
}

/// Erfolgreiche Anmeldung speichern
fn keep(v: &Value) -> Result<Account, String> {
    let token = v["token"].as_str().ok_or("Keine Sitzung erhalten.")?.to_string();
    let account: Account = serde_json::from_value(v["account"].clone()).map_err(err)?;
    store(&Stored { token, account: account.clone() })?;
    Ok(account)
}

/// Wer ist angemeldet? Prüft online; ohne Verbindung gilt die gespeicherte Anmeldung.
#[tauri::command]
pub async fn studio_account_status(app: AppHandle) -> Result<AccountStatus, String> {
    let Some(s) = load() else { return Ok(AccountStatus { account: None, offline: false }) };
    let resp = match http_client() {
        Ok(c) => c.get(format!("{}/api/account/me", base(&app))).bearer_auth(&s.token).timeout(std::time::Duration::from_secs(8)).send().await,
        Err(_) => return Ok(AccountStatus { account: Some(s.account), offline: true }),
    };
    match resp {
        Ok(r) if r.status().as_u16() == 401 => {
            clear();
            Ok(AccountStatus { account: None, offline: false })
        }
        Ok(r) if r.status().is_success() => {
            let fresh: Option<Account> = r.json().await.ok();
            let account = fresh.unwrap_or(s.account);
            let _ = store(&Stored { token: s.token, account: account.clone() });
            Ok(AccountStatus { account: Some(account), offline: false })
        }
        // Server antwortet nicht oder mit Fehler → offline weiterarbeiten
        _ => Ok(AccountStatus { account: Some(s.account), offline: true }),
    }
}

#[tauri::command]
pub async fn studio_account_register(app: AppHandle, email: String, password: String, name: String, lang: String) -> Result<Value, String> {
    let (st, v) = post(&app, "/api/account/register", json!({ "email": email, "password": password, "name": name, "lang": lang }), None).await?;
    if st >= 400 {
        return Err(error_of(st, &v));
    }
    Ok(v)
}

#[tauri::command]
pub async fn studio_account_resend(app: AppHandle, email: String, lang: String) -> Result<(), String> {
    let (st, v) = post(&app, "/api/account/resend", json!({ "email": email, "lang": lang }), None).await?;
    if st >= 400 {
        return Err(error_of(st, &v));
    }
    Ok(())
}

#[tauri::command]
pub async fn studio_account_verify(app: AppHandle, email: String, code: String) -> Result<Account, String> {
    let (st, v) = post(&app, "/api/account/verify", json!({ "email": email, "code": code }), None).await?;
    if st >= 400 {
        return Err(error_of(st, &v));
    }
    keep(&v)
}

/// Anmelden. Ist die E-Mail noch nicht bestätigt: { needVerify: true } (ein neuer Code ist unterwegs).
#[tauri::command]
pub async fn studio_account_login(app: AppHandle, email: String, password: String, lang: String) -> Result<Value, String> {
    let (st, v) = post(&app, "/api/account/login", json!({ "email": email, "password": password, "lang": lang }), None).await?;
    if st == 403 && v["needVerify"].as_bool() == Some(true) {
        return Ok(json!({ "needVerify": true, "message": error_of(st, &v) }));
    }
    if st >= 400 {
        return Err(error_of(st, &v));
    }
    Ok(json!({ "account": keep(&v)? }))
}

#[tauri::command]
pub async fn studio_account_forgot(app: AppHandle, email: String, lang: String) -> Result<(), String> {
    let (st, v) = post(&app, "/api/account/forgot", json!({ "email": email, "lang": lang }), None).await?;
    if st >= 400 {
        return Err(error_of(st, &v));
    }
    Ok(())
}

#[tauri::command]
pub async fn studio_account_reset(app: AppHandle, email: String, code: String, password: String) -> Result<Account, String> {
    let (st, v) = post(&app, "/api/account/reset", json!({ "email": email, "code": code, "password": password }), None).await?;
    if st >= 400 {
        return Err(error_of(st, &v));
    }
    keep(&v)
}

#[tauri::command]
pub async fn studio_account_logout(app: AppHandle) -> Result<(), String> {
    if let Some(s) = load() {
        let _ = post(&app, "/api/account/logout", json!({}), Some(&s.token)).await;
    }
    clear();
    Ok(())
}

#[tauri::command]
pub async fn studio_account_delete(app: AppHandle, password: String) -> Result<(), String> {
    let s = load().ok_or("Nicht angemeldet.")?;
    let (st, v) = post(&app, "/api/account/delete", json!({ "password": password }), Some(&s.token)).await?;
    if st >= 400 {
        return Err(error_of(st, &v));
    }
    clear();
    Ok(())
}
