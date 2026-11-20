//! Spielen aus dem Workshop: lädt Minecraft, installiert NeoForge, legt die Mod
//! in einen eigenen Spielordner und startet das Spiel mit dem Minecraft-Konto.
//! Alles liegt in <App-Daten>/play – das normale Minecraft bleibt unberührt.

use crate::util::{err, http_client, net_err};
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

static RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress {
    step: String,
    done: u64,
    total: u64,
}

/// Fortschritt melden (Schritt, erledigt, gesamt)
pub type Prog = Arc<dyn Fn(&str, u64, u64) + Send + Sync>;

fn app_prog(app: &AppHandle) -> Prog {
    let app = app.clone();
    Arc::new(move |step: &str, done: u64, total: u64| {
        let _ = app.emit("play-progress", Progress { step: step.into(), done, total });
    })
}

fn root(app: &AppHandle) -> Result<PathBuf, String> {
    let d = crate::util::data_dir(app)?.join("play");
    std::fs::create_dir_all(&d).map_err(err)?;
    Ok(d)
}

async fn get_json(url: &str) -> Result<Value, String> {
    let r = http_client()?.get(url).send().await.map_err(|e| net_err(&e))?;
    if !r.status().is_success() {
        return Err(format!("{url}: HTTP {}", r.status()));
    }
    r.json().await.map_err(|e| net_err(&e))
}

/// Datei laden, wenn sie fehlt oder die Größe nicht passt
async fn fetch(client: &reqwest::Client, url: &str, target: &Path, size: Option<u64>) -> Result<(), String> {
    if let (Ok(m), Some(s)) = (std::fs::metadata(target), size) {
        if m.len() == s {
            return Ok(());
        }
    } else if size.is_none() && target.exists() {
        return Ok(());
    }
    if let Some(p) = target.parent() {
        std::fs::create_dir_all(p).map_err(err)?;
    }
    let mut last = String::new();
    for _ in 0..3 {
        match client.get(url).send().await {
            Ok(r) if r.status().is_success() => match r.bytes().await {
                Ok(b) => {
                    let tmp = target.with_extension("part");
                    std::fs::write(&tmp, &b).map_err(err)?;
                    std::fs::rename(&tmp, target).map_err(err)?;
                    return Ok(());
                }
                Err(e) => last = net_err(&e),
            },
            Ok(r) => last = format!("HTTP {}", r.status()),
            Err(e) => last = net_err(&e),
        }
    }
    Err(format!("Download fehlgeschlagen ({url}): {last}"))
}

/// Viele Dateien parallel laden
async fn fetch_all(prog: &Prog, step: &str, jobs: Vec<(String, PathBuf, Option<u64>)>) -> Result<(), String> {
    let client = http_client()?;
    let total = jobs.len() as u64;
    let done = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let sem = Arc::new(tokio::sync::Semaphore::new(16));
    let mut set = tokio::task::JoinSet::new();
    for (url, path, size) in jobs {
        let (client, sem, done, prog, step) = (client.clone(), sem.clone(), done.clone(), prog.clone(), step.to_string());
        set.spawn(async move {
            let _permit = sem.acquire().await.map_err(err)?;
            fetch(&client, &url, &path, size).await?;
            let n = done.fetch_add(1, Ordering::SeqCst) + 1;
            if n % 25 == 0 || n == total {
                prog(&step, n, total);
            }
            Ok::<(), String>(())
        });
    }
    while let Some(r) = set.join_next().await {
        r.map_err(err)??;
    }
    Ok(())
}

fn os_name() -> &'static str {
    if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

/// Mojang-Regeln (os/features) auswerten; Features sind bei uns alle aus
fn rules_ok(rules: Option<&Value>) -> bool {
    let Some(rules) = rules.and_then(|r| r.as_array()) else { return true };
    let mut allowed = false;
    for r in rules {
        let mut matches = true;
        if let Some(os) = r.get("os") {
            if let Some(n) = os["name"].as_str() {
                matches &= n == os_name();
            }
            if let Some(a) = os["arch"].as_str() {
                matches &= (a == "x86") == cfg!(target_arch = "x86");
            }
        }
        if r.get("features").is_some() {
            matches = false;
        }
        if matches {
            allowed = r["action"] == "allow";
        }
    }
    allowed
}

