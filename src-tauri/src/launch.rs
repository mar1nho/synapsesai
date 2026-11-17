// Monta a linha de comando de cada tipo de sessão.
// Os agentes são iniciados direto pelo ConPTY, com os argumentos em lista: não há PowerShell
// no meio nem comando codificado, e o que roda fica visível, em texto, na linha de comando do processo.
use crate::model::{CommandLine, Kind, LaunchCtx, Resume, SessionSpec};
use std::path::{Path, PathBuf};

/// Programas externos encontrados no PATH (caminho completo do .exe).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Programs {
    pub claude: Option<PathBuf>,
    pub fnm: Option<PathBuf>,
}

impl Programs {
    pub fn detect() -> Self {
        Programs { claude: find_exe("claude"), fnm: find_exe("fnm") }
    }
}

/// Procura `<name>.exe` nas pastas do PATH.
pub fn find_exe(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    find_exe_in(name, std::env::split_paths(&path))
}

/// Entradas vazias do PATH são ignoradas: elas significariam "a pasta atual".
pub fn find_exe_in(name: &str, dirs: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    let arquivo = format!("{name}.exe");
    dirs.into_iter().filter(|d| !d.as_os_str().is_empty()).map(|d| d.join(&arquivo)).find(|p| p.is_file())
}

/// Variáveis herdadas que precisam sair do ambiente da sessão
/// (senão o Claude vira "sessão filha" e some da conversa entre agentes).
pub fn vars_to_remove<'a>(names: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    names
        .into_iter()
        .filter(|n| {
            let u = n.to_ascii_uppercase();
            (u == "CLAUDECODE" || u == "CLAUDE_PID" || u.starts_with("CLAUDE_CODE_")) && u != "CLAUDE_CODE_GIT_BASH_PATH"
        })
        .map(str::to_string)
        .collect()
}

fn texto(p: &Path) -> String {
    p.to_string_lossy().to_string()
}

fn claude_args(spec: &SessionSpec, ctx: &LaunchCtx) -> Vec<String> {
    let mut a: Vec<String> = vec![
        "--name".into(),
        spec.name.clone(),
        "--settings".into(),
        texto(&ctx.cfg_dir.join("settings.json")),
        "--mcp-config".into(),
        texto(&ctx.cfg_dir.join("mcp.json")),
        "--append-system-prompt".into(),
        ctx.system_prompt.clone(),
    ];
    if spec.bypass {
        a.push("--dangerously-skip-permissions".into());
    }
    for d in &spec.add_dirs {
        a.push("--add-dir".into());
        a.push(texto(d));
    }
    match &spec.resume {
        Resume::New => {}
        Resume::ClaudeId(id) => {
            a.push("--resume".into());
            a.push(id.clone());
        }
        Resume::Continue => a.push("--continue".into()),
    }
    a
}

/// Codex e Gemini: nome do programa seguido só de opções fixas (nenhum texto do usuário).
fn node_cli_args(spec: &SessionSpec) -> Vec<String> {
    let mut a: Vec<String> = Vec::new();
    match spec.kind {
        Kind::Codex => {
            a.push("codex".into());
            if spec.resume != Resume::New {
                a.extend(["resume".to_string(), "--last".to_string()]);
            }
            if spec.bypass {
                a.push("--dangerously-bypass-approvals-and-sandbox".into());
            }
        }
        Kind::Gemini => {
            a.push("gemini".into());
            if spec.bypass {
                a.push("--yolo".into());
            }
            if spec.resume != Resume::New {
                a.extend(["--resume".to_string(), "latest".to_string()]);
            }
        }
        _ => unreachable!("só Codex e Gemini são CLIs do npm"),
    }
    a
}

/// Codex e Gemini são scripts do npm (.cmd), então rodam pelo cmd.exe.
/// Com o fnm instalado, rodam dentro do Node padrão dele (`fnm exec`), como na tela Ambiente.
fn node_cli(cli: Vec<String>, progs: &Programs) -> (String, Vec<String>) {
    match &progs.fnm {
        Some(fnm) => {
            let mut a: Vec<String> = ["exec", "--using=default", "cmd", "/c"].iter().map(|s| s.to_string()).collect();
            a.extend(cli);
            (texto(fnm), a)
        }
        None => {
            let mut a = vec!["/c".to_string()];
            a.extend(cli);
            ("cmd.exe".to_string(), a)
        }
    }
}

