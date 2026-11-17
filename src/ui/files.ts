// Painel de arquivos da pasta da sessão em foco.
// Clique: abre no editor embaixo dos terminais. Botão direito: colar caminho no terminal,
// abrir no programa padrão, mostrar no Explorer, copiar caminho.
import { invoke } from '@tauri-apps/api/core';
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener';
import { byId, getState, hosts } from '../state/store';
import { flattenTree, quotePath, type Entry } from '../state/filetree';
import { openFile } from './editor-panel';

const cache = new Map<string, Entry[]>();
const errosPasta = new Map<string, string>();
const expanded = new Set<string>();
let currentRoot = '';
let aside: HTMLElement | null = null;
let menu: HTMLElement | null = null;

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const ICON_DIR = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5h4l1.5 1.5h7.5v8h-13z" style="fill:none;stroke:currentColor;stroke-width:1.1"/></svg>';
const ICON_FILE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3" style="fill:none;stroke:currentColor;stroke-width:1.1"/></svg>';

function focusedSessionId(): string {
  const { layout } = getState();
  return layout.panes[layout.focus] ?? '';
}

async function load(dir: string) {
  try {
    cache.set(dir, await invoke<Entry[]>('list_dir', { path: dir }));
    errosPasta.delete(dir);
  } catch (e) {
    errosPasta.set(dir, String(e));
    cache.set(dir, []);
  }
  draw();
}

function closeMenu() { menu?.remove(); menu = null; }
document.addEventListener('click', closeMenu);

function openMenu(e: Entry, x: number, y: number) {
  closeMenu();
  const m = document.createElement('div');
  m.className = 'menu';
  m.setAttribute('role', 'menu');
  const item = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.setAttribute('role', 'menuitem');
    b.addEventListener('click', ev => { ev.stopPropagation(); closeMenu(); fn(); });
    m.appendChild(b);
  };
  const sid = focusedSessionId();
  const h = hosts.get(sid);
  if (h) item('Colar caminho no terminal', () => { h.paste(quotePath(e.path)); h.focus(); });
  if (!e.isDir) item('Abrir no editor', () => { void openFile(e.path); });
  if (!e.isDir) item('Abrir no programa padrão', () => { void openPath(e.path); });
  item('Mostrar no Explorer', () => { void revealItemInDir(e.path); });
  item('Copiar caminho', () => { void navigator.clipboard.writeText(e.path); });
  m.style.left = `${Math.min(x, window.innerWidth - 230)}px`;
  m.style.top = `${Math.min(y, window.innerHeight - 160)}px`;
  document.body.appendChild(m);
  menu = m;
  (m.querySelector('button') as HTMLButtonElement | null)?.focus();
}

function draw() {
  if (!aside) return;
  const s = byId(focusedSessionId());
  const head = aside.querySelector('.files-head')!;
  const list = aside.querySelector('.files-list')!;
  if (!s || s.kind === 'nota' || !s.cwd) {
    head.innerHTML = '<span>Arquivos</span>';
    list.innerHTML = '<p class="files-empty">Selecione um terminal para ver os arquivos da pasta dele.</p>';
    return;
  }
  const nomePasta = s.cwd.split(/[\\/]/).filter(Boolean).pop() ?? s.cwd;
  head.innerHTML = `<span class="files-title" title="${esc(s.cwd)}">${esc(nomePasta)}</span><button type="button" class="fbtn" id="filesRefresh" aria-label="Atualizar lista de arquivos" title="Atualizar">↻</button>`;
  head.querySelector('#filesRefresh')!.addEventListener('click', () => {
    for (const k of [...cache.keys()]) if (k.startsWith(currentRoot)) cache.delete(k);
    void load(currentRoot);
    for (const d of expanded) if (d.startsWith(currentRoot)) void load(d);
  });
  if (s.cwd !== currentRoot) {
    currentRoot = s.cwd;
    if (!cache.has(currentRoot)) { list.innerHTML = '<p class="files-empty">Carregando…</p>'; void load(currentRoot); return; }
  }
  const erro = errosPasta.get(currentRoot);
  if (erro) { list.innerHTML = `<p class="files-empty">${esc(erro)}</p>`; return; }
  const rows = flattenTree(currentRoot, cache, expanded);
  if (!rows.length) { list.innerHTML = '<p class="files-empty">Pasta vazia.</p>'; return; }
  list.innerHTML = rows.map((r, i) => `
    <button type="button" class="file-row${r.entry.isDir ? ' is-dir' : ''}" data-i="${i}" style="padding-left:${8 + r.depth * 14}px" title="${esc(r.entry.path)}">
      <span class="chev">${r.entry.isDir ? (r.expanded ? '▾' : '▸') : ''}</span>${r.entry.isDir ? ICON_DIR : ICON_FILE}<span class="file-name">${esc(r.entry.name)}</span>${r.loading ? '<span class="file-loading">…</span>' : ''}
    </button>`).join('');
  list.querySelectorAll<HTMLButtonElement>('.file-row').forEach(b => {
    const r = rows[Number(b.dataset.i)];
    b.addEventListener('click', () => {
      if (r.entry.isDir) {
        if (expanded.has(r.entry.path)) expanded.delete(r.entry.path);
        else { expanded.add(r.entry.path); if (!cache.has(r.entry.path)) void load(r.entry.path); }
        draw();
      } else {
        void openFile(r.entry.path);
      }
    });
    b.addEventListener('contextmenu', ev => { ev.preventDefault(); openMenu(r.entry, ev.clientX, ev.clientY); });
  });
}

export function mountFiles(el: HTMLElement) {
  aside = el;
  el.innerHTML = '<div class="split split-x split-left" id="splitFiles" aria-label="Largura do painel de arquivos"></div><div class="files-head"></div><div class="files-list"></div>';
}

/** Chamado a cada mudança de estado; só redesenha se a sessão em foco mudou de pasta. */
let lastKey = '';
export function renderFiles() {
  if (!aside || aside.hidden) return;
  const s = byId(focusedSessionId());
  const key = s ? `${s.id}|${s.cwd}` : '';
  if (key === lastKey) return;
  lastKey = key;
  draw();
}

export function forceRenderFiles() { lastKey = '\u0000'; renderFiles(); }
