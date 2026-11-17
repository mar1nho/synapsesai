// Casca da janela: barra de título, lista lateral, barra de layout e grade de painéis.
import { getCurrentWindow } from '@tauri-apps/api/window';

export interface Shell {
  app: HTMLElement;
  viewSeg: HTMLElement;
  canvas: HTMLElement;
  appbody: HTMLElement;
  side: HTMLElement;
  btnCollapse: HTMLButtonElement;
  splitSide: HTMLElement;
  splitEditor: HTMLElement;
  editorPanel: HTMLElement;
  btnNew: HTMLButtonElement;
  btnEnv: HTMLButtonElement;
  btnFiles: HTMLButtonElement;
  themeSel: HTMLSelectElement;
  filesAside: HTMLElement;
  sidebarTree: HTMLUListElement;
  toolbarSeg: HTMLElement;
  summary: HTMLElement;
  grid: HTMLElement;
  overlayRoot: HTMLElement;
}

export const BRAND_SVG =
  '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.5 7.5 C9.5 9, 10.5 11, 13.5 12.5" style="fill:none;stroke:var(--ink-muted);stroke-width:1.4"/><rect x="2.5" y="3.5" width="5" height="5" style="fill:var(--ink)"/><rect x="12.5" y="11.5" width="5" height="5" style="fill:var(--accent);stroke:var(--ink);stroke-width:1"/></svg>';

const LAYOUT_ICONS: Record<number, string> = {
  1: '<rect x="1" y="1" width="14" height="10"/>',
  2: '<rect x="1" y="1" width="6.3" height="10"/><rect x="8.7" y="1" width="6.3" height="10"/>',
  3: '<rect x="1" y="1" width="7" height="10"/><rect x="9.4" y="1" width="5.6" height="4.3"/><rect x="9.4" y="6.7" width="5.6" height="4.3"/>',
  4: '<rect x="1" y="1" width="6.3" height="4.3"/><rect x="8.7" y="1" width="6.3" height="4.3"/><rect x="1" y="6.7" width="6.3" height="4.3"/><rect x="8.7" y="6.7" width="6.3" height="4.3"/>',
};

