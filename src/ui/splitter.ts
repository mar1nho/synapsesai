// Divisor arrastável: ajusta uma medida em px (largura ou altura) e lembra o valor neste computador.
export interface SplitOpts {
  axis: 'x' | 'y';
  key: string;            // chave no localStorage
  initial: number;
  min: number;
  max: () => number;
  /** +1 quando arrastar para a direita/baixo aumenta; -1 quando diminui. */
  dir: 1 | -1;
  apply: (px: number) => void;
}

const ler = (k: string): number | null => { try { const v = Number(localStorage.getItem(k)); return v > 0 ? v : null; } catch { return null; } };
const gravar = (k: string, v: number) => { try { localStorage.setItem(k, String(Math.round(v))); } catch { /* sem armazenamento */ } };

export function makeSplitter(handle: HTMLElement, o: SplitOpts) {
  let atual = Math.min(Math.max(ler(o.key) ?? o.initial, o.min), o.max());
  o.apply(atual);
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', o.axis === 'x' ? 'vertical' : 'horizontal');
  handle.tabIndex = 0;

  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const inicio = o.axis === 'x' ? e.clientX : e.clientY;
    const base = atual;
    document.body.classList.add(o.axis === 'x' ? 'resizing-x' : 'resizing-y');
    const mover = (ev: PointerEvent) => {
      const d = ((o.axis === 'x' ? ev.clientX : ev.clientY) - inicio) * o.dir;
      atual = Math.min(Math.max(base + d, o.min), o.max());
      o.apply(atual);
    };
    const soltar = () => {
      handle.removeEventListener('pointermove', mover);
      handle.removeEventListener('pointerup', soltar);
      document.body.classList.remove('resizing-x', 'resizing-y');
      gravar(o.key, atual);
    };
    handle.addEventListener('pointermove', mover);
    handle.addEventListener('pointerup', soltar);
  });

  // teclado: setas ajustam de 16 em 16 px
  handle.addEventListener('keydown', e => {
    const passo = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 16 : (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -16 : 0;
    if (!passo) return;
    e.preventDefault();
    atual = Math.min(Math.max(atual + passo * o.dir, o.min), o.max());
    o.apply(atual);
    gravar(o.key, atual);
  });
}
