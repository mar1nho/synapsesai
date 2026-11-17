// Tela Ambiente: verifica Git, Claude Code, fnm/Node, Codex e Gemini; instala com confirmação num terminal visível.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createSession, getState } from '../state/store';
import type { Kind } from '../state/types';
import { confirmDialog, openOverlay } from './dialog';
import { unavailable } from './new-session';

interface EnvItem { key: string; label: string; required: boolean; status: 'ok' | 'old' | 'missing'; version: string | null; install: string | null; update: string | null; }

const KIND_OF: Record<string, Kind> = { claude: 'claude', codex: 'codex', gemini: 'gemini' };

let installId: string | null = null;
let reabrir: (() => void) | null = null;
listen<{ id: string }>('session://exited', e => { if (e.payload.id === installId) { installId = null; reabrir?.(); } });

export async function refreshAvailability(): Promise<EnvItem[]> {
  const itens = await invoke<EnvItem[]>('env_check');
  unavailable.clear();
  for (const i of itens) if (KIND_OF[i.key] && i.status === 'missing') unavailable.add(KIND_OF[i.key]);
  return itens;
}

async function runInstall(label: string, cmd: string) {
  const ok = await confirmDialog(`Instalar ${label}?`, `Vai rodar num terminal visível: ${cmd}`, 'Instalar');
  if (!ok) return;
  const s = await createSession({
    name: `Instalação ${new Date().toLocaleTimeString('pt-BR')}`, kind: 'ps', cwd: getState().lastCwd || 'C:\\',
    bypass: false, startup: `${cmd}; Write-Host ''; Write-Host 'Pronto. Pode fechar esta sessão.'`,
  });
  installId = s.id;
}

export async function openAmbiente() {
  const d = document.createElement('div');
  d.className = 'dialog';
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-modal', 'true');
  d.innerHTML = '<h2>Ambiente</h2><p>Verificando o que está instalado…</p>';
  const close = openOverlay(d);
  reabrir = () => { close(); void openAmbiente(); };

  const itens = await refreshAvailability();
  const pill = (i: EnvItem) => i.status === 'ok' ? '<span class="pill p-done">ok</span>' : i.status === 'old' ? '<span class="pill p-wait">desatualizado</span>' : `<span class="pill ${i.required ? 'p-wait' : 'p-idle'}">faltando</span>`;
  const falta = itens.filter(i => i.status !== 'ok' && (i.status === 'old' ? i.update : i.install));
  d.innerHTML = `<h2>Ambiente</h2>
    <p>Git e Claude Code são obrigatórios. fnm/Node, Codex e Gemini só são precisos para essas sessões. O login de cada CLI você faz no próprio terminal.</p>
    <div class="env-list">${itens.map((i, k) => `
      <div class="env-row"><div class="env-main"><span>${i.label}${i.required ? '' : ' <span class="env-ver">(opcional)</span>'}</span><span class="env-ver">${i.version ?? '—'}</span></div>
      ${pill(i)}
      ${i.status === 'old' && i.update ? `<button type="button" class="btn" data-k="${k}" data-a="update">Atualizar</button>` : ''}
      ${i.status === 'missing' && i.install ? `<button type="button" class="btn" data-k="${k}" data-a="install">Instalar</button>` : ''}
      </div>`).join('')}</div>
    <div class="actions">${falta.length ? '<button type="button" class="btn" id="env-all">Instalar o que falta</button>' : ''}<button type="button" class="btn primary" id="env-close">Fechar</button></div>`;
  d.querySelector('#env-close')!.addEventListener('click', close);
  d.querySelectorAll<HTMLButtonElement>('button[data-k]').forEach(b => b.addEventListener('click', () => {
    const i = itens[Number(b.dataset.k)];
    const cmd = b.dataset.a === 'update' ? i.update! : i.install!;
    close();
    void runInstall(i.label, cmd);
  }));
  d.querySelector('#env-all')?.addEventListener('click', () => {
    const cmds = falta.map(i => (i.status === 'old' ? i.update : i.install)!).join('; ');
    close();
    void runInstall(falta.map(i => i.label).join(', '), cmds);
  });
  (d.querySelector('#env-close') as HTMLButtonElement).focus();
}
