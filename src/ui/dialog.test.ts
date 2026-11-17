// @vitest-environment happy-dom
import { test, expect, vi, beforeEach } from 'vitest';

let dialog: typeof import('./dialog');

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = '';
  dialog = await import('./dialog');
});

const botao = (texto: string) => [...document.querySelectorAll('button')].find(b => b.textContent === texto)!;

test('confirmar devolve true e fecha', async () => {
  const p = dialog.confirmDialog('Encerrar "A"?', 'O processo será fechado.', 'Encerrar');
  expect(document.querySelector('.dialog h2')!.textContent).toBe('Encerrar "A"?');
  expect(document.querySelector('.dialog p')!.textContent).toBe('O processo será fechado.');
  expect(document.activeElement).toBe(botao('Encerrar'));

  botao('Encerrar').click();
  expect(await p).toBe(true);
  expect(document.querySelector('.overlay')).toBeNull();
});

test('cancelar devolve false e fecha', async () => {
  const p = dialog.confirmDialog('Título', 'Corpo', 'Ok');
  botao('Cancelar').click();
  expect(await p).toBe(false);
  expect(document.querySelector('.overlay')).toBeNull();
});

test('Esc devolve false e fecha', async () => {
  const p = dialog.confirmDialog('Título', 'Corpo', 'Ok');
  document.querySelector('.overlay')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(await p).toBe(false);
  expect(document.querySelector('.overlay')).toBeNull();
});

test('título e corpo são texto: HTML não é interpretado', () => {
  void dialog.confirmDialog('<b>negrito</b>', '<img src=x>', 'Ok');
  expect(document.querySelector('.dialog b')).toBeNull();
  expect(document.querySelector('.dialog img')).toBeNull();
  expect(document.querySelector('.dialog h2')!.textContent).toBe('<b>negrito</b>');
});

test('o diálogo abre dentro do elemento definido como raiz', () => {
  const raiz = document.createElement('div');
  document.body.appendChild(raiz);
  dialog.setOverlayRoot(raiz);
  const conteudo = document.createElement('div');
  const fechar = dialog.openOverlay(conteudo);

  expect(raiz.querySelector('.overlay')!.contains(conteudo)).toBe(true);
  fechar();
  expect(raiz.querySelector('.overlay')).toBeNull();
});
