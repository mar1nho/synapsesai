// @vitest-environment happy-dom
import { test, expect, vi, beforeEach } from 'vitest';

vi.mock('../terminal/termhost', () => import('../test/fake-termhost'));
vi.mock('@tauri-apps/plugin-opener', () => ({ openPath: vi.fn() }));

let store: typeof import('../state/store');
let sidebar: typeof import('./sidebar');
let ul: HTMLUListElement;

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = '';
  store = await import('../state/store');
  sidebar = await import('./sidebar');
  ul = document.createElement('ul');
  document.body.appendChild(ul);
});

const nova = (name: string, extra: Record<string, unknown> = {}) =>
  store.createSession({ name, kind: 'claude', cwd: 'C:\\proj', bypass: false, ...extra });
const itens = () => [...ul.querySelectorAll<HTMLElement>('.item')];

test('sem sessões, mostra a orientação', () => {
  sidebar.renderSidebar(ul);
  expect(ul.textContent).toContain('Nenhuma sessão ainda');
  expect(itens()).toHaveLength(0);
});

test('lista em árvore: filho logo abaixo do pai, recuado', async () => {
  const pai = await nova('Orquestrador', { bypass: true });
  await nova('Solta', { kind: 'ps' });
  await nova('Pesquisa', { parent: pai.id });
  sidebar.renderSidebar(ul);

  expect(itens().map(i => i.querySelector('.item-name')!.textContent)).toEqual(['Orquestrador', 'Pesquisa', 'Solta']);
  const [iPai, iFilho, iSolta] = itens();
  expect(iPai.classList.contains('child')).toBe(false);
  expect(iFilho.classList.contains('child')).toBe(true);
  expect(iFilho.style.paddingLeft).toBe('32px');
  expect(iPai.querySelector('.item-kind')!.textContent).toBe('Claude · bypass');
  expect(iSolta.querySelector('.item-kind')!.textContent).toBe('PowerShell');
  expect(iPai.dataset.ini).toBe('O');
});

test('mostra o número do painel só para quem está na tela e destaca o painel em foco', async () => {
  store.setLayoutCount(2);
  const a = await nova('A');
  const b = await nova('B');
  const c = await nova('C', { focus: false });
  sidebar.renderSidebar(ul);

  const porId = (id: string) => itens().find(i => i.dataset.id === id)!;
  const { layout } = store.getState();
  expect(porId(a.id).querySelector('.slot')!.textContent).toBe(String(layout.panes.indexOf(a.id) + 1));
  expect(porId(b.id).querySelector('.slot')).not.toBeNull();
  expect(porId(c.id).querySelector('.slot')).toBeNull();
  expect(itens().filter(i => i.classList.contains('is-focused')).map(i => i.dataset.id)).toEqual([layout.panes[layout.focus]]);
});

test('o status vira o texto certo', async () => {
  const a = await nova('A');
  const n = await nova('Nota', { kind: 'nota', cwd: '' });
  const texto = (id: string) => itens().find(i => i.dataset.id === id)!.querySelector('.pill')!.textContent;

  sidebar.renderSidebar(ul);
  expect(texto(a.id)).toBe('idle');
  expect(texto(n.id)).toBe('nota');
  for (const [st, esperado] of [['run', 'executando'], ['wait', 'esperando você'], ['done', 'terminou']] as const) {
    store.setStatus(a.id, st);
    sidebar.renderSidebar(ul);
    expect(texto(a.id)).toBe(esperado);
  }
});

test('nome com HTML aparece como texto, nunca vira elemento', async () => {
  const nome = '<img src=x onerror="alert(1)"> & "aspas"';
  await nova(nome);
  sidebar.renderSidebar(ul);

  expect(ul.querySelector('img')).toBeNull();
  expect(ul.querySelector('.item-name')!.textContent).toBe(nome);
  expect(itens()[0].title).toBe(nome);
});

test('clicar leva a sessão ao painel em foco', async () => {
  store.setLayoutCount(1);
  const a = await nova('A');
  const b = await nova('B', { focus: false });
  sidebar.wireSidebar(ul);
  sidebar.renderSidebar(ul);
  expect(store.getState().layout.panes[0]).toBe(a.id);

  itens().find(i => i.dataset.id === b.id)!.querySelector<HTMLElement>('.item-name')!.click();
  expect(store.getState().layout.panes[0]).toBe(b.id);
});

test('botão direito abre o menu da sessão', async () => {
  const a = await nova('A');
  sidebar.wireSidebar(ul);
  sidebar.renderSidebar(ul);

  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
  itens().find(i => i.dataset.id === a.id)!.dispatchEvent(ev);
  expect(ev.defaultPrevented).toBe(true);
  expect(document.querySelector('.menu')).not.toBeNull();
});
