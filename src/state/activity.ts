// Status por atividade de saída (Codex, Gemini, PowerShell, CMD e reserva do Claude).
import type { Status } from './types';

const SILENCIO_MS = 1500;

export class ActivityTracker {
  private last = new Map<string, number>();
  private hiddenOutput = new Set<string>();

  onOutput(id: string, now: number, visible: boolean): void {
    this.last.set(id, now);
    if (visible) this.hiddenOutput.delete(id);
    else this.hiddenOutput.add(id);
  }

  /** Status atual de cada sessão que já produziu saída. */
  tick(now: number, visibleIds: Set<string>): Map<string, Status> {
    const out = new Map<string, Status>();
    for (const [id, t] of this.last) {
      if (visibleIds.has(id)) this.hiddenOutput.delete(id);
      if (now - t < SILENCIO_MS) out.set(id, 'run');
      else out.set(id, this.hiddenOutput.has(id) ? 'done' : 'idle');
    }
    return out;
  }

  /** Chamado quando o usuário vê a sessão: "terminou, não visto" vira idle. */
  markSeen(id: string): void {
    this.hiddenOutput.delete(id);
  }

  forget(id: string): void {
    this.last.delete(id);
    this.hiddenOutput.delete(id);
  }
}
