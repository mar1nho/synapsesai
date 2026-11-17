import { test, expect } from 'vitest';
import { shouldNotify } from './notify-rule';

test('aviso só ao entrar em wait e fora de vista', () => {
  expect(shouldNotify('run', 'wait', false, true)).toBe(true);
  expect(shouldNotify('run', 'wait', true, false)).toBe(true);
  expect(shouldNotify('run', 'wait', true, true)).toBe(false);
  expect(shouldNotify('wait', 'wait', false, false)).toBe(false);
  expect(shouldNotify('run', 'idle', false, false)).toBe(false);
});
