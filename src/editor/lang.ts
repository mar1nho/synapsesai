// Linguagem do editor pela extensão do arquivo.
export type Lang = 'markdown' | 'typescript' | 'javascript' | 'json' | 'python' | 'powershell' | 'rust' | 'css' | 'html' | 'yaml' | 'sql' | 'shell' | 'text';

const EXT: Record<string, Lang> = {
  md: 'markdown', markdown: 'markdown',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', jsonc: 'json',
  py: 'python',
  ps1: 'powershell', psm1: 'powershell', psd1: 'powershell',
  rs: 'rust',
  css: 'css', scss: 'css',
  html: 'html', htm: 'html', vue: 'html', svelte: 'html',
  yaml: 'yaml', yml: 'yaml',
  sql: 'sql',
  sh: 'shell', bash: 'shell',
};

export function languageFor(path: string): Lang {
  const nome = path.split(/[\\/]/).pop() ?? '';
  const i = nome.lastIndexOf('.');
  if (i <= 0) return 'text';
  return EXT[nome.slice(i + 1).toLowerCase()] ?? 'text';
}
