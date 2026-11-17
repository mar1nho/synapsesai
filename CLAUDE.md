# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

SynapseIA: app desktop **só Windows** (Tauri 2 + Rust + TypeScript/xterm.js) que roda até ~5 terminais e agentes de IA (Claude, Codex, Gemini, PowerShell, CMD) e notas, com lista em árvore, grade de 1–4 painéis, canvas dos agentes, painel de arquivos e editor embutido. É a reconstrução do TermiCanvas, sem herdar nada dele.


## Comandos

```powershell
npm install
npm run tauri dev        # roda o app; o script "pretauri" compila o sidecar antes (scripts/build-agent.ps1)
npm run tauri build      # instalador NSIS (.exe)
npx tsc --noEmit         # checagem de tipos do frontend

npm test                                      # Vitest (frontend)
npx vitest run src/state/panes.test.ts        # um arquivo
npx vitest run -t "assign troca"              # um teste pelo nome

cargo test --manifest-path src-tauri/Cargo.toml --lib            # testes unitários do Rust
cargo test --manifest-path src-tauri/Cargo.toml --lib hooks      # filtrar por nome/módulo
cargo test --manifest-path src-tauri/Cargo.toml --test pty_it    # integração com ConPTY real
cargo test --manifest-path src-tauri/agent/Cargo.toml            # sidecar (unidade + executável real)

cargo fmt --manifest-path src-tauri/Cargo.toml --check                           # formato (repita com src-tauri/agent/Cargo.toml)
cargo clippy --manifest-path src-tauri/Cargo.toml --lib --tests -- -D warnings   # lints do app
cargo clippy --manifest-path src-tauri/agent/Cargo.toml --all-targets -- -D warnings
```

- Se `cargo` não for encontrado, o shell é anterior à instalação do Rust: prefixe `$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"`.
- Com o app de dev aberto, `target\debug\synapseia.exe` fica travado: `cargo test` sem `--lib` (que compila binários e testes de integração) falha com "failed to remove file". Rode só `--lib` ou feche o app (o X manda para a bandeja; encerrar = "Sair" na bandeja).
- Primeira compilação do Rust leva ~12 min; as seguintes são incrementais.

## Arquitetura

**Três processos.** O app Tauri (Rust + WebView2), cada sessão num ConPTY, e o sidecar `synapseia-agent.exe` (crate separado em `src-tauri/agent`, empacotado via `bundle.externalBin`). O sidecar é iniciado *pelo Claude Code*: como hook (`synapseia-agent hook`) e como servidor MCP stdio (`synapseia-agent mcp`, ferramenta `criar_agente`). Ele fala com o app por HTTP em `127.0.0.1` (porta e token gerados a cada execução, passados às sessões em `SYNAPSEIA_PORT`/`SYNAPSEIA_TOKEN`/`SYNAPSEIA_SESSION_ID`). O MCP é escrito à mão (JSON-RPC por linha), sem rmcp/tokio.

**Terminal.** `pty/mod.rs` (`PtyManager`): `portable-pty` → thread de leitura → `mpsc` → `Batcher` (lotes de 12 ms / 64 KB) → `tauri::ipc::Channel` com bytes crus → `TermHost` (`src/terminal/termhost.ts`, um xterm.js por sessão, **criado uma vez e movido entre painéis, nunca recriado**). Cada processo vai num Job Object (`pty/job.rs`): fechar a sessão mata a árvore inteira. O ConPTY abre pedindo a posição do cursor (`ESC[6n`) e espera resposta: o xterm.js responde no app; em teste, responda manualmente (ver `tests/pty_it.rs`).

