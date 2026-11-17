// Arquivos de configuração que o SynapseIA passa ao Claude por flag (nunca nos arquivos do usuário).
use std::path::Path;

pub const SYSTEM_PROMPT: &str = "Você está rodando dentro do SynapseIA, um app de terminais. Quando precisar de uma resposta ou decisão do usuário, use a ferramenta AskUserQuestion; não termine o turno com uma pergunta em texto. Para criar um agente filho, use a ferramenta criar_agente e depois converse com ele por SendMessage, pelo nome.";

pub const HOOK_EVENTS: &[&str] = &["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Notification", "Stop"];

/// Escreve settings.json e mcp.json em cfg_dir.
pub fn write_cfg(cfg_dir: &Path, agent_exe: &Path) -> std::io::Result<()> {
    use serde_json::{Map, Value, json};
    std::fs::create_dir_all(cfg_dir)?;
    let exe = agent_exe.to_string_lossy().to_string();
    let comando = format!("\"{exe}\" hook");
    let mut hooks = Map::new();
    for ev in HOOK_EVENTS {
        let mut entrada = json!({ "hooks": [{ "type": "command", "command": comando, "timeout": 5 }] });
        if *ev == "PreToolUse" || *ev == "PostToolUse" {
            entrada["matcher"] = json!("*");
        }
        hooks.insert(ev.to_string(), json!([entrada]));
    }
    let settings = json!({ "crossSessionInbound": "accept", "hooks": Value::Object(hooks) });
    let mcp = json!({ "mcpServers": { "synapseia": { "command": exe, "args": ["mcp"] } } });
    let pretty = |v: &Value| serde_json::to_vec_pretty(v).map_err(std::io::Error::other);
    crate::state::write_atomic(&cfg_dir.join("settings.json"), &pretty(&settings)?)?;
    crate::state::write_atomic(&cfg_dir.join("mcp.json"), &pretty(&mcp)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn gera_settings_e_mcp() {
        let d = tempfile::tempdir().unwrap();
        let exe = Path::new(r"C:\Program Files\SynapseIA\synapseia-agent.exe");
        write_cfg(d.path(), exe).unwrap();
        let s: Value = serde_json::from_str(&std::fs::read_to_string(d.path().join("settings.json")).unwrap()).unwrap();
        assert_eq!(s["crossSessionInbound"], "accept");
        for ev in HOOK_EVENTS {
            let cmd = s["hooks"][ev][0]["hooks"][0]["command"].as_str().unwrap();
            assert_eq!(cmd, r#""C:\Program Files\SynapseIA\synapseia-agent.exe" hook"#, "{ev}");
        }
        assert_eq!(s["hooks"]["PreToolUse"][0]["matcher"], "*");
        let m: Value = serde_json::from_str(&std::fs::read_to_string(d.path().join("mcp.json")).unwrap()).unwrap();
        assert_eq!(m["mcpServers"]["synapseia"]["command"], r"C:\Program Files\SynapseIA\synapseia-agent.exe");
        assert_eq!(m["mcpServers"]["synapseia"]["args"], serde_json::json!(["mcp"]));
    }
}
