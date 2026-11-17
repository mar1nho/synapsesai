// Menu de contexto da lista: encerrar (com confirmação), abrir pasta, copiar nome.
import { openPath } from '@tauri-apps/plugin-opener';
import { byId, closeSession } from '../state/store';
import { confirmDialog } from './dialog';

let current: HTMLElement | null = null;

function closeMenu() { current?.remove(); current = null; }
document.addEventListener('click', closeMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

export function openContextMenu(id: string, x: number, y: number) {
  closeMenu();
  const s = byId(id);
  if (!s) return;
  const m = document.createElement('div');
  m.className = 'menu';
  m.setAttribute('role', 'menu');
  const item = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('role', 'menuitem');
    b.addEventListener('click', ev => { ev.stopPropagation(); closeMenu(); fn(); });
    m.appendChild(b);
  };
  item('Encerrar sessão', async () => {
    const ok = await confirmDialog(`Encerrar "${s.name}"?`,
      s.kind === 'nota' ? 'A nota sai da lista; o arquivo dela continua salvo.' : 'O processo e tudo que ele abriu serão fechados. A pasta continua no disco.',
      'Encerrar');
    if (ok) closeSession(id);
  });
  if (s.kind !== 'nota') item('Abrir pasta no Explorer', () => { void openPath(s.cwd); });
  item('Copiar nome', () => { void navigator.clipboard.writeText(s.name); });
  m.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
  m.style.top = `${Math.min(y, window.innerHeight - 120)}px`;
  document.body.appendChild(m);
  current = m;
  (m.querySelector('button') as HTMLButtonElement | null)?.focus();
}