/// Maven-Koordinate → Pfad (group:artifact:version[:classifier][@ext])
fn maven_path(name: &str) -> Option<String> {
    let (coords, ext) = name.split_once('@').map(|(c, e)| (c, e)).unwrap_or((name, "jar"));
    let parts: Vec<&str> = coords.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let (g, a, v) = (parts[0].replace('.', "/"), parts[1], parts[2]);
    let file = match parts.get(3) {
        Some(c) => format!("{a}-{v}-{c}.{ext}"),
        None => format!("{a}-{v}.{ext}"),
    };
    Some(format!("{g}/{a}/{v}/{file}"))
}

/// Vanilla-Minecraft vollständig laden (Version-JSON, Client, Bibliotheken, Assets)
pub async fn install_vanilla(prog: &Prog, base: &Path, version: &str) -> Result<Value, String> {
    let vdir = base.join("versions").join(version);
    let vjson = vdir.join(format!("{version}.json"));
    let v: Value = match std::fs::read_to_string(&vjson).ok().and_then(|s| serde_json::from_str(&s).ok()) {
        Some(v) => v,
        None => {
            prog("Minecraft-Version wird gesucht", 0, 0);
            let manifest = get_json("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json").await?;
            let url = manifest["versions"]
                .as_array()
                .and_then(|a| a.iter().find(|x| x["id"] == version))
                .and_then(|x| x["url"].as_str())
                .ok_or(format!("Minecraft {version} wurde nicht gefunden."))?
                .to_string();
            let v = get_json(&url).await?;
            std::fs::create_dir_all(&vdir).map_err(err)?;
            std::fs::write(&vjson, v.to_string()).map_err(err)?;
            v
        }
    };
    let mut jobs = vec![];
    let client = &v["downloads"]["client"];
    jobs.push((client["url"].as_str().unwrap_or_default().to_string(), vdir.join(format!("{version}.jar")), client["size"].as_u64()));
    for lib in v["libraries"].as_array().into_iter().flatten() {
        if !rules_ok(lib.get("rules")) {
            continue;
        }
        let a = &lib["downloads"]["artifact"];
        if let (Some(url), Some(path)) = (a["url"].as_str(), a["path"].as_str()) {
            jobs.push((url.to_string(), base.join("libraries").join(path), a["size"].as_u64()));
        }
    }
    fetch_all(prog, "Minecraft wird geladen", jobs).await?;

    // Assets
    let idx = &v["assetIndex"];
    let id = idx["id"].as_str().unwrap_or("legacy");
    let idx_path = base.join("assets/indexes").join(format!("{id}.json"));
    fetch(&http_client()?, idx["url"].as_str().unwrap_or_default(), &idx_path, idx["size"].as_u64()).await?;
    let index: Value = serde_json::from_str(&std::fs::read_to_string(&idx_path).map_err(err)?).map_err(err)?;
    let mut jobs = vec![];
    for (_, o) in index["objects"].as_object().into_iter().flatten() {
        let Some(hash) = o["hash"].as_str() else { continue };
        let sub = &hash[..2];
        jobs.push((
            format!("https://resources.download.minecraft.net/{sub}/{hash}"),
            base.join("assets/objects").join(sub).join(hash),
            o["size"].as_u64(),
        ));
    }
    fetch_all(prog, "Spieldateien werden geladen", jobs).await?;
    Ok(v)
}

/// Neueste NeoForge-Version zu einer Minecraft-Version (1.21.1 → 21.1.x)
pub async fn latest_neoforge(mc: &str) -> Result<String, String> {
    let parts: Vec<&str> = mc.split('.').collect();
    let prefix = format!("{}.{}.", parts.get(1).unwrap_or(&"21"), parts.get(2).unwrap_or(&"0"));
    let xml = http_client()?
        .get("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml")
        .send()
        .await
        .map_err(|e| net_err(&e))?
        .text()
        .await
        .map_err(|e| net_err(&e))?;
    let mut best: Option<(Vec<u32>, String)> = None;
    for chunk in xml.split("<version>").skip(1) {
        let ver = chunk.split("</version>").next().unwrap_or("").trim();
        if !ver.starts_with(&prefix) || ver.contains('-') {
            continue;
        }
        let key: Vec<u32> = ver.split('.').filter_map(|x| x.parse().ok()).collect();
        if best.as_ref().map(|(k, _)| key > *k).unwrap_or(true) {
            best = Some((key, ver.to_string()));
        }
    }
    best.map(|(_, v)| v).ok_or(format!("Keine NeoForge-Version für Minecraft {mc} gefunden."))
}

