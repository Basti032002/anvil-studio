use crate::projects::{self, Project};
use crate::util::{err, now};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

/// Minecraft-Versionen mit offizieller NeoForge-MDK-Vorlage (ModDevGradle).
const VERSIONS: &[&str] = &["1.21.1", "1.21.4", "1.21.8", "1.21.10"];

const OLD_PACKAGE: &str = "com.example.examplemod";
const OLD_MODID: &str = "examplemod";
const OLD_CLASS: &str = "ExampleMod";

pub const GRADLE_SNIPPET: &str = r#"

// --- Anvil Studio -------------------------------------------------------
// Ermöglicht "Testen → direkt in Welt laden". Anvil Studio übergibt den
// Weltnamen als -PanvilWorld=<Name>. Ohne die Eigenschaft startet das Spiel
// ganz normal im Hauptmenü.
neoForge {
    runs {
        configureEach {
            if (name == 'client' && project.hasProperty('anvilWorld')) {
                programArguments.addAll('--quickPlaySingleplayer', project.property('anvilWorld').toString())
            }
        }
    }
}
"#;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRequest {
    pub name: String,
    pub mod_id: String,
    pub package: String,
    pub mc_version: String,
    pub author: String,
    pub description: String,
    pub parent_dir: Option<String>,
}

#[derive(Serialize, Clone)]
struct Progress {
    step: String,
}

#[tauri::command]
pub fn supported_versions(app: AppHandle) -> Result<serde_json::Value, String> {
    let default_dir = default_parent(&app)?;
    Ok(serde_json::json!({
        "versions": VERSIONS,
        "defaultDir": default_dir.to_string_lossy(),
    }))
}

pub fn default_parent(app: &AppHandle) -> Result<PathBuf, String> {
    let configured = crate::settings::load(app).projects_dir;
    if !configured.trim().is_empty() {
        return Ok(PathBuf::from(configured.trim()));
    }
    let docs = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(err)?;
    Ok(docs.join("Anvil Studio"))
}

fn valid_mod_id(id: &str) -> bool {
    let mut chars = id.chars();
    matches!(chars.next(), Some('a'..='z'))
        && id.len() >= 2
        && id.len() <= 64
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

fn valid_package(pkg: &str) -> bool {
    !pkg.is_empty()
        && pkg.split('.').all(|part| {
            let mut c = part.chars();
            matches!(c.next(), Some('a'..='z') | Some('_'))
                && c.all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '_')
        })
}

/// "Kristallhöhlen Mod" -> "KristallhoehlenMod"
fn class_name(name: &str) -> String {
    let ascii: String = name
        .chars()
        .flat_map(|c| match c {
            'ä' => vec!['a', 'e'],
            'ö' => vec!['o', 'e'],
            'ü' => vec!['u', 'e'],
            'Ä' => vec!['A', 'e'],
            'Ö' => vec!['O', 'e'],
            'Ü' => vec!['U', 'e'],
            'ß' => vec!['s', 's'],
            c => vec![c],
        })
        .collect();
    let mut out = String::new();
    for word in ascii.split(|c: char| !c.is_ascii_alphanumeric()) {
        let mut cs = word.chars();
        if let Some(first) = cs.next() {
            out.push(first.to_ascii_uppercase());
            out.extend(cs);
        }
    }
    if out.is_empty() {
        return "MyMod".into();
    }
    if out.chars().next().unwrap().is_ascii_digit() {
        out.insert_str(0, "Mod");
    }
    out
}

async fn download_mdk(version: &str) -> Result<Vec<u8>, String> {
    let repo = format!("MDK-{version}-ModDevGradle");
    let mut last_error = String::new();
    for branch in ["main", "master"] {
        let url = format!("https://github.com/NeoForgeMDKs/{repo}/archive/refs/heads/{branch}.zip");
        let tmp = std::env::temp_dir().join(format!("anvil-mdk-{version}-{branch}.zip"));
        match crate::util::download(&url, &tmp, &|_, _| {}).await {
            Ok(()) => {
                let bytes = std::fs::read(&tmp).map_err(err)?;
                let _ = std::fs::remove_file(&tmp);
                return Ok(bytes);
            }
            Err(e) => last_error = e,
        }
    }
    Err(format!("Die NeoForge-Vorlage für {version} konnte nicht geladen werden ({last_error}). Besteht eine Internetverbindung?"))
}

