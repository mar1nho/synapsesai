// Tipos do estado do app (frontend).

export type Kind = 'claude' | 'codex' | 'gemini' | 'ps' | 'cmd' | 'nota';

/** run = executando, idle = parado, wait = esperando você, done = terminou e não visto, note = nota */
export type Status = 'run' | 'idle' | 'wait' | 'done' | 'note';

export interface Session {
  id: string;
  name: string;
  kind: Kind;
  cwd: string;
  bypass: boolean;
  addDirs: string[];
  parent: string | null;
  font: number;
  claudeSessionId?: string;
  status: Status;
}

/** panes tem sempre 4 posições; '' = painel vazio. n = quantos painéis aparecem. */
export interface Layout {
  n: 1 | 2 | 3 | 4;
  panes: string[];
  focus: number;
}
