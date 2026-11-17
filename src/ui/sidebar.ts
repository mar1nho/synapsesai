// Lista lateral: árvore de sessões com status, painel e menu de contexto.
import { orderTree } from '../state/tree';
import { assignToFocus, getState } from '../state/store';
import type { Session } from '../state/types';
import { openContextMenu } from './context-menu';

const KIND_LABEL: Record<string, string> = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini', ps: 'PowerShell', cmd: 'CMD', nota: 'Nota' };

export function pillHtml(s: Session): string {
  switch (s.status) {
    case 'note': return '<span class="pill p-note">nota</span>';
    case 'run': return '<span class="pill p-run">executando</span>';
    case 'wait': return '<span class="pill p-wait">esperando você</span>';
    case 'done': return '<span class="pill p-done">terminou</span>';
    default: return '<span class="pill p-idle">idle</span>';
  }
}

export const kindLabel = (k: string) => KIND_LABEL[k] ?? k;

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function renderSidebar(ul: HTMLUListElement) {
  const { sessions, layout } = getState();
  if (sessions.length === 0) {
    ul.innerHTML = '<li class="tree-empty">Nenhuma sessão ainda. Use "Nova sessão".</li>';
    return;
  }
  ul.innerHTML = orderTree(sessions).map(({ session: s, depth }) => {
    const j = layout.panes.indexOf(s.id);
    const visible = j >= 0 && j < layout.n;
    const cls = `item${depth ? ' child' : ''}${visible && j === layout.focus ? ' is-focused' : ''}`;
    const pad = depth ? ` style="padding-left:${10 + depth * 22}px"` : '';
    const guide = depth ? ` data-depth="${depth}"` : '';
    const kind = s.kind === 'nota' ? 'Nota' : `${kindLabel(s.kind)}${s.bypass ? ' · bypass' : ''}`;
    const ini = esc(s.name.trim().split(/\s+/).map(p => p[0] ?? '').join('').slice(0, 2).toUpperCase() || '?');
    return `<li><button type="button" class="${cls}"${pad}${guide} data-id="${esc(s.id)}" data-ini="${ini}" title="${esc(s.name)}">
      <span class="item-main"><span class="item-name">${esc(s.name)}</span><span class="item-kind">${esc(kind)}</span></span>
      ${visible ? `<span class="slot" title="no painel ${j + 1}">${j + 1}</span><span class="sr">no painel ${j + 1}</span>` : ''}
      ${pillHtml(s)}
    </button></li>`;
  }).join('');
  ul.querySelectorAll<HTMLElement>('.item.child').forEach(el => {
    const d = Number(el.dataset.depth ?? '1');
    el.style.setProperty('--guide-left', `${(d - 1) * 22 + 15}px`);
  });
}

export function wireSidebar(ul: HTMLUListElement) {
  ul.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.item');
    if (b?.dataset.id) assignToFocus(b.dataset.id);
  });
  ul.addEventListener('contextmenu', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.item');
    if (!b?.dataset.id) return;
    e.preventDefault();
    openContextMenu(b.dataset.id, e.clientX, e.clientY);
  });
}