/// Entpackt das GitHub-Archiv und entfernt dabei den obersten Ordner.
fn extract_strip(bytes: &[u8], target: &Path) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(err)?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(err)?;
        let Some(path) = entry.enclosed_name() else { continue };
        let rel: PathBuf = path.components().skip(1).collect();
        if rel.as_os_str().is_empty() {
            continue;
        }
        let out = target.join(&rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out).map_err(err)?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).map_err(err)?;
        }
        let mut f = std::fs::File::create(&out).map_err(err)?;
        std::io::copy(&mut entry, &mut f).map_err(err)?;
        #[cfg(unix)]
        if let Some(mode) = entry.unix_mode() {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&out, std::fs::Permissions::from_mode(mode));
        }
    }
    Ok(())
}

/// Gradle liest gradle.properties als ISO-8859-1 – Umlaute daher als \uXXXX schreiben.
pub fn escape_property(value: &str) -> String {
    let mut out = String::new();
    for c in value.chars() {
        if c == '\n' {
            out.push_str("\\n");
        } else if c == '\r' {
            continue;
        } else if c.is_ascii() && c != '\\' {
            out.push(c);
        } else {
            let mut buf = [0u16; 2];
            for unit in c.encode_utf16(&mut buf) {
                out.push_str(&format!("\\u{:04x}", unit));
            }
        }
    }
    out
}

pub fn set_properties(file: &Path, values: &[(&str, &str)]) -> Result<(), String> {
    let content = std::fs::read_to_string(file).map_err(err)?;
    let mut seen = std::collections::HashSet::new();
    let mut lines: Vec<String> = content
        .lines()
        .map(|line| {
            if !line.trim_start().starts_with('#') {
                if let Some((k, _)) = line.split_once('=') {
                    if let Some((key, value)) = values.iter().find(|(key, _)| *key == k.trim()) {
                        seen.insert(key.to_string());
                        return format!("{key}={}", escape_property(value));
                    }
                }
            }
            line.to_string()
        })
        .collect();
    // fehlende Schlüssel anhängen (z. B. mod_authors im NeoForge-MDK)
    for (key, value) in values.iter().filter(|(k, _)| !seen.contains(*k)) {
        lines.push(format!("{key}={}", escape_property(value)));
    }
    std::fs::write(file, lines.join("\n") + "\n").map_err(err)
}

fn customize(target: &Path, req: &CreateRequest, class: &str) -> Result<(), String> {
    let author = if req.author.trim().is_empty() { "Unbekannt" } else { req.author.trim() };
    // gradle.properties
    set_properties(
        &target.join("gradle.properties"),
        &[
            ("mod_id", &req.mod_id),
            ("mod_name", req.name.trim()),
            ("mod_group_id", &req.package),
            ("mod_version", "0.1.0"),
        ],
    )?;

    // Java-Paket verschieben
    let java_root = target.join("src").join("main").join("java");
    let old_dir = java_root.join(OLD_PACKAGE.replace('.', "/"));
    let new_dir = java_root.join(req.package.replace('.', "/"));
    if old_dir.exists() && old_dir != new_dir {
        let tmp = java_root.join("__anvil_tmp");
        std::fs::rename(&old_dir, &tmp).map_err(err)?;
        // leere Ordner com/example entfernen
        let _ = std::fs::remove_dir(java_root.join("com").join("example"));
        let _ = std::fs::remove_dir(java_root.join("com"));
        if let Some(parent) = new_dir.parent() {
            std::fs::create_dir_all(parent).map_err(err)?;
        }
        std::fs::rename(&tmp, &new_dir).map_err(err)?;
    }

    // Asset-/Data-Ordner umbenennen
    for kind in ["assets", "data"] {
        let old = target.join("src/main/resources").join(kind).join(OLD_MODID);
        if old.exists() {
            std::fs::rename(&old, old.with_file_name(&req.mod_id)).map_err(err)?;
        }
    }

    // Inhalte ersetzen und Dateien umbenennen
    let files: Vec<PathBuf> = walkdir::WalkDir::new(target.join("src"))
        .into_iter()
        .flatten()
        .filter(|e| e.file_type().is_file())
        .map(|e| e.into_path())
        .collect();
    for file in files {
        let ext = file.extension().and_then(|e| e.to_str()).unwrap_or("");
        if matches!(ext, "java" | "json" | "toml" | "mcmeta" | "cfg" | "properties") {
            if let Ok(text) = std::fs::read_to_string(&file) {
                let new_text = text
                    .replace(OLD_PACKAGE, &req.package)
                    .replace(OLD_CLASS, class)
                    .replace(OLD_MODID, &req.mod_id)
                    .replace("Example Mod", req.name.trim())
                    .replace("Example mod description.", req.description.trim())
                    .replace("#authors=\"\"", &format!("authors=\"{}\"", author.replace('"', "'")));
                if new_text != text {
                    std::fs::write(&file, new_text).map_err(err)?;
                }
            }
        }
        let fname = file.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if fname.contains(OLD_CLASS) {
            let renamed = file.with_file_name(fname.replace(OLD_CLASS, class));
            std::fs::rename(&file, renamed).map_err(err)?;
        }
    }

    // Build-Skript erweitern
    let build = target.join("build.gradle");
    if build.exists() {
        let mut text = std::fs::read_to_string(&build).map_err(err)?;
        if !text.contains("anvilWorld") {
            text.push_str(GRADLE_SNIPPET);
            std::fs::write(&build, text).map_err(err)?;
        }
    }

    // Eigenes README statt MDK-README
    let readme = format!(
        "# {}\n\n{}\n\nErstellt mit Anvil Studio · NeoForge · Minecraft {}\n",
        req.name.trim(),
        req.description.trim(),
        req.mc_version
    );
    let _ = std::fs::write(target.join("README.md"), readme);
    Ok(())
}

