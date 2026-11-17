// Painel de arquivos: lista uma pasta (um nível), pastas primeiro, ordem alfabética sem caixa.
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

pub fn list_dir(dir: &Path) -> Result<Vec<Entry>, String> {
    let leitura = std::fs::read_dir(dir).map_err(|e| format!("Não consegui abrir a pasta {}: {e}", dir.display()))?;
    let mut itens: Vec<Entry> = leitura
        .filter_map(Result::ok)
        .map(|e| Entry {
            name: e.file_name().to_string_lossy().to_string(),
            path: e.path().to_string_lossy().to_string(),
            is_dir: e.file_type().map(|t| t.is_dir()).unwrap_or(false),
        })
        .collect();
    itens.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(itens)
}

/// Limite do editor embutido.
pub const MAX_EDIT_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFile {
    pub text: String,
    /// Arquivo começava com BOM UTF-8 (é mantido ao salvar).
    pub bom: bool,
    pub mtime: u64,
}

/// Data de modificação em milissegundos (0 se não der para ler).
pub fn mtime_ms(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Lê um arquivo de texto UTF-8 para o editor; recusa binário, outra codificação e arquivo grande.
pub fn read_text(path: &Path) -> Result<TextFile, String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("Não consegui abrir {}: {e}", path.display()))?;
    if meta.len() > MAX_EDIT_BYTES {
        return Err(format!("Arquivo grande demais para o editor ({:.1} MB). Use \"Abrir no programa padrão\".", meta.len() as f64 / 1_048_576.0));
    }
    let bytes = std::fs::read(path).map_err(|e| format!("Não consegui ler {}: {e}", path.display()))?;
    if bytes.iter().take(8192).any(|b| *b == 0) {
        return Err("Arquivo binário: abra no programa padrão (botão direito).".into());
    }
    let (bom, corpo) = match bytes.strip_prefix(b"\xEF\xBB\xBF") {
        Some(resto) => (true, resto.to_vec()),
        None => (false, bytes),
    };
    let text = String::from_utf8(corpo).map_err(|_| "O arquivo não está em UTF-8; abra no programa padrão para não estragar os acentos.".to_string())?;
    Ok(TextFile { text, bom, mtime: mtime_ms(path) })
}

/// Salva o texto (com BOM se o original tinha).
pub fn write_text(path: &Path, text: &str, bom: bool) -> Result<u64, String> {
    let mut bytes = Vec::with_capacity(text.len() + 3);
    if bom {
        bytes.extend_from_slice(b"\xEF\xBB\xBF");
    }
    bytes.extend_from_slice(text.as_bytes());
    std::fs::write(path, bytes).map_err(|e| format!("Não consegui salvar {}: {e}", path.display()))?;
    Ok(mtime_ms(path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn le_texto_utf8() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("a.md");
        fs::write(&p, "olá\nmundo").unwrap();
        let t = read_text(&p).unwrap();
        assert_eq!((t.text.as_str(), t.bom), ("olá\nmundo", false));
        assert!(t.mtime > 0);
    }

    #[test]
    fn bom_e_mantido() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("b.ps1");
        fs::write(&p, b"\xEF\xBB\xBFWrite-Host 1").unwrap();
        let t = read_text(&p).unwrap();
        assert_eq!((t.text.as_str(), t.bom), ("Write-Host 1", true));
        write_text(&p, "Write-Host 2", true).unwrap();
        assert_eq!(fs::read(&p).unwrap(), b"\xEF\xBB\xBFWrite-Host 2");
    }

    #[test]
    fn recusa_binario_e_outra_codificacao() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("x.bin");
        fs::write(&p, [0x50u8, 0x4B, 0x03, 0x04, 0x00, 0x00]).unwrap();
        assert!(read_text(&p).unwrap_err().contains("programa padrão"));
        let p = d.path().join("latin1.txt");
        fs::write(&p, [b'a', 0xE7, b'o']).unwrap(); // "aço" em Windows-1252
        assert!(read_text(&p).unwrap_err().contains("UTF-8"));
    }

    #[test]
    fn recusa_arquivo_grande() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("g.log");
        fs::write(&p, vec![b'a'; (MAX_EDIT_BYTES + 1) as usize]).unwrap();
        assert!(read_text(&p).unwrap_err().contains("grande"));
    }

    #[test]
    fn salvar_devolve_nova_data() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("c.txt");
        let m = write_text(&p, "x", false).unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "x");
        assert_eq!(m, mtime_ms(&p));
    }

    #[test]
    fn pastas_primeiro_e_ordem_alfabetica() {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join("b.txt"), "").unwrap();
        fs::write(d.path().join("A.md"), "").unwrap();
        fs::create_dir(d.path().join("zeta")).unwrap();
        fs::create_dir(d.path().join("Alfa")).unwrap();
        let nomes: Vec<(String, bool)> = list_dir(d.path()).unwrap().into_iter().map(|e| (e.name, e.is_dir)).collect();
        assert_eq!(nomes, vec![("Alfa".into(), true), ("zeta".into(), true), ("A.md".into(), false), ("b.txt".into(), false)]);
    }

    #[test]
    fn caminho_completo() {
        let d = tempfile::tempdir().unwrap();
        fs::write(d.path().join("x.ps1"), "").unwrap();
        let e = &list_dir(d.path()).unwrap()[0];
        assert_eq!(Path::new(&e.path), d.path().join("x.ps1"));
    }

    #[test]
    fn pasta_inexistente_da_erro_legivel() {
        let r = list_dir(Path::new(r"C:\nao\existe\synapseia"));
        assert!(r.unwrap_err().contains("Não consegui abrir a pasta"));
    }
}
