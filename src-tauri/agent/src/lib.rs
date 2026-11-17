// Sidecar do SynapseIA. Dois modos:
//   hook -> repassa o JSON do hook do Claude Code ao app (sempre sai com 0, rápido)
//   mcp  -> servidor MCP stdio com a ferramenta criar_agente
use serde_json::{json, Value};
use std::time::Duration;

pub const ERRO_SEM_APP: &str = "O SynapseIA não está rodando; não dá para criar agentes agora.";

/// Variáveis que o app injeta em toda sessão.
#[derive(Clone, Debug, Default)]
pub struct Env {
    pub port: Option<u16>,
    pub token: Option<String>,
    pub session_id: Option<String>,
}

impl Env {
    pub fn from_process() -> Self {
        Env {
            port: std::env::var("SYNAPSEIA_PORT").ok().and_then(|p| p.parse().ok()),
            token: std::env::var("SYNAPSEIA_TOKEN").ok(),
            session_id: std::env::var("SYNAPSEIA_SESSION_ID").ok(),
        }
    }
}

/// Modo hook: POST /hook?sid=<id> com o corpo recebido. Nunca falha.
pub fn run_hook(body: &str, env: &Env) {
    let Some(sid) = env.session_id.as_deref() else { return };
    let _ = post(env, &format!("/hook?sid={sid}"), body, Duration::from_millis(2000));
}

