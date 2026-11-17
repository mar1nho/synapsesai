// Gerenciador de pseudoconsoles (ConPTY).
// Uma thread lê o PTY e outra junta a saída em lotes (12 ms / 64 KB) antes de mandar ao frontend.
pub mod batch;
pub mod job;

use crate::launch::vars_to_remove;
use crate::model::{CommandLine, SessionSpec};
use batch::Batcher;
use portable_pty::{Child, CommandBuilder, MasterPty, PtySize, native_pty_system};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

pub const LOTE_MAX: usize = 65_536;
pub const JANELA: Duration = Duration::from_millis(12);

/// Destino da saída de uma sessão (Channel do Tauri no app, coletor nos testes).
pub trait OutputSink: Send + 'static {
    /// false = destino fechado.
    fn send(&self, bytes: Vec<u8>) -> bool;
}

struct Live {
    spec: SessionSpec,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    _job: Option<job::Job>,
}

type Sessoes = HashMap<String, Live>;

/// Trava o mapa de sessões. Se outra thread entrou em pânico segurando a trava, segue com o mapa
/// como está: derrubar o app inteiro (e todos os terminais) por causa de uma thread seria pior.
fn travar(m: &Mutex<Sessoes>) -> MutexGuard<'_, Sessoes> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

#[derive(Default)]
pub struct PtyManager {
    sessions: Arc<Mutex<Sessoes>>,
}

impl PtyManager {
    pub fn spawn(
        &self,
        spec: SessionSpec,
        cmd: CommandLine,
        cols: u16,
        rows: u16,
        sink: impl OutputSink,
        on_exit: impl FnOnce(Option<u32>) + Send + 'static,
    ) -> Result<(), String> {
        if !cmd.cwd.is_dir() {
            return Err(format!("pasta não encontrada: {}", cmd.cwd.display()));
        }
        let pty = native_pty_system()
            .openpty(PtySize { rows: rows.max(2), cols: cols.max(10), pixel_width: 0, pixel_height: 0 })
            .map_err(|e| format!("não consegui abrir o terminal: {e}"))?;

        let mut b = CommandBuilder::new(&cmd.program);
        b.args(&cmd.args);
        b.cwd(&cmd.cwd);
        let herdadas: Vec<String> = std::env::vars().map(|(k, _)| k).collect();
        for k in vars_to_remove(herdadas.iter().map(String::as_str)) {
            b.env_remove(k);
        }
        for (k, v) in &cmd.env {
            b.env(k, v);
        }

        let child = pty.slave.spawn_command(b).map_err(|e| format!("não consegui iniciar {}: {e}", cmd.program))?;
        drop(pty.slave);
        let job = child.process_id().and_then(job::Job::for_process);
        let reader = pty.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pty.master.take_writer().map_err(|e| e.to_string())?;

        let id = spec.id.clone();
        travar(&self.sessions).insert(id.clone(), Live { spec, master: pty.master, writer, child, _job: job });

        // leitura bloqueante -> canal
        let (tx, rx) = mpsc::channel::<Vec<u8>>();
        std::thread::spawn(move || {
            let mut reader = reader;
            let mut buf = [0u8; 16 * 1024];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if tx.send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                }
            }
        });

        // canal -> lotes -> destino
        let sessions = Arc::clone(&self.sessions);
        std::thread::spawn(move || {
            let mut lotes = Batcher::new(LOTE_MAX, JANELA);
            loop {
                let espera = lotes.time_left(Instant::now()).unwrap_or(Duration::from_secs(3600));
                match rx.recv_timeout(espera) {
                    Ok(dados) => {
                        for l in lotes.push(&dados, Instant::now()) {
                            if !sink.send(l) {
                                break;
                            }
                        }
                    }
                    Err(RecvTimeoutError::Timeout) => {
                        if let Some(l) = lotes.due(Instant::now()) {
                            sink.send(l);
                        }
                    }
                    Err(RecvTimeoutError::Disconnected) => {
                        if let Some(l) = lotes.flush() {
                            sink.send(l);
                        }
                        break;
                    }
                }
            }
            let code = travar(&sessions).remove(&id).and_then(|mut l| l.child.try_wait().ok().flatten().map(|s| s.exit_code()));
            on_exit(code);
        });
        Ok(())
    }

    pub fn write(&self, id: &str, data: &[u8]) {
        if let Some(l) = travar(&self.sessions).get_mut(id) {
            let _ = l.writer.write_all(data);
            let _ = l.writer.flush();
        }
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) {
        if let Some(l) = travar(&self.sessions).get(id) {
            let _ = l.master.resize(PtySize { rows: rows.max(2), cols: cols.max(10), pixel_width: 0, pixel_height: 0 });
        }
    }

    /// Encerra a sessão e todos os processos que ela abriu.
    pub fn kill(&self, id: &str) {
        let live = travar(&self.sessions).remove(id);
        if let Some(mut l) = live {
            let _ = l.child.kill();
            drop(l); // fecha o job -> mata a árvore
        }
    }

    pub fn kill_all(&self) {
        let ids: Vec<String> = travar(&self.sessions).keys().cloned().collect();
        for id in ids {
            self.kill(&id);
        }
    }

    pub fn registry(&self) -> Vec<SessionSpec> {
        travar(&self.sessions).values().map(|l| l.spec.clone()).collect()
    }

    pub fn process_id(&self, id: &str) -> Option<u32> {
        travar(&self.sessions).get(id).and_then(|l| l.child.process_id())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trava_envenenada_nao_derruba_o_gerenciador() {
        let m = PtyManager::default();
        let sessoes = Arc::clone(&m.sessions);
        // uma thread entra em pânico segurando a trava
        let _ = std::thread::spawn(move || {
            let _guarda = sessoes.lock().unwrap();
            panic!("pânico de propósito, para envenenar a trava");
        })
        .join();
        assert!(m.sessions.is_poisoned());

        // todas as operações continuam respondendo
        assert!(m.registry().is_empty());
        assert_eq!(m.process_id("nao-existe"), None);
        m.write("nao-existe", b"a");
        m.resize("nao-existe", 80, 24);
        m.kill("nao-existe");
        m.kill_all();
    }
}
