// Atalhos globais com Ctrl+Shift (não colidem com o TUI do Claude).
import { setFocus } from '../state/store';
import { openNewSession } from './new-session';
import { focusCurrent } from './panes';

export function wireShortcuts() {
  window.addEventListener('keydown', e => {
    if (!(e.ctrlKey && e.shiftKey) || e.altKey) return;
    if (e.code === 'KeyN') { e.preventDefault(); openNewSession(); return; }
    const m = /^Digit([1-4])$/.exec(e.code);
    if (m) { e.preventDefault(); setFocus(Number(m[1]) - 1); focusCurrent(); }
  }, true);
}
