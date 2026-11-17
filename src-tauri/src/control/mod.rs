// Servidor de controle local (127.0.0.1, porta do sistema, token por execução):
//   POST /hook?sid=<id>  -> status da sessão (hooks do Claude Code)
//   POST /spawn          -> criar_agente
pub mod hooks;

use crate::commands::AppCtx;
use crate::spawn::{SpawnError, prepare_child};
use serde::Deserialize;
use std::io::Read;
use tauri::{AppHandle, Emitter, Manager};

pub const TOKEN_HEADER: &str = "X-SynapseIA-Token";

/// Token de 32 caracteres hex (128 bits) tirado do gerador aleatório do sistema.
pub fn new_token() -> String {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).expect("gerador aleatório do sistema indisponível");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Compara o token sem parar no primeiro byte diferente (o tempo não revela quantos acertaram).
pub fn token_ok(recebido: &str, esperado: &str) -> bool {
    let (a, b) = (recebido.as_bytes(), esperado.as_bytes());
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusEv {
    id: String,
    status: hooks::HookStatus,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeIdEv {
    id: String,
    claude_session_id: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct MessageEv {
    id: String,
    to: String,
    preview: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpawnReq {
    parent_id: String,
    nome: String,
    papel: String,
}

/// Abre o servidor numa thread própria e devolve a porta.
pub fn start(app: AppHandle, token: String) -> std::io::Result<u16> {
    let server = tiny_http::Server::http("127.0.0.1:0").map_err(std::io::Error::other)?;
    let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);
    std::thread::spawn(move || {
        for mut req in server.incoming_requests() {
            let ok_token = req.headers().iter().any(|h| h.field.equiv(TOKEN_HEADER) && token_ok(h.value.as_str(), &token));
            if !ok_token {
                let _ = req.respond(tiny_http::Response::from_string("token inválido").with_status_code(401));
                continue;
            }
            let mut corpo = String::new();
            let _ = req.as_reader().take(4 * 1024 * 1024).read_to_string(&mut corpo);
            let url = req.url().to_string();
            let (code, texto) = if url.starts_with("/hook") {
                handle_hook(&app, &url, &corpo)
            } else if url == "/spawn" {
                handle_spawn(&app, &corpo)
            } else {
                (404, "rota desconhecida".to_string())
            };
            let _ = req.respond(tiny_http::Response::from_string(texto).with_status_code(code));
        }
    });
    Ok(port)
}

/// Lê o id da sessão de "/hook?sid=<id>[&...]".
pub fn parse_sid(url: &str) -> Option<String> {
    let (_, q) = url.split_once('?')?;
    q.split('&').find_map(|par| par.strip_prefix("sid=")).filter(|s| !s.is_empty()).map(str::to_string)
}

fn handle_hook(app: &AppHandle, url: &str, corpo: &str) -> (u16, String) {
    let Some(sid) = parse_sid(url) else { return (400, "sem sid".into()) };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(corpo) else { return (400, "json inválido".into()) };
    if let Some(ef) = hooks::map_event(&v) {
        if let Some(m) = ef.message {
            let _ = app.emit("session://message", MessageEv { id: sid.clone(), to: m.to, preview: m.preview });
        }
        if let Some(cid) = ef.claude_session_id {
            let _ = app.emit("session://claude-id", ClaudeIdEv { id: sid.clone(), claude_session_id: cid });
        }
        if let Some(st) = ef.status {
            let _ = app.emit("session://status", StatusEv { id: sid, status: st });
        }
    }
    (200, "ok".into())
}

fn handle_spawn(app: &AppHandle, corpo: &str) -> (u16, String) {
    let Ok(r) = serde_json::from_str::<SpawnReq>(corpo) else { return (400, "Pedido inválido.".into()) };
    let ctx = app.state::<AppCtx>();
    let vivas = ctx.pty.registry();
    let Some(pai) = vivas.iter().find(|s| s.id == r.parent_id) else {
        return (404, "Sessão de origem não encontrada no SynapseIA.".into());
    };
    let nomes: Vec<String> = vivas.iter().map(|s| s.name.clone()).collect();
    match prepare_child(pai, &r.nome, &r.papel, &nomes, &new_token()) {
        Ok(filho) => {
            let msg = format!("Agente \"{}\" criado em {}. Fale com ele por SendMessage usando o nome \"{}\".", filho.name, filho.cwd.display(), filho.name);
            let _ = app.emit("session://spawn", filho);
            (200, msg)
        }
        Err(SpawnError::NameTaken) => (409, format!("Já existe uma sessão chamada \"{}\". Escolha outro nome.", r.nome.trim())),
        Err(SpawnError::Io(e)) => {
            log::error!("spawn: {e}");
            (500, format!("Não consegui criar a pasta do agente: {e}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sid_da_url() {
        assert_eq!(parse_sid("/hook?sid=abc-1").as_deref(), Some("abc-1"));
        assert_eq!(parse_sid("/hook?sid=abc&x=1").as_deref(), Some("abc"));
        assert_eq!(parse_sid("/hook?x=1&sid=z").as_deref(), Some("z"));
        assert_eq!(parse_sid("/hook"), None);
        assert_eq!(parse_sid("/hook?sid="), None);
    }

    #[test]
    fn token_tem_32_hex_e_muda() {
        let a = new_token();
        assert_eq!(a.len(), 32);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, new_token());
    }

    #[test]
    fn token_so_passa_se_for_igual() {
        assert!(token_ok("abc123", "abc123"));
        assert!(!token_ok("abc124", "abc123"));
        assert!(!token_ok("abc12", "abc123"));
        assert!(!token_ok("", "abc123"));
    }
}
