// Tela Ambiente: verifica e instala o que o SynapseIA precisa.
use serde::Serialize;

pub type Version = (u32, u32, u32);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EnvStatus {
    Ok,
    Old,
    Missing,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvItem {
    pub key: String,
    pub label: String,
    pub required: bool,
    pub status: EnvStatus,
    pub version: Option<String>,
    pub install: Option<String>,
    pub update: Option<String>,
}

/// Primeira sequência N.N.N do texto.
pub fn parse_version(s: &str) -> Option<Version> {
    let b = s.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if b[i].is_ascii_digit() && (i == 0 || !b[i - 1].is_ascii_digit()) {
            let mut nums = Vec::new();
            let mut j = i;
            loop {
                let ini = j;
                while j < b.len() && b[j].is_ascii_digit() {
                    j += 1;
                }
                if j == ini {
                    break;
                }
                nums.push(s[ini..j].parse::<u32>().ok()?);
                if nums.len() == 3 || j >= b.len() || b[j] != b'.' {
                    break;
                }
                j += 1;
            }
            if nums.len() == 3 {
                return Some((nums[0], nums[1], nums[2]));
            }
            i = j.max(i + 1);
        } else {
            i += 1;
        }
    }
    None
}

pub fn classify(found: Option<Version>, min: Option<Version>) -> EnvStatus {
    match (found, min) {
        (None, _) => EnvStatus::Missing,
        (Some(v), Some(m)) if v < m => EnvStatus::Old,
        _ => EnvStatus::Ok,
    }
}

struct Spec {
    key: &'static str,
    label: &'static str,
    required: bool,
    min: Option<Version>,
    install: &'static str,
    update: Option<&'static str>,
}

const ITENS: &[Spec] = &[
    Spec { key: "git", label: "Git for Windows", required: true, min: None, install: "winget install --id Git.Git -e", update: None },
    // instalação pelo winget (pacote assinado), nunca por script baixado e executado na hora
    Spec {
        key: "claude",
        label: "Claude Code",
        required: true,
        min: Some((2, 1, 234)),
        install: "winget install --id Anthropic.ClaudeCode -e",
        update: Some("claude update"),
    },
    Spec { key: "fnm", label: "fnm (gerenciador do Node)", required: false, min: None, install: "winget install --id Schniz.fnm -e", update: None },
    Spec { key: "node", label: "Node.js", required: false, min: None, install: "fnm install --lts", update: None },
    // o npm roda dentro do Node padrão do fnm, como a checagem acima
    Spec { key: "codex", label: "Codex CLI", required: false, min: None, install: "fnm exec --using=default npm install -g @openai/codex", update: None },
    Spec {
        key: "gemini",
        label: "Gemini CLI",
        required: false,
        min: None,
        install: "fnm exec --using=default npm install -g @google/gemini-cli",
        update: None,
    },
];

/// Programa e argumentos da checagem de cada item (sem PowerShell).
pub fn check_cmd(key: &str) -> (String, Vec<String>) {
    let v = |a: &[&str]| a.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    match key {
        // programas que o fnm gerencia: roda com o Node padrão do fnm
        "node" => ("fnm".into(), v(&["exec", "--using=default", "node", "--version"])),
        "codex" | "gemini" => ("fnm".into(), v(&["exec", "--using=default", "cmd", "/c", key, "--version"])),
        // executáveis comuns no PATH
        outro => (outro.into(), v(&["--version"])),
    }
}

/// Primeira versão N.N.N encontrada na saída.
pub fn version_in_output(out: &str) -> Option<Version> {
    out.lines().find_map(parse_version)
}

/// Roda o executável direto (sem janela), com limite de 30 s; devolve a saída padrão.
fn run_version(key: &str) -> Option<String> {
    use std::io::Read;
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let (prog, args) = check_cmd(key);
    let mut child = Command::new(prog).args(args).stdout(Stdio::piped()).stderr(Stdio::null()).creation_flags(CREATE_NO_WINDOW).spawn().ok()?;
    // lê a saída numa thread para o processo nunca travar com o pipe cheio
    let mut stdout = child.stdout.take()?;
    let leitor = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = stdout.read_to_string(&mut s);
        s
    });
    let inicio = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(st)) if st.success() => break,
            Ok(Some(_)) => return None,
            Ok(None) if inicio.elapsed() > std::time::Duration::from_secs(30) => {
                let _ = child.kill();
                return None;
            }
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(50)),
            Err(_) => return None,
        }
    }
    leitor.join().ok()
}

