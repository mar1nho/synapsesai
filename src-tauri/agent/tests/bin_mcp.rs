// Roda o executável de verdade em modo MCP e conversa com ele pelo stdin/stdout.
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};

#[test]
fn executavel_responde_initialize_e_lista_criar_agente() {
    let mut p = Command::new(env!("CARGO_BIN_EXE_synapseia-agent"))
        .arg("mcp")
        .env_remove("SYNAPSEIA_PORT")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut entrada = p.stdin.take().unwrap();
    let mut saida = BufReader::new(p.stdout.take().unwrap());
    let mut linha = String::new();

    writeln!(entrada, r#"{{"jsonrpc":"2.0","id":1,"method":"initialize","params":{{"protocolVersion":"2025-06-18","capabilities":{{}},"clientInfo":{{"name":"t","version":"1"}}}}}}"#).unwrap();
    saida.read_line(&mut linha).unwrap();
    let v: serde_json::Value = serde_json::from_str(&linha).unwrap();
    assert_eq!(v["result"]["serverInfo"]["name"], "synapseia");

    writeln!(entrada, r#"{{"jsonrpc":"2.0","method":"notifications/initialized"}}"#).unwrap();
    writeln!(entrada, r#"{{"jsonrpc":"2.0","id":2,"method":"tools/list"}}"#).unwrap();
    linha.clear();
    saida.read_line(&mut linha).unwrap();
    let v: serde_json::Value = serde_json::from_str(&linha).unwrap();
    assert_eq!(v["id"], 2, "a notificação não pode gerar resposta: {linha}");
    assert_eq!(v["result"]["tools"][0]["name"], "criar_agente");

    drop(entrada);
    assert!(p.wait().unwrap().success());
}

#[test]
fn executavel_hook_sem_app_sai_com_zero() {
    let mut p = Command::new(env!("CARGO_BIN_EXE_synapseia-agent"))
        .arg("hook")
        .env("SYNAPSEIA_PORT", "1")
        .env("SYNAPSEIA_TOKEN", "x")
        .env("SYNAPSEIA_SESSION_ID", "s")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    p.stdin.take().unwrap().write_all(br#"{"hook_event_name":"Stop"}"#).unwrap();
    let out = p.wait_with_output().unwrap();
    assert!(out.status.success());
    assert!(out.stdout.is_empty(), "hook não pode escrever no stdout");
}
