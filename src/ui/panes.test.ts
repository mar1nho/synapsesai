// @vitest-environment happy-dom
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TermHost as FakeHost } from '../test/fake-termhost';

vi.mock('../terminal/termhost', () => import('../test/fake-termhost'));
vi.mock('@tauri-apps/plugin-opener', () => ({ openPath: vi.fn() }));
const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

let store: typeof import('../state/store');
let panes: typeof import('./panes');
let grid: HTMLElement;

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = '<div id="grid"></div>';
  grid = document.getElementById('grid')!;
  invoke.mockReset();
  store = await import('../state/store');
  panes = await import('./panes');
});
afterEach(() => vi.useRealTimers());

const nova = (name: string, extra: Record<string, unknown> = {}) =>
  store.createSession({ name, kind: 'claude', cwd: 'C:\\proj', bypass: false, ...extra });
const paineis = () => [...grid.querySelectorAll<HTMLElement>('.pane')];
const naTela = () => paineis().filter(p => !p.hidden);
const host = (id: string) => store.hosts.get(id) as unknown as FakeHost;

test('sem sessões: um painel vazio na tela, os outros escondidos', () => {
  panes.renderPanes(grid);
  expect(paineis()).toHaveLength(4);
  expect(naTela()).toHaveLength(1);
  expect(naTela()[0].querySelector('.pane-name')!.textContent).toBe('Painel vazio');
  expect(naTela()[0].querySelector('.pane-empty')).not.toBeNull();
  expect(grid.dataset.layout).toBe('1');
});

test('cabeçalho mostra nome, tipo, bypass, pasta e status', async () => {
  await nova('Orquestrador', { bypass: true, cwd: 'C:\\Docs\\Pasta & Cia' });
  panes.renderPanes(grid);
  const cab = naTela()[0].querySelector('.pane-head')!;

  expect(cab.querySelector('.pane-name')!.textContent).toBe('Orquestrador');
  expect(cab.querySelector('.tag')!.textContent).toBe('Claude');
  expect(cab.querySelector('.tag-bypass')).not.toBeNull();
  expect(cab.querySelector('.pane-cwd')!.textContent).toBe('C:\\Docs\\Pasta & Cia');
  expect(cab.querySelector('.pill')!.textContent).toBe('idle');
});

test('nome e pasta com HTML aparecem como texto', async () => {
  await nova('<img src=x>', { cwd: 'C:\\<b>x</b>' });
  panes.renderPanes(grid);
  expect(grid.querySelector('img')).toBeNull();
  expect(grid.querySelector('.pane-head b')).toBeNull();
  expect(grid.querySelector('.pane-name')!.textContent).toBe('<img src=x>');
});

test('o terminal é movido para o painel, nunca recriado, e sai do DOM quando sai de vista', async () => {
  store.setLayoutCount(1);
  const a = await nova('A');
  const b = await nova('B', { focus: false });
  panes.renderPanes(grid);
  const elA = host(a.id).el;
  expect(naTela()[0].querySelector('.pane-body')!.contains(elA)).toBe(true);
  expect(host(b.id).el.isConnected).toBe(false);

  store.assignToFocus(b.id);
  panes.renderPanes(grid);
  expect(host(a.id).el).toBe(elA);
  expect(elA.isConnected).toBe(false);
  expect(naTela()[0].querySelector('.pane-body')!.contains(host(b.id).el)).toBe(true);
  expect(host(a.id).descartado).toBe(false);
});

test('mostra tantos painéis quanto o layout visível e marca o que está em foco', async () => {
  store.setLayoutCount(2);
  await nova('A');
  await nova('B');
  await nova('C', { focus: false });
  panes.renderPanes(grid);

  expect(naTela()).toHaveLength(2);
  expect(paineis().map(p => p.classList.contains('focused')).indexOf(true)).toBe(store.getState().layout.focus);
});

