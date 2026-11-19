use crate::util::{err, now};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::Command;

/// Gradle-Tasks, die über die Oberfläche gestartet werden dürfen.
const ALLOWED_TASKS: &[&str] = &["runClient", "runServer", "runData", "build", "clean"];

#[derive(Default)]
pub struct Runner {
    procs: Mutex<HashMap<String, RunInfo>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RunInfo {
    pub project_id: String,
    pub task: String,
    pub started_at: u64,
    #[serde(skip)]
    pid: Option<u32>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LogLine {
    project_id: String,
    stream: &'static str,
    line: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RunExit {
    project_id: String,
    task: String,
    success: bool,
    code: Option<i32>,
}

fn pump<R: AsyncRead + Unpin + Send + 'static>(app: AppHandle, project_id: String, stream: &'static str, reader: R) {
    tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(reader);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    // Gradle/Minecraft schreiben unter Windows teils nicht in UTF-8
                    let line = String::from_utf8_lossy(&buf).trim_end_matches(['\r', '\n']).to_string();
                    let _ = app.emit("log", LogLine { project_id: project_id.clone(), stream, line });
                }
            }
        }
    });
}

#[tauri::command]
pub async fn run_task(
    app: AppHandle,
    state: State<'_, Runner>,
    project_id: String,
    task: String,
    world: Option<String>,
) -> Result<(), String> {
    if !ALLOWED_TASKS.contains(&task.as_str()) {
        return Err(format!("Unbekannte Aufgabe: {task}"));
    }
    if state.procs.lock().unwrap().contains_key(&project_id) {
        return Err("In diesem Projekt läuft bereits etwas. Stoppe es zuerst.".into());
    }
    let project = crate::projects::get(&app, &project_id)?;
    let java = crate::java::java_home(&app)
        .ok_or("Java 21 ist noch nicht installiert. Installiere es unten links unter „Umgebung“.")?;

    let dir = PathBuf::from(&project.path);
    let wrapper = dir.join(if cfg!(windows) { "gradlew.bat" } else { "gradlew" });
    if !wrapper.exists() {
        return Err(format!("{} fehlt im Projektordner.", wrapper.display()));
    }

    let mut args = vec![task.clone(), "--console=plain".to_string()];
    if task == "runClient" {
        if let Some(w) = world.map(|w| w.trim().to_string()).filter(|w| !w.is_empty()) {
            if w.chars().any(|c| matches!(c, '"' | '%' | '^' | '&' | '|' | '<' | '>')) {
                return Err("Der Weltname enthält ungültige Zeichen.".into());
            }
            args.push(format!("-PanvilWorld={w}"));
        }
    }

    let path_var = std::env::var_os("PATH").unwrap_or_default();
    let mut paths = vec![java.join("bin")];
    paths.extend(std::env::split_paths(&path_var));

    let mut cmd = Command::new(&wrapper);
    cmd.args(&args)
        .current_dir(&dir)
        .env("JAVA_HOME", &java)
        .env("PATH", std::env::join_paths(paths).map_err(err)?)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(false);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);

    let mut child = cmd.spawn().map_err(|e| format!("Gradle konnte nicht gestartet werden: {e}"))?;
    let info = RunInfo { project_id: project_id.clone(), task: task.clone(), started_at: now(), pid: child.id() };
    state.procs.lock().unwrap().insert(project_id.clone(), info);

    let _ = app.emit(
        "log",
        LogLine { project_id: project_id.clone(), stream: "system", line: format!("▶ gradlew {}", args.join(" ")) },
    );
    if let Some(out) = child.stdout.take() {
        pump(app.clone(), project_id.clone(), "stdout", out);
    }
    if let Some(errs) = child.stderr.take() {
        pump(app.clone(), project_id.clone(), "stderr", errs);
    }

    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        let status = child.wait().await;
        let code = status.as_ref().ok().and_then(|s| s.code());
        let success = status.map(|s| s.success()).unwrap_or(false);
        app2.state::<Runner>().procs.lock().unwrap().remove(&project_id);
        let _ = crate::projects::update(&app2, &project_id, |p| {
            p.last_run = Some(crate::projects::LastRun { task: task.clone(), success, finished_at: now() });
        });
        let _ = app2.emit("run-exit", RunExit { project_id, task, success, code });
    });
    Ok(())
}

/// Beendet Gradle samt gestartetem Spiel (ganzer Prozessbaum).
#[tauri::command]
pub fn stop_task(state: State<'_, Runner>, project_id: String) -> Result<(), String> {
    let pid = state
        .procs
        .lock()
        .unwrap()
        .get(&project_id)
        .and_then(|i| i.pid)
        .ok_or("Es läuft gerade nichts.")?;
    let mut cmd = if cfg!(windows) {
        let mut c = std::process::Command::new("taskkill");
        c.args(["/PID", &pid.to_string(), "/T", "/F"]);
        c
    } else {
        let mut c = std::process::Command::new("sh");
        c.args(["-c", &format!("pkill -TERM -P {pid}; kill -TERM {pid}")]);
        c
    };
    crate::util::hide_window_std(&mut cmd).status().map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn running_tasks(state: State<'_, Runner>) -> Vec<RunInfo> {
    state.procs.lock().unwrap().values().cloned().collect()
}
