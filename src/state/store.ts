// Estado central do frontend: sessões, layout, terminais e status.
import type { Kind, Layout, Session, Status } from './types';
import { assign, removeSession, setCount, visibleLayout } from './panes';
import { closeSession as treeClose } from './tree';
import { ActivityTracker } from './activity';
import { TermHost } from '../terminal/termhost';
import type { Resume, SessionSpec } from '../ipc';
import { MessageLog } from './canvas';
import { DEFAULT_THEME } from '../theme';

/** Mensagens entre agentes vistas pelos hooks (para o canvas). */
export const messages = new MessageLog();
export function recordMessage(fromId: string, toName: string, preview: string) {
  messages.add(fromId, toName, preview, Date.now());
  emit(false);
}

export interface NewSessionInput {
  name: string;
  kind: Kind;
  cwd: string;
  bypass: boolean;
  parent?: string | null;
  addDirs?: string[];
  resume?: Resume;
  startup?: string | null;
  id?: string;
  font?: number;
  claudeSessionId?: string;
  /** false = não toma o painel em foco (filhos criados pelo Orquestrador). */
  focus?: boolean;
}

type Listener = () => void;

const state = {
  sessions: [] as Session[],
  /** O que a tela mostra (nunca mais painéis que sessões). */
  layout: { n: 1, panes: ['', '', '', ''], focus: 0 } as Layout,
  /** Layout escolhido pelo usuário (1–4). */
  preferredN: 4 as Layout['n'],
  lastCwd: '',
  theme: DEFAULT_THEME as string,
  /** Visão da área principal. */
  view: 'term' as 'term' | 'canvas',
};

export function setView(v: 'term' | 'canvas') {
  state.view = v;
  emit(false);
}

/** Recalcula o layout visível a partir do escolhido e das sessões abertas. */
function normalize() {
  const ids = state.sessions.map(s => s.id);
  const cheio = setCount({ ...state.layout, n: state.preferredN }, state.preferredN, ids);
  state.layout = visibleLayout(cheio, ids);
}

export const hosts = new Map<string, TermHost>();
export const errors = new Map<string, string>();
export const notes = new Map<string, string>();
const specs = new Map<string, SessionSpec>();
const listeners = new Set<Listener>();
const statusListeners = new Set<(id: string, prev: Status, next: Status) => void>();
export const activity = new ActivityTracker();

let saveHook: (() => void) | null = null;

export function getState() { return state; }
export function subscribe(cb: Listener): () => void { listeners.add(cb); return () => listeners.delete(cb); }
export function onStatus(cb: (id: string, prev: Status, next: Status) => void) { statusListeners.add(cb); }
export function setSaveHook(cb: () => void) { saveHook = cb; }

function emit(persist = true) {
  for (const l of listeners) l();
  if (persist) saveHook?.();
}

