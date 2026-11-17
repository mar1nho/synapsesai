// Nome de sessão -> nome de pasta seguro.

/// Minúsculas, sem acentos, qualquer sequência não alfanumérica vira "-"; vazio vira "agente".
pub fn slugify(name: &str) -> String {
    let ascii = deunicode::deunicode(name).to_lowercase();
    let mut out = String::with_capacity(ascii.len());
    let mut traco = false;
    for c in ascii.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
            traco = false;
        } else if !traco && !out.is_empty() {
            out.push('-');
            traco = true;
        }
    }
    let out = out.trim_matches('-').to_string();
    if out.is_empty() { "agente".to_string() } else { out }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_basico() {
        assert_eq!(slugify("Revenue Hub"), "revenue-hub");
        assert_eq!(slugify("Análise d'Água (Q3)"), "analise-d-agua-q3");
        assert_eq!(slugify("  --Ops__ "), "ops");
        assert_eq!(slugify("日本"), "ri-ben");
        assert_eq!(slugify("!!! ???"), "agente");
    }
}