pub fn build_command(spec: &SessionSpec, ctx: &LaunchCtx, progs: &Programs) -> CommandLine {
    let env = vec![
        ("SYNAPSEIA_SESSION_ID".to_string(), spec.id.clone()),
        ("SYNAPSEIA_PORT".to_string(), ctx.port.to_string()),
        ("SYNAPSEIA_TOKEN".to_string(), ctx.token.clone()),
    ];
    let (program, args) = match spec.kind {
        // comando de instalação da tela Ambiente: PowerShell visível, com o comando em texto
        Kind::Ps => match &spec.startup {
            Some(cmd) => ("powershell.exe".to_string(), vec!["-NoLogo".to_string(), "-NoExit".to_string(), "-Command".to_string(), cmd.clone()]),
            None => ("powershell.exe".to_string(), vec!["-NoLogo".to_string()]),
        },
        Kind::Cmd => ("cmd.exe".to_string(), vec![]),
        Kind::Claude => (progs.claude.as_deref().map(texto).unwrap_or_else(|| "claude".to_string()), claude_args(spec, ctx)),
        Kind::Codex | Kind::Gemini => node_cli(node_cli_args(spec), progs),
    };
    CommandLine { program, args, cwd: spec.cwd.clone(), env }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    fn ctx() -> LaunchCtx {
        LaunchCtx {
            cfg_dir: PathBuf::from(r"C:\Users\u\AppData\Roaming\SynapseIA\claude"),
            port: 4321,
            token: "tok".into(),
            system_prompt: "Use AskUserQuestion.".into(),
        }
    }

    fn spec(kind: Kind, name: &str, cwd: &str, bypass: bool, add_dirs: Vec<PathBuf>, resume: Resume) -> SessionSpec {
        SessionSpec { id: "s1".into(), name: name.into(), kind, cwd: PathBuf::from(cwd), bypass, add_dirs, parent: None, resume, startup: None }
    }

    fn progs() -> Programs {
        Programs { claude: Some(PathBuf::from(r"C:\Users\u\.local\bin\claude.exe")), fnm: Some(PathBuf::from(r"C:\fnm\fnm.exe")) }
    }

    fn strs(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn remove_variaveis_herdadas_do_claude() {
        let r = vars_to_remove(["PATH", "CLAUDECODE", "CLAUDE_PID", "CLAUDE_CODE_CHILD_SESSION", "CLAUDE_CODE_GIT_BASH_PATH", "CLAUDE_CODE_MESSAGING_SOCKET"]);
        assert_eq!(r, vec!["CLAUDECODE", "CLAUDE_PID", "CLAUDE_CODE_CHILD_SESSION", "CLAUDE_CODE_MESSAGING_SOCKET"]);
    }

    #[test]
    fn acha_exe_no_path_e_ignora_entrada_vazia() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join("claude.exe"), "").unwrap();
        std::fs::write(d.path().join("codex.cmd"), "").unwrap();
        let dirs = || vec![PathBuf::new(), PathBuf::from(r"C:\nao\existe"), d.path().to_path_buf()];
        assert_eq!(find_exe_in("claude", dirs()), Some(d.path().join("claude.exe")));
        // só .exe conta: script .cmd não é iniciado direto
        assert_eq!(find_exe_in("codex", dirs()), None);
    }

    #[test]
    fn claude_roda_direto_com_argumentos_em_lista() {
        let s = spec(Kind::Claude, "Revenue Hub", r"C:\Docs\0050 - Pasta & Cia", true, vec![r"C:\Vault\projeto-ia".into()], Resume::ClaudeId("abc-1".into()));
        let c = build_command(&s, &ctx(), &progs());
        assert_eq!(c.program, r"C:\Users\u\.local\bin\claude.exe");
        assert_eq!(
            c.args,
            strs(&[
                "--name",
                "Revenue Hub",
                "--settings",
                r"C:\Users\u\AppData\Roaming\SynapseIA\claude\settings.json",
                "--mcp-config",
                r"C:\Users\u\AppData\Roaming\SynapseIA\claude\mcp.json",
                "--append-system-prompt",
                "Use AskUserQuestion.",
                "--dangerously-skip-permissions",
                "--add-dir",
                r"C:\Vault\projeto-ia",
                "--resume",
                "abc-1",
            ])
        );
        assert_eq!(c.cwd, PathBuf::from(r"C:\Docs\0050 - Pasta & Cia"));
        assert!(c.env.contains(&("SYNAPSEIA_SESSION_ID".into(), "s1".into())));
        assert!(c.env.contains(&("SYNAPSEIA_PORT".into(), "4321".into())));
        assert!(c.env.contains(&("SYNAPSEIA_TOKEN".into(), "tok".into())));
    }

    #[test]
    fn claude_nome_com_apostrofo_sem_bypass_continue() {
        // o nome vai inteiro num argumento só: aspas e espaços não precisam de tratamento
        let s = spec(Kind::Claude, "Análise d'Água \"v2\"", r"C:\x", false, vec![], Resume::Continue);
        let c = build_command(&s, &ctx(), &progs());
        assert_eq!(&c.args[..2], &strs(&["--name", "Análise d'Água \"v2\""])[..]);
        assert!(!c.args.contains(&"--dangerously-skip-permissions".to_string()));
        assert_eq!(c.args.last().unwrap(), "--continue");
    }

    #[test]
    fn claude_novo_sem_resume() {
        let s = spec(Kind::Claude, "Orq", r"C:\x", true, vec![], Resume::New);
        let c = build_command(&s, &ctx(), &progs());
        assert!(!c.args.iter().any(|a| a == "--resume" || a == "--continue"));
    }

    #[test]
    fn claude_fora_do_path_usa_o_nome() {
        let s = spec(Kind::Claude, "Orq", r"C:\x", false, vec![], Resume::New);
        assert_eq!(build_command(&s, &ctx(), &Programs::default()).program, "claude");
    }

    #[test]
    fn nenhum_agente_usa_powershell_nem_comando_codificado() {
        for kind in [Kind::Claude, Kind::Codex, Kind::Gemini] {
            for p in [progs(), Programs::default()] {
                let c = build_command(&spec(kind, "A", r"C:\x", true, vec![], Resume::Continue), &ctx(), &p);
                assert!(!c.program.to_lowercase().contains("powershell"), "{kind:?}: {}", c.program);
                assert!(
                    !c.args.iter().any(|a| a.eq_ignore_ascii_case("-EncodedCommand") || a.to_lowercase().contains("invoke-expression")),
                    "{kind:?}: {:?}",
                    c.args
                );
            }
        }
    }

    #[test]
    fn codex_com_fnm() {
        let s = spec(Kind::Codex, "Codex", r"C:\x", true, vec![], Resume::Continue);
        let c = build_command(&s, &ctx(), &progs());
        assert_eq!(c.program, r"C:\fnm\fnm.exe");
        assert_eq!(c.args, strs(&["exec", "--using=default", "cmd", "/c", "codex", "resume", "--last", "--dangerously-bypass-approvals-and-sandbox"]));
    }

    #[test]
    fn codex_novo_sem_bypass_e_sem_fnm() {
        let s = spec(Kind::Codex, "Codex", r"C:\x", false, vec![], Resume::New);
        let c = build_command(&s, &ctx(), &Programs::default());
        assert_eq!((c.program.as_str(), c.args), ("cmd.exe", strs(&["/c", "codex"])));
    }

    #[test]
    fn gemini_novo_e_continue() {
        let s = spec(Kind::Gemini, "G", r"C:\x", true, vec![], Resume::New);
        assert_eq!(build_command(&s, &ctx(), &progs()).args, strs(&["exec", "--using=default", "cmd", "/c", "gemini", "--yolo"]));
        let s = spec(Kind::Gemini, "G", r"C:\x", false, vec![], Resume::Continue);
        assert_eq!(build_command(&s, &ctx(), &Programs::default()).args, strs(&["/c", "gemini", "--resume", "latest"]));
    }

    #[test]
    fn ps_e_cmd() {
        let c = build_command(&spec(Kind::Ps, "P", r"C:\x", false, vec![], Resume::New), &ctx(), &progs());
        assert_eq!((c.program.as_str(), c.args.clone()), ("powershell.exe", vec!["-NoLogo".to_string()]));
        let c = build_command(&spec(Kind::Cmd, "C", r"C:\x", false, vec![], Resume::New), &ctx(), &progs());
        assert_eq!(c.program, "cmd.exe");
        assert!(c.args.is_empty());
    }

    #[test]
    fn ps_com_startup_vai_em_texto() {
        let mut s = spec(Kind::Ps, "Instalação", r"C:\x", false, vec![], Resume::New);
        s.startup = Some("winget install --id Git.Git -e".into());
        let c = build_command(&s, &ctx(), &progs());
        assert_eq!(c.args, strs(&["-NoLogo", "-NoExit", "-Command", "winget install --id Git.Git -e"]));
    }
}