export function byId(id: string): Session | undefined { return state.sessions.find(s => s.id === id); }
export function isNameTaken(name: string): boolean {
  const n = name.trim().toLowerCase();
  return state.sessions.some(s => s.name.trim().toLowerCase() === n);
}
export function visibleIds(): Set<string> {
  return new Set(state.layout.panes.slice(0, state.layout.n).filter(Boolean));
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

export async function createSession(input: NewSessionInput): Promise<Session> {
  const id = input.id ?? newId();
  const s: Session = {
    id,
    name: input.name.trim(),
    kind: input.kind,
    cwd: input.cwd,
    bypass: input.bypass,
    addDirs: input.addDirs ?? [],
    parent: input.parent ?? null,
    font: input.font ?? 13,
    claudeSessionId: input.claudeSessionId,
    status: input.kind === 'nota' ? 'note' : 'idle',
  };
  state.sessions.push(s);
  if (input.kind !== 'nota') state.lastCwd = input.cwd;
  normalize();
  if (input.focus !== false) {
    const j = state.layout.panes.slice(0, state.layout.n).indexOf(id);
    state.layout = j >= 0 ? { ...state.layout, focus: j } : assign(state.layout, id);
  }
  if (s.kind === 'nota') {
    if (!notes.has(id)) notes.set(id, '');
  } else {
    const spec: SessionSpec = {
      id, name: s.name, kind: s.kind, cwd: s.cwd, bypass: s.bypass, addDirs: s.addDirs,
      parent: s.parent, resume: input.resume ?? { type: 'new' }, startup: input.startup ?? null,
    };
    specs.set(id, spec);
    startHost(s, spec);
  }
  emit();
  return s;
}

function startHost(s: Session, spec: SessionSpec) {
  const h = new TermHost(s.id, s.font);
  hosts.set(s.id, h);
  errors.delete(s.id);
  h.onOutput(() => activity.onOutput(s.id, performance.now(), visibleIds().has(s.id)));
  // anexa antes de iniciar para o PTY nascer no tamanho certo do painel
  emit(false);
  h.start(spec).catch(e => {
    errors.set(s.id, String(e));
    emit(false);
  });
}

export function retry(id: string) {
  const s = byId(id);
  const spec = specs.get(id);
  if (!s || !spec) return;
  hosts.get(id)?.dispose();
  hosts.delete(id);
  startHost(s, spec);
}

export function closeSession(id: string) {
  hosts.get(id)?.dispose();
  hosts.delete(id);
  errors.delete(id);
  specs.delete(id);
  activity.forget(id);
  messages.forget(id);
  state.sessions = treeClose(state.sessions, id);
  state.layout = removeSession({ ...state.layout, n: state.preferredN }, id, state.sessions.map(s => s.id));
  normalize();
  emit();
}

export function assignToFocus(id: string) {
  state.layout = assign(state.layout, id);
  activity.markSeen(id);
  const s = byId(id);
  if (s && s.status === 'done') setStatus(id, 'idle');
  emit();
}

export function setLayoutCount(n: 1 | 2 | 3 | 4) {
  state.preferredN = n;
  normalize();
  emit();
}

export function setTheme(t: string) {
  state.theme = t;
  emit();
}

export function setFocus(i: number) {
  if (i === state.layout.focus || i >= state.layout.n) return;
  state.layout = { ...state.layout, focus: i };
  const id = state.layout.panes[i];
  if (id) { activity.markSeen(id); const s = byId(id); if (s?.status === 'done') setStatus(id, 'idle'); }
  emit();
}

export function setFont(id: string, px: number) {
  const s = byId(id);
  if (!s) return;
  s.font = Math.max(10, Math.min(18, px));
  hosts.get(id)?.setFontSize(s.font);
  emit();
}

export function setStatus(id: string, next: Status) {
  const s = byId(id);
  if (!s || s.status === next || s.kind === 'nota') return;
  const prev = s.status;
  s.status = next;
  for (const cb of statusListeners) cb(id, prev, next);
  emit(false);
}

/** Troca o terminal do painel por um aviso (com "Tentar de novo") e redesenha. */
export function setError(id: string, msg: string) {
  errors.set(id, msg);
  emit(false);
}

export function setClaudeSessionId(id: string, claudeId: string) {
  const s = byId(id);
  if (!s || s.claudeSessionId === claudeId) return;
  s.claudeSessionId = claudeId;
  emit();
}

export function setNote(id: string, text: string) { notes.set(id, text); }

export function restoreLayout(l: Layout, lastCwd: string, theme?: string) {
  const ids = new Set(state.sessions.map(s => s.id));
  const panes = l.panes.map(p => (ids.has(p) ? p : ''));
  while (panes.length < 4) panes.push('');
  state.preferredN = l.n;
  state.layout = { n: l.n, panes, focus: Math.min(l.focus, l.n - 1) };
  normalize();
  state.lastCwd = lastCwd;
  if (theme) state.theme = theme;
  emit(false);
}

/** Status por atividade para sessões sem hooks. O Claude usa só os hooks
 *  (o spike mostrou que mensagem recebida dispara UserPromptSubmit; e a statusline
 *  do TUI imprime sozinha, o que faria o status piscar). */
export function tickActivity() {
  const vis = visibleIds();
  const m = activity.tick(performance.now(), vis);
  for (const [id, st] of m) {
    const s = byId(id);
    if (!s || s.kind === 'claude') continue;
    setStatus(id, st);
  }
}
