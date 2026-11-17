// Traduz o JSON dos hooks do Claude Code em status da sessão.
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum HookStatus {
    Run,
    Idle,
    Wait,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HookEffect {
    pub status: Option<HookStatus>,
    pub claude_session_id: Option<String>,
    /// Mensagem enviada a outra sessão (SendMessage): destino e começo do texto.
    pub message: Option<MessageOut>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct MessageOut {
    pub to: String,
    pub preview: String,
}

/// Destino e prévia (até 140 caracteres, primeira linha) de um SendMessage.
pub fn message_of(payload: &Value) -> Option<MessageOut> {
    if payload.get("tool_name").and_then(Value::as_str) != Some("SendMessage") {
        return None;
    }
    let input = payload.get("tool_input")?;
    let bruto = input.get("to").and_then(Value::as_str)?.trim();
    // "nome [ref]" -> "nome"
    let to = match bruto.rfind(" [") {
        Some(i) if bruto.ends_with(']') => &bruto[..i],
        _ => bruto,
    };
    let texto = input.get("message").and_then(Value::as_str).unwrap_or("");
    let linha = texto.lines().find(|l| !l.trim().is_empty()).unwrap_or("").trim();
    let preview = if linha.chars().count() > 140 { format!("{}…", linha.chars().take(140).collect::<String>()) } else { linha.to_string() };
    Some(MessageOut { to: to.to_string(), preview })
}

/// Ferramentas que significam "o agente está perguntando algo ao usuário".
pub const QUESTION_TOOLS: &[&str] = &["AskUserQuestion"];

pub fn map_event(payload: &Value) -> Option<HookEffect> {
    let ev = payload.get("hook_event_name")?.as_str()?;
    let tool = payload.get("tool_name").and_then(Value::as_str).unwrap_or("");
    let status = |s| Some(HookEffect { status: Some(s), claude_session_id: None, message: None });
    match ev {
        "SessionStart" => Some(HookEffect {
            status: Some(HookStatus::Idle),
            claude_session_id: payload.get("session_id").and_then(Value::as_str).map(str::to_string),
            message: None,
        }),
        "UserPromptSubmit" | "PostToolUse" => status(HookStatus::Run),
        "PreToolUse" if QUESTION_TOOLS.contains(&tool) => status(HookStatus::Wait),
        "PreToolUse" => Some(HookEffect { status: Some(HookStatus::Run), claude_session_id: None, message: message_of(payload) }),
        "Notification" => match payload.get("notification_type").and_then(Value::as_str) {
            Some("idle_prompt") => None,
            _ => status(HookStatus::Wait),
        },
        "Stop" => status(HookStatus::Idle),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn ev(j: Value) -> Option<HookEffect> {
        map_event(&j)
    }

    #[test]
    fn mapa() {
        let s = ev(json!({"hook_event_name":"SessionStart","session_id":"abc","source":"startup"})).unwrap();
        assert_eq!((s.status, s.claude_session_id.as_deref()), (Some(HookStatus::Idle), Some("abc")));
        assert_eq!(ev(json!({"hook_event_name":"UserPromptSubmit"})).unwrap().status, Some(HookStatus::Run));
        assert_eq!(ev(json!({"hook_event_name":"PreToolUse","tool_name":"AskUserQuestion"})).unwrap().status, Some(HookStatus::Wait));
        assert_eq!(ev(json!({"hook_event_name":"PreToolUse","tool_name":"Bash"})).unwrap().status, Some(HookStatus::Run));
        assert_eq!(ev(json!({"hook_event_name":"PostToolUse","tool_name":"Bash"})).unwrap().status, Some(HookStatus::Run));
        assert_eq!(ev(json!({"hook_event_name":"Notification","notification_type":"permission_prompt"})).unwrap().status, Some(HookStatus::Wait));
        assert!(ev(json!({"hook_event_name":"Notification","notification_type":"idle_prompt"})).is_none());
        assert_eq!(ev(json!({"hook_event_name":"Stop"})).unwrap().status, Some(HookStatus::Idle));
        assert!(ev(json!({"hook_event_name":"Desconhecido"})).is_none());
        assert!(ev(json!({"sem":"evento"})).is_none());
    }

    #[test]
    fn send_message_vira_mensagem() {
        let p = json!({"hook_event_name":"PreToolUse","tool_name":"SendMessage","tool_input":{"to":"spike-b [0e808e]","message":"Teste do SynapseIA: responda pong\nlinha 2"}});
        let e = ev(p.clone()).unwrap();
        assert_eq!(e.status, Some(HookStatus::Run));
        let m = e.message.unwrap();
        assert_eq!(m.to, "spike-b");
        assert_eq!(m.preview, "Teste do SynapseIA: responda pong");
        assert_eq!(message_of(&p).unwrap().to, "spike-b");
        // PostToolUse do mesmo envio não conta de novo
        assert!(ev(json!({"hook_event_name":"PostToolUse","tool_name":"SendMessage","tool_input":{"to":"x","message":"y"}})).unwrap().message.is_none());
        // prévia longa é cortada
        let longo = "a".repeat(300);
        let m = message_of(&json!({"tool_name":"SendMessage","tool_input":{"to":"x","message":longo}})).unwrap();
        assert_eq!(m.preview.chars().count(), 141); // 140 + "…"
        assert!(message_of(&json!({"tool_name":"Bash","tool_input":{}})).is_none());
    }

    #[test]
    fn resposta_a_pergunta_volta_a_executar() {
        // PostToolUse do AskUserQuestion = o usuário respondeu; o agente segue trabalhando
        assert_eq!(ev(json!({"hook_event_name":"PostToolUse","tool_name":"AskUserQuestion"})).unwrap().status, Some(HookStatus::Run));
    }
}