test('tocar num painel leva o foco para ele', async () => {
  store.setLayoutCount(2);
  await nova('A');
  await nova('B');
  panes.renderPanes(grid);
  const outro = store.getState().layout.focus === 0 ? 1 : 0;

  paineis()[outro].dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(store.getState().layout.focus).toBe(outro);
});

test('erro ao iniciar troca o terminal por um aviso; "Tentar de novo" recria o terminal', async () => {
  const a = await nova('A');
  panes.renderPanes(grid);
  const primeiro = host(a.id);

  store.setError(a.id, 'pasta não encontrada: C:\\<sumiu>');
  panes.renderPanes(grid);
  expect(grid.querySelector('.pane-error p')!.textContent).toBe('pasta não encontrada: C:\\<sumiu>');
  expect(primeiro.el.isConnected).toBe(false);

  grid.querySelector<HTMLButtonElement>('.pane-error button')!.click();
  panes.renderPanes(grid);
  expect(primeiro.descartado).toBe(true);
  expect(host(a.id)).not.toBe(primeiro);
  expect(grid.querySelector('.pane-error')).toBeNull();
  expect(host(a.id).el.isConnected).toBe(true);
});

test('A+ e A− mudam a fonte da sessão, dentro do limite', async () => {
  const a = await nova('A', { font: 17 });
  panes.renderPanes(grid);
  grid.querySelector<HTMLButtonElement>('.fbtn[data-font="1"]')!.click();
  panes.renderPanes(grid);
  grid.querySelector<HTMLButtonElement>('.fbtn[data-font="1"]')!.click();
  expect(store.byId(a.id)!.font).toBe(18);
  expect(host(a.id).fontes).toEqual([18, 18]);

  panes.renderPanes(grid);
  grid.querySelector<HTMLButtonElement>('.fbtn[data-font="-1"]')!.click();
  expect(store.byId(a.id)!.font).toBe(17);
});

test('nota: mostra o texto, guarda o que é digitado e grava 1 s depois da última tecla', async () => {
  const n = await nova('Ideias', { kind: 'nota', cwd: '' });
  store.setNote(n.id, 'texto salvo');
  vi.useFakeTimers();
  invoke.mockResolvedValue(undefined);
  panes.renderPanes(grid);
  const ta = grid.querySelector<HTMLTextAreaElement>('textarea.note')!;
  expect(ta.value).toBe('texto salvo');
  expect(grid.querySelector('.fbtn')).toBeNull();

  ta.value = 'a';
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  vi.advanceTimersByTime(700);
  ta.value = 'ab';
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  vi.advanceTimersByTime(700);
  expect(invoke).not.toHaveBeenCalled();
  expect(store.notes.get(n.id)).toBe('ab');

  vi.advanceTimersByTime(300);
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith('note_write', { id: n.id, text: 'ab' });
});

test('nota: falha ao gravar aparece no cabeçalho e some quando a gravação volta a funcionar', async () => {
  const n = await nova('Ideias', { kind: 'nota', cwd: '' });
  vi.useFakeTimers();
  panes.renderPanes(grid);
  const digitar = async (texto: string) => {
    const ta = grid.querySelector<HTMLTextAreaElement>('textarea.note')!;
    ta.value = texto;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1000);
  };

  invoke.mockRejectedValueOnce(new Error('disco cheio'));
  await digitar('a');
  expect(grid.querySelector('.pane-warn')!.textContent).toBe('Não consegui salvar a nota');
  // o campo continua o mesmo: o texto digitado não se perde
  expect(grid.querySelector<HTMLTextAreaElement>('textarea.note')!.value).toBe('a');

  invoke.mockResolvedValueOnce(undefined);
  await digitar('ab');
  expect(grid.querySelector('.pane-warn')).toBeNull();
  expect(store.byId(n.id)).toBeDefined();
});

test('focusCurrent leva o teclado ao terminal do painel em foco', async () => {
  const a = await nova('A');
  panes.renderPanes(grid);
  panes.focusCurrent();
  expect(host(a.id).focos).toBe(1);
});
