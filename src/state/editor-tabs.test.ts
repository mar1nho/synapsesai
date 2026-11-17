import { test, expect } from 'vitest';
import { openTab, closeTab, setDirty, tabLabel, type Tabs } from './editor-tabs';

const vazio: Tabs = { list: [], active: null };

test('abrir arquivo novo cria aba ativa', () => {
  const t = openTab(vazio, 'C:\\p\\a.md');
  expect(t.list.map(x => x.path)).toEqual(['C:\\p\\a.md']);
  expect(t.active).toBe('C:\\p\\a.md');
});

test('abrir arquivo já aberto só ativa a aba', () => {
  let t = openTab(openTab(vazio, 'C:\\p\\a.md'), 'C:\\p\\b.md');
  t = openTab(t, 'C:\\p\\a.md');
  expect(t.list.length).toBe(2);
  expect(t.active).toBe('C:\\p\\a.md');
});

test('mesmo arquivo com caixa diferente é a mesma aba (Windows)', () => {
  const t = openTab(openTab(vazio, 'C:\\p\\A.md'), 'c:\\P\\a.md');
  expect(t.list.length).toBe(1);
});

test('fechar a aba ativa ativa a vizinha', () => {
  let t = openTab(openTab(openTab(vazio, 'C:\\a'), 'C:\\b'), 'C:\\c');
  t = openTab(t, 'C:\\b');
  t = closeTab(t, 'C:\\b');
  expect(t.list.map(x => x.path)).toEqual(['C:\\a', 'C:\\c']);
  expect(t.active).toBe('C:\\c');
  t = closeTab(closeTab(t, 'C:\\c'), 'C:\\a');
  expect(t.active).toBeNull();
});

test('marca alteração não salva', () => {
  const t = setDirty(openTab(vazio, 'C:\\a'), 'C:\\a', true);
  expect(t.list[0].dirty).toBe(true);
});

test('rótulo mostra a pasta quando dois arquivos têm o mesmo nome', () => {
  const t = openTab(openTab(vazio, 'C:\\p\\x\\README.md'), 'C:\\p\\y\\README.md');
  expect(t.list.map(x => tabLabel(t, x.path))).toEqual(['README.md · x', 'README.md · y']);
  expect(tabLabel(openTab(vazio, 'C:\\q\\notas.txt'), 'C:\\q\\notas.txt')).toBe('notas.txt');
});
