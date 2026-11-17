// Canvas no estilo n8n: um card por sessão, linhas de criação (pai -> filho) e de conversa (SendMessage).
// Arrastar o fundo move a tela; roda do mouse dá zoom; arrastar o card o reposiciona; clicar abre os detalhes.
import { openPath } from '@tauri-apps/plugin-opener';
import { assignToFocus, byId, closeSession, getState, messages, setView } from '../state/store';
import { autoLayout, buildEdges, type Pos } from '../state/canvas';
import type { Session } from '../state/types';
import { kindLabel, pillHtml } from './sidebar';
import { confirmDialog } from './dialog';

const CARD_W = 248;
const CARD_H = 118;
const POS_KEY = 'synapseia.canvasPos';

let root: HTMLElement;
let viewport: HTMLElement;
let world: HTMLElement;
let svg: SVGSVGElement;
let nodesEl: HTMLElement;
let detail: HTMLElement;
let selected: string | null = null;
let view = { x: 0, y: 0, z: 1 };
let saved: Record<string, Pos> = lerPos();
let fitted = false;

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
function lerPos(): Record<string, Pos> { try { return JSON.parse(localStorage.getItem(POS_KEY) ?? '{}'); } catch { return {}; } }
function gravarPos() { try { localStorage.setItem(POS_KEY, JSON.stringify(saved)); } catch { /* sem armazenamento */ } }
const hora = (t: number) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function applyView() {
  world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
}

export function mountCanvas(el: HTMLElement) {
  root = el;
  root.innerHTML = `
    <div class="cv-viewport" tabindex="0" aria-label="Canvas das sessões">
      <div class="cv-world"><svg class="cv-edges" aria-hidden="true"></svg><div class="cv-nodes"></div></div>
    </div>
    <div class="cv-empty" hidden>Nenhuma sessão aberta. Crie uma em "Nova sessão".</div>
    <div class="cv-controls" role="group" aria-label="Zoom do canvas">
      <button type="button" data-z="out" aria-label="Diminuir zoom">−</button>
      <button type="button" data-z="in" aria-label="Aumentar zoom">+</button>
      <button type="button" data-z="fit">Ajustar</button>
      <button type="button" data-z="reset" title="Volta os cards para a arrumação automática">Reorganizar</button>
    </div>
    <div class="cv-legend"><span><i class="lg-spawn"></i>criou</span><span><i class="lg-msg"></i>conversou</span></div>
    <aside class="cv-detail" hidden></aside>`;
  viewport = root.querySelector('.cv-viewport')!;
  world = root.querySelector('.cv-world')!;
  svg = root.querySelector('.cv-edges')!;
  nodesEl = root.querySelector('.cv-nodes')!;
  detail = root.querySelector('.cv-detail')!;

  // mover a tela arrastando o fundo
  viewport.addEventListener('pointerdown', e => {
    if ((e.target as HTMLElement).closest('.cv-node')) return;
    viewport.setPointerCapture(e.pointerId);
    const ini = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    let moveu = false;
    const mover = (ev: PointerEvent) => { moveu = true; view.x = ini.vx + ev.clientX - ini.x; view.y = ini.vy + ev.clientY - ini.y; applyView(); };
    const soltar = () => {
      viewport.removeEventListener('pointermove', mover); viewport.removeEventListener('pointerup', soltar);
      if (!moveu) { selected = null; renderCanvas(); }
    };
    viewport.addEventListener('pointermove', mover); viewport.addEventListener('pointerup', soltar);
  });
  // zoom na posição do mouse
  viewport.addEventListener('wheel', e => {
    e.preventDefault();
    const r = viewport.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.1 : 1 / 1.1);
  }, { passive: false });
  root.querySelectorAll<HTMLButtonElement>('.cv-controls button').forEach(b => b.addEventListener('click', () => {
    const r = viewport.getBoundingClientRect();
    if (b.dataset.z === 'in') zoomAt(r.width / 2, r.height / 2, 1.2);
    else if (b.dataset.z === 'out') zoomAt(r.width / 2, r.height / 2, 1 / 1.2);
    else if (b.dataset.z === 'reset') { saved = {}; gravarPos(); renderCanvas(); fit(); }
    else fit();
  }));
}

function zoomAt(cx: number, cy: number, f: number) {
  const z = Math.min(2, Math.max(0.3, view.z * f));
  const k = z / view.z;
  view = { x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k, z };
  applyView();
}