**Lançamento.** `launch.rs::build_command` monta programa + lista de argumentos, e o ConPTY inicia o processo direto: **sem PowerShell no meio, sem `-EncodedCommand` e sem `Invoke-Expression`** (antivírus com análise de comportamento bloqueavam o app por isso). O Claude roda pelo `claude.exe` achado no PATH (`Programs::detect`, a cada sessão). Codex/Gemini são scripts do npm e rodam por `fnm exec --using=default cmd /c <cli>` (ou `cmd /c <cli>` sem fnm). Só a sessão de instalação da tela Ambiente usa `powershell.exe -NoExit -Command <texto>`. Como não há shell em volta, quando o agente sai a sessão termina e o painel mostra o aviso com as últimas linhas da saída (`TermHost.tail`). O Claude recebe `--name`, `--settings` e `--mcp-config` apontando para `%APPDATA%\SynapseIA\claude\` (gerados por `claude_cfg.rs` na inicialização), além de `--append-system-prompt` com a instrução de usar `AskUserQuestion` quando precisar do usuário. **Crítico:** o `PtyManager` remove `CLAUDECODE`, `CLAUDE_PID` e `CLAUDE_CODE_*` (exceto `CLAUDE_CODE_GIT_BASH_PATH`) do ambiente. Sem isso, uma sessão lançada de dentro de outra sessão Claude vira "filha" e some da conversa entre agentes.

**Conversa entre agentes** é nativa do Claude Code (`ListAgents`/`SendMessage`, endereçados pelo `--name`). O app não entrega mensagens: só *observa* `SendMessage` pelo hook `PreToolUse` para desenhar as linhas do canvas.

**Status.**
- Claude: `control/hooks.rs::map_event` (hooks → `run`/`idle`/`wait` + id da conversa + mensagem), emitidos como eventos Tauri `session://status`, `session://claude-id` e `session://message`.
- Codex/Gemini/PowerShell/CMD: por atividade de saída (`src/state/activity.ts`). O Claude não usa atividade, porque a statusline do TUI imprime sozinha.
- Notificação do Windows só ao entrar em `wait` fora de vista (`notify-rule.ts`).

**criar_agente.** O sidecar faz POST `/spawn`. `spawn.rs::prepare_child` cria `<pasta do pai>\.synapseia\<slug>\CLAUDE.md` (primeira linha `<!-- synapseia:gerenciado -->`; sem o marcador, o arquivo do usuário é preservado) e o `.synapseia\.gitignore` com `*`. O filho herda bypass e `--add-dir` (pastas do pai + pasta do pai). O evento `session://spawn` faz o frontend chamar `createSession({..., focus: false})`.

**Frontend** (TS puro, sem framework).
- `src/state/store.ts` é o estado central. `layout` é o que aparece; `preferredN` é o layout escolhido; `normalize()` nunca mostra mais painéis que sessões.
- A lógica pura fica em `src/state/*.ts`, com testes ao lado.
- A UI imperativa fica em `src/ui/*.ts`. O `main.ts` junta tudo e redesenha num `requestAnimationFrame` a cada mudança do store.
- Testes da interface ficam ao lado (`src/ui/*.test.ts`), rodam num DOM simulado (`// @vitest-environment happy-dom` na primeira linha) e trocam o terminal real pelo dublê `src/test/fake-termhost.ts`.
- O editor usa CodeMirror 6 (`src/editor`, `src/ui/editor-panel.ts`); o canvas é SVG + cards HTML (`src/ui/canvas.ts`, lógica em `src/state/canvas.ts`).

**Persistência.**
- `%APPDATA%\SynapseIA\state.json`: escrita atômica por `state.rs`; JSON corrompido vira `.bak-<unix>`.
- Notas em `%APPDATA%\SynapseIA\notas\<id>.md`.
- Logs em `%APPDATA%\SynapseIA\logs\`.
- Tamanhos de painel, lista recolhida e posições no canvas: `localStorage`.
- Ao reabrir: Claude retoma com `--resume <id>` (ou `--continue`), Codex com `resume --last`, Gemini com `--resume latest`.

## Convenções

- Textos da interface em PT-BR; comentários de código em português.
- Nunca escrever nos arquivos de configuração do usuário (`~\.claude\settings.json`, `.mcp.json`/`.claude\` de projetos, `~\.codex\config.toml`). Configuração do app vai por flags apontando para `%APPDATA%\SynapseIA\`.
- Nada de comando codificado, `Invoke-Expression` ou script baixado e executado (`irm ... | iex`): instalação é por `winget`. Há testes que garantem isso em `launch.rs` e `env_check.rs`.
- A interface tem CSP (`tauri.conf.json`); todo texto dinâmico em `innerHTML` passa por `esc()`.
- Temas em `src/styles/tokens.css` (`navy` padrão, `dark`, `light`). Os três definem **o mesmo conjunto** de variáveis, e `app.css` só usa variáveis semânticas (`--bg`, `--surface`, `--accent`, `--ink`…): `src/theme.test.ts` garante as duas coisas. Cores do terminal por tema em `src/theme.ts`.
- `[hidden] { display: none !important; }` em `app.css` é obrigatório: vários elementos com `display` definido usam o atributo `hidden`.
- Design system: fontes só peso 400; verde-oliva no máximo 1× por tela.
- O CI (`.github/workflows/ci.yml`) roda tipos, testes, `cargo fmt --check` e `cargo clippy -D warnings` a cada push no GitHub. Formato do Rust em `src-tauri/rustfmt.toml`.
- Commits locais, um por tarefa, **sem** trailers de IA (sem "Co-Authored-By"/"Generated with").
