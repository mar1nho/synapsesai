// Comandos chamados pelo frontend.
use crate::launch::{Programs, build_command};
use crate::model::{LaunchCtx, SessionSpec};
use crate::pty::{OutputSink, PtyManager};
use crate::{env_check, notes, state};
use std::path::PathBuf;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, State};

/// Estado global do app no lado Rust.
pub struct AppCtx {
    pub pty: PtyManager,
    pub launch: LaunchCtx,
    pub data_dir: PathBuf,
}

struct ChannelSink(Channel<InvokeResponseBody>);
impl OutputSink for ChannelSink {
    fn send(&self, bytes: Vec<u8>) -> bool {
        self.0.send(InvokeResponseBody::Raw(bytes)).is_ok()
    }
}

#[derive(Clone, serde::Serialize)]
struct Exited {
    id: String,
    code: Option<u32>,
}

#[tauri::command]
pub async fn pty_spawn(
    app: AppHandle,
    ctx: State<'_, AppCtx>,
    spec: SessionSpec,
    cols: u16,
    rows: u16,
    on_output: Channel<InvokeResponseBody>,
) -> Result<(), String> {
    // procura claude/fnm a cada sessão: eles podem ter sido instalados com o app aberto
    let cmd = build_command(&spec, &ctx.launch, &Programs::detect());
    let id = spec.id.clone();
    let r = ctx.pty.spawn(spec, cmd, cols, rows, ChannelSink(on_output), move |code| {
        let _ = app.emit("session://exited", Exited { id, code });
    });
    if let Err(e) = &r {
        log::error!("pty_spawn: {e}");
    }
    r
}

#[tauri::command]
pub fn pty_write(ctx: State<'_, AppCtx>, id: String, data: String) {
    ctx.pty.write(&id, data.as_bytes());
}

#[tauri::command]
pub fn pty_resize(ctx: State<'_, AppCtx>, id: String, cols: u16, rows: u16) {
    ctx.pty.resize(&id, cols, rows);
}

#[tauri::command]
pub fn pty_kill(ctx: State<'_, AppCtx>, id: String) {
    ctx.pty.kill(&id);
}

#[tauri::command]
pub fn note_read(ctx: State<'_, AppCtx>, id: String) -> Result<String, String> {
    notes::read_note(&ctx.data_dir.join("notas"), &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn note_write(ctx: State<'_, AppCtx>, id: String, text: String) -> Result<(), String> {
    notes::write_note(&ctx.data_dir.join("notas"), &id, &text).map_err(|e| {
        log::error!("note_write: {e}");
        e.to_string()
    })
}

#[tauri::command]
pub fn state_load(ctx: State<'_, AppCtx>) -> (state::AppState, bool) {
    let existia = ctx.data_dir.join(state::STATE_FILE).exists();
    (state::load(&ctx.data_dir), existia)
}

#[tauri::command]
pub fn state_save(ctx: State<'_, AppCtx>, s: state::AppState) -> Result<(), String> {
    state::save(&ctx.data_dir, &s).map_err(|e| {
        log::error!("state_save: {e}");
        e.to_string()
    })
}

#[tauri::command]
pub async fn env_check() -> Vec<env_check::EnvItem> {
    tauri::async_runtime::spawn_blocking(env_check::check_all).await.unwrap_or_default()
}

#[tauri::command]
pub async fn list_dir(path: String) -> Result<Vec<crate::files::Entry>, String> {
    crate::files::list_dir(std::path::Path::new(&path))
}

#[tauri::command]
pub async fn read_text(path: String) -> Result<crate::files::TextFile, String> {
    crate::files::read_text(std::path::Path::new(&path))
}

#[tauri::command]
pub async fn write_text(path: String, text: String, bom: bool) -> Result<u64, String> {
    crate::files::write_text(std::path::Path::new(&path), &text, bom).inspect_err(|e| log::error!("write_text: {e}"))
}

#[tauri::command]
pub fn file_mtime(path: String) -> u64 {
    crate::files::mtime_ms(std::path::Path::new(&path))
}

#[tauri::command]
pub fn app_exit(app: AppHandle, ctx: State<'_, AppCtx>) {
    ctx.pty.kill_all();
    app.exit(0);
}