export function buildShell(root: HTMLElement): Shell {
  const seg = [1, 2, 3, 4]
    .map(n => `<button type="button" data-layout="${n}" aria-pressed="false" aria-label="${n} ${n === 1 ? 'painel' : 'painéis'}"><svg viewBox="0 0 16 12" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:1.2">${LAYOUT_ICONS[n]}</svg>${n}</button>`)
    .join('');
  root.innerHTML = `
  <div class="app">
    <div class="titlebar" data-tauri-drag-region>
      <div class="brand">${BRAND_SVG}SynapseIA</div>
      <div class="titlebar-actions">
        <label class="theme-pick" for="themeSel">Tema
          <select id="themeSel"><option value="navy">Marinho</option><option value="dark">Escuro</option><option value="light">Claro</option></select>
        </label>
        <button type="button" id="btnEnv">Ambiente</button>
      </div>
      <div class="winctl">
        <button type="button" id="winMin" aria-label="Minimizar"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" style="stroke:currentColor;stroke-width:1"/></svg></button>
        <button type="button" id="winMax" aria-label="Maximizar"><svg viewBox="0 0 10 10" aria-hidden="true"><rect x=".5" y=".5" width="9" height="9" style="fill:none;stroke:currentColor;stroke-width:1"/></svg></button>
        <button type="button" id="winClose" class="close" aria-label="Fechar janela (o app continua na bandeja)"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 0l10 10M10 0L0 10" style="stroke:currentColor;stroke-width:1.1"/></svg></button>
      </div>
    </div>
    <div class="appbody">
      <aside class="side" id="side" aria-label="Sessões">
        <div class="side-top">
          <button type="button" class="btn-new" id="btnNew" title="Nova sessão (Ctrl+Shift+N)"><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1v12M1 7h12" style="stroke:currentColor;stroke-width:1.5"/></svg><span class="lbl">Nova sessão</span></button>
          <button type="button" class="side-collapse" id="btnCollapse" aria-label="Recolher lista" aria-expanded="true" title="Recolher/expandir lista (Ctrl+Shift+B)"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2.5 4 6l3.5 3.5" style="fill:none;stroke:currentColor;stroke-width:1.4"/></svg></button>
        </div>
        <div class="tree-label" id="treeLabel">Sessões</div>
        <ul class="tree" id="tree" aria-labelledby="treeLabel"></ul>
        <div class="legend" aria-label="Legenda de status">
          <span class="legend-label">Status</span>
          <span class="pill p-run">executando</span>
          <span class="pill p-wait">esperando você</span>
          <span class="pill p-done">terminou</span>
          <span class="pill p-idle">idle</span>
        </div>
        <div class="split split-x" id="splitSide" aria-label="Largura da lista"></div>
      </aside>
      <main class="main">
        <div class="toolbar">
          <div class="toolbar-left">
            <div class="seg view-seg" role="group" aria-label="Visão" id="viewSeg">
              <button type="button" data-view="term" aria-pressed="true"><svg viewBox="0 0 16 12" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:1.2"><rect x="1" y="1" width="14" height="10"/><path d="M3.5 4l2 2-2 2M7 8h3"/></svg>Terminais</button>
              <button type="button" data-view="canvas" aria-pressed="false" title="Canvas dos agentes (Ctrl+Shift+G)"><svg viewBox="0 0 16 12" aria-hidden="true" style="fill:none;stroke:currentColor;stroke-width:1.2"><rect x="1" y="1" width="5" height="4"/><rect x="10" y="7" width="5" height="4"/><path d="M6 3c3 0 1 6 4 6"/></svg>Canvas</button>
            </div>
            <div class="seg" role="group" aria-label="Layout" id="seg"><span class="seg-label">Layout</span>${seg}</div>
          </div>
          <div class="toolbar-right">
            <div class="summary" id="summary" aria-live="polite"></div>
            <button type="button" class="btn-toggle" id="btnFiles" aria-pressed="false" title="Mostrar os arquivos da pasta da sessão em foco"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5h4l1.5 1.5h7.5v8h-13z" style="fill:none;stroke:currentColor;stroke-width:1.1"/></svg>Arquivos</button>
          </div>
        </div>
        <div class="workarea">
          <div class="work-top">
            <div class="grid" id="grid" data-layout="1"></div>
            <div class="canvas" id="canvas" hidden></div>
            <aside class="files" id="files" aria-label="Arquivos da pasta" hidden></aside>
          </div>
          <div class="split split-y" id="splitEditor" aria-label="Altura do editor" hidden></div>
          <section class="editor-panel" id="editor" aria-label="Editor de arquivos" hidden></section>
        </div>
      </main>
    </div>
    <div id="overlayRoot"></div>
  </div>`;

  const win = getCurrentWindow();
  root.querySelector('#winMin')!.addEventListener('click', () => win.minimize());
  root.querySelector('#winMax')!.addEventListener('click', () => win.toggleMaximize());
  root.querySelector('#winClose')!.addEventListener('click', () => win.hide());

  return {
    app: root.querySelector('.app')!,
    viewSeg: root.querySelector('#viewSeg')!,
    canvas: root.querySelector('#canvas')!,
    appbody: root.querySelector('.appbody')!,
    side: root.querySelector('#side')!,
    btnCollapse: root.querySelector('#btnCollapse')!,
    splitSide: root.querySelector('#splitSide')!,
    splitEditor: root.querySelector('#splitEditor')!,
    editorPanel: root.querySelector('#editor')!,
    btnNew: root.querySelector('#btnNew')!,
    btnEnv: root.querySelector('#btnEnv')!,
    btnFiles: root.querySelector('#btnFiles')!,
    themeSel: root.querySelector('#themeSel')!,
    filesAside: root.querySelector('#files')!,
    sidebarTree: root.querySelector('#tree')!,
    toolbarSeg: root.querySelector('#seg')!,
    summary: root.querySelector('#summary')!,
    grid: root.querySelector('#grid')!,
    overlayRoot: root.querySelector('#overlayRoot')!,
  };
}
