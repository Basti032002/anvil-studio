mod admin;
mod blueprint;
mod content;
mod fsx;
mod i18n;
mod java;
mod mcassets;
mod migrate;
mod modsettings;
mod mods;
mod projects;
mod runner;
mod settings;
mod template;
mod updater;
mod util;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(runner::Runner::default())
        .setup(|app| {
            if let Err(e) = migrate::run(app.handle()) {
                eprintln!("Migration fehlgeschlagen: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            projects::list_projects,
            projects::remove_project,
            projects::import_project,
            content::content_load,
            mcassets::mc_entity_texture,
            template::change_mc_version,
            i18n::set_language_cmd,
            modsettings::mod_settings_get,
            modsettings::mod_settings_save,
            content::content_save,
            content::texture_get,
            content::texture_save,
            content::project_open,
            mcassets::mc_catalog,
            mcassets::mc_names,
            mods::mods_search,
            mods::mods_list,
            mods::mods_add,
            mods::mods_remove,
            mods::mods_toggle,
            mods::mods_update,
            fsx::files_list,
            fsx::files_read,
            fsx::files_write,
            fsx::files_create,
            fsx::files_delete,
            fsx::files_rename,
            fsx::files_reveal,
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
            admin::account_configured,
            admin::account_start_login,
            admin::account_poll_login,
            admin::account_session,
            admin::account_logout,
            admin::admin_testers,
            admin::admin_add_tester,
            admin::admin_remove_tester,
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
