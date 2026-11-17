// Editor embaixo dos terminais: abas, edição com CodeMirror, Ctrl+S salva,
// avisa quando o arquivo mudou no disco (por exemplo, o Claude editou).
import { invoke } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';
import { basicSetup } from 'codemirror';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { indentWithTab } from '@codemirror/commands';
import { closeTab, openTab, setDirty, tabLabel, type Tabs } from '../state/editor-tabs';
import { languageFor } from '../editor/lang';
import { cmHighlight, cmTheme, langExtension } from '../editor/cm';
import { confirmDialog } from './dialog';

interface Doc { state: EditorState; saved: string; bom: boolean; mtime: number; external: boolean; }
interface TextFile { text: string; bom: boolean; mtime: number; }

let tabs: Tabs = { list: [], active: null };
const docs = new Map<string, Doc>();
let panel: HTMLElement;
let tabBar: HTMLElement;
let host: HTMLElement;
let banner: HTMLElement;
let view: EditorView | null = null;
let onVisibility: (open: boolean) => void = () => undefined;

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const key = (p: string) => p.toLowerCase();

export function mountEditor(el: HTMLElement, visibilityCb: (open: boolean) => void) {
  panel = el;
  onVisibility = visibilityCb;
  panel.innerHTML = '<div class="ed-tabs" role="tablist" aria-label="Arquivos abertos"></div><div class="ed-banner" hidden></div><div class="ed-host"></div>';
  tabBar = panel.querySelector('.ed-tabs')!;
  banner = panel.querySelector('.ed-banner')!;
  host = panel.querySelector('.ed-host')!;
  window.addEventListener('focus', () => { if (tabs.active) void checkDisk(tabs.active); });
  draw();
}

function extensions(path: string, lang: import('@codemirror/state').Extension) {
  return [
    basicSetup,
    keymap.of([indentWithTab, { key: 'Mod-s', preventDefault: true, run: () => { void save(path); return true; } }]),
    cmTheme,
    cmHighlight,
    lang,
    EditorView.updateListener.of(u => {
      if (!u.docChanged) return;
      const d = docs.get(key(path));
      if (!d) return;
      const dirty = u.state.doc.toString() !== d.saved;
      const tab = tabs.list.find(t => key(t.path) === key(path));
      if (tab && tab.dirty !== dirty) { tabs = setDirty(tabs, path, dirty); drawTabs(); }
    }),
  ];
}

async function load(path: string): Promise<Doc> {
  const f = await invoke<TextFile>('read_text', { path });
  const state = EditorState.create({ doc: f.text, extensions: extensions(path, await langExtension(languageFor(path))) });
  return { state, saved: f.text, bom: f.bom, mtime: f.mtime, external: false };
}

/** Abre (ou ativa) o arquivo numa aba. */
export async function openFile(path: string) {
  if (!docs.has(key(path))) {
    try {
      docs.set(key(path), await load(path));
    } catch (e) {
      showError(path, String(e));
      return;
    }
  }
  stash();
  tabs = openTab(tabs, path);
  draw();
  view?.focus();
}

function showError(path: string, msg: string) {
  onVisibility(true);
  panel.hidden = false;
  banner.hidden = false;
  banner.innerHTML = `<span>${esc(msg)}</span><button type="button" class="btn" id="edOpenExt">Abrir no programa padrão</button><button type="button" class="fbtn" id="edBannerX" aria-label="Fechar aviso">×</button>`;
  banner.querySelector('#edOpenExt')!.addEventListener('click', () => { void openPath(path); banner.hidden = true; if (!tabs.list.length) { panel.hidden = true; onVisibility(false); } });
  banner.querySelector('#edBannerX')!.addEventListener('click', () => { banner.hidden = true; if (!tabs.list.length) { panel.hidden = true; onVisibility(false); } });
}

/** Guarda o estado do editor da aba ativa antes de trocar. */
function stash() {
  if (view && tabs.active) {
    const d = docs.get(key(tabs.active));
    if (d) d.state = view.state;
  }
}

