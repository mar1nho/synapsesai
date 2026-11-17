// @vitest-environment happy-dom
import { test, expect, vi, beforeEach } from 'vitest';
import type { TermHost as FakeHost } from '../test/fake-termhost';

vi.mock('../terminal/termhost', () => import('../test/fake-termhost'));
vi.mock('@tauri-apps/plugin-opener', () => ({ openPath: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

let store: typeof import('../state/store');

// Os atalhos ficam presos à janela: liga uma vez só e troca o store a cada teste não funcionaria,
// então cada teste carrega módulos novos e desliga o ouvinte anterior.
let desligar: (() => void) | null = null;

beforeEach(async () => {
  desligar?.();
  vi.resetModules();
  document.body.innerHTML = '';
  store = await import('../state/store');
  const { wireShortcuts } = await import('./shortcuts');
  const original = window.addEventListener.bind(window);
  const registrados: [string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined][] = [];
  window.addEventListener = ((t: string, l: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => {
    registrados.push([t, l, o]);
    original(t, l, o);
  }) as typeof window.addEventListener;
  wireShortcuts();
  window.addEventListener = original as typeof window.addEventListener;
  desligar = () => { for (const [t, l, o] of registrados) window.removeEventListener(t, l, o); };
});

const nova = (name: string) => store.createSession({ name, kind: 'claude', cwd: 'C:\\proj', bypass: false });
const tecla = (code: string, mods: Partial<KeyboardEventInit> = { ctrlKey: true, shiftKey: true }) => {
  const e = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...mods });
  window.dispatchEvent(e);
  return e;
};

test('Ctrl+Shift+N abre o diálogo de nova sessão', () => {
  const e = tecla('KeyN');
  expect(e.defaultPrevented).toBe(true);
  expect(document.querySelector('#nsTitle')!.textContent).toBe('Nova sessão');
});

test('Ctrl+Shift+número foca o painel e leva o teclado ao terminal dele', async () => {
  store.setLayoutCount(2);
  await nova('A');
  await nova('B');
  const outro = store.getState().layout.focus === 0 ? 1 : 0;
  const idOutro = store.getState().layout.panes[outro];

  const e = tecla(`Digit${outro + 1}`);
  expect(e.defaultPrevented).toBe(true);
  expect(store.getState().layout.focus).toBe(outro);
  expect((store.hosts.get(idOutro) as unknown as FakeHost).focos).toBe(1);
});

test('painel que não está na tela não recebe foco', async () => {
  await nova('A');
  tecla('Digit4');
  expect(store.getState().layout.focus).toBe(0);
});

test('sem Ctrl+Shift, ou com Alt junto, a tecla passa direto para o terminal', () => {
  for (const mods of [{ ctrlKey: true }, { shiftKey: true }, { ctrlKey: true, shiftKey: true, altKey: true }, {}]) {
    const e = tecla('KeyN', mods);
    expect(e.defaultPrevented).toBe(false);
  }
  expect(document.querySelector('#nsTitle')).toBeNull();
});
