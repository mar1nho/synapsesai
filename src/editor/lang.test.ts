import { test, expect } from 'vitest';
import { languageFor } from './lang';

test('linguagem pela extensão', () => {
  expect(languageFor('C:\\p\\README.md')).toBe('markdown');
  expect(languageFor('C:\\p\\a.ts')).toBe('typescript');
  expect(languageFor('C:\\p\\a.tsx')).toBe('typescript');
  expect(languageFor('C:\\p\\a.js')).toBe('javascript');
  expect(languageFor('C:\\p\\a.json')).toBe('json');
  expect(languageFor('C:\\p\\a.py')).toBe('python');
  expect(languageFor('C:\\p\\s.ps1')).toBe('powershell');
  expect(languageFor('C:\\p\\s.psm1')).toBe('powershell');
  expect(languageFor('C:\\p\\a.rs')).toBe('rust');
  expect(languageFor('C:\\p\\a.css')).toBe('css');
  expect(languageFor('C:\\p\\a.html')).toBe('html');
  expect(languageFor('C:\\p\\a.yaml')).toBe('yaml');
  expect(languageFor('C:\\p\\a.sql')).toBe('sql');
  expect(languageFor('C:\\p\\Makefile')).toBe('text');
  expect(languageFor('C:\\p\\a.TXT')).toBe('text');
});
