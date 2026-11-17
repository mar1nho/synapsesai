// Barra superior: seletor de layout 1/2/3/4 e resumo.
import { getState, setLayoutCount } from '../state/store';

export function wireToolbar(seg: HTMLElement) {
  seg.querySelectorAll<HTMLButtonElement>('button[data-layout]').forEach(b =>
    b.addEventListener('click', () => setLayoutCount(Number(b.dataset.layout) as 1 | 2 | 3 | 4)));
}

export function renderToolbar(seg: HTMLElement, summary: HTMLElement) {
  const { preferredN, sessions } = getState();
  seg.querySelectorAll<HTMLButtonElement>('button[data-layout]').forEach(b =>
    b.setAttribute('aria-pressed', String(Number(b.dataset.layout) === preferredN)));
  const terms = sessions.filter(s => s.kind !== 'nota');
  const run = terms.filter(s => s.status === 'run').length;
  const wait = terms.filter(s => s.status === 'wait').length;
  summary.innerHTML = `<span><b>${terms.length}</b> ${terms.length === 1 ? 'sessão' : 'sessões'}</span><span><b>${run}</b> trabalhando</span><span><b>${wait}</b> esperando você</span>`;
}