async function save(path: string) {
  const d = docs.get(key(path));
  if (!d) return;
  const text = (tabs.active && key(tabs.active) === key(path) && view ? view.state : d.state).doc.toString();
  const noDisco = await invoke<number>('file_mtime', { path });
  if (noDisco && noDisco !== d.mtime) {
    const ok = await confirmDialog('O arquivo mudou no disco', 'Outra pessoa ou um agente alterou este arquivo depois que você abriu. Salvar por cima?', 'Salvar por cima');
    if (!ok) return;
  }
  try {
    d.mtime = await invoke<number>('write_text', { path, text, bom: d.bom });
    d.saved = text;
    d.external = false;
    tabs = setDirty(tabs, path, false);
    draw();
  } catch (e) {
    showError(path, String(e));
  }
}

async function checkDisk(path: string) {
  const d = docs.get(key(path));
  if (!d) return;
  const m = await invoke<number>('file_mtime', { path });
  if (!m || m === d.mtime) return;
  const dirty = tabs.list.find(t => key(t.path) === key(path))?.dirty;
  if (!dirty) {
    // sem alterações locais: recarrega sozinho
    try { const novo = await load(path); docs.set(key(path), novo); if (tabs.active && key(tabs.active) === key(path)) view?.setState(novo.state); } catch { /* arquivo sumiu: mantém */ }
  } else {
    d.external = true;
    draw();
  }
}

async function requestClose(path: string) {
  const dirty = tabs.list.find(t => key(t.path) === key(path))?.dirty;
  if (dirty) {
    const ok = await confirmDialog('Fechar sem salvar?', `As alterações em ${tabLabel(tabs, path)} serão perdidas.`, 'Fechar sem salvar');
    if (!ok) return;
  }
  stash();
  tabs = closeTab(tabs, path);
  docs.delete(key(path));
  draw();
}

function drawTabs() {
  tabBar.innerHTML = tabs.list.map(t => {
    const ativa = tabs.active && key(t.path) === key(tabs.active);
    return `<div class="ed-tab${ativa ? ' active' : ''}" title="${esc(t.path)}">
      <button type="button" class="ed-tab-name" role="tab" aria-selected="${ativa ? 'true' : 'false'}" data-p="${esc(t.path)}">${t.dirty ? '<span class="ed-dot" aria-label="não salvo">●</span>' : ''}${esc(tabLabel(tabs, t.path))}</button>
      <button type="button" class="ed-tab-x" data-x="${esc(t.path)}" aria-label="Fechar ${esc(tabLabel(tabs, t.path))}">×</button></div>`;
  }).join('') + '<span class="ed-hint">Ctrl+S salva</span>';
  tabBar.querySelectorAll<HTMLButtonElement>('.ed-tab-name').forEach(b => b.addEventListener('click', () => {
    stash();
    tabs = openTab(tabs, b.dataset.p!);
    draw();
    void checkDisk(b.dataset.p!);
  }));
  tabBar.querySelectorAll<HTMLButtonElement>('.ed-tab-x').forEach(b => b.addEventListener('click', () => void requestClose(b.dataset.x!)));
}

function draw() {
  const aberto = tabs.list.length > 0;
  panel.hidden = !aberto && banner.hidden;
  onVisibility(!panel.hidden);
  drawTabs();
  if (!aberto || !tabs.active) { view?.destroy(); view = null; host.innerHTML = ''; return; }
  const d = docs.get(key(tabs.active))!;
  if (!view) view = new EditorView({ state: d.state, parent: host });
  else if (view.state !== d.state) view.setState(d.state);
  if (d.external) {
    banner.hidden = false;
    const p = tabs.active;
    banner.innerHTML = '<span>Este arquivo mudou no disco enquanto você editava.</span><button type="button" class="btn" id="edReload">Recarregar do disco</button><button type="button" class="btn" id="edKeep">Manter o meu</button>';
    banner.querySelector('#edReload')!.addEventListener('click', async () => { const novo = await load(p); docs.set(key(p), novo); tabs = setDirty(tabs, p, false); view?.setState(novo.state); banner.hidden = true; draw(); });
    banner.querySelector('#edKeep')!.addEventListener('click', async () => { d.external = false; d.mtime = await invoke<number>('file_mtime', { path: p }); banner.hidden = true; });
  } else if (!banner.querySelector('#edOpenExt')) {
    banner.hidden = true;
  }
}

export function hasUnsaved(): boolean { return tabs.list.some(t => t.dirty); }
