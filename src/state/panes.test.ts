import { test, expect } from 'vitest';
import { assign, setCount, removeSession, effectiveCount, visibleLayout } from './panes';
import type { Layout } from './types';

const L = (panes: string[], focus = 0, n: 1 | 2 | 3 | 4 = 4): Layout => ({ n, panes, focus });

test('assign põe no painel em foco', () => expect(assign(L(['a', 'b', 'c', 'd']), 'e').panes).toEqual(['e', 'b', 'c', 'd']));
test('assign troca se já visível', () => expect(assign(L(['a', 'b', 'c', 'd']), 'c').panes).toEqual(['c', 'b', 'a', 'd']));
test('assign de sessão já no painel em foco não muda nada', () => expect(assign(L(['a', 'b', '', '']), 'a').panes).toEqual(['a', 'b', '', '']));
test('reduzir layout ajusta foco', () => expect(setCount(L(['a', 'b', 'c', 'd'], 3), 2, ['a', 'b', 'c', 'd']).focus).toBe(1));
test('aumentar preenche com não visíveis', () => expect(setCount(L(['a', '', '', ''], 0, 1), 3, ['a', 'b']).panes).toEqual(['a', 'b', '', '']));
test('zero sessões => painéis vazios', () => expect(setCount(L(['', '', '', ''], 0, 1), 4, []).panes).toEqual(['', '', '', '']));
test('remover sessão visível puxa outra', () => expect(removeSession(L(['a', 'b', '', ''], 0, 2), 'a', ['b', 'c']).panes.slice(0, 2)).toEqual(['c', 'b']));
test('mostra só os painéis que têm sessão', () => {
  expect(effectiveCount(4, 1)).toBe(1);
  expect(effectiveCount(4, 2)).toBe(2);
  expect(effectiveCount(3, 2)).toBe(2);
  expect(effectiveCount(2, 5)).toBe(2);
  expect(effectiveCount(4, 0)).toBe(1);
});
test('layout visível com 1 sessão e layout 4: um painel com a sessão e foco nele', () => {
  const v = visibleLayout(L(['', 'a', '', ''], 3, 4), ['a']);
  expect(v.n).toBe(1);
  expect(v.panes[0]).toBe('a');
  expect(v.focus).toBe(0);
});
test('layout visível compacta sessões para os primeiros painéis', () => {
  const v = visibleLayout(L(['a', '', 'b', ''], 2, 4), ['a', 'b']);
  expect(v.n).toBe(2);
  expect(v.panes.slice(0, 2)).toEqual(['a', 'b']);
  expect(v.focus).toBe(1);
});
test('remover a única sessão deixa vazio', () => expect(removeSession(L(['a', '', '', ''], 0, 1), 'a', []).panes).toEqual(['', '', '', '']));
