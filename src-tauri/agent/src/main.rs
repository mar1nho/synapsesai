// Ponto de entrada do sidecar: `synapseia-agent hook` ou `synapseia-agent mcp`.
use std::io::{BufRead, Read, Write};
use synapseia_agent::{handle_mcp_line, run_hook, Env};

fn main() {
    let env = Env::from_process();
    match std::env::args().nth(1).as_deref() {
        Some("hook") => {
            let mut corpo = String::new();
            let _ = std::io::stdin().read_to_string(&mut corpo);
            run_hook(&corpo, &env);
        }
        Some("mcp") => {
            let stdin = std::io::stdin();
            let mut out = std::io::stdout();
            for linha in stdin.lock().lines() {
                let Ok(linha) = linha else { break };
                if linha.trim().is_empty() {
                    continue;
                }
                if let Some(resp) = handle_mcp_line(&linha, &env) {
                    let _ = writeln!(out, "{resp}");
                    let _ = out.flush();
                }
            }
        }
        _ => eprintln!("uso: synapseia-agent hook|mcp"),
    }
}