function fit() {
  const { sessions } = getState();
  if (!sessions.length) return;
  const pos = autoLayout(sessions, saved);
  const xs = Object.values(pos).map(p => p.x), ys = Object.values(pos).map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs) + CARD_W, maxY = Math.max(...ys) + CARD_H;
  const r = viewport.getBoundingClientRect();
  if (!r.width) return;
  const z = Math.min(1.2, Math.max(0.3, Math.min((r.width - 80) / (maxX - minX), (r.height - 80) / (maxY - minY))));
  view = { z, x: (r.width - (maxX - minX) * z) / 2 - minX * z, y: (r.height - (maxY - minY) * z) / 2 - minY * z };
  applyView();
}

function edgePath(a: Pos, b: Pos): { d: string; mx: number; my: number } {
  // da direita do card da esquerda até a esquerda do card da direita
  const [p, q] = a.x <= b.x ? [a, b] : [b, a];
  const x1 = p.x + CARD_W, y1 = p.y + CARD_H / 2, x2 = q.x, y2 = q.y + CARD_H / 2;
  const dx = Math.max(60, Math.abs(x2 - x1) / 2);
  return { d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
}

function cardHtml(s: Session, p: Pos, info: { filhos: number; msgs: number }) {
  const pasta = s.kind === 'nota' ? 'nota' : s.cwd;
  return `<div class="cv-node${selected === s.id ? ' selected' : ''}" data-id="${esc(s.id)}" style="left:${p.x}px;top:${p.y}px" role="button" tabindex="0" aria-label="${esc(s.name)}">
    <span class="cv-port in" aria-hidden="true"></span><span class="cv-port out" aria-hidden="true"></span>
    <div class="cv-node-top"><span class="tag">${kindLabel(s.kind)}</span>${s.bypass ? '<span class="tag tag-bypass">bypass</span>' : ''}<span class="cv-sp"></span>${pillHtml(s)}</div>
    <div class="cv-name">${esc(s.name)}</div>
    <div class="cv-cwd" title="${esc(pasta)}">${esc(pasta)}</div>
    <div class="cv-foot"><span>${info.filhos} ${info.filhos === 1 ? 'filho' : 'filhos'}</span><span>${info.msgs} ${info.msgs === 1 ? 'mensagem' : 'mensagens'}</span></div>
  </div>`;
}

let dragging = false;
let pulseTimer: number | undefined;

export function renderCanvas() {
  if (!root || root.hidden || dragging) return;
  const { sessions } = getState();
  root.querySelector<HTMLElement>('.cv-empty')!.hidden = sessions.length > 0;
  const pos = autoLayout(sessions, saved);
  const edges = buildEdges(sessions, messages);
  const agora = Date.now();

  // linhas
  const partes: string[] = [];
  for (const e of edges) {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) continue;
    const { d, mx, my } = edgePath(a, b);
    if (e.kind === 'spawn') partes.push(`<path class="cv-edge spawn" d="${d}"/>`);
    else {
      const recente = agora - e.last < 5000 ? ' recent' : '';
      partes.push(`<path class="cv-edge msg${recente}" d="${d}"/><g class="cv-badge${recente}" transform="translate(${mx},${my})"><rect x="-15" y="-10" width="30" height="20" rx="10"/><text text-anchor="middle" dy="4">${e.count}</text></g>`);
    }
  }
  const xs = Object.values(pos).map(p => p.x + CARD_W + 400), ys = Object.values(pos).map(p => p.y + CARD_H + 400);
  svg.setAttribute('width', String(Math.max(2000, ...xs)));
  svg.setAttribute('height', String(Math.max(1400, ...ys)));
  svg.innerHTML = partes.join('');

  // cards
  const msgsPor = new Map<string, number>();
  for (const m of messages.resolved(sessions)) {
    msgsPor.set(m.from, (msgsPor.get(m.from) ?? 0) + 1);
    if (m.to) msgsPor.set(m.to, (msgsPor.get(m.to) ?? 0) + 1);
  }
  nodesEl.innerHTML = sessions.map(s => cardHtml(s, pos[s.id], {
    filhos: sessions.filter(x => x.parent === s.id).length,
    msgs: msgsPor.get(s.id) ?? 0,
  })).join('');
  nodesEl.querySelectorAll<HTMLElement>('.cv-node').forEach(wireNode);

  if (!fitted && sessions.length) { fitted = true; requestAnimationFrame(fit); }
  renderDetail();

  // tira o destaque de "mensagem recente" depois de 5 s
  window.clearTimeout(pulseTimer);
  if (edges.some(e => e.kind === 'message' && agora - e.last < 5000)) pulseTimer = window.setTimeout(renderCanvas, 5200);
}

