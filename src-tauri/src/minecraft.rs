//! Anmeldung mit dem Minecraft-Konto (Microsoft → Xbox Live → XSTS → Minecraft).
//! Solange Mojang die Azure-App noch nicht freigeschaltet hat, gibt es eine
//! Übergangs-Anmeldung über das Xbox-Konto (Gamertag) – damit geht der Workshop,
//! nur Spielen braucht das echte Minecraft-Token.
//! Der Refresh-Token liegt in der Windows-Anmeldeinformationsverwaltung; das
//! Minecraft-Token nur im Speicher.

use crate::util::{err, http_client, net_err};
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::Mutex;

/// Azure-App „Anvil Studio“ (öffentliche Client-ID, nicht geheim).
const DEFAULT_CLIENT_ID: &str = "f488fb04-ce2c-41c1-88f6-b548849f7e24";
/// Optional beim Build über die Umgebung überschreibbar.
const BUILD_CLIENT_ID: Option<&str> = option_env!("ANVIL_MS_CLIENT_ID");
const KEYRING_SERVICE: &str = "AnvilStudio";
const KEYRING_USER: &str = "minecraft-refresh";
const SCOPE: &str = "XboxLive.signin offline_access";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct McProfile {
    pub uuid: String,
    pub name: String,
    pub skin_url: Option<String>,
    /// "minecraft" oder "xbox" (Übergangs-Anmeldung)
    pub kind: String,
}

#[derive(Clone)]
struct Session {
    mc_token: Option<String>,
    /// (uhs, XSTS-Token für xboxlive.com) – zum Nachweis des Xbox-Kontos beim Workshop
    xbox: Option<(String, String)>,
    expires_at: u64,
    profile: McProfile,
}

/// Anmeldedaten für den Workshop
pub struct Credentials {
    pub mc_token: Option<String>,
    pub xbox: Option<(String, String)>,
}

const NOT_APPROVED: &str = "Anvil Studio ist bei Microsoft noch nicht für die Minecraft-Anmeldung freigeschaltet. Das ist beantragt – bitte etwas Geduld.";

static SESSION: Mutex<Option<Session>> = Mutex::new(None);

fn client_id() -> Option<String> {
    std::env::var("ANVIL_MS_CLIENT_ID").ok().filter(|s| !s.is_empty()).or(BUILD_CLIENT_ID.filter(|s| !s.is_empty()).map(|s| s.to_string()))
        .or(Some(DEFAULT_CLIENT_ID.to_string()))
}

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(err)
}
fn load_refresh() -> Option<String> {
    entry().ok()?.get_password().ok().filter(|t| !t.is_empty())
}
fn store_refresh(t: &str) {
    if let Ok(e) = entry() {
        let _ = e.set_password(t);
    }
}
fn clear_refresh() {
    if let Ok(e) = entry() {
        let _ = e.delete_credential();
    }
}

async fn post_form(url: &str, form: &[(&str, &str)]) -> Result<Value, String> {
    let r = http_client()?.post(url).form(form).send().await.map_err(|e| net_err(&e))?;
    serde_json::from_str(&r.text().await.map_err(|e| net_err(&e))?).map_err(err)
}

async fn post_json(url: &str, body: &Value) -> Result<(u16, Value), String> {
    let r = http_client()?
        .post(url)
        .header("Accept", "application/json")
        .json(body)
        .send()
        .await
        .map_err(|e| net_err(&e))?;
    let status = r.status().as_u16();
    let text = r.text().await.map_err(|e| net_err(&e))?;
    Ok((status, serde_json::from_str(&text).unwrap_or(Value::Null)))
}

