// Temas: cores da interface (CSS) e do terminal (xterm.js).
import type { ITheme } from '@xterm/xterm';

export type ThemeName = 'navy' | 'dark' | 'light';
export const DEFAULT_THEME: ThemeName = 'navy';
export const THEMES: { id: ThemeName; label: string }[] = [
  { id: 'navy', label: 'Marinho' },
  { id: 'dark', label: 'Escuro' },
  { id: 'light', label: 'Claro' },
];

export const TERM_THEMES: Record<ThemeName, ITheme> = {
  navy: { background: '#00216C', foreground: '#FFF9EE', cursor: '#FFF9EE', cursorAccent: '#00216C', selectionBackground: 'rgba(255, 249, 238, 0.28)' },
  dark: { background: '#0b0d10', foreground: '#e8eaee', cursor: '#e8eaee', cursorAccent: '#0b0d10', selectionBackground: 'rgba(232, 234, 238, 0.24)' },
  light: {
    background: '#ffffff', foreground: '#141820', cursor: '#141820', cursorAccent: '#ffffff', selectionBackground: 'rgba(0, 67, 165, 0.2)',
    // paleta ANSI legível em fundo claro
    black: '#141820', red: '#c4232b', green: '#1f7a1f', yellow: '#8a5a00', blue: '#0043A5', magenta: '#8b2fb3', cyan: '#0b6e79', white: '#5d6470',
    brightBlack: '#5d6470', brightRed: '#d1242f', brightGreen: '#2a8f2a', brightYellow: '#9c6a00', brightBlue: '#1f5fc4', brightMagenta: '#a23fca', brightCyan: '#13808c', brightWhite: '#141820',
  },
};

export function isTheme(t: string): t is ThemeName {
  return t === 'navy' || t === 'dark' || t === 'light';
}

/** Tema salvo → tema válido. Id vazio ou desconhecido (por exemplo, de uma versão antiga) vira o padrão. */
export function normalizeTheme(t: string | null | undefined): ThemeName {
  return t && isTheme(t) ? t : DEFAULT_THEME;
}

export function applyThemeToDocument(t: ThemeName) {
  document.documentElement.dataset.theme = t;
}