#[tauri::command]
pub async fn create_project(app: AppHandle, req: CreateRequest) -> Result<Project, String> {
    let step = |s: &str| {
        let _ = app.emit("create-progress", Progress { step: s.into() });
    };

    if req.name.trim().is_empty() {
        return Err("Bitte gib einen Projektnamen ein.".into());
    }
    if !valid_mod_id(&req.mod_id) {
        return Err("Die Mod-ID darf nur Kleinbuchstaben, Ziffern und _ enthalten, muss mit einem Buchstaben beginnen und 2–64 Zeichen lang sein.".into());
    }
    if !valid_package(&req.package) {
        return Err("Das Java-Paket ist ungültig (Beispiel: de.deinname.meinemod).".into());
    }
    if !VERSIONS.contains(&req.mc_version.as_str()) {
        return Err(format!("Minecraft {} wird noch nicht unterstützt.", req.mc_version));
    }

    let parent = match &req.parent_dir {
        Some(d) if !d.trim().is_empty() => PathBuf::from(d.trim()),
        _ => default_parent(&app)?,
    };
    let target = parent.join(&req.mod_id);
    if target.exists() && std::fs::read_dir(&target).map_err(err)?.next().is_some() {
        return Err(format!("Der Ordner {} existiert bereits und ist nicht leer.", target.display()));
    }
    std::fs::create_dir_all(&target).map_err(err)?;

    step("NeoForge-Vorlage wird heruntergeladen …");
    let bytes = download_mdk(&req.mc_version).await;
    let bytes = match bytes {
        Ok(b) => b,
        Err(e) => {
            let _ = std::fs::remove_dir(&target);
            return Err(e);
        }
    };

    step("Vorlage wird entpackt …");
    let class = class_name(&req.name);
    let (name, mod_id, package, mc_version) =
        (req.name.trim().to_string(), req.mod_id.clone(), req.package.clone(), req.mc_version.clone());
    let target_c = target.clone();
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        extract_strip(&bytes, &target_c)?;
        customize(&target_c, &req, &class)?;
        Ok(())
    })
    .await
    .map_err(err)?;

    if let Err(e) = result {
        let _ = std::fs::remove_dir_all(&target);
        return Err(e);
    }

    step("Git-Repository wird angelegt …");
    let mut git = std::process::Command::new("git");
    git.arg("init").arg("-q").current_dir(&target);
    let _ = crate::util::hide_window_std(&mut git).status();

    let project = Project {
        id: format!("{}-{}", mod_id, now()),
        name,
        mod_id,
        package,
        mc_version,
        loader: "neoforge".into(),
        path: target.to_string_lossy().to_string(),
        created_at: now(),
        last_run: None,
    };
    projects::add(&app, project.clone())?;
    step("Fertig!");
    Ok(project)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names() {
        assert_eq!(class_name("Kristallhöhlen"), "Kristallhoehlen");
        assert_eq!(class_name("mein erster block"), "MeinErsterBlock");
        assert_eq!(class_name("3d stuff"), "Mod3dStuff");
        assert!(valid_mod_id("kristall_hoehlen"));
        assert!(!valid_mod_id("Kristall"));
        assert!(valid_package("de.sebigames.kristall"));
        assert!(!valid_package("de..x"));
    }

    /// Prüft das Anpassen der Vorlage mit einem lokal geladenen MDK-Zip:
    /// Beispiel-Mod bauen: ANVIL_EXAMPLE_DIR, ANVIL_EXAMPLE_MDK (nur beim ersten Lauf), ANVIL_EXAMPLE_CONTENT (content.json)
    #[test]
    fn build_example() {
        let Ok(dir) = std::env::var("ANVIL_EXAMPLE_DIR") else { return };
        let target = PathBuf::from(&dir);
        let req = CreateRequest {
            name: "Rubinwerk".into(),
            mod_id: "rubinwerk".into(),
            package: "de.sebigames.rubinwerk".into(),
            mc_version: "1.21.1".into(),
            author: "Anvil Studio".into(),
            description: "Beispiel-Mod: Rubine, Werkzeuge, eine Rubin-Presse mit eigener Oberfläche, Variablen und Blueprints.".into(),
            parent_dir: None,
        };
        if !target.join("build.gradle").exists() {
            let bytes = std::fs::read(std::env::var("ANVIL_EXAMPLE_MDK").unwrap()).unwrap();
            std::fs::create_dir_all(&target).unwrap();
            extract_strip(&bytes, &target).unwrap();
            customize(&target, &req, &class_name(&req.name)).unwrap();
        }
        let Ok(content) = std::env::var("ANVIL_EXAMPLE_CONTENT") else { return };
        let mut c: crate::content::Content = serde_json::from_str(&std::fs::read_to_string(content).unwrap()).unwrap();
        let p = crate::projects::Project {
            id: "rubinwerk".into(),
            name: req.name.clone(),
            mod_id: req.mod_id.clone(),
            package: req.package.clone(),
            mc_version: req.mc_version.clone(),
            loader: "neoforge".into(),
            path: dir.clone(),
            created_at: 0,
            last_run: None,
        };
        let r = crate::content::generate(&p, &mut c).unwrap();
        println!("Registrierung: {r}");
    }

    /// ANVIL_TEST_MDK=/pfad/mdk.zip cargo test -- customize_mdk
    #[test]
    fn customize_mdk() {
        let Ok(zip_path) = std::env::var("ANVIL_TEST_MDK") else { return };
        let bytes = std::fs::read(zip_path).unwrap();
        let target = std::env::temp_dir().join("anvil-test-project");
        let _ = std::fs::remove_dir_all(&target);
        std::fs::create_dir_all(&target).unwrap();
        extract_strip(&bytes, &target).unwrap();
        let req = CreateRequest {
            name: "Kristallhöhlen".into(),
            mod_id: "kristallhoehlen".into(),
            package: "de.sebigames.kristallhoehlen".into(),
            mc_version: "1.21.1".into(),
            author: "Sebigames".into(),
            description: "Leuchtende Höhlen".into(),
            parent_dir: None,
        };
        customize(&target, &req, &class_name(&req.name)).unwrap();
        let main = target.join("src/main/java/de/sebigames/kristallhoehlen/Kristallhoehlen.java");
        let text = std::fs::read_to_string(main).unwrap();
        assert!(text.contains("public static final String MODID = \"kristallhoehlen\";"));
        assert!(text.contains("package de.sebigames.kristallhoehlen;"));
        assert!(target.join("src/main/resources/assets/kristallhoehlen/lang/en_us.json").exists());
        assert!(!target.join("src/main/java/com").exists());
        let props = std::fs::read_to_string(target.join("gradle.properties")).unwrap();
        assert!(props.contains("mod_id=kristallhoehlen"));
        assert!(props.contains("mod_name=Kristallh\\u00f6hlen"));
        let toml = std::fs::read_to_string(target.join("src/main/templates/META-INF/neoforge.mods.toml")).unwrap();
        assert!(toml.contains("authors=\"Sebigames\""));
        assert!(std::fs::read_to_string(target.join("build.gradle")).unwrap().contains("anvilWorld"));
    }
}

