// Salva o estado com debounce de 1 s e restaura na abertura (com retomada das conversas).
import { invoke } from '@tauri-apps/api/core';
import { createSession, getState, notes, restoreLayout, setSaveHook } from './store';
import { orderTree } from './tree';
import type { Kind, Layout, Session } from './types';
import type { Resume } from '../ipc';
import { normalizeTheme } from '../theme';

interface PersistedSession {
  id: string; name: string; kind: string; cwd: string; bypass: boolean; addDirs: string[];
  parent: string | null; font: number; claudeSessionId: string | null;
}
interface AppState {
  version: number;
  sessions: PersistedSession[];
  layout: { n: number; panes: string[]; focus: number };
  lastCwd: string;
  theme: string;
}

let timer: number | undefined;

export function snapshot(): AppState {
  const s = getState();
  return {
    version: 1,
    sessions: orderTree(s.sessions).map(({ session: x }) => ({
      id: x.id, name: x.name, kind: x.kind, cwd: x.cwd, bypass: x.bypass, addDirs: x.addDirs,
      parent: x.parent, font: x.font, claudeSessionId: x.claudeSessionId ?? null,
    })),
    layout: { n: s.preferredN, panes: s.layout.panes, focus: s.layout.focus },
    lastCwd: s.lastCwd,
    theme: s.theme,
  };
}

export function saveNow(): Promise<void> {
  window.clearTimeout(timer);
  return invoke('state_save', { s: snapshot() });
}

export function startAutosave() {
  setSaveHook(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { void saveNow().catch(() => undefined); }, 1000);
  });
}

function resumeFor(p: PersistedSession): Resume {
  if (p.kind === 'claude') return p.claudeSessionId ? { type: 'claudeId', id: p.claudeSessionId } : { type: 'continue' };
  if (p.kind === 'codex' || p.kind === 'gemini') return { type: 'continue' };
  return { type: 'new' };
}

/** Recria as sessões salvas. Devolve true se havia estado salvo (não é a primeira execução). */
export async function restore(): Promise<boolean> {
  const [st, existia] = await invoke<[AppState, boolean]>('state_load');
  for (const p of st.sessions) {
    if (p.kind === 'nota') {
      try { notes.set(p.id, await invoke<string>('note_read', { id: p.id })); } catch { notes.set(p.id, ''); }
    }
    await createSession({
      id: p.id, name: p.name, kind: p.kind as Kind, cwd: p.cwd, bypass: p.bypass, addDirs: p.addDirs,
      parent: p.parent, font: p.font || 13, claudeSessionId: p.claudeSessionId ?? undefined,
      resume: resumeFor(p), focus: false,
    });
  }
  const n = (Math.min(4, Math.max(1, st.layout?.n || 1))) as Layout['n'];
  restoreLayout({ n, panes: st.layout?.panes ?? [], focus: st.layout?.focus ?? 0 }, st.lastCwd ?? '', normalizeTheme(st.theme));
  return existia;
}

export type { Session };
