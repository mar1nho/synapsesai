// Diálogos simples dentro da própria interface (o app não usa confirm() do navegador).
let root: HTMLElement | null = null;
export function setOverlayRoot(el: HTMLElement) { root = el; }

export function openOverlay(content: HTMLElement, onEscape?: () => void): () => void {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.appendChild(content);
  const close = () => { ov.remove(); };
  ov.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); onEscape?.(); close(); } });
  (root ?? document.body).appendChild(ov);
  return close;
}

export function confirmDialog(title: string, body: string, okLabel: string): Promise<boolean> {
  return new Promise(resolve => {
    const d = document.createElement('div');
    d.className = 'dialog';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    const h = document.createElement('h2'); h.textContent = title;
    const p = document.createElement('p'); p.textContent = body;
    const a = document.createElement('div'); a.className = 'actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn'; cancel.textContent = 'Cancelar';
    const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'btn primary'; ok.textContent = okLabel;
    a.append(cancel, ok);
    d.append(h, p, a);
    let done = false;
    const finish = (v: boolean) => { if (done) return; done = true; close(); resolve(v); };
    const close = openOverlay(d, () => finish(false));
    cancel.addEventListener('click', () => finish(false));
    ok.addEventListener('click', () => finish(true));
    ok.focus();
  });
}
