// Diálogo "Nova sessão".
import { open } from '@tauri-apps/plugin-dialog';
import { createSession, getState, isNameTaken } from '../state/store';
import type { Kind } from '../state/types';
import { openOverlay } from './dialog';

const KINDS: { k: Kind; label: string }[] = [
  { k: 'claude', label: 'Claude' }, { k: 'codex', label: 'Codex' }, { k: 'gemini', label: 'Gemini' },
  { k: 'ps', label: 'PowerShell' }, { k: 'cmd', label: 'CMD' }, { k: 'nota', label: 'Nota' },
];
const AGENTS = new Set<Kind>(['claude', 'codex', 'gemini']);

/** Tipos indisponíveis (programa ausente) — preenchido pela tela Ambiente. */
export const unavailable = new Set<Kind>();
let onInstallLink: (() => void) | null = null;
export function setInstallLink(cb: () => void) { onInstallLink = cb; }

export function openNewSession() {
  const d = document.createElement('form');
  d.className = 'dialog';
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-modal', 'true');
  d.setAttribute('aria-labelledby', 'nsTitle');
  // a checagem do Ambiente é só um aviso: nunca impede de escolher o tipo
  d.innerHTML = `
    <h2 id="nsTitle">Nova sessão</h2>
    <fieldset class="field"><legend>Tipo</legend><div class="kinds">${KINDS.map(x =>
      `<label><input type="radio" name="kind" value="${x.k}" id="k-${x.k}" ${x.k === 'claude' ? 'checked' : ''}><span>${x.label}${unavailable.has(x.k) ? ' <span class="kind-warn" title="não encontrado neste computador">!</span>' : ''}</span></label>`).join('')}
    </div><p class="hint warn" id="nsMissing" hidden></p></fieldset>
    <div class="field"><label for="ns-name">Nome</label>
      <input class="text-in" type="text" id="ns-name" placeholder="Ex.: Financeiro" autocomplete="off" required>
      <p class="hint warn" id="ns-name-err" hidden></p></div>
    <div class="field" id="ns-cwd-field"><label for="ns-cwd">Pasta</label>
      <div class="row"><input class="text-in mono" type="text" id="ns-cwd" autocomplete="off"><button type="button" class="btn" id="ns-pick">Escolher…</button></div></div>
    <div class="field" id="ns-bypass-field"><label class="switch" for="ns-bypass"><input type="checkbox" id="ns-bypass" checked><span>Bypass: o agente não pede permissão</span></label>
      <p class="hint" id="ns-bypass-hint">Filhos criados por esta sessão herdam o modo.</p></div>
    <div class="actions"><button type="button" class="btn" id="ns-cancel">Cancelar</button><button type="submit" class="btn primary">Abrir sessão</button></div>`;

  const $ = <T extends HTMLElement>(sel: string) => d.querySelector(sel) as T;
  const name = $<HTMLInputElement>('#ns-name');
  const cwd = $<HTMLInputElement>('#ns-cwd');
  const bypass = $<HTMLInputElement>('#ns-bypass');
  const err = $<HTMLParagraphElement>('#ns-name-err');
  cwd.value = getState().lastCwd || '';

  const LABEL = Object.fromEntries(KINDS.map(x => [x.k, x.label])) as Record<Kind, string>;
  const kind = () => (d.querySelector('input[name="kind"]:checked') as HTMLInputElement).value as Kind;
  const sync = () => {
    const k = kind();
    const miss = $<HTMLParagraphElement>('#nsMissing');
    miss.hidden = !unavailable.has(k);
    if (!miss.hidden) {
      miss.innerHTML = `Não encontrei o ${LABEL[k]} neste computador. Dá para tentar abrir assim mesmo, ou <button type="button" class="link-btn" id="ns-install">instalar</button>.`;
      miss.querySelector('#ns-install')!.addEventListener('click', () => { close(); onInstallLink?.(); });
    }
    $<HTMLElement>('#ns-cwd-field').hidden = k === 'nota';
    bypass.disabled = !AGENTS.has(k);
    $<HTMLElement>('#ns-bypass-hint').textContent = AGENTS.has(k) ? 'Filhos criados por esta sessão herdam o modo.' : 'Só vale para agentes (Claude, Codex, Gemini).';
  };
  d.addEventListener('change', e => { if ((e.target as HTMLInputElement).name === 'kind') sync(); });
  sync();

  $<HTMLButtonElement>('#ns-pick').addEventListener('click', async () => {
    const dir = await open({ directory: true, defaultPath: cwd.value || undefined });
    if (typeof dir === 'string') cwd.value = dir;
  });

  const close = openOverlay(d);
  $<HTMLButtonElement>('#ns-cancel').addEventListener('click', close);
  name.focus();

  d.addEventListener('submit', async e => {
    e.preventDefault();
    const k = kind();
    const n = name.value.trim();
    const showErr = (m: string) => { err.textContent = m; err.hidden = false; name.setAttribute('aria-invalid', 'true'); name.focus(); };
    if (!n) return showErr('Dê um nome para a sessão.');
    if (isNameTaken(n)) return showErr('Já existe uma sessão com esse nome.');
    if (k !== 'nota' && !cwd.value.trim()) { cwd.focus(); return; }
    close();
    await createSession({ name: n, kind: k, cwd: k === 'nota' ? '' : cwd.value.trim(), bypass: AGENTS.has(k) && bypass.checked });
  });
}