/// Modo MCP: trata uma linha JSON-RPC; devolve a resposta (None para notificações).
pub fn handle_mcp_line(line: &str, env: &Env) -> Option<String> {
    let req: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return Some(json!({"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"JSON inválido"}}).to_string()),
    };
    let id = req.get("id").cloned()?; // sem id = notificação
    let method = req.get("method").and_then(Value::as_str).unwrap_or("");
    let result = match method {
        "initialize" => {
            let versao = req.pointer("/params/protocolVersion").and_then(Value::as_str).unwrap_or("2025-06-18");
            json!({
                "protocolVersion": versao,
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "synapseia", "version": env!("CARGO_PKG_VERSION") }
            })
        }
        "ping" => json!({}),
        "tools/list" => tools_list(),
        "tools/call" => call_tool(req.get("params").unwrap_or(&Value::Null), env),
        _ => return Some(json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":format!("método desconhecido: {method}")}}).to_string()),
    };
    Some(json!({"jsonrpc":"2.0","id":id,"result":result}).to_string())
}

fn texto(t: &str, erro: bool) -> Value {
    json!({ "content": [{ "type": "text", "text": t }], "isError": erro })
}

fn call_tool(params: &Value, env: &Env) -> Value {
    if params.get("name").and_then(Value::as_str) != Some("criar_agente") {
        return texto("Ferramenta desconhecida.", true);
    }
    let a = params.get("arguments").cloned().unwrap_or(Value::Null);
    let nome = a.get("nome").and_then(Value::as_str).unwrap_or("").trim().to_string();
    let papel = a.get("papel").and_then(Value::as_str).unwrap_or("").trim().to_string();
    if nome.is_empty() || papel.is_empty() {
        return texto("Informe nome e papel.", true);
    }
    let Some(pai) = env.session_id.clone() else { return texto(ERRO_SEM_APP, true) };
    let corpo = json!({ "parentId": pai, "nome": nome, "papel": papel }).to_string();
    match post(env, "/spawn", &corpo, Duration::from_secs(15)) {
        Ok((200, t)) => texto(&t, false),
        Ok((_, t)) => texto(&t, true),
        Err(_) => texto(ERRO_SEM_APP, true),
    }
}

fn post(env: &Env, path: &str, body: &str, timeout: Duration) -> Result<(u16, String), String> {
    let (Some(port), Some(token)) = (env.port, env.token.as_deref()) else { return Err("sem app".into()) };
    let agent = ureq::AgentBuilder::new().timeout(timeout).build();
    let r = agent.post(&format!("http://127.0.0.1:{port}{path}")).set("X-SynapseIA-Token", token).set("Content-Type", "application/json").send_string(body);
    match r {
        Ok(resp) => {
            let code = resp.status();
            Ok((code, resp.into_string().unwrap_or_default()))
        }
        Err(ureq::Error::Status(code, resp)) => Ok((code, resp.into_string().unwrap_or_default())),
        Err(e) => Err(e.to_string()),
    }
}

fn tools_list() -> Value {
    json!({ "tools": [{
        "name": "criar_agente",
        "description": "Cria um agente Claude filho no SynapseIA, numa pasta própria com o papel dado. Depois converse com ele usando SendMessage pelo nome.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "nome": { "type": "string", "description": "Nome único do agente (é o endereço dele no SendMessage)." },
                "papel": { "type": "string", "description": "O papel do agente, em Markdown: o que ele faz e como trabalha." }
            },
            "required": ["nome", "papel"]
        }
    }]})
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc;

    /// Servidor HTTP mínimo de teste: guarda (linha de requisição, cabeçalhos, corpo) e responde `resposta`.
    fn servidor(resposta: &'static str) -> (u16, mpsc::Receiver<(String, String)>) {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            s.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
            let mut buf = Vec::new();
            let mut tmp = [0u8; 4096];
            loop {
                let n = s.read(&mut tmp).unwrap_or(0);
                if n == 0 {
                    break;
                }
                buf.extend_from_slice(&tmp[..n]);
                let t = String::from_utf8_lossy(&buf).to_string();
                if let Some(p) = t.find("\r\n\r\n") {
                    let cl = t
                        .lines()
                        .find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse::<usize>().unwrap_or(0)))
                        .unwrap_or(0);
                    if buf.len() >= p + 4 + cl {
                        break;
                    }
                }
            }
            let t = String::from_utf8_lossy(&buf).to_string();
            let (cab, corpo) = t.split_once("\r\n\r\n").unwrap_or((&t, ""));
            tx.send((cab.to_string(), corpo.to_string())).unwrap();
            let r = format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", resposta.len(), resposta);
            let _ = s.write_all(r.as_bytes());
        });
        (port, rx)
    }

    fn env(port: u16) -> Env {
        Env { port: Some(port), token: Some("tok".into()), session_id: Some("s1".into()) }
    }

    #[test]
    fn hook_repasse_corpo_e_token() {
        let (port, rx) = servidor("ok");
        run_hook(r#"{"hook_event_name":"Stop"}"#, &env(port));
        let (cab, corpo) = rx.recv_timeout(Duration::from_secs(3)).unwrap();
        assert!(cab.starts_with("POST /hook?sid=s1 "), "{cab}");
        assert!(cab.to_ascii_lowercase().contains("x-synapseia-token: tok"));
        assert_eq!(corpo, r#"{"hook_event_name":"Stop"}"#);
    }

    #[test]
    fn hook_sem_app_volta_rapido() {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        drop(l); // ninguém escuta
        let t = std::time::Instant::now();
        run_hook("{}", &env(port));
        assert!(t.elapsed() < Duration::from_millis(2500));
        run_hook("{}", &Env::default()); // sem variáveis: não faz nada
    }

    #[test]
    fn mcp_initialize_e_lista() {
        let r: Value = serde_json::from_str(&handle_mcp_line(r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}"#, &Env::default()).unwrap()).unwrap();
        assert_eq!(r["id"], 1);
        assert_eq!(r["result"]["protocolVersion"], "2025-06-18");
        assert!(r["result"]["capabilities"]["tools"].is_object());
        assert!(handle_mcp_line(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#, &Env::default()).is_none());
        let r: Value = serde_json::from_str(&handle_mcp_line(r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#, &Env::default()).unwrap()).unwrap();
        let t = &r["result"]["tools"][0];
        assert_eq!(t["name"], "criar_agente");
        assert_eq!(t["inputSchema"]["required"], json!(["nome", "papel"]));
    }

    #[test]
    fn mcp_criar_agente_sem_app() {
        let r: Value = serde_json::from_str(
            &handle_mcp_line(
                r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"criar_agente","arguments":{"nome":"A","papel":"x"}}}"#,
                &Env::default(),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(r["result"]["isError"], true);
        assert_eq!(r["result"]["content"][0]["text"], ERRO_SEM_APP);
    }

    #[test]
    fn mcp_criar_agente_repasse_ao_app() {
        let (port, rx) = servidor("Agente \"A\" criado.");
        let r: Value = serde_json::from_str(
            &handle_mcp_line(
                r#"{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"criar_agente","arguments":{"nome":"A","papel":"faz x"}}}"#,
                &env(port),
            )
            .unwrap(),
        )
        .unwrap();
        let (cab, corpo) = rx.recv_timeout(Duration::from_secs(3)).unwrap();
        assert!(cab.starts_with("POST /spawn "));
        let c: Value = serde_json::from_str(&corpo).unwrap();
        assert_eq!(c, json!({"parentId":"s1","nome":"A","papel":"faz x"}));
        assert_eq!(r["result"]["content"][0]["text"], "Agente \"A\" criado.");
    }
}
