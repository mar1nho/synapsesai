// Lógica pura dos painéis: qual sessão aparece em qual painel.
import type { Layout } from './types';

/** Leva a sessão ao painel em foco; se já está em outro painel, os dois trocam. */
export function assign(l: Layout, id: string): Layout {
  const panes = [...l.panes];
  const j = panes.indexOf(id);
  if (j === l.focus) return { ...l, panes };
  if (j >= 0) panes[j] = panes[l.focus];
  panes[l.focus] = id;
  return { ...l, panes };
}

/** Muda a quantidade de painéis; painéis novos recebem sessões que não estão visíveis. */
export function setCount(l: Layout, n: 1 | 2 | 3 | 4, allIds: string[]): Layout {
  const panes = [...l.panes];
  while (panes.length < 4) panes.push('');
  for (let i = 0; i < n; i++) {
    if (panes[i]) continue;
    const visiveis = new Set(panes.slice(0, n).filter(Boolean));
    const livre = allIds.find(id => !visiveis.has(id));
    if (livre) {
      const k = panes.indexOf(livre);
      if (k >= 0) panes[k] = '';
      panes[i] = livre;
    }
  }
  return { n, panes, focus: Math.min(l.focus, n - 1) };
}

/** Quantos painéis aparecem: nunca mais que o número de sessões (mínimo 1). */
export function effectiveCount(n: number, sessions: number): 1 | 2 | 3 | 4 {
  return Math.max(1, Math.min(n, sessions, 4)) as 1 | 2 | 3 | 4;
}

/** Layout que a tela mostra: sem painéis vazios quando há menos sessões que painéis.
 *  O layout escolhido (l.n) fica guardado; isto só calcula o que aparece. */
export function visibleLayout(l: Layout, allIds: string[]): Layout {
  const n = effectiveCount(l.n, allIds.length);
  if (n === l.n) return l;
  const existe = new Set(allIds);
  const emFoco = l.panes[l.focus];
  const ordem = l.panes.filter(p => p && existe.has(p));
  for (const id of allIds) if (!ordem.includes(id)) ordem.push(id);
  const panes = [...ordem.slice(0, n), '', '', '', ''].slice(0, 4);
  const focus = Math.max(0, panes.slice(0, n).indexOf(emFoco));
  return { n, panes, focus };
}

/** Tira a sessão dos painéis; o painel que ela ocupava recebe outra não visível (ou fica vazio). */
export function removeSession(l: Layout, id: string, allIds: string[]): Layout {
  const panes = l.panes.map(p => (p === id ? '' : p));
  const restantes = allIds.filter(x => x !== id);
  return setCount({ ...l, panes }, l.n, restantes);
}
