mod java;
mod projects;
mod runner;
mod settings;
mod template;
mod updater;
mod util;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(runner::Runner::default())
        .invoke_handler(tauri::generate_handler![
            projects::list_projects,
            projects::remove_project,
            java::java_status,
            java::install_java,
            template::supported_versions,
            template::create_project,
            runner::run_task,
            runner::stop_task,
            runner::running_tasks,
            util::open_in,
            util::open_path,
            util::list_jars,
            util::latest_crash_report,
            settings::get_settings,
            settings::save_settings,
            updater::check_update,
            updater::install_update,
        ])
        .run(tauri::generate_context!())
        .expect("Anvil Studio konnte nicht gestartet werden");
}
