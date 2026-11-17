import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { THEMES, TERM_THEMES, DEFAULT_THEME, isTheme, normalizeTheme } from './theme';

const css = readFileSync(new URL('./styles/tokens.css', import.meta.url), 'utf8');
const bloco = (sel: string) => {
  const i = css.indexOf(sel);
  return css.slice(i, css.indexOf('}', i));
};
const vars = (b: string) => [...b.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]).sort();

test('os três temas definem exatamente as mesmas variáveis', () => {
  const padrao = vars(bloco(':root, :root[data-theme="navy"]'));
  expect(padrao.length).toBeGreaterThan(15);
  expect(vars(bloco(':root[data-theme="dark"]'))).toEqual(padrao);
  expect(vars(bloco(':root[data-theme="light"]'))).toEqual(padrao);
});

test('todo tema tem cores de terminal', () => {
  for (const t of THEMES) {
    expect(isTheme(t.id)).toBe(true);
    expect(TERM_THEMES[t.id].background).toMatch(/^#/);
    expect(TERM_THEMES[t.id].foreground).toMatch(/^#/);
  }
  expect(isTheme('rosa')).toBe(false);
});

test('o atributo hidden sempre esconde (regressão: editor vazio e painéis extras apareciam)', () => {
  const app = readFileSync(new URL('./styles/app.css', import.meta.url), 'utf8');
  expect(app).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
});

test('o CSS do app só usa variáveis que os temas definem', () => {
  const app = readFileSync(new URL('./styles/app.css', import.meta.url), 'utf8');
  const usadas = new Set([...app.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]));
  const definidas = new Set([...vars(bloco(':root, :root[data-theme="navy"]')), '--font-display', '--font-ui', '--font-mono', '--r-xs', '--r-pill', '--guide-left',
    // medidas de layout definidas pelos divisores (sempre com valor de reserva no var())
    '--side-w', '--files-w', '--editor-h']);
  expect([...usadas].filter(v => !definidas.has(v))).toEqual([]);
});

test('tema salvo vazio ou desconhecido vira o padrão (estado de versões antigas)', () => {
  expect(normalizeTheme('dark')).toBe('dark');
  expect(normalizeTheme('light')).toBe('light');
  expect(normalizeTheme(DEFAULT_THEME)).toBe(DEFAULT_THEME);
  expect(normalizeTheme('tema-que-nao-existe-mais')).toBe(DEFAULT_THEME);
  expect(normalizeTheme('')).toBe(DEFAULT_THEME);
  expect(normalizeTheme(undefined)).toBe(DEFAULT_THEME);
  expect(isTheme(DEFAULT_THEME)).toBe(true);
});
