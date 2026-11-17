import { test, expect } from 'vitest';
import { flattenTree, quotePath, type Entry } from './filetree';

const E = (name: string, isDir = false, base = 'C:\\p'): Entry => ({ name, path: `${base}\\${name}`, isDir });

test('mostra só o primeiro nível quando nada está aberto', () => {
  const cache = new Map([['C:\\p', [E('src', true), E('a.md')]]]);
  expect(flattenTree('C:\\p', cache, new Set()).map(r => [r.entry.name, r.depth, r.expanded])).toEqual([['src', 0, false], ['a.md', 0, false]]);
});

test('pasta aberta mostra os filhos indentados', () => {
  const cache = new Map([
    ['C:\\p', [E('src', true), E('a.md')]],
    ['C:\\p\\src', [E('main.ts', false, 'C:\\p\\src')]],
  ]);
  const rows = flattenTree('C:\\p', cache, new Set(['C:\\p\\src']));
  expect(rows.map(r => [r.entry.name, r.depth])).toEqual([['src', 0], ['main.ts', 1], ['a.md', 0]]);
  expect(rows[0].expanded).toBe(true);
});

test('pasta aberta ainda sem listagem aparece como carregando', () => {
  const cache = new Map([['C:\\p', [E('src', true)]]]);
  const rows = flattenTree('C:\\p', cache, new Set(['C:\\p\\src']));
  expect(rows.map(r => r.loading)).toEqual([true]);
});

test('caminho entre aspas para colar no terminal', () => {
  expect(quotePath('C:\\Docs\\0050 - Pasta & Cia\\a.md')).toBe('"C:\\Docs\\0050 - Pasta & Cia\\a.md"');
});
