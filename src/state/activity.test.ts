import { test, expect } from 'vitest';
import { ActivityTracker } from './activity';

test('saída => run; 1,6 s de silêncio visível => idle', () => {
  const a = new ActivityTracker();
  a.onOutput('p', 0, true);
  expect(a.tick(100, new Set(['p'])).get('p')).toBe('run');
  expect(a.tick(1600, new Set(['p'])).get('p')).toBe('idle');
});

test('saída oculta e silêncio => done', () => {
  const a = new ActivityTracker();
  a.onOutput('p', 0, false);
  expect(a.tick(1600, new Set()).get('p')).toBe('done');
});

test('sessão sem saída não aparece', () => {
  const a = new ActivityTracker();
  expect(a.tick(5000, new Set()).has('q')).toBe(false);
});
