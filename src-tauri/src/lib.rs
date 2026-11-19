mod admin;
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
            util::open_url,
            util::list_jars,
            util::latest_crash_report,
            settings::get_settings,
            settings::save_settings,
            updater::check_update,
            updater::install_update,
            admin::admin_configured,
            admin::admin_start_login,
            admin::admin_poll_login,
            admin::admin_session,
            admin::admin_logout,
            admin::admin_overview,
            admin::admin_publish,
            admin::admin_set_prerelease,
            admin::admin_update_notes,
            admin::admin_delete_release,
            admin::admin_rerun,
        ])
        .run(tauri::generate_context!())
        .expect("Anvil Studio konnte nicht gestartet werden");
}
