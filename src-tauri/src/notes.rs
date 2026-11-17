// Notas como arquivos .md em %APPDATA%\SynapseIA\notas\<id>.md
use std::path::Path;

fn note_path(dir: &Path, id: &str) -> std::io::Result<std::path::PathBuf> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "id de nota inválido"));
    }
    Ok(dir.join(format!("{id}.md")))
}

pub fn read_note(dir: &Path, id: &str) -> std::io::Result<String> {
    match std::fs::read_to_string(note_path(dir, id)?) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        r => r,
    }
}

pub fn write_note(dir: &Path, id: &str, text: &str) -> std::io::Result<()> {
    let p = note_path(dir, id)?;
    std::fs::create_dir_all(dir)?;
    crate::state::write_atomic(&p, text.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grava_e_le() {
        let d = tempfile::tempdir().unwrap();
        write_note(d.path(), "n1", "a\nb").unwrap();
        assert_eq!(read_note(d.path(), "n1").unwrap(), "a\nb");
    }

    #[test]
    fn nota_inexistente_vazia() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(read_note(d.path(), "nada").unwrap(), "");
    }

    #[test]
    fn id_com_barra_e_recusado() {
        let d = tempfile::tempdir().unwrap();
        assert!(write_note(d.path(), r"..\fora", "x").is_err());
    }
}
