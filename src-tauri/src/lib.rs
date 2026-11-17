// Raiz do app SynapseIA: registra módulos, plugins, bandeja e comandos.
pub mod claude_cfg;
pub mod commands;
pub mod control;
pub mod env_check;
pub mod files;
pub mod launch;
pub mod model;
pub mod notes;
pub mod pty;
pub mod slug;
pub mod spawn;
pub mod state;

use commands::AppCtx;
use model::LaunchCtx;
use std::path::PathBuf;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, WindowEvent};

/// %APPDATA%\SynapseIA
pub fn data_dir() -> PathBuf {
    std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir).join("SynapseIA")
}

fn agent_exe() -> PathBuf {
    std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.join("synapseia-agent.exe"))).unwrap_or_else(|| PathBuf::from("synapseia-agent.exe"))
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(
            tauri_plugin_log::Builder::new()
                .target(tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Folder {
                    path: data_dir().join("logs"),
                    file_name: Some("synapseia".into()),
                }))
                .max_file_size(5_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(5))
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .setup(|app| {
            let dir = data_dir();
            let cfg_dir = dir.join("claude");
            if let Err(e) = claude_cfg::write_cfg(&cfg_dir, &agent_exe()) {
                log::error!("write_cfg: {e}");
            }
            let token = control::new_token();
            let port = control::start(app.handle().clone(), token.clone())?;
            log::info!("SynapseIA iniciado; servidor de controle na porta {port}");
            app.manage(AppCtx {
                pty: pty::PtyManager::default(),
                launch: LaunchCtx { cfg_dir, port, token, system_prompt: claude_cfg::SYSTEM_PROMPT.into() },
                data_dir: dir,
            });

            // bandeja: Abrir / Sair
            let abrir = MenuItem::with_id(app, "abrir", "Abrir SynapseIA", true, None::<&str>)?;
            let sair = MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&abrir, &sair])?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().expect("ícone padrão"))
                .tooltip("SynapseIA")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, ev| match ev.id().as_ref() {
                    "abrir" => show_main(app),
                    "sair" => {
                        show_main(app);
                        // o frontend salva o estado e chama app_exit
                        let _ = app.emit("app://quit", ());
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // fechar pelo sistema (Alt+F4) só esconde; agentes continuam
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::pty_spawn,
            commands::pty_write,
            commands::pty_resize,
            commands::pty_kill,
            commands::note_read,
            commands::note_write,
            commands::state_load,
            commands::state_save,
            commands::env_check,
            commands::list_dir,
            commands::read_text,
            commands::write_text,
            commands::file_mtime,
            commands::app_exit,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o SynapseIA");
}
