// @vitest-environment happy-dom
import { test, expect, vi, beforeEach } from 'vitest';

vi.mock('../terminal/termhost', () => import('../test/fake-termhost'));
const openPath = vi.fn();
vi.mock('@tauri-apps/plugin-opener', () => ({ openPath: (...a: unknown[]) => openPath(...a) }));

let store: typeof import('../state/store');
let menu: typeof import('./context-menu');

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = '';
  openPath.mockReset();
  store = await import('../state/store');
  menu = await import('./context-menu');
});

const nova = (name: string, extra: Record<string, unknown> = {}) =>
  store.createSession({ name, kind: 'claude', cwd: 'C:\\proj', bypass: false, ...extra });
const rotulos = () => [...document.querySelectorAll('.menu button')].map(b => b.textContent);
const item = (texto: string) => [...document.querySelectorAll<HTMLButtonElement>('.menu button')].find(b => b.textContent === texto)!;
const botao = (texto: string) => [...document.querySelectorAll<HTMLButtonElement>('.dialog button')].find(b => b.textContent === texto)!;
const tick = () => new Promise(r => setTimeout(r, 0));

test('sessão de terminal tem as três ações; nota não tem "abrir pasta"', async () => {
  const a = await nova('A');
  const n = await nova('Nota', { kind: 'nota', cwd: '' });

  menu.openContextMenu(a.id, 10, 10);
  expect(rotulos()).toEqual(['Encerrar sessão', 'Abrir pasta no Explorer', 'Copiar nome']);
  menu.openContextMenu(n.id, 10, 10);
  expect(rotulos()).toEqual(['Encerrar sessão', 'Copiar nome']);
  // abrir outro menu fecha o anterior
  expect(document.querySelectorAll('.menu')).toHaveLength(1);
});

test('id desconhecido não abre menu', () => {
  menu.openContextMenu('nao-existe', 10, 10);
  expect(document.querySelector('.menu')).toBeNull();
});

test('encerrar pede confirmação: confirmando fecha a sessão, cancelando mantém', async () => {
  const a = await nova('A');

  menu.openContextMenu(a.id, 10, 10);
  item('Encerrar sessão').click();
  await tick();
  expect(document.querySelector('.dialog h2')!.textContent).toBe('Encerrar "A"?');
  botao('Cancelar').click();
  await tick();
  expect(store.byId(a.id)).toBeDefined();

  menu.openContextMenu(a.id, 10, 10);
  item('Encerrar sessão').click();
  await tick();
  botao('Encerrar').click();
  await tick();
  expect(store.byId(a.id)).toBeUndefined();
});

test('abrir pasta chama o Explorer na pasta da sessão', async () => {
  const a = await nova('A', { cwd: 'C:\\Docs\\Pasta & Cia' });
  menu.openContextMenu(a.id, 10, 10);
  item('Abrir pasta no Explorer').click();

  expect(openPath).toHaveBeenCalledWith('C:\\Docs\\Pasta & Cia');
  expect(document.querySelector('.menu')).toBeNull();
});

test('copiar nome manda o nome para a área de transferência', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  const a = await nova('Revisão');
  menu.openContextMenu(a.id, 10, 10);
  item('Copiar nome').click();

  expect(writeText).toHaveBeenCalledWith('Revisão');
});

test('clicar fora ou apertar Esc fecha o menu', async () => {
  const a = await nova('A');

  menu.openContextMenu(a.id, 10, 10);
  document.body.click();
  expect(document.querySelector('.menu')).toBeNull();

  menu.openContextMenu(a.id, 10, 10);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(document.querySelector('.menu')).toBeNull();
});

test('o menu não sai da janela quando o clique é perto da borda', async () => {
  const a = await nova('A');
  menu.openContextMenu(a.id, 99999, 99999);
  const m = document.querySelector<HTMLElement>('.menu')!;

  expect(parseFloat(m.style.left)).toBe(window.innerWidth - 220);
  expect(parseFloat(m.style.top)).toBe(window.innerHeight - 120);
});
