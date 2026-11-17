// @vitest-environment happy-dom
import { test, expect, vi, beforeEach } from 'vitest';

vi.mock('../terminal/termhost', () => import('../test/fake-termhost'));

let store: typeof import('../state/store');
let toolbar: typeof import('./toolbar');
let seg: HTMLElement;
let resumo: HTMLElement;

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = '<div id="seg">' + [1, 2, 3, 4].map(n => `<button data-layout="${n}">${n}</button>`).join('') + '</div><div id="resumo"></div>';
  seg = document.getElementById('seg')!;
  resumo = document.getElementById('resumo')!;
  store = await import('../state/store');
  toolbar = await import('./toolbar');
});

const nova = (name: string, extra: Record<string, unknown> = {}) =>
  store.createSession({ name, kind: 'claude', cwd: 'C:\\proj', bypass: false, ...extra });
const pressionados = () => [...seg.querySelectorAll('button')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.layout);

test('clicar num número escolhe o layout, e o botão escolhido fica marcado', () => {
  toolbar.wireToolbar(seg);
  seg.querySelector<HTMLButtonElement>('button[data-layout="2"]')!.click();
  toolbar.renderToolbar(seg, resumo);

  expect(store.getState().preferredN).toBe(2);
  expect(pressionados()).toEqual(['2']);
});

test('resumo conta sessões (sem as notas), quantas trabalham e quantas esperam', async () => {
  toolbar.renderToolbar(seg, resumo);
  expect(resumo.textContent).toBe('0 sessões0 trabalhando0 esperando você');

  const a = await nova('A');
  await nova('Nota', { kind: 'nota', cwd: '' });
  toolbar.renderToolbar(seg, resumo);
  expect(resumo.textContent).toBe('1 sessão0 trabalhando0 esperando você');

  const b = await nova('B');
  const c = await nova('C');
  store.setStatus(a.id, 'run');
  store.setStatus(b.id, 'run');
  store.setStatus(c.id, 'wait');
  toolbar.renderToolbar(seg, resumo);
  expect(resumo.textContent).toBe('3 sessões2 trabalhando1 esperando você');
});
