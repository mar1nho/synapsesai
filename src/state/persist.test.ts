import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SessionSpec } from '../ipc';
import { DEFAULT_THEME } from '../theme';

// Dublês: o terminal (precisa de DOM) e os comandos do Rust.
const iniciados: SessionSpec[] = [];
class FakeHost {
  onOutput() { /* sem saída nos testes */ }
  start(spec: SessionSpec): Promise<void> { iniciados.push(spec); return Promise.resolve(); }
  setFontSize() { /* nada */ }
  dispose() { /* nada */ }
}
vi.mock('../terminal/termhost', () => ({ TermHost: FakeHost }));

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

type Store = typeof import('./store');
type Persist = typeof import('./persist');
let store: Store;
let persist: Persist;

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('window', globalThis);
  iniciados.length = 0;
  invoke.mockReset();
  store = await import('./store');
  persist = await import('./persist');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const salvo = (extra: Record<string, unknown>) => ({
  id: 'x', name: 'X', kind: 'claude', cwd: 'C:\\proj', bypass: false, addDirs: [], parent: null, font: 13, claudeSessionId: null,
  ...extra,
});
/** Faz o state_load devolver este estado (e o note_read devolver o texto da nota). */
function aoCarregar(estado: Record<string, unknown>, existia = true, notas: Record<string, string> = {}) {
  invoke.mockImplementation((cmd: string, args?: { id?: string }) => {
    if (cmd === 'state_load') return Promise.resolve([{ version: 1, sessions: [], layout: { n: 1, panes: [], focus: 0 }, lastCwd: '', theme: '', ...estado }, existia]);
    if (cmd === 'note_read') {
      const texto = notas[args?.id ?? ''];
      return texto === undefined ? Promise.reject(new Error('sem arquivo')) : Promise.resolve(texto);
    }
    return Promise.resolve();
  });
}

test('snapshot guarda sessões em ordem de árvore, o layout escolhido e o tema', async () => {
  const pai = await store.createSession({ name: 'Pai', kind: 'claude', cwd: 'C:\\a', bypass: true, addDirs: ['C:\\b'] });
  await store.createSession({ name: 'Solta', kind: 'ps', cwd: 'C:\\c', bypass: false });
  await store.createSession({ name: 'Filho', kind: 'claude', cwd: 'C:\\a', bypass: true, parent: pai.id });
  store.setClaudeSessionId(pai.id, 'conversa-1');
  store.setLayoutCount(2);
  store.setTheme('dark');

  const s = persist.snapshot();
  expect(s.version).toBe(1);
  expect(s.sessions.map(x => x.name)).toEqual(['Pai', 'Filho', 'Solta']);
  expect(s.sessions[0]).toMatchObject({ kind: 'claude', cwd: 'C:\\a', bypass: true, addDirs: ['C:\\b'], parent: null, claudeSessionId: 'conversa-1' });
  expect(s.sessions[2].claudeSessionId).toBeNull();
  expect(s.layout.n).toBe(2);
  expect(s.theme).toBe('dark');
  // o status não é salvo: ele é do momento
  expect(s.sessions[0]).not.toHaveProperty('status');
});

test('restaurar: cada tipo de sessão retoma do jeito certo', async () => {
  aoCarregar({
    sessions: [
      salvo({ id: 'c1', name: 'Com id', claudeSessionId: 'abc' }),
      salvo({ id: 'c2', name: 'Sem id' }),
      salvo({ id: 'cx', name: 'Codex', kind: 'codex' }),
      salvo({ id: 'gm', name: 'Gemini', kind: 'gemini' }),
      salvo({ id: 'ps', name: 'Shell', kind: 'ps' }),
    ],
    layout: { n: 4, panes: ['c1', 'c2', 'cx', 'gm'], focus: 0 },
  });
  expect(await persist.restore()).toBe(true);

  const retoma = Object.fromEntries(iniciados.map(s => [s.id, s.resume]));
  expect(retoma).toEqual({
    c1: { type: 'claudeId', id: 'abc' },
    c2: { type: 'continue' },
    cx: { type: 'continue' },
    gm: { type: 'continue' },
    ps: { type: 'new' },
  });
  expect(store.getState().sessions.map(s => s.id)).toEqual(['c1', 'c2', 'cx', 'gm', 'ps']);
});

test('restaurar: nota carrega o texto do arquivo; sem arquivo, abre vazia', async () => {
  aoCarregar(
    { sessions: [salvo({ id: 'n1', name: 'Com texto', kind: 'nota' }), salvo({ id: 'n2', name: 'Sem arquivo', kind: 'nota' })] },
    true,
    { n1: '# ideias' },
  );
  await persist.restore();

  expect(store.notes.get('n1')).toBe('# ideias');
  expect(store.notes.get('n2')).toBe('');
  expect(iniciados).toHaveLength(0);
});

test('restaurar: quantidade de painéis fora de 1 a 4 é corrigida', async () => {
  aoCarregar({ sessions: [salvo({ id: 'a' })], layout: { n: 9, panes: ['a'], focus: 0 } });
  await persist.restore();
  expect(store.getState().preferredN).toBe(4);

  vi.resetModules();
  store = await import('./store');
  persist = await import('./persist');
  aoCarregar({ sessions: [salvo({ id: 'a' })], layout: { n: 0, panes: ['a'], focus: 0 } });
  await persist.restore();
  expect(store.getState().preferredN).toBe(1);
});

test('restaurar: tema salvo que não existe mais (versão antiga) ou vazio vira o padrão', async () => {
  aoCarregar({ theme: 'tema-de-versao-antiga' });
  await persist.restore();
  expect(store.getState().theme).toBe(DEFAULT_THEME);
  // e é o padrão que volta a ser salvo
  expect(persist.snapshot().theme).toBe(DEFAULT_THEME);
});

test('restaurar: tema válido é mantido', async () => {
  aoCarregar({ theme: 'light' });
  await persist.restore();
  expect(store.getState().theme).toBe('light');
});

test('primeira execução: restore devolve false e não cria nada', async () => {
  aoCarregar({}, false);
  expect(await persist.restore()).toBe(false);
  expect(store.getState().sessions).toEqual([]);
});

test('salvamento automático junta várias mudanças numa gravação só, 1 s depois da última', async () => {
  vi.useFakeTimers();
  invoke.mockResolvedValue(undefined);
  persist.startAutosave();

  store.setTheme('dark');
  vi.advanceTimersByTime(600);
  store.setTheme('light');
  vi.advanceTimersByTime(600);
  expect(invoke).not.toHaveBeenCalled();

  vi.advanceTimersByTime(400);
  const gravacoes = invoke.mock.calls.filter(c => c[0] === 'state_save');
  expect(gravacoes).toHaveLength(1);
  expect((gravacoes[0][1] as { s: { theme: string } }).s.theme).toBe('light');
});

test('mudança de status não dispara gravação', async () => {
  vi.useFakeTimers();
  invoke.mockResolvedValue(undefined);
  const a = await store.createSession({ name: 'A', kind: 'claude', cwd: 'C:\\a', bypass: false });
  persist.startAutosave();

  store.setStatus(a.id, 'run');
  vi.advanceTimersByTime(5000);
  expect(invoke).not.toHaveBeenCalled();
});
