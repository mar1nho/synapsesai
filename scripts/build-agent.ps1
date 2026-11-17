# Compila o sidecar synapseia-agent e coloca onde o Tauri espera (binaries/<nome>-<triple>.exe)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path $PSScriptRoot -Parent
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo build --release --manifest-path "$raiz\src-tauri\agent\Cargo.toml"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$destino = "$raiz\src-tauri\binaries"
New-Item -ItemType Directory -Force $destino | Out-Null
Copy-Item -Force "$raiz\src-tauri\agent\target\release\synapseia-agent.exe" "$destino\synapseia-agent-x86_64-pc-windows-msvc.exe"
