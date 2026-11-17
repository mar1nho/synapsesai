// criar_agente: prepara a pasta e o CLAUDE.md do filho e devolve a SessionSpec dele.
use crate::model::{Kind, Resume, SessionSpec};

pub const MARKER: &str = "<!-- synapseia:gerenciado -->";

#[derive(Debug, PartialEq, Eq)]
pub enum SpawnError {
    NameTaken,
    Io(String),
}

/// `taken` = nomes já usados pelas sessões vivas do app.
pub fn prepare_child(parent: &SessionSpec, nome: &str, papel: &str, taken: &[String], new_id: &str) -> Result<SessionSpec, SpawnError> {
    let nome = nome.trim();
    if taken.iter().any(|t| t.trim().eq_ignore_ascii_case(nome)) {
        return Err(SpawnError::NameTaken);
    }
    let io = |e: std::io::Error| SpawnError::Io(e.to_string());
    let base = parent.cwd.join(".synapseia");
    let pasta = base.join(crate::slug::slugify(nome));
    std::fs::create_dir_all(&pasta).map_err(io)?;
    let gi = base.join(".gitignore");
    if !gi.exists() {
        std::fs::write(&gi, "*\n").map_err(io)?;
    }
    let md = pasta.join("CLAUDE.md");
    let gerenciado = match std::fs::read_to_string(&md) {
        Ok(t) => t.lines().next() == Some(MARKER),
        Err(_) => true,
    };
    if gerenciado {
        let texto = render_claude_md(nome, &parent.name, papel, &parent.cwd.to_string_lossy());
        std::fs::write(&md, texto).map_err(io)?;
    }
    let mut add_dirs = parent.add_dirs.clone();
    add_dirs.push(parent.cwd.clone());
    Ok(SessionSpec {
        id: new_id.to_string(),
        name: nome.to_string(),
        kind: Kind::Claude,
        cwd: pasta,
        bypass: parent.bypass,
        add_dirs,
        parent: Some(parent.id.clone()),
        resume: Resume::New,
        startup: None,
    })
}

pub fn render_claude_md(nome: &str, pai: &str, papel: &str, cwd_pai: &str) -> String {
    format!(
        "{MARKER}\n# {nome}\n\nVocê é um agente criado por \"{pai}\" no SynapseIA.\n\n## Seu papel\n\n{papel}\n\n## Como trabalhar\n\n- Você tem acesso à pasta do projeto: {cwd_pai}.\n- As tarefas chegam por mensagem de \"{pai}\". Quando terminar uma tarefa, responda a ele com SendMessage, pelo nome.\n- Quando precisar de uma resposta do usuário, use a ferramenta AskUserQuestion.\n"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn pai(cwd: &std::path::Path) -> SessionSpec {
        SessionSpec {
            id: "p1".into(),
            name: "Orquestrador".into(),
            kind: Kind::Claude,
            cwd: cwd.to_path_buf(),
            bypass: true,
            add_dirs: vec![PathBuf::from(r"C:\Outro")],
            parent: None,
            resume: Resume::ClaudeId("x".into()),
            startup: None,
        }
    }

    #[test]
    fn cria_pasta_claude_md_e_gitignore() {
        let d = tempfile::tempdir().unwrap();
        let f = prepare_child(&pai(d.path()), "Revenue Hub", "Migrar o endpoint /receita.", &[], "c1").unwrap();
        let pasta = d.path().join(".synapseia").join("revenue-hub");
        assert_eq!(f.cwd, pasta);
        let md = fs::read_to_string(pasta.join("CLAUDE.md")).unwrap();
        assert_eq!(md.lines().next().unwrap(), MARKER);
        assert!(md.contains("Migrar o endpoint /receita."));
        assert!(md.contains("\"Orquestrador\""));
        assert!(md.contains("AskUserQuestion"));
        assert_eq!(fs::read_to_string(d.path().join(".synapseia").join(".gitignore")).unwrap(), "*\n");
    }

    #[test]
    fn filho_herda_modo_e_pastas() {
        let d = tempfile::tempdir().unwrap();
        let f = prepare_child(&pai(d.path()), "Pesquisa", "x", &[], "c1").unwrap();
        assert_eq!(f.kind, Kind::Claude);
        assert!(f.bypass);
        assert_eq!(f.parent.as_deref(), Some("p1"));
        assert_eq!(f.resume, Resume::New);
        assert_eq!(f.id, "c1");
        assert_eq!(f.name, "Pesquisa");
        assert_eq!(f.add_dirs, vec![PathBuf::from(r"C:\Outro"), d.path().to_path_buf()]);
    }

    #[test]
    fn preserva_gitignore_existente() {
        let d = tempfile::tempdir().unwrap();
        fs::create_dir_all(d.path().join(".synapseia")).unwrap();
        fs::write(d.path().join(".synapseia").join(".gitignore"), "meu\n").unwrap();
        prepare_child(&pai(d.path()), "A", "x", &[], "c1").unwrap();
        assert_eq!(fs::read_to_string(d.path().join(".synapseia").join(".gitignore")).unwrap(), "meu\n");
    }

    #[test]
    fn preserva_claude_md_sem_marcador_e_reescreve_com() {
        let d = tempfile::tempdir().unwrap();
        let pasta = d.path().join(".synapseia").join("a");
        fs::create_dir_all(&pasta).unwrap();
        fs::write(pasta.join("CLAUDE.md"), "do usuario").unwrap();
        prepare_child(&pai(d.path()), "A", "novo papel", &[], "c1").unwrap();
        assert_eq!(fs::read_to_string(pasta.join("CLAUDE.md")).unwrap(), "do usuario");

        fs::write(pasta.join("CLAUDE.md"), format!("{MARKER}\nvelho")).unwrap();
        prepare_child(&pai(d.path()), "A", "novo papel", &[], "c2").unwrap();
        assert!(fs::read_to_string(pasta.join("CLAUDE.md")).unwrap().contains("novo papel"));
    }

    #[test]
    fn nome_repetido() {
        let d = tempfile::tempdir().unwrap();
        let r = prepare_child(&pai(d.path()), "Hubspot", "x", &["Hubspot".to_string()], "c1");
        assert_eq!(r.unwrap_err(), SpawnError::NameTaken);
    }
}
