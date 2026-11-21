mod admin;
mod blueprint;
mod content;
mod dimension;
mod export;
mod fsx;
mod i18n;
mod java;
mod mcassets;
mod migrate;
mod minecraft;
mod modsettings;
mod mods;
mod play;
mod projects;
mod runner;
mod settings;
mod structures;
mod template;
mod updater;
mod util;
mod workshop;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(runner::Runner::default())
        .setup(|app| {
            if let Err(e) = migrate::run(app.handle()) {
                eprintln!("Migration fehlgeschlagen: {e}");
            }
            workshop::start_remote_poll(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            projects::list_projects,
            projects::remove_project,
            projects::import_project,
            content::content_load,
            content::content_lang_entries,
            content::structures_scan,
            workshop::ws_remote_config,
            workshop::ws_public_stats,
            workshop::ws_check_url,
            workshop::ws_image_preview,
            admin::admin_workshop_config,
            admin::admin_set_workshop_config,
            content::structures_imported,
            content::structure_import,
            content::lang_export,
            content::lang_import,
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
            updater::patch_notes_pending,
            updater::patch_notes_seen,
            export::export_jars,
            minecraft::mc_login_available,
            minecraft::mc_start_login,
            minecraft::mc_poll_login,
            minecraft::mc_account,
            minecraft::mc_logout,
            workshop::ws_base_url,
            workshop::ws_reset,
            workshop::ws_list,
            workshop::ws_item,
            workshop::ws_me,
            workshop::ws_my_items,
            workshop::ws_delete,
            workshop::ws_report,
            workshop::ws_upload,
            workshop::ws_download,
            workshop::ws_open_source,
            workshop::ws_admin_items,
            workshop::ws_admin_stats,
            workshop::ws_admin_reports,
            workshop::ws_admin_action,
            workshop::ws_admin_patch,
            workshop::ws_admin_settings,
            workshop::ws_rate,
            workshop::ws_comments,
            workshop::ws_comment_add,
            workshop::ws_comment_delete,
            workshop::ws_subscribe,
            workshop::ws_subscriptions,
            workshop::ws_sync_subscriptions,
            workshop::ws_notifications,
            workshop::ws_notifications_read,
            play::play_mod,
            play::play_running,
            content::content_hot_reload,
            export::export_copy_jar,
            export::export_delete_jar,
            export::export_source_zip,
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
