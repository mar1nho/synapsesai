// Tipos compartilhados entre o lançamento de sessões, o PTY e o estado salvo.
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Tipo de sessão de terminal (nota não é PTY e fica só no frontend).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Claude,
    Codex,
    Gemini,
    Ps,
    Cmd,
}

/// Como a sessão começa: nova, retomando uma conversa do Claude pelo id, ou "a mais recente".
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "id")]
pub enum Resume {
    New,
    ClaudeId(String),
    Continue,
}

/// Tudo que define uma sessão a ser lançada.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSpec {
    pub id: String,
    pub name: String,
    pub kind: Kind,
    pub cwd: PathBuf,
    pub bypass: bool,
    pub add_dirs: Vec<PathBuf>,
    pub parent: Option<String>,
    pub resume: Resume,
    pub startup: Option<String>,
}

/// Linha de comando pronta para o ConPTY.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandLine {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: PathBuf,
    /// Variáveis a definir.
    pub env: Vec<(String, String)>,
}

/// Contexto do app necessário para montar o comando.
#[derive(Debug, Clone)]
pub struct LaunchCtx {
    pub cfg_dir: PathBuf,
    pub port: u16,
    pub token: String,
    pub system_prompt: String,
}
