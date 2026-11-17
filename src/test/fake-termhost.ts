// Dublê do TermHost para os testes de interface: o real precisa do xterm.js e de WebGL.
// Guarda o que recebeu para os testes conferirem.
import type { SessionSpec } from '../ipc';

export class TermHost {
  readonly el = document.createElement('div');
  specs: SessionSpec[] = [];
  fontes: number[] = [];
  focos = 0;
  descartado = false;

  constructor(readonly id: string, readonly fonte: number) {
    this.el.className = 'term-host';
    this.el.dataset.id = id;
  }
  onOutput() { /* sem saída nos testes */ }
  start(spec: SessionSpec): Promise<void> { this.specs.push(spec); return Promise.resolve(); }
  attach(parent: HTMLElement) { if (this.el.parentElement !== parent) parent.appendChild(this.el); }
  detach() { this.el.remove(); }
  focus() { this.focos++; }
  setFontSize(px: number) { this.fontes.push(px); }
  setTheme() { /* nada */ }
  dispose() { this.descartado = true; this.el.remove(); }
}

export function setCurrentTermTheme() { /* nada */ }
