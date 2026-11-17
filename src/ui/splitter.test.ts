// @vitest-environment happy-dom
import { test, expect, beforeEach } from 'vitest';
import { makeSplitter, type SplitOpts } from './splitter';

let handle: HTMLElement;
let aplicado: number[];

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<div id="h"></div>';
  document.body.className = '';
  handle = document.getElementById('h')!;
  handle.setPointerCapture = () => { /* o DOM de teste não captura ponteiro */ };
  aplicado = [];
});

const opts = (extra: Partial<SplitOpts> = {}): SplitOpts =>
  ({ axis: 'x', key: 'teste-w', initial: 300, min: 200, max: () => 500, dir: 1, apply: px => aplicado.push(px), ...extra });
const ultimo = () => aplicado[aplicado.length - 1];
const tecla = (key: string) => handle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const ponteiro = (tipo: string, pos: { clientX?: number; clientY?: number }) =>
  handle.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true, ...pos }));

test('começa no valor inicial e se apresenta como separador', () => {
  makeSplitter(handle, opts());
  expect(aplicado).toEqual([300]);
  expect(handle.getAttribute('role')).toBe('separator');
  expect(handle.getAttribute('aria-orientation')).toBe('vertical');
  expect(handle.tabIndex).toBe(0);
});

test('usa a medida lembrada neste computador, sem sair dos limites', () => {
  localStorage.setItem('teste-w', '420');
  makeSplitter(handle, opts());
  expect(aplicado).toEqual([420]);

  aplicado = [];
  localStorage.setItem('teste-w', '9999');
  makeSplitter(handle, opts());
  expect(aplicado).toEqual([500]);

  aplicado = [];
  localStorage.setItem('teste-w', 'lixo');
  makeSplitter(handle, opts());
  expect(aplicado).toEqual([300]);
});

test('setas ajustam de 16 em 16 px, param nos limites e gravam', () => {
  makeSplitter(handle, opts({ initial: 480 }));
  tecla('ArrowRight');
  tecla('ArrowRight');
  expect(aplicado).toEqual([480, 496, 500]);
  expect(localStorage.getItem('teste-w')).toBe('500');

  tecla('ArrowLeft');
  expect(ultimo()).toBe(484);
  tecla('a');
  expect(aplicado).toHaveLength(4);
});

test('com dir -1, a seta para a direita diminui', () => {
  makeSplitter(handle, opts({ dir: -1 }));
  tecla('ArrowRight');
  expect(ultimo()).toBe(284);
});

test('arrastar muda a medida enquanto move e grava ao soltar', () => {
  makeSplitter(handle, opts());
  ponteiro('pointerdown', { clientX: 100 });
  expect(document.body.classList.contains('resizing-x')).toBe(true);

  ponteiro('pointermove', { clientX: 150 });
  expect(ultimo()).toBe(350);
  ponteiro('pointermove', { clientX: 900 });
  expect(ultimo()).toBe(500);
  expect(localStorage.getItem('teste-w')).toBeNull();

  ponteiro('pointerup', { clientX: 900 });
  expect(localStorage.getItem('teste-w')).toBe('500');
  expect(document.body.classList.contains('resizing-x')).toBe(false);

  // depois de soltar, mover não muda mais nada
  const antes = aplicado.length;
  ponteiro('pointermove', { clientX: 120 });
  expect(aplicado).toHaveLength(antes);
});

test('divisor horizontal usa a posição vertical do ponteiro', () => {
  makeSplitter(handle, opts({ axis: 'y', dir: -1 }));
  expect(handle.getAttribute('aria-orientation')).toBe('horizontal');
  ponteiro('pointerdown', { clientY: 400 });
  expect(document.body.classList.contains('resizing-y')).toBe(true);
  ponteiro('pointermove', { clientY: 350 });
  expect(ultimo()).toBe(350);
});
