// Ponto de entrada do frontend do SynapseIA.
import '@fontsource/figtree/400.css';
import '@fontsource/geist/400.css';
import '@fontsource/geist-mono/400.css';
import '@xterm/xterm/css/xterm.css';
import './styles/tokens.css';
import './styles/app.css';
import { buildShell } from './ui/shell';
import { getState, hosts, setTheme, subscribe, tickActivity } from './state/store';
import { applyThemeToDocument, isTheme, normalizeTheme, type ThemeName } from './theme';
import { setCurrentTermTheme } from './terminal/termhost';
import { forceRenderFiles, mountFiles, renderFiles } from './ui/files';
import { makeSplitter } from './ui/splitter';
import { mountEditor } from './ui/editor-panel';
import { mountCanvas, onShowCanvas, renderCanvas } from './ui/canvas';
import { setView } from './state/store';
import { renderSidebar, wireSidebar } from './ui/sidebar';
import { renderPanes } from './ui/panes';
import { renderToolbar, wireToolbar } from './ui/toolbar';
import { openNewSession, setInstallLink } from './ui/new-session';
import { setOverlayRoot } from './ui/dialog';
import { wireShortcuts } from './ui/shortcuts';
import { openAmbiente, refreshAvailability } from './ui/ambiente';
import { restore, startAutosave } from './state/persist';
import { wireAppEvents } from './app-events';

const shell = buildShell(document.getElementById('root')!);
setOverlayRoot(shell.overlayRoot);
wireSidebar(shell.sidebarTree);
wireToolbar(shell.toolbarSeg);
wireShortcuts();
shell.btnNew.addEventListener('click', openNewSession);
shell.btnEnv.addEventListener('click', () => void openAmbiente());
setInstallLink(() => void openAmbiente());

// painel de arquivos (aberto/fechado lembrado neste computador)
mountFiles(shell.filesAside);
const root = document.documentElement;
makeSplitter(shell.filesAside.querySelector('#splitFiles')!, {
  axis: 'x', key: 'synapseia.filesW', initial: 230, min: 170, max: () => Math.max(220, window.innerWidth * 0.4), dir: -1,
  apply: px => root.style.setProperty('--files-w', `${px}px`),
});

// lista lateral: largura arrastável e recolher/expandir
makeSplitter(shell.splitSide, {
  axis: 'x', key: 'synapseia.sideW', initial: 276, min: 200, max: () => Math.max(260, window.innerWidth * 0.35), dir: 1,
  apply: px => root.style.setProperty('--side-w', `${px}px`),
});
const lerRecolhida = () => { try { return localStorage.getItem('synapseia.sideCollapsed') === '1'; } catch { return false; } };
const setRecolhida = (v: boolean) => {
  shell.appbody.classList.toggle('side-collapsed', v);
  shell.btnCollapse.setAttribute('aria-expanded', String(!v));
  shell.btnCollapse.setAttribute('aria-label', v ? 'Expandir lista' : 'Recolher lista');
  try { localStorage.setItem('synapseia.sideCollapsed', v ? '1' : '0'); } catch { /* sem armazenamento */ }
};
setRecolhida(lerRecolhida());
shell.btnCollapse.addEventListener('click', () => setRecolhida(!shell.appbody.classList.contains('side-collapsed')));
window.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === 'KeyB') { e.preventDefault(); setRecolhida(!shell.appbody.classList.contains('side-collapsed')); }
}, true);

// visão: terminais | canvas
mountCanvas(shell.canvas);
shell.viewSeg.querySelectorAll<HTMLButtonElement>('button[data-view]').forEach(b =>
  b.addEventListener('click', () => setView(b.dataset.view as 'term' | 'canvas')));
window.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === 'KeyG') { e.preventDefault(); setView(getState().view === 'canvas' ? 'term' : 'canvas'); }
}, true);
let viewAplicada = '';
const aplicarView = () => {
  const v = getState().view;
  if (v === viewAplicada) return;
  viewAplicada = v;
  shell.canvas.hidden = v !== 'canvas';
  shell.grid.hidden = v === 'canvas';
  shell.toolbarSeg.hidden = v === 'canvas';
  shell.viewSeg.querySelectorAll<HTMLButtonElement>('button[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
  if (v === 'canvas') onShowCanvas();
};

// editor embaixo dos terminais
mountEditor(shell.editorPanel, aberto => { shell.splitEditor.hidden = !aberto; });
makeSplitter(shell.splitEditor, {
  axis: 'y', key: 'synapseia.editorH', initial: 300, min: 120, max: () => Math.max(200, window.innerHeight - 260), dir: -1,
  apply: px => root.style.setProperty('--editor-h', `${px}px`),
});
const lerFilesAberto = () => { try { return localStorage.getItem('synapseia.files') === '1'; } catch { return false; } };
const setFilesAberto = (v: boolean) => {
  shell.filesAside.hidden = !v;
  shell.btnFiles.setAttribute('aria-pressed', String(v));
  try { localStorage.setItem('synapseia.files', v ? '1' : '0'); } catch { /* sem armazenamento */ }
  if (v) forceRenderFiles();
};
setFilesAberto(lerFilesAberto());
shell.btnFiles.addEventListener('click', () => setFilesAberto(shell.filesAside.hidden === true));

// tema
let temaAplicado = '';
const aplicarTema = (t: ThemeName) => {
  if (t === temaAplicado) return;
  temaAplicado = t;
  applyThemeToDocument(t);
  setCurrentTermTheme(t);
  for (const h of hosts.values()) h.setTheme(t);
  shell.themeSel.value = t;
};
shell.themeSel.addEventListener('change', () => { if (isTheme(shell.themeSel.value)) setTheme(shell.themeSel.value); });

let frame = 0;
const render = () => {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const t = getState().theme;
    aplicarTema(normalizeTheme(t));
    aplicarView();
    renderSidebar(shell.sidebarTree);
    renderPanes(shell.grid);
    renderToolbar(shell.toolbarSeg, shell.summary);
    renderFiles();
    renderCanvas();
  });
};
subscribe(render);
render();
window.setInterval(tickActivity, 500);

(async () => {
  await wireAppEvents();
  const jaUsado = await restore().catch(() => false);
  startAutosave();
  if (!jaUsado) void openAmbiente();
  else void refreshAvailability();
})();
