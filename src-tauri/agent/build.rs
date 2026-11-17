// Grava nome, empresa e descrição nas propriedades do synapseia-agent.exe.
// Um executável sem essas informações parece anônimo para o antivírus e para quem o inspeciona.
fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let mut res = winresource::WindowsResource::new();
        res.set("ProductName", "SynapseIA");
        res.set("FileDescription", "SynapseIA: sidecar (hook e servidor MCP do Claude Code)");
        res.set("CompanyName", "Marinho");
        res.set("LegalCopyright", "Marinho");
        res.set("OriginalFilename", "synapseia-agent.exe");
        res.compile().expect("recurso de versão do synapseia-agent");
    }
}