/// Verifica todos os itens em paralelo.
pub fn check_all() -> Vec<EnvItem> {
    let handles: Vec<_> = ITENS.iter().map(|s| std::thread::spawn(move || (s, run_version(s.key)))).collect();
    handles
        .into_iter()
        .filter_map(|h| h.join().ok())
        .map(|(s, saida)| {
            let ver = saida.as_deref().and_then(version_in_output);
            let status = classify(ver, s.min);
            EnvItem {
                key: s.key.into(),
                label: s.label.into(),
                required: s.required,
                status,
                version: ver.map(|(a, b, c)| format!("{a}.{b}.{c}")),
                install: Some(s.install.into()),
                update: s.update.map(str::to_string),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versoes() {
        assert_eq!(parse_version("2.1.317 (Claude Code)"), Some((2, 1, 317)));
        assert_eq!(parse_version("codex-cli 0.142.4"), Some((0, 142, 4)));
        assert_eq!(parse_version("git version 2.53.0.windows.1"), Some((2, 53, 0)));
        assert_eq!(parse_version("v24.14.0"), Some((24, 14, 0)));
        assert_eq!(parse_version("lixo"), None);
    }

    #[test]
    fn checagem_chama_executavel_direto_sem_powershell() {
        // PowerShell leva ~6 s para abrir nesta máquina: a checagem não pode depender dele
        assert_eq!(check_cmd("claude"), ("claude".to_string(), vec!["--version".to_string()]));
        assert_eq!(check_cmd("git"), ("git".to_string(), vec!["--version".to_string()]));
        assert_eq!(check_cmd("fnm"), ("fnm".to_string(), vec!["--version".to_string()]));
        assert_eq!(check_cmd("node").0, "fnm");
        assert_eq!(check_cmd("node").1, vec!["exec", "--using=default", "node", "--version"]);
        assert_eq!(check_cmd("codex").1, vec!["exec", "--using=default", "cmd", "/c", "codex", "--version"]);
        assert_eq!(check_cmd("gemini").1, vec!["exec", "--using=default", "cmd", "/c", "gemini", "--version"]);
    }

    #[test]
    fn versao_em_qualquer_linha_da_saida() {
        assert_eq!(version_in_output("Using Node v24.14.0\n0.59.0\n"), Some((24, 14, 0)));
        assert_eq!(version_in_output("\n\n2.1.319 (Claude Code)\n"), Some((2, 1, 319)));
        assert_eq!(version_in_output(""), None);
    }

    /// Checagem real desta máquina: `cargo test --lib ambiente_real -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn ambiente_real() {
        let t = std::time::Instant::now();
        let itens = check_all();
        for i in &itens {
            println!("{:<8} {:?} {:?}", i.key, i.status, i.version);
        }
        println!("tempo: {:?}", t.elapsed());
        assert_eq!(itens.iter().find(|i| i.key == "claude").unwrap().status, EnvStatus::Ok);
        assert!(t.elapsed() < std::time::Duration::from_secs(20));
    }

    #[test]
    fn instalacao_nao_baixa_e_executa_script() {
        for s in ITENS {
            let cmd = s.install.to_lowercase();
            for proibido in ["iex", "invoke-expression", "irm ", "invoke-restmethod", "invoke-webrequest", "http://", "https://"] {
                assert!(!cmd.contains(proibido), "{}: {}", s.key, s.install);
            }
        }
    }

    #[test]
    fn classificacao() {
        assert_eq!(classify(Some((2, 1, 233)), Some((2, 1, 234))), EnvStatus::Old);
        assert_eq!(classify(Some((2, 1, 234)), Some((2, 1, 234))), EnvStatus::Ok);
        assert_eq!(classify(Some((0, 59, 0)), None), EnvStatus::Ok);
        assert_eq!(classify(None, None), EnvStatus::Missing);
    }
}