/// Liest einfache key=value-Paare (ohne Kommentare) roh – ohne Unescaping.
fn raw_properties(file: &Path) -> Vec<(String, String)> {
    std::fs::read_to_string(file)
        .unwrap_or_default()
        .lines()
        .filter(|l| !l.trim_start().starts_with('#'))
        .filter_map(|l| l.split_once('=').map(|(k, v)| (k.trim().to_string(), v.to_string())))
        .collect()
}

/// Stellt ein Projekt auf eine andere Minecraft-Version um: Gradle-Dateien
/// kommen aus der neuen NeoForge-Vorlage, Quellcode und Ressourcen bleiben.
/// Vorher wird alles Ersetzte in .anvil/backups gesichert.
#[tauri::command]
pub async fn change_mc_version(app: AppHandle, project_id: String, version: String) -> Result<Vec<String>, String> {
    use crate::i18n::{tr, trf};
    let p = projects::get(&app, &project_id)?;
    if !VERSIONS.contains(&version.as_str()) {
        return Err(trf("Minecraft {v} wird noch nicht unterstützt.", &[("v", &version)]));
    }
    if p.mc_version == version {
        return Ok(vec![]);
    }
    let root = PathBuf::from(&p.path);
    let step = |s: String| {
        let _ = app.emit("create-progress", Progress { step: s });
    };

    step(tr("NeoForge-Vorlage wird heruntergeladen …"));
    let bytes = download_mdk(&version).await?;
    let tmp = std::env::temp_dir().join(format!("anvil-switch-{}-{}", p.mod_id, now()));
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).map_err(err)?;
    extract_strip(&bytes, &tmp)?;

    // Sichern
    step(tr("Sicherung wird angelegt …"));
    let backup = root.join(".anvil").join("backups").join(format!("mc-{}-{}", p.mc_version, now()));
    std::fs::create_dir_all(&backup).map_err(err)?;
    let files = ["build.gradle", "settings.gradle", "gradle.properties", "gradlew", "gradlew.bat"];
    for f in files {
        if root.join(f).exists() {
            std::fs::copy(root.join(f), backup.join(f)).map_err(err)?;
        }
    }
    for e in walkdir::WalkDir::new(root.join("gradle")).into_iter().flatten().filter(|e| e.file_type().is_file()) {
        let rel = e.path().strip_prefix(&root).unwrap_or(e.path());
        let to = backup.join(rel);
        if let Some(parent) = to.parent() {
            std::fs::create_dir_all(parent).map_err(err)?;
        }
        std::fs::copy(e.path(), to).map_err(err)?;
    }

    step(tr("Gradle-Dateien werden ersetzt …"));
    // Eigene Werte aus gradle.properties übernehmen
    let keep = ["mod_id", "mod_name", "mod_license", "mod_version", "mod_group_id", "mod_authors", "mod_description"];
    let old_props = raw_properties(&root.join("gradle.properties"));
    for f in ["build.gradle", "settings.gradle", "gradle.properties", "gradlew", "gradlew.bat"] {
        if tmp.join(f).exists() {
            std::fs::copy(tmp.join(f), root.join(f)).map_err(err)?;
        }
    }
    let _ = std::fs::remove_dir_all(root.join("gradle"));
    if tmp.join("gradle").exists() {
        for e in walkdir::WalkDir::new(tmp.join("gradle")).into_iter().flatten().filter(|e| e.file_type().is_file()) {
            let rel = e.path().strip_prefix(&tmp).unwrap_or(e.path());
            let to = root.join(rel);
            if let Some(parent) = to.parent() {
                std::fs::create_dir_all(parent).map_err(err)?;
            }
            std::fs::copy(e.path(), to).map_err(err)?;
        }
    }
    let props_file = root.join("gradle.properties");
    let text = std::fs::read_to_string(&props_file).map_err(err)?;
    let new_text: Vec<String> = text
        .lines()
        .map(|l| {
            if let Some((k, _)) = l.split_once('=') {
                let k = k.trim();
                if keep.contains(&k) {
                    if let Some((_, v)) = old_props.iter().find(|(ok, _)| ok == k) {
                        return format!("{k}={v}");
                    }
                }
            }
            l.to_string()
        })
        .collect();
    std::fs::write(&props_file, new_text.join("\n") + "\n").map_err(err)?;
    let build = root.join("build.gradle");
    let mut build_text = std::fs::read_to_string(&build).map_err(err)?;
    if !build_text.contains("anvilWorld") {
        build_text.push_str(GRADLE_SNIPPET);
        std::fs::write(&build, build_text).map_err(err)?;
    }
    let _ = std::fs::remove_dir_all(&tmp);
    // Alte Build-Ausgaben passen nicht mehr
    let _ = std::fs::remove_dir_all(root.join("build"));

    projects::update(&app, &project_id, |pr| pr.mc_version = version.clone())?;
    let p = projects::get(&app, &project_id)?;

    step(tr("Inhalte werden für die neue Version erzeugt …"));
    let mut notes = vec![trf("Sicherung der alten Gradle-Dateien: {path}", &[("path", &backup.display())])];
    let (mut content, _) = crate::content::load(&p)?;
    if !content.blocks.is_empty() || !content.items.is_empty() || !content.mobs.is_empty() {
        crate::content::generate(&p, &mut content)?;
        notes.push(tr("Blöcke & Items wurden im Format der neuen Version neu erzeugt."));
    }
    notes.push(tr("Mitgeladene Mods passen eventuell nicht mehr – unter „Mods“ auf „Alle aktualisieren“ klicken."));
    notes.push(tr("Eigener Java-Code wird nicht angepasst. Prüfe mit „Bauen“, ob er mit der neuen Version kompiliert."));
    Ok(notes)
}