/// Microsoft-Token → Minecraft-Token + Profil
async fn minecraft_from_ms(ms_token: &str) -> Result<Session, String> {
    let (s, xbl) = post_json(
        "https://user.auth.xboxlive.com/user/authenticate",
        &json!({
            "Properties": { "AuthMethod": "RPS", "SiteName": "user.auth.xboxlive.com", "RpsTicket": format!("d={ms_token}") },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        }),
    )
    .await?;
    let xbl_token = xbl["Token"].as_str().ok_or(format!("Xbox-Live-Anmeldung fehlgeschlagen (HTTP {s})."))?;
    let uhs = xbl["DisplayClaims"]["xui"][0]["uhs"].as_str().unwrap_or_default().to_string();

    let xsts_for = |rp: &'static str| {
        let body = json!({
            "Properties": { "SandboxId": "RETAIL", "UserTokens": [xbl_token] },
            "RelyingParty": rp,
            "TokenType": "JWT"
        });
        async move { post_json("https://xsts.auth.xboxlive.com/xsts/authorize", &body).await }
    };
    // Xbox-Identität (Gamertag + XUID) – für die Übergangs-Anmeldung im Workshop
    let xbox_id = match xsts_for("http://xboxlive.com").await {
        Ok((_, v)) => {
            let c = &v["DisplayClaims"]["xui"][0];
            match (v["Token"].as_str(), c["uhs"].as_str(), c["xid"].as_str(), c["gtg"].as_str()) {
                (Some(t), Some(u), Some(x), Some(g)) => Some((u.to_string(), t.to_string(), x.to_string(), g.to_string())),
                _ => None,
            }
        }
        Err(_) => None,
    };
    let (s, xsts) = xsts_for("rp://api.minecraftservices.com/").await?;
    if let Some(code) = xsts["XErr"].as_u64() {
        return Err(match code {
            2148916233 => "Zu diesem Microsoft-Konto gibt es noch kein Xbox-Profil. Melde dich einmal auf minecraft.net an und versuche es erneut.".into(),
            2148916235 => "Xbox Live ist in deinem Land nicht verfügbar.".into(),
            2148916236 | 2148916237 => "Dieses Konto muss erst auf xbox.com volljährig bestätigt werden.".into(),
            2148916238 => "Kinderkonten müssen von einem Erwachsenen zu einer Familie hinzugefügt werden.".into(),
            _ => format!("Xbox-Fehler {code}."),
        });
    }
    let xsts_token = xsts["Token"].as_str().ok_or(format!("XSTS-Anmeldung fehlgeschlagen (HTTP {s})."))?;

    let (s, mc) = post_json(
        "https://api.minecraftservices.com/authentication/login_with_xbox",
        &json!({ "identityToken": format!("XBL3.0 x={uhs};{xsts_token}") }),
    )
    .await?;
    let Some(token) = mc["access_token"].as_str() else {
        let msg = mc["errorMessage"].as_str().or(mc["error"].as_str()).unwrap_or("");
        if s == 403 || msg.to_lowercase().contains("invalid app registration") {
            // Übergang: mit dem Xbox-Konto weiter (Workshop ja, Spielen nein)
            if let Some((uhs, tok, xid, gtg)) = xbox_id {
                return Ok(Session {
                    mc_token: None,
                    xbox: Some((uhs, tok)),
                    expires_at: crate::util::now() + 4 * 3600,
                    profile: McProfile { uuid: format!("xbox-{xid}"), name: gtg, skin_url: None, kind: "xbox".into() },
                });
            }
            return Err(NOT_APPROVED.into());
        }
        return Err(format!("Minecraft-Anmeldung fehlgeschlagen (HTTP {s}) {msg}"));
    };
    let expires = mc["expires_in"].as_u64().unwrap_or(86400);

    let r = http_client()?
        .get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| net_err(&e))?;
    if r.status().as_u16() == 404 {
        return Err("Dieses Konto besitzt kein Minecraft: Java Edition.".into());
    }
    let p: Value = r.json().await.map_err(|e| net_err(&e))?;
    let profile = McProfile {
        uuid: p["id"].as_str().unwrap_or_default().to_string(),
        name: p["name"].as_str().unwrap_or_default().to_string(),
        skin_url: p["skins"].as_array().and_then(|s| s.iter().find(|x| x["state"] == "ACTIVE")).and_then(|x| x["url"].as_str()).map(|s| s.to_string()),
        kind: "minecraft".into(),
    };
    Ok(Session {
        mc_token: Some(token.to_string()),
        xbox: xbox_id.map(|(u, t, _, _)| (u, t)),
        expires_at: crate::util::now() + expires.saturating_sub(300),
        profile,
    })
}

/// Gültiges Minecraft-Token zum Spielen (erneuert es bei Bedarf)
pub async fn token() -> Result<(String, McProfile), String> {
    let s = current().await?;
    match s.mc_token {
        Some(t) => Ok((t, s.profile)),
        None => Err("Spielen geht erst, wenn Mojang die Minecraft-Anmeldung für Anvil Studio freigeschaltet hat. Im Workshop bist du so lange mit deinem Xbox-Konto angemeldet.".into()),
    }
}

