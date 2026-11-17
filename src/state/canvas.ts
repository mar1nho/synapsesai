// Lógica pura do canvas: posição dos cards, linhas de criação e de mensagem, histórico de mensagens.
import type { Session } from './types';
import { orderTree } from './tree';

export const ORIGIN = 60;
export const COL_W = 320;
export const ROW_H = 150;

export type Pos = { x: number; y: number };

/** Layout automático da esquerda para a direita (pai -> filhos); posições salvas prevalecem. */
export function autoLayout(sessions: Session[], saved: Record<string, Pos>): Record<string, Pos> {
  const pos: Record<string, Pos> = {};
  const livre: number[] = [];
  const alturaMax = () => Math.max(ORIGIN, ...livre.filter(v => v !== undefined));
  for (const { session: s, depth } of orderTree(sessions)) {
    const paiY = s.parent && pos[s.parent] ? pos[s.parent].y : ORIGIN;
    const y = depth === 0 ? alturaMax() : Math.max(livre[depth] ?? ORIGIN, paiY);
    pos[s.id] = { x: ORIGIN + depth * COL_W, y };
    livre[depth] = y + ROW_H;
    for (let d = depth + 1; d < livre.length; d++) if ((livre[d] ?? 0) < y) livre[d] = y;
  }
  for (const s of sessions) if (saved[s.id]) pos[s.id] = saved[s.id];
  return pos;
}

export interface Msg { from: string; toName: string; to: string | null; preview: string; at: number; }

/** Mensagens observadas pelos hooks (SendMessage), com limite por sessão. */
export class MessageLog {
  private msgs: Msg[] = [];
  constructor(private limite = 50) {}

  add(fromId: string, toName: string, preview: string, at: number) {
    this.msgs.push({ from: fromId, toName, to: null, preview, at });
    // poda: guarda no máximo `limite` enviadas por sessão
    const deste = this.msgs.filter(m => m.from === fromId);
    if (deste.length > this.limite) {
      const sobra = new Set(deste.slice(0, deste.length - this.limite));
      this.msgs = this.msgs.filter(m => !sobra.has(m));
    }
  }

  /** Resolve o nome do destino para o id da sessão (sem diferenciar maiúsculas). */
  private resolve(sessions: Session[]): Msg[] {
    const porNome = new Map(sessions.map(s => [s.name.trim().toLowerCase(), s.id]));
    return this.msgs.map(m => ({ ...m, to: porNome.get(m.toName.trim().toLowerCase()) ?? null }));
  }

  forSession(id: string, sessions: Session[]): { sent: Msg[]; received: Msg[] } {
    const r = this.resolve(sessions);
    const desc = (a: Msg, b: Msg) => b.at - a.at;
    return { sent: r.filter(m => m.from === id).sort(desc), received: r.filter(m => m.to === id).sort(desc) };
  }

  resolved(sessions: Session[]): Msg[] { return this.resolve(sessions); }

  forget(id: string) { this.msgs = this.msgs.filter(m => m.from !== id); }
}

export type Edge =
  | { kind: 'spawn'; from: string; to: string }
  | { kind: 'message'; from: string; to: string; count: number; ab: number; ba: number; last: number };

/** Linhas do canvas: criação (pai -> filho) e conversa (um par, com contagem por sentido). */
export function buildEdges(sessions: Session[], log: MessageLog): Edge[] {
  const ids = new Set(sessions.map(s => s.id));
  const edges: Edge[] = sessions.filter(s => s.parent && ids.has(s.parent)).map(s => ({ kind: 'spawn' as const, from: s.parent!, to: s.id }));
  const pares = new Map<string, { from: string; to: string; ab: number; ba: number; last: number }>();
  for (const m of log.resolved(sessions)) {
    if (!m.to || !ids.has(m.from) || m.to === m.from) continue;
    const [a, b] = [m.from, m.to].sort();
    const k = `${a}|${b}`;
    const p = pares.get(k) ?? { from: m.from, to: m.to, ab: 0, ba: 0, last: 0 };
    if (m.from === p.from) p.ab++; else p.ba++;
    p.last = Math.max(p.last, m.at);
    pares.set(k, p);
  }
  for (const p of pares.values()) edges.push({ kind: 'message', from: p.from, to: p.to, count: p.ab + p.ba, ab: p.ab, ba: p.ba, last: p.last });
  return edges;
}
