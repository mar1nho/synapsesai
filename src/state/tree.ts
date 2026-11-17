// Lógica pura da árvore de sessões (pai -> filhos).
import type { Session } from './types';

/** Ordena em profundidade: cada pai seguido dos seus filhos, com a profundidade de cada um. */
export function orderTree(s: Session[]): { session: Session; depth: number }[] {
  const ids = new Set(s.map(x => x.id));
  const filhos = (pai: string | null) =>
    s.filter(x => (pai === null ? x.parent === null || !ids.has(x.parent) : x.parent === pai));
  const out: { session: Session; depth: number }[] = [];
  const visitar = (pai: string | null, depth: number) => {
    for (const x of filhos(pai)) {
      out.push({ session: x, depth });
      visitar(x.id, depth + 1);
    }
  };
  visitar(null, 0);
  return out;
}

/** Remove a sessão; os filhos dela sobem para a raiz. */
export function closeSession(s: Session[], id: string): Session[] {
  return s.filter(x => x.id !== id).map(x => (x.parent === id ? { ...x, parent: null } : x));
}
