// Estado salvo do app em %APPDATA%\SynapseIA\state.json (gravação atômica).
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PersistedSession {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub cwd: String,
    pub bypass: bool,
    pub add_dirs: Vec<String>,
    pub parent: Option<String>,
    pub font: u32,
    pub claude_session_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PersistedLayout {
    pub n: u8,
    pub panes: Vec<String>,
    pub focus: u8,
}

impl Default for PersistedLayout {
    fn default() -> Self {
        Self { n: 1, panes: vec![String::new(); 4], focus: 0 }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppState {
    pub version: u32,
    pub sessions: Vec<PersistedSession>,
    pub layout: PersistedLayout,
    pub last_cwd: String,
    /// "navy" | "dark" | "light"
    pub theme: String,
}

pub const STATE_FILE: &str = "state.json";

/// Lê o estado; ausente = padrão; corrompido = vira state.json.bak-<unix> e devolve o padrão.
pub fn load(dir: &Path) -> AppState {
    let p = dir.join(STATE_FILE);
    let Ok(texto) = std::fs::read_to_string(&p) else { return AppState::default() };
    match serde_json::from_str(&texto) {
        Ok(s) => s,
        Err(_) => {
            let agora = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
            let _ = std::fs::rename(&p, dir.join(format!("{STATE_FILE}.bak-{agora}")));
            AppState::default()
        }
    }
}

/// Grava de forma atômica (arquivo temporário + rename).
pub fn save(dir: &Path, s: &AppState) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let json = serde_json::to_vec_pretty(s).map_err(std::io::Error::other)?;
    write_atomic(&dir.join(STATE_FILE), &json)
}

/// Escreve num temporário ao lado e troca pelo definitivo.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn exemplo() -> AppState {
        AppState {
            version: 1,
            sessions: vec![
                PersistedSession {
                    id: "o".into(),
                    name: "Orquestrador".into(),
                    kind: "claude".into(),
                    cwd: r"C:\x".into(),
                    bypass: true,
                    font: 13,
                    claude_session_id: Some("abc".into()),
                    ..Default::default()
                },
                PersistedSession {
                    id: "h".into(),
                    name: "Hubspot".into(),
                    kind: "claude".into(),
                    cwd: r"C:\x\.synapseia\hubspot".into(),
                    parent: Some("o".into()),
                    add_dirs: vec![r"C:\x".into()],
                    font: 13,
                    ..Default::default()
                },
            ],
            layout: PersistedLayout { n: 2, panes: vec!["o".into(), "h".into(), "".into(), "".into()], focus: 1 },
            last_cwd: r"C:\x".into(),
            theme: "light".into(),
        }
    }

    #[test]
    fn ida_e_volta() {
        let d = tempfile::tempdir().unwrap();
        save(d.path(), &exemplo()).unwrap();
        assert_eq!(load(d.path()), exemplo());
    }

    #[test]
    fn corrompido_vira_bak_e_padrao() {
        let d = tempfile::tempdir().unwrap();
        std::fs::write(d.path().join(STATE_FILE), "{lixo").unwrap();
        assert_eq!(load(d.path()), AppState::default());
        let tem_bak = std::fs::read_dir(d.path()).unwrap().any(|e| e.unwrap().file_name().to_string_lossy().starts_with("state.json.bak-"));
        assert!(tem_bak);
    }

    #[test]
    fn ausente_e_padrao() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(load(d.path()), AppState::default());
    }
}