/// NeoForge mit dem offiziellen Installer in den Spielordner installieren
pub async fn install_neoforge(prog: &Prog, base: &Path, neo: &str, java: &Path) -> Result<Value, String> {
    let id = format!("neoforge-{neo}");
    let vjson = base.join("versions").join(&id).join(format!("{id}.json"));
    if let Some(v) = std::fs::read_to_string(&vjson).ok().and_then(|s| serde_json::from_str::<Value>(&s).ok()) {
        return Ok(v);
    }
    prog("NeoForge wird installiert", 0, 0);
    let installer = base.join("installers").join(format!("neoforge-{neo}-installer.jar"));
    fetch(
        &http_client()?,
        &format!("https://maven.neoforged.net/releases/net/neoforged/neoforge/{neo}/neoforge-{neo}-installer.jar"),
        &installer,
        None,
    )
    .await?;
    let profiles = base.join("launcher_profiles.json");
    if !profiles.exists() {
        std::fs::write(&profiles, r#"{"profiles":{}}"#).map_err(err)?;
    }
    let mut cmd = std::process::Command::new(java.join("bin").join(if cfg!(windows) { "java.exe" } else { "java" }));
    cmd.arg("-jar").arg(&installer).arg("--install-client").arg(base).current_dir(base);
    let out = tauri::async_runtime::spawn_blocking(move || crate::util::hide_window_std(&mut cmd).output()).await.map_err(err)?.map_err(err)?;
    if !out.status.success() || !vjson.exists() {
        let log = String::from_utf8_lossy(&out.stdout).lines().rev().take(8).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
        return Err(format!("NeoForge-Installation fehlgeschlagen.\n{log}"));
    }
    serde_json::from_str(&std::fs::read_to_string(&vjson).map_err(err)?).map_err(err)
}

/// Argumente aus "arguments.jvm"/"arguments.game" mit Regeln auflösen
fn collect_args(list: Option<&Value>) -> Vec<String> {
    let mut out = vec![];
    for a in list.and_then(|l| l.as_array()).into_iter().flatten() {
        if let Some(s) = a.as_str() {
            out.push(s.to_string());
        } else if rules_ok(a.get("rules")) {
            match &a["value"] {
                Value::String(s) => out.push(s.clone()),
                Value::Array(v) => out.extend(v.iter().filter_map(|x| x.as_str().map(|s| s.to_string()))),
                _ => {}
            }
        }
    }
    out
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayRequest {
    item_id: String,
    title: String,
    mc_version: String,
    /// vom Frontend mitgeschickt; maßgeblich ist die aktuelle Fassung auf dem Server
    #[allow(dead_code)]
    mod_version: String,
}

#[tauri::command]
pub async fn play_mod(app: AppHandle, req: PlayRequest) -> Result<(), String> {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err("Es wird bereits ein Spiel vorbereitet oder gespielt.".into());
    }
    let res = prepare_and_launch(&app, &req).await;
    if res.is_err() {
        RUNNING.store(false, Ordering::SeqCst);
    }
    res
}

async fn prepare_and_launch(app: &AppHandle, req: &PlayRequest) -> Result<(), String> {
    let java = crate::java::java_home(app).ok_or("Java 21 fehlt noch – installiere es über die Statusleiste unten.")?;
    let prog = app_prog(app);
    prog("Minecraft-Konto wird geprüft", 0, 0);
    let (token, profile) = crate::minecraft::token().await?;
    let base = root(app)?;
    let mc = req.mc_version.trim();
    if mc.is_empty() {
        return Err("Für diese Mod ist keine Minecraft-Version angegeben.".into());
    }
    let vanilla = install_vanilla(&prog, &base, mc).await?;
    let neo = latest_neoforge(mc).await?;
    let forge = install_neoforge(&prog, &base, &neo, &java).await?;

    // Spielordner mit genau dieser Mod
    prog("Mod wird geladen", 0, 0);
    // Immer die neueste Fassung (samt Abhängigkeiten) – bereits geladene bleiben im Zwischenspeicher
    let item = crate::workshop::ws_item(app.clone(), req.item_id.clone()).await?;
    let game = base.join("instances").join(&req.item_id);
    let mods = game.join("mods");
    let _ = std::fs::remove_dir_all(&mods);
    std::fs::create_dir_all(&mods).map_err(err)?;
    let mut queue = vec![item];
    let mut done = std::collections::HashSet::new();
    while let Some(it) = queue.pop() {
        let id = it["id"].as_str().unwrap_or_default().to_string();
        if id.is_empty() || !done.insert(id.clone()) || done.len() > 20 {
            continue;
        }
        if id != req.item_id {
            prog(&format!("Abhängigkeit wird geladen: {}", it["title"].as_str().unwrap_or(&id)), 0, 0);
        }
        let jar = crate::workshop::fetch_mod(app, &id, &crate::workshop::mod_key(&it)).await?;
        std::fs::copy(&jar, mods.join(format!("{id}.jar"))).map_err(err)?;
        for d in it["dependencies"].as_array().into_iter().flatten() {
            let did = d["id"].as_str().unwrap_or_default().to_string();
            if done.contains(&did) {
                continue;
            }
            if !d["available"].as_bool().unwrap_or(false) {
                return Err(format!("Die benötigte Mod „{}“ ist im Workshop gerade nicht verfügbar.", d["title"].as_str().unwrap_or(&did)));
            }
            queue.push(crate::workshop::ws_item(app.clone(), did).await?);
        }
    }

    let mem = crate::settings::load(app).play_memory_mb;
    let args = launch_args(&base, mc, &vanilla, &forge, &game, &profile.name, &profile.uuid, &token, mem)?;
    prog("Minecraft startet", 1, 1);
    let log = std::fs::File::create(game.join("anvil-launch.log")).map_err(err)?;
    let mut cmd = std::process::Command::new(java.join("bin").join(if cfg!(windows) { "javaw.exe" } else { "java" }));
    cmd.args(&args).current_dir(&game).stdout(log.try_clone().map_err(err)?).stderr(log);
    let mut child = cmd.spawn().map_err(|e| format!("Minecraft konnte nicht gestartet werden: {e}"))?;
    let app2 = app.clone();
    let title = req.title.clone();
    std::thread::spawn(move || {
        let status = child.wait();
        RUNNING.store(false, Ordering::SeqCst);
        let ok = status.map(|s| s.success()).unwrap_or(false);
        let _ = app2.emit("play-exit", serde_json::json!({ "title": title, "success": ok }));
    });
    Ok(())
}


/// Startargumente (JVM + Hauptklasse + Spiel) für eine installierte NeoForge-Version
#[allow(clippy::too_many_arguments)]
pub fn launch_args(base: &Path, mc: &str, vanilla: &Value, forge: &Value, game: &Path, name: &str, uuid: &str, token: &str, mem: u32) -> Result<Vec<String>, String> {
    // Klassenpfad: NeoForge-Bibliotheken zuerst, dann Vanilla
    let sep = if cfg!(windows) { ";" } else { ":" };
    let mut cp: Vec<String> = vec![];
    let mut seen = std::collections::HashSet::new();
    for lib in forge["libraries"].as_array().into_iter().flatten().chain(vanilla["libraries"].as_array().into_iter().flatten()) {
        if !rules_ok(lib.get("rules")) {
            continue;
        }
        let path = lib["downloads"]["artifact"]["path"].as_str().map(|s| s.to_string()).or_else(|| lib["name"].as_str().and_then(maven_path));
        let Some(path) = path else { continue };
        // gleiche Bibliothek nur einmal (group:artifact[:classifier])
        let name = lib["name"].as_str().unwrap_or(&path);
        let parts: Vec<&str> = name.split(':').collect();
        let key = format!("{}:{}:{}", parts.first().unwrap_or(&""), parts.get(1).unwrap_or(&""), parts.get(3).unwrap_or(&""));
        if !seen.insert(key) {
            continue;
        }
        let full = base.join("libraries").join(&path);
        if full.exists() {
            cp.push(full.to_string_lossy().to_string());
        }
    }
    // Wie der offizielle Launcher: Spiel-Jar unter dem Namen der NeoForge-Version
    // (NeoForge ignoriert genau diese Datei beim Modul-Scan, sonst Doppelpaket-Fehler)
    let forge_id = forge["id"].as_str().unwrap_or("neoforge");
    let named = base.join("versions").join(forge_id).join(format!("{forge_id}.jar"));
    if !named.exists() {
        std::fs::copy(base.join("versions").join(mc).join(format!("{mc}.jar")), &named).map_err(err)?;
    }
    cp.push(named.to_string_lossy().to_string());

    let natives = base.join("natives").join(mc);
    std::fs::create_dir_all(&natives).map_err(err)?;
    let version_id = forge["id"].as_str().unwrap_or("neoforge").to_string();
    let vars: Vec<(&str, String)> = vec![
        ("${natives_directory}", natives.to_string_lossy().into()),
        ("${launcher_name}", "AnvilStudio".into()),
        ("${launcher_version}", env!("CARGO_PKG_VERSION").into()),
        ("${classpath}", cp.join(sep)),
        ("${classpath_separator}", sep.into()),
        ("${library_directory}", base.join("libraries").to_string_lossy().into()),
        ("${version_name}", version_id.clone()),
        ("${auth_player_name}", name.to_string()),
        ("${game_directory}", game.to_string_lossy().into()),
        ("${assets_root}", base.join("assets").to_string_lossy().into()),
        ("${assets_index_name}", vanilla["assetIndex"]["id"].as_str().unwrap_or("").into()),
        ("${auth_uuid}", uuid.to_string()),
        ("${auth_access_token}", token.to_string()),
        ("${clientid}", "".into()),
        ("${auth_xuid}", "".into()),
        ("${user_type}", "msa".into()),
        ("${version_type}", "release".into()),
    ];
    let fill = |s: &str| vars.iter().fold(s.to_string(), |acc, (k, v)| acc.replace(k, v));
    let mut args: Vec<String> = vec![format!("-Xmx{mem}M"), "-Xms512M".into()];
    args.extend(collect_args(vanilla["arguments"].get("jvm")).iter().map(|a| fill(a)));
    args.extend(collect_args(forge["arguments"].get("jvm")).iter().map(|a| fill(a)));
    args.push(forge["mainClass"].as_str().or(vanilla["mainClass"].as_str()).unwrap_or("net.minecraft.client.main.Main").to_string());
    args.extend(collect_args(vanilla["arguments"].get("game")).iter().map(|a| fill(a)));
    args.extend(collect_args(forge["arguments"].get("game")).iter().map(|a| fill(a)));

    Ok(args)
}

#[tauri::command]
pub fn play_running() -> bool {
    RUNNING.load(Ordering::SeqCst)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Lädt Minecraft + NeoForge und startet das Spiel (nur in der CI mit ANVIL_TEST_PLAY=1).
    #[tokio::test]
    async fn install_and_launch() {
        let Ok(mc) = std::env::var("ANVIL_TEST_PLAY") else { return };
        let java = PathBuf::from(std::env::var("JAVA_HOME").expect("JAVA_HOME"));
        let base = std::env::temp_dir().join("anvil-play-test");
        let prog: Prog = Arc::new(|s: &str, d: u64, t: u64| {
            if t == 0 || d == t {
                println!("{s} {d}/{t}");
            }
        });
        let vanilla = install_vanilla(&prog, &base, &mc).await.unwrap();
        let neo = latest_neoforge(&mc).await.unwrap();
        println!("NeoForge {neo}");
        let forge = install_neoforge(&prog, &base, &neo, &java).await.unwrap();
        let game = base.join("instances/test");
        std::fs::create_dir_all(game.join("mods")).unwrap();
        if let Ok(jar) = std::env::var("ANVIL_TEST_MOD_JAR") {
            std::fs::copy(jar, game.join("mods/test.jar")).unwrap();
        }
        let args = launch_args(&base, &mc, &vanilla, &forge, &game, "AnvilTest", "00000000000000000000000000000000", "0", 2048).unwrap();
        let cp_idx = args.iter().position(|a| a == "-cp").unwrap();
        for f in args[cp_idx + 1].split(':') {
            assert!(Path::new(f).exists(), "fehlt: {f}");
        }
        assert!(!args.iter().any(|a| a.contains("${")), "offene Platzhalter: {:?}", args.iter().filter(|a| a.contains("${")).collect::<Vec<_>>());
        std::fs::write(base.join("launch-args.txt"), args.join("\n")).unwrap();
        println!("Hauptklasse: {}", forge["mainClass"]);
    }
}
