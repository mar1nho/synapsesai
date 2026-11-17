// Grade de painéis. Os terminais nunca são recriados: o elemento de cada TermHost
// é movido para o painel certo e retirado quando sai de vista.
import { invoke } from '@tauri-apps/api/core';
import { errors, getState, hosts, notes, retry, setFocus, setFont, setNote, byId } from '../state/store';
import { kindLabel, pillHtml } from './sidebar';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

interface Slot { pane: HTMLElement; head: HTMLElement; body: HTMLElement; sessionId: string; bodyKey: string; }
const slots: Slot[] = [];
const noteTimers = new Map<string, number>();
const noteErrors = new Set<string>();

function makeSlot(grid: HTMLElement, i: number): Slot {
  const pane = document.createElement('section');
  pane.className = 'pane';
  pane.dataset.idx = String(i);
  const head = document.createElement('header');
  head.className = 'pane-head';
  const body = document.createElement('div');
  body.className = 'pane-body';
  pane.append(head, body);
  pane.addEventListener('pointerdown', () => setFocus(i));
  pane.addEventListener('focusin', () => setFocus(i));
  grid.appendChild(pane);
  return { pane, head, body, sessionId: '\u0000', bodyKey: '' };
}

export function renderPanes(grid: HTMLElement) {
  const { layout } = getState();
  grid.dataset.layout = String(layout.n);
  while (slots.length < 4) slots.push(makeSlot(grid, slots.length));
  const visible = new Set<string>();

  slots.forEach((slot, i) => {
    const show = i < layout.n;
    slot.pane.hidden = !show;
    slot.pane.classList.toggle('focused', show && i === layout.focus);
    if (!show) return;
    const id = layout.panes[i] ?? '';
    const s = id ? byId(id) : undefined;
    if (s) visible.add(s.id);

    // cabeçalho (barato; sempre atualiza)
    if (!s) {
      slot.head.innerHTML = '<span class="pane-name">Painel vazio</span>';
    } else {
      const warn = noteErrors.has(s.id) ? '<span class="pane-warn">Não consegui salvar a nota</span>' : '';
      slot.head.innerHTML = `<span class="pane-name">${esc(s.name)}</span><span class="tag">${kindLabel(s.kind)}</span>` +
        (s.bypass ? '<span class="tag tag-bypass">bypass</span>' : '') +
        `<span class="pane-cwd" title="${esc(s.cwd)}">${s.kind === 'nota' ? '' : esc(s.cwd)}</span>${warn}${pillHtml(s)}` +
        (s.kind !== 'nota' ? `<button type="button" class="fbtn" data-font="-1" aria-label="Diminuir fonte de ${esc(s.name)}">A−</button><button type="button" class="fbtn" data-font="1" aria-label="Aumentar fonte de ${esc(s.name)}">A+</button>` : '');
      slot.head.querySelectorAll<HTMLButtonElement>('.fbtn').forEach(b =>
        b.addEventListener('click', () => setFont(s.id, s.font + Number(b.dataset.font))));
    }

    // corpo (só muda quando a sessão do painel ou o tipo de conteúdo muda)
    const err = s ? errors.get(s.id) : undefined;
    const key = !s ? 'vazio' : err ? `erro:${s.id}:${err}` : s.kind === 'nota' ? `nota:${s.id}` : `term:${s.id}`;
    if (slot.bodyKey === key) return;
    slot.bodyKey = key;
    slot.sessionId = s?.id ?? '';
    // tira o terminal que estava aqui (se não for o mesmo)
    for (const child of Array.from(slot.body.children)) child.remove();

    if (!s) {
      slot.body.innerHTML = '<div class="pane-empty"><p>Escolha uma sessão na lista ou crie uma em Nova sessão.</p></div>';
    } else if (err) {
      slot.body.innerHTML = `<div class="pane-error"><p>${esc(err)}</p><button type="button" class="btn primary">Tentar de novo</button></div>`;
      slot.body.querySelector('button')!.addEventListener('click', () => retry(s.id));
    } else if (s.kind === 'nota') {
      const ta = document.createElement('textarea');
      ta.className = 'note';
      ta.spellcheck = false;
      ta.setAttribute('aria-label', `Nota ${s.name}`);
      ta.value = notes.get(s.id) ?? '';
      ta.addEventListener('input', () => {
        setNote(s.id, ta.value);
        window.clearTimeout(noteTimers.get(s.id));
        noteTimers.set(s.id, window.setTimeout(() => {
          invoke('note_write', { id: s.id, text: ta.value })
            .then(() => { if (noteErrors.delete(s.id)) renderPanes(grid); })
            .catch(() => { noteErrors.add(s.id); renderPanes(grid); });
        }, 1000));
      });
      slot.body.appendChild(ta);
    } else {
      hosts.get(s.id)?.attach(slot.body);
    }
  });

  // terminais que não estão em nenhum painel visível saem do DOM (continuam rodando)
  for (const [id, h] of hosts) if (!visible.has(id) && h.el.isConnected) h.detach();
}

export function focusCurrent() {
  const { layout } = getState();
  const id = layout.panes[layout.focus];
  if (id) hosts.get(id)?.focus();
}