/// Anmeldedaten für den Workshop (Minecraft oder übergangsweise Xbox)
pub async fn credentials() -> Result<Credentials, String> {
    let s = current().await?;
    Ok(Credentials { mc_token: s.mc_token, xbox: s.xbox })
}

async fn current() -> Result<Session, String> {
    if let Some(s) = SESSION.lock().unwrap().clone() {
        if s.expires_at > crate::util::now() {
            return Ok(s);
        }
    }
    let refresh = load_refresh().ok_or("Bitte melde dich mit deinem Minecraft-Konto an.")?;
    let id = client_id().ok_or("Diese Version wurde ohne Microsoft-Client-ID gebaut.")?;
    let v = post_form(
        "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
        &[("client_id", &id), ("grant_type", "refresh_token"), ("refresh_token", &refresh), ("scope", SCOPE)],
    )
    .await?;
    let Some(ms) = v["access_token"].as_str() else {
        clear_refresh();
        return Err("Die Minecraft-Anmeldung ist abgelaufen. Bitte melde dich neu an.".into());
    };
    if let Some(r) = v["refresh_token"].as_str() {
        store_refresh(r);
    }
    let s = minecraft_from_ms(ms).await?;
    *SESSION.lock().unwrap() = Some(s.clone());
    Ok(s)
}

#[tauri::command]
pub fn mc_login_available() -> bool {
    client_id().is_some()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McDeviceCode {
    device_code: String,
    user_code: String,
    verification_uri: String,
    interval: u64,
    expires_in: u64,
}

#[tauri::command]
pub async fn mc_start_login() -> Result<McDeviceCode, String> {
    let id = client_id().ok_or("Diese Version wurde ohne Microsoft-Client-ID gebaut.")?;
    let v = post_form("https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode", &[("client_id", &id), ("scope", SCOPE)]).await?;
    if let Some(e) = v["error_description"].as_str() {
        return Err(format!("Microsoft: {}", e.lines().next().unwrap_or(e)));
    }
    Ok(McDeviceCode {
        device_code: v["device_code"].as_str().unwrap_or_default().into(),
        user_code: v["user_code"].as_str().unwrap_or_default().into(),
        verification_uri: v["verification_uri"].as_str().unwrap_or("https://www.microsoft.com/link").into(),
        interval: v["interval"].as_u64().unwrap_or(5),
        expires_in: v["expires_in"].as_u64().unwrap_or(900),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McPoll {
    /// pending | slow_down | done | denied | expired
    status: String,
    profile: Option<McProfile>,
}

#[tauri::command]
pub async fn mc_poll_login(device_code: String) -> Result<McPoll, String> {
    let id = client_id().ok_or("Keine Client-ID")?;
    let v = post_form(
        "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
        &[("client_id", &id), ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"), ("device_code", &device_code)],
    )
    .await?;
    let st = |s: &str| Ok(McPoll { status: s.into(), profile: None });
    if let Some(e) = v["error"].as_str() {
        return match e {
            "authorization_pending" => st("pending"),
            "slow_down" => st("slow_down"),
            "expired_token" | "code_expired" => st("expired"),
            "authorization_declined" | "access_denied" => st("denied"),
            _ => Err(format!("Microsoft: {}", v["error_description"].as_str().unwrap_or(e).lines().next().unwrap_or(e))),
        };
    }
    let ms = v["access_token"].as_str().ok_or("Kein Token erhalten.")?;
    if let Some(r) = v["refresh_token"].as_str() {
        store_refresh(r);
    }
    let s = minecraft_from_ms(ms).await?;
    *SESSION.lock().unwrap() = Some(s.clone());
    crate::workshop::reset_session();
    Ok(McPoll { status: "done".into(), profile: Some(s.profile) })
}

/// Angemeldetes Konto (None = nicht angemeldet)
#[tauri::command]
pub async fn mc_account() -> Result<Option<McProfile>, String> {
    if load_refresh().is_none() && SESSION.lock().unwrap().is_none() {
        return Ok(None);
    }
    match current().await {
        Ok(s) => Ok(Some(s.profile)),
        Err(e) if e.contains("anmelden") || e.contains("abgelaufen") => Ok(None),
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub fn mc_logout() {
    clear_refresh();
    *SESSION.lock().unwrap() = None;
    crate::workshop::reset_session();
}