function wireNode(n: HTMLElement) {
  const id = n.dataset.id!;
  n.addEventListener('pointerdown', e => {
    e.stopPropagation();
    n.setPointerCapture(e.pointerId);
    const s = byId(id);
    if (!s) return;
    const base = { ...(autoLayout(getState().sessions, saved)[id]) };
    const ini = { x: e.clientX, y: e.clientY };
    let moveu = false;
    dragging = true;
    const mover = (ev: PointerEvent) => {
      const dx = (ev.clientX - ini.x) / view.z, dy = (ev.clientY - ini.y) / view.z;
      if (!moveu && Math.abs(dx) + Math.abs(dy) < 4) return;
      moveu = true;
      saved[id] = { x: Math.round(base.x + dx), y: Math.round(base.y + dy) };
      n.style.left = `${saved[id].x}px`; n.style.top = `${saved[id].y}px`;
    };
    const soltar = () => {
      n.removeEventListener('pointermove', mover); n.removeEventListener('pointerup', soltar);
      dragging = false;
      if (moveu) { gravarPos(); renderCanvas(); }
      else { selected = id; renderCanvas(); }
    };
    n.addEventListener('pointermove', mover); n.addEventListener('pointerup', soltar);
  });
  n.addEventListener('dblclick', () => abrirNoTerminal(id));
  n.addEventListener('keydown', e => { if (e.key === 'Enter') { selected = id; renderCanvas(); } });
}

function abrirNoTerminal(id: string) {
  setView('term');
  assignToFocus(id);
}

function renderDetail() {
  const s = selected ? byId(selected) : undefined;
  detail.hidden = !s;
  if (!s) return;
  const { sessions } = getState();
  const pai = s.parent ? byId(s.parent) : undefined;
  const filhos = sessions.filter(x => x.parent === s.id);
  const h = messages.forSession(s.id, sessions);
  const lista = (ms: typeof h.sent, campo: 'para' | 'de') => ms.length
    ? `<ul class="cv-msgs">${ms.slice(0, 10).map(m => `<li><span class="cv-msg-meta">${hora(m.at)} · ${campo} ${esc(campo === 'para' ? m.toName : (byId(m.from)?.name ?? '?'))}</span>${esc(m.preview || '(sem texto)')}</li>`).join('')}</ul>`
    : '<p class="cv-none">Nenhuma ainda.</p>';
  detail.innerHTML = `
    <div class="cv-d-head"><h3>${esc(s.name)}</h3><button type="button" class="fbtn" id="cvClose" aria-label="Fechar detalhes">×</button></div>
    <div class="cv-d-tags"><span class="tag">${kindLabel(s.kind)}</span>${s.bypass ? '<span class="tag tag-bypass">bypass</span>' : ''}${pillHtml(s)}</div>
    <dl class="cv-d-info">
      ${s.kind !== 'nota' ? `<dt>Pasta</dt><dd class="mono">${esc(s.cwd)}</dd>` : ''}
      ${pai ? `<dt>Criado por</dt><dd><button type="button" class="link-btn" data-go="${esc(pai.id)}">${esc(pai.name)}</button></dd>` : ''}
      ${filhos.length ? `<dt>Filhos</dt><dd>${filhos.map(f => `<button type="button" class="link-btn" data-go="${esc(f.id)}">${esc(f.name)}</button>`).join(', ')}</dd>` : ''}
      ${s.claudeSessionId ? `<dt>Conversa</dt><dd class="mono">${esc(s.claudeSessionId)}</dd>` : ''}
    </dl>
    <h4>Mensagens enviadas</h4>${lista(h.sent, 'para')}
    <h4>Mensagens recebidas</h4>${lista(h.received, 'de')}
    <div class="actions">
      ${s.kind !== 'nota' ? '<button type="button" class="btn" id="cvFolder">Abrir pasta</button>' : ''}
      <button type="button" class="btn" id="cvKill">Encerrar</button>
      <button type="button" class="btn primary" id="cvOpen">Abrir no terminal</button>
    </div>`;
  detail.querySelector('#cvClose')!.addEventListener('click', () => { selected = null; renderCanvas(); });
  detail.querySelector('#cvOpen')!.addEventListener('click', () => abrirNoTerminal(s.id));
  detail.querySelector('#cvFolder')?.addEventListener('click', () => { void openPath(s.cwd); });
  detail.querySelector('#cvKill')!.addEventListener('click', async () => {
    if (await confirmDialog(`Encerrar "${s.name}"?`, 'O processo e tudo que ele abriu serão fechados. A pasta continua no disco.', 'Encerrar')) {
      selected = null;
      closeSession(s.id);
    }
  });
  detail.querySelectorAll<HTMLButtonElement>('[data-go]').forEach(b => b.addEventListener('click', () => { selected = b.dataset.go!; renderCanvas(); }));
}

/** Chamado ao entrar no canvas: centraliza na primeira vez. */
export function onShowCanvas() {
  renderCanvas();
  if (!fitted) requestAnimationFrame(fit);
}
