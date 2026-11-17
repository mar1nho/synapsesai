// Lógica pura das abas do editor.

export interface Tab { path: string; dirty: boolean; }
export interface Tabs { list: Tab[]; active: string | null; }

const mesmo = (a: string, b: string) => a.toLowerCase() === b.toLowerCase(); // Windows não diferencia caixa
const base = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
const pasta = (p: string) => { const partes = p.split(/[\\/]/).filter(Boolean); return partes[partes.length - 2] ?? ''; };

export function openTab(t: Tabs, path: string): Tabs {
  const existente = t.list.find(x => mesmo(x.path, path));
  if (existente) return { ...t, active: existente.path };
  return { list: [...t.list, { path, dirty: false }], active: path };
}

export function closeTab(t: Tabs, path: string): Tabs {
  const i = t.list.findIndex(x => mesmo(x.path, path));
  if (i < 0) return t;
  const list = t.list.filter((_, k) => k !== i);
  let active = t.active;
  if (active && mesmo(active, path)) active = list[i]?.path ?? list[i - 1]?.path ?? null;
  return { list, active };
}

export function setDirty(t: Tabs, path: string, dirty: boolean): Tabs {
  return { ...t, list: t.list.map(x => (mesmo(x.path, path) ? { ...x, dirty } : x)) };
}

/** Nome do arquivo; se houver outro aberto com o mesmo nome, acrescenta a pasta. */
export function tabLabel(t: Tabs, path: string): string {
  const nome = base(path);
  const repetido = t.list.filter(x => base(x.path).toLowerCase() === nome.toLowerCase()).length > 1;
  return repetido ? `${nome} · ${pasta(path)}` : nome;
}
