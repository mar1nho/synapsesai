// Integração do PtyManager com processos reais (Windows).
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use synapseia_lib::model::{CommandLine, Kind, Resume, SessionSpec};
use synapseia_lib::pty::{OutputSink, PtyManager};

#[derive(Clone, Default)]
struct Coletor(Arc<Mutex<Vec<u8>>>);
impl OutputSink for Coletor {
    fn send(&self, bytes: Vec<u8>) -> bool {
        self.0.lock().unwrap().extend(bytes);
        true
    }
}
impl Coletor {
    fn texto(&self) -> String {
        String::from_utf8_lossy(&self.0.lock().unwrap()).to_string()
    }
}

fn spec(id: &str, cwd: PathBuf) -> SessionSpec {
    SessionSpec { id: id.into(), name: id.into(), kind: Kind::Cmd, cwd, bypass: false, add_dirs: vec![], parent: None, resume: Resume::New, startup: None }
}

fn cmd(program: &str, args: &[&str], cwd: PathBuf) -> CommandLine {
    CommandLine { program: program.into(), args: args.iter().map(|s| s.to_string()).collect(), cwd, env: vec![("SYNAPSEIA_TESTE".into(), "1".into())] }
}

fn espera(cond: impl Fn() -> bool, max: Duration) -> bool {
    let t = Instant::now();
    while t.elapsed() < max {
        if cond() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    cond()
}

/// O ConPTY abre pedindo a posição do cursor (ESC[6n) e espera a resposta,
/// como o xterm.js faz no app. Aqui o teste responde.
fn responde_dsr(m: &PtyManager, id: &str, c: &Coletor) {
    assert!(espera(|| c.texto().contains("\x1b[6n"), Duration::from_secs(10)), "sem pedido de cursor");
    m.write(id, b"\x1b[1;1R");
}

#[test]
fn echo_chega_na_saida() {
    let m = PtyManager::default();
    let c = Coletor::default();
    let dir = std::env::temp_dir();
    m.spawn(spec("e1", dir.clone()), cmd("cmd.exe", &["/c", "echo synapseia-ok"], dir), 120, 30, c.clone(), |_| {}).unwrap();
    responde_dsr(&m, "e1", &c);
    assert!(espera(|| c.texto().contains("synapseia-ok"), Duration::from_secs(10)), "saída: {}", c.texto());
}

#[test]
fn variaveis_do_claude_nao_vazam() {
    // SAFETY do teste: ambiente do processo de teste
    unsafe { std::env::set_var("CLAUDE_CODE_CHILD_SESSION", "1") };
    let m = PtyManager::default();
    let c = Coletor::default();
    let dir = std::env::temp_dir();
    m.spawn(spec("e2", dir.clone()), cmd("cmd.exe", &["/c", "echo [%CLAUDE_CODE_CHILD_SESSION%][%SYNAPSEIA_TESTE%]"], dir), 120, 30, c.clone(), |_| {})
        .unwrap();
    responde_dsr(&m, "e2", &c);
    assert!(espera(|| c.texto().contains("[%CLAUDE_CODE_CHILD_SESSION%][1]"), Duration::from_secs(10)), "saída: {}", c.texto());
}

#[test]
fn kill_mata_a_arvore() {
    let m = PtyManager::default();
    let c = Coletor::default();
    let dir = std::env::temp_dir();
    // cmd -> ping (neto) que roda para sempre
    m.spawn(spec("k1", dir.clone()), cmd("cmd.exe", &["/c", "ping -t 127.0.0.1"], dir), 120, 30, c.clone(), |_| {}).unwrap();
    responde_dsr(&m, "k1", &c);
    assert!(espera(|| c.texto().contains("127.0.0.1"), Duration::from_secs(10)));
    let pid = m.process_id("k1").expect("pid");
    let filhos = || {
        let mut s = sysinfo::System::new();
        s.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        s.processes().values().filter(|p| p.parent().map(|pp| pp.as_u32()) == Some(pid)).count()
    };
    assert!(filhos() > 0, "ping deveria ser filho do cmd");
    m.kill("k1");
    assert!(espera(|| filhos() == 0, Duration::from_secs(3)), "sobrou processo filho");
    assert!(m.registry().iter().all(|s| s.id != "k1"));
}

#[test]
fn pasta_inexistente_da_erro() {
    let m = PtyManager::default();
    let dir = PathBuf::from(r"C:\nao\existe\synapseia");
    let r = m.spawn(spec("x1", dir.clone()), cmd("cmd.exe", &[], dir), 80, 24, Coletor::default(), |_| {});
    assert!(r.unwrap_err().contains("pasta não encontrada"));
}
