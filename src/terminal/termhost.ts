// Um xterm.js por sessão, criado UMA vez; o elemento é movido entre painéis, nunca recriado.
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { ptyKill, ptyResize, ptySpawn, ptyWrite, type SessionSpec } from '../ipc';
import { DEFAULT_THEME, TERM_THEMES, type ThemeName } from '../theme';

/** Tema atual (aplicado aos terminais novos e trocado em todos pelo setTheme). */
let temaAtual: ThemeName = DEFAULT_THEME;
export function setCurrentTermTheme(t: ThemeName) { temaAtual = t; }

export class TermHost {
  readonly el: HTMLDivElement;
  private term: Terminal;
  private fit = new FitAddon();
  private webgl: WebglAddon | null = null;
  private resizeTimer: number | undefined;
  private observer: ResizeObserver;
  private outputCbs: (() => void)[] = [];
  private started = false;

  constructor(readonly id: string, fontSize: number) {
    this.el = document.createElement('div');
    this.el.className = 'term-host';
    this.term = new Terminal({
      scrollback: 10000,
      fontFamily: '"Geist Mono", "Cascadia Mono", Consolas, monospace',
      fontSize,
      theme: TERM_THEMES[temaAtual],
      allowProposedApi: true,
      cursorBlink: true,
    });
    this.term.loadAddon(this.fit);
    const u = new Unicode11Addon();
    this.term.loadAddon(u);
    this.term.unicode.activeVersion = '11';
    this.term.loadAddon(new WebLinksAddon());
    this.term.open(this.el);
    this.term.attachCustomKeyEventHandler(e => this.onKey(e));
    this.term.onData(d => { if (this.started) void ptyWrite(this.id, d); });
    this.observer = new ResizeObserver(() => this.scheduleFit());
  }

  /** Inicia o processo da sessão no tamanho atual do terminal. */
  async start(spec: SessionSpec): Promise<void> {
    this.fitNow();
    await ptySpawn(spec, this.term.cols, this.term.rows, bytes => {
      this.term.write(bytes);
      for (const cb of this.outputCbs) cb();
    });
    this.started = true;
  }

  attach(parent: HTMLElement): void {
    if (this.el.parentElement !== parent) parent.appendChild(this.el);
    this.observer.disconnect();
    this.observer.observe(parent);
    if (!this.webgl) {
      try {
        this.webgl = new WebglAddon();
        this.webgl.onContextLoss(() => { this.webgl?.dispose(); this.webgl = null; });
        this.term.loadAddon(this.webgl);
      } catch {
        this.webgl = null; // sem WebGL: fica no renderizador padrão
      }
    }
    this.scheduleFit();
  }

  detach(): void {
    this.observer.disconnect();
    this.webgl?.dispose();
    this.webgl = null;
    this.el.remove();
  }

  setFontSize(px: number): void {
    this.term.options.fontSize = px;
    this.scheduleFit();
  }

  setTheme(t: ThemeName): void { this.term.options.theme = TERM_THEMES[t]; }

  /** Últimas linhas com texto, depois que a saída pendente foi desenhada
   *  (mostra por que a sessão terminou, já que o painel troca o terminal pelo aviso). */
  tail(max = 8): Promise<string> {
    return new Promise(resolve => {
      this.term.write('', () => {
        const b = this.term.buffer.active;
        const linhas: string[] = [];
        for (let y = b.length - 1; y >= 0 && linhas.length < max; y--) {
          const t = b.getLine(y)?.translateToString(true) ?? '';
          if (t.trim() || linhas.length) linhas.unshift(t);
        }
        resolve(linhas.join('\n').trim());
      });
    });
  }

  focus(): void { this.term.focus(); }
  paste(text: string): void { this.term.paste(text); }
  onOutput(cb: () => void): void { this.outputCbs.push(cb); }

  dispose(): void {
    this.detach();
    void ptyKill(this.id).catch(() => undefined);
    this.term.dispose();
  }

  private scheduleFit(): void {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => this.fitNow(), 100);
  }

  private fitNow(): void {
    if (!this.el.isConnected || this.el.clientWidth === 0) return;
    const { cols, rows } = this.term;
    this.fit.fit();
    if (this.started && (cols !== this.term.cols || rows !== this.term.rows)) {
      void ptyResize(this.id, this.term.cols, this.term.rows);
    }
  }

  /** Ctrl+C com seleção copia; Ctrl+V cola; Alt+V passa direto (colar imagem do Claude). */
  private onKey(e: KeyboardEvent): boolean {
    if (e.type !== 'keydown') return true;
    if (e.ctrlKey && e.shiftKey) return false; // atalhos do app (Ctrl+Shift+...)
    if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'c' && this.term.hasSelection()) {
      void navigator.clipboard.writeText(this.term.getSelection());
      this.term.clearSelection();
      return false;
    }
    if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      void navigator.clipboard.readText().then(t => { if (t) this.term.paste(t); });
      return false;
    }
    return true;
  }
}
