import { test, expect } from 'vitest';
import { orderTree, closeSession } from './tree';
import type { Session } from './types';

const S = (id: string, parent: string | null = null): Session => ({
  id, name: id, kind: 'claude', cwd: 'C:\\x', bypass: true, addDirs: [], parent, font: 13, status: 'idle',
});

test('árvore indenta filhos sob o pai', () =>
  expect(orderTree([S('o'), S('x'), S('h', 'o')]).map(r => [r.session.id, r.depth])).toEqual([['o', 0], ['h', 1], ['x', 0]]));
test('netos ficam sob o filho', () =>
  expect(orderTree([S('o'), S('h', 'o'), S('n', 'h')]).map(r => [r.session.id, r.depth])).toEqual([['o', 0], ['h', 1], ['n', 2]]));
test('filho cujo pai sumiu vira raiz', () =>
  expect(orderTree([S('h', 'fantasma')]).map(r => r.depth)).toEqual([0]));
test('encerrar pai sobe filhos para a raiz', () => expect(closeSession([S('o'), S('h', 'o')], 'o')).toEqual([S('h')]));
