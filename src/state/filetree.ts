// Lógica pura do painel de arquivos.

export interface Entry { name: string; path: string; isDir: boolean; }
export interface Row { entry: Entry; depth: number; expanded: boolean; loading: boolean; }

/** Linhas visíveis da árvore: pastas abertas mostram os filhos (já listados) indentados. */
export function flattenTree(root: string, cache: Map<string, Entry[]>, expanded: Set<string>): Row[] {
  const out: Row[] = [];
  const visitar = (dir: string, depth: number) => {
    for (const e of cache.get(dir) ?? []) {
      const aberta = e.isDir && expanded.has(e.path);
      out.push({ entry: e, depth, expanded: aberta, loading: aberta && !cache.has(e.path) });
      if (aberta) visitar(e.path, depth + 1);
    }
  };
  visitar(root, 0);
  return out;
}

/** Caminho pronto para colar no terminal (entre aspas por causa de espaços e &). */
export function quotePath(p: string): string {
  return `"${p}"`;
}
