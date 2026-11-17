import { test, expect } from 'vitest';
import { autoLayout, buildEdges, MessageLog, COL_W, ROW_H, ORIGIN } from './canvas';
import type { Session } from './types';

const S = (id: string, parent: string | null = null, name = id): Session => ({
  id, name, kind: 'claude', cwd: 'C:\\x', bypass: true, addDirs: [], parent, font: 13, status: 'idle',
});

test('pais à esquerda, filhos à direita; próxima raiz abaixo da árvore anterior', () => {
  const pos = autoLayout([S('o'), S('h', 'o'), S('r', 'o'), S('x')], {});
  expect(pos.o).toEqual({ x: ORIGIN, y: ORIGIN });
  expect(pos.h).toEqual({ x: ORIGIN + COL_W, y: ORIGIN });
  expect(pos.r).toEqual({ x: ORIGIN + COL_W, y: ORIGIN + ROW_H });
  expect(pos.x).toEqual({ x: ORIGIN, y: ORIGIN + 2 * ROW_H });
});

test('posição arrastada pelo usuário prevalece', () => {
  const pos = autoLayout([S('o'), S('h', 'o')], { h: { x: 900, y: 40 } });
  expect(pos.h).toEqual({ x: 900, y: 40 });
  expect(pos.o).toEqual({ x: ORIGIN, y: ORIGIN });
});

test('linhas de criação e de mensagem (nome resolvido, externo ignorado)', () => {
  const ss = [S('o', null, 'Orquestrador'), S('h', 'o', 'Hubspot')];
  const log = new MessageLog();
  log.add('o', 'Hubspot', 'faça x', 1);
  log.add('o', 'hubspot', 'e y', 2);
  log.add('h', 'Orquestrador', 'feito', 3);
  log.add('o', 'mestro-02', 'fora do app', 4);
  const e = buildEdges(ss, log);
  expect(e.filter(x => x.kind === 'spawn')).toEqual([{ kind: 'spawn', from: 'o', to: 'h' }]);
  const m = e.filter(x => x.kind === 'message');
  expect(m).toEqual([{ kind: 'message', from: 'o', to: 'h', count: 3, ab: 2, ba: 1, last: 3 }]);
});

test('histórico por sessão: enviadas e recebidas, mais recentes primeiro', () => {
  const ss = [S('o', null, 'Orquestrador'), S('h', 'o', 'Hubspot')];
  const log = new MessageLog();
  log.add('o', 'Hubspot', 'faça x', 1);
  log.add('h', 'Orquestrador', 'feito', 2);
  const h = log.forSession('h', ss);
  expect(h.received.map(m => m.preview)).toEqual(['faça x']);
  expect(h.sent.map(m => m.preview)).toEqual(['feito']);
  expect(log.forSession('o', ss).sent[0].toName).toBe('Hubspot');
});

test('histórico tem limite por sessão', () => {
  const log = new MessageLog(5);
  for (let i = 0; i < 9; i++) log.add('o', 'X', `m${i}`, i);
  expect(log.forSession('o', [S('o')]).sent.map(m => m.preview)).toEqual(['m8', 'm7', 'm6', 'm5', 'm4']);
});
