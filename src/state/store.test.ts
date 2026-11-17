import { test, expect, vi, beforeEach } from 'vitest';
import type { SessionSpec } from '../ipc';

// O TermHost real precisa de DOM e do xterm.js; aqui basta um dublê que registra as chamadas.
const criados: FakeHost[] = [];
let falhaAoIniciar: string | null = null;

class FakeHost {
  specs: SessionSpec[] = [];
  fontes: number[] = [];
  descartado = false;
  constructor(readonly id: string, readonly fonte: number) { criados.push(this); }
  onOutput() { /* sem saída nos testes */ }
  start(spec: SessionSpec): Promise<void> {
    this.specs.push(spec);
    return falhaAoIniciar ? Promise.reject(new Error(falhaAoIniciar)) : Promise.resolve();
  }
  setFontSize(px: number) { this.fontes.push(px); }
  dispose() { this.descartado = true; }
}
vi.mock('../terminal/termhost', () => ({ TermHost: FakeHost }));

type Store = typeof import('./store');
let store: Store;

// O estado do store é do módulo: cada teste carrega um módulo novo.
beforeEach(async () => {
  vi.resetModules();
  criados.length = 0;
  falhaAoIniciar = null;
  store = await import('./store');
});

const nova = (name: string, extra: Partial<Parameters<Store['createSession']>[0]> = {}) =>
  store.createSession({ name, kind: 'claude', cwd: 'C:\\proj', bypass: false, ...extra });
const visiveis = () => store.getState().layout.panes.slice(0, store.getState().layout.n);

test('criar sessão: entra na lista, ganha terminal, toma o foco e pede para salvar', async () => {
  const salvar = vi.fn();
  store.setSaveHook(salvar);
  const s = await nova('  Orquestrador  ');

  expect(s.name).toBe('Orquestrador');
  expect(s.status).toBe('idle');
  expect(store.getState().sessions).toHaveLength(1);
  expect(store.getState().lastCwd).toBe('C:\\proj');
  expect(visiveis()).toEqual([s.id]);
  expect(criados).toHaveLength(1);
  expect(criados[0].specs[0]).toMatchObject({ id: s.id, name: 'Orquestrador', kind: 'claude', resume: { type: 'new' }, startup: null });
  expect(salvar).toHaveBeenCalled();
});

test('nota não abre terminal, tem status próprio e não muda a última pasta', async () => {
  await nova('A');
  const n = await nova('Ideias', { kind: 'nota', cwd: '' });

  expect(n.status).toBe('note');
  expect(criados).toHaveLength(1);
  expect(store.notes.get(n.id)).toBe('');
  expect(store.getState().lastCwd).toBe('C:\\proj');
});

test('a tela nunca mostra mais painéis que sessões, mas guarda o layout escolhido', async () => {
  store.setLayoutCount(4);
  await nova('A');
  await nova('B');
  expect(store.getState().layout.n).toBe(2);
  expect(store.getState().preferredN).toBe(4);

  await nova('C');
  await nova('D');
  await nova('E');
  expect(store.getState().layout.n).toBe(4);
  expect(new Set(visiveis()).size).toBe(4);
});

test('sessão criada com focus:false não tira a sessão que está no painel em foco', async () => {
  store.setLayoutCount(1);
  const a = await nova('A');
  const filho = await nova('Filho', { parent: a.id, focus: false });

  expect(visiveis()).toEqual([a.id]);
  expect(store.byId(filho.id)?.parent).toBe(a.id);
});

test('fechar sessão: descarta o terminal, sobe os filhos para a raiz e encolhe o layout', async () => {
  const a = await nova('A');
  const filho = await nova('Filho', { parent: a.id });
  store.closeSession(a.id);

  expect(criados[0].descartado).toBe(true);
  expect(store.hosts.has(a.id)).toBe(false);
  expect(store.byId(a.id)).toBeUndefined();
  expect(store.byId(filho.id)?.parent).toBeNull();
  expect(visiveis()).toEqual([filho.id]);
});

test('status: avisa quem escuta com o anterior e o novo, ignora repetição e notas, e não salva', async () => {
  const a = await nova('A');
  const n = await nova('Nota', { kind: 'nota', cwd: '' });
  const salvar = vi.fn();
  const mudou = vi.fn();
  store.setSaveHook(salvar);
  store.onStatus(mudou);

  store.setStatus(a.id, 'wait');
  store.setStatus(a.id, 'wait');
  store.setStatus(n.id, 'run');
  store.setStatus('nao-existe', 'run');

  expect(mudou).toHaveBeenCalledTimes(1);
  expect(mudou).toHaveBeenCalledWith(a.id, 'idle', 'wait');
  expect(store.byId(n.id)?.status).toBe('note');
  expect(salvar).not.toHaveBeenCalled();
});

test('olhar uma sessão que terminou (done) a devolve para parado (idle)', async () => {
  store.setLayoutCount(2);
  const a = await nova('A');
  const b = await nova('B');
  const c = await nova('C', { focus: false });

  // por foco de painel
  store.setStatus(a.id, 'done');
  store.setFocus(visiveis().indexOf(a.id));
  expect(store.byId(a.id)?.status).toBe('idle');

  // por trazer ao painel em foco
  store.setStatus(c.id, 'done');
  store.assignToFocus(c.id);
  expect(store.byId(c.id)?.status).toBe('idle');
  expect(visiveis()).toContain(c.id);
  expect(store.byId(b.id)?.status).toBe('idle');
});

test('setFocus ignora painel que não está na tela', async () => {
  await nova('A');
  const antes = store.getState().layout.focus;
  store.setFocus(3);
  expect(store.getState().layout.focus).toBe(antes);
});

test('fonte fica entre 10 e 18 e vai para o terminal', async () => {
  const a = await nova('A');
  store.setFont(a.id, 40);
  store.setFont(a.id, 2);
  expect(criados[0].fontes).toEqual([18, 10]);
  expect(store.byId(a.id)?.font).toBe(10);
});

test('falha ao iniciar vira aviso no painel; "tentar de novo" cria outro terminal e limpa o aviso', async () => {
  falhaAoIniciar = 'pasta não encontrada';
  const a = await nova('A');
  await Promise.resolve();
  await Promise.resolve();
  expect(store.errors.get(a.id)).toContain('pasta não encontrada');

  falhaAoIniciar = null;
  store.retry(a.id);
  expect(criados).toHaveLength(2);
  expect(criados[0].descartado).toBe(true);
  expect(store.errors.has(a.id)).toBe(false);
  expect(criados[1].specs[0].id).toBe(a.id);
});

test('nome já usado é detectado sem diferenciar maiúsculas nem espaços', async () => {
  await nova('Revisão');
  expect(store.isNameTaken('  revisão ')).toBe(true);
  expect(store.isNameTaken('Pesquisa')).toBe(false);
});

test('id da conversa do Claude: salva quando muda, não salva quando é o mesmo', async () => {
  const a = await nova('A');
  const salvar = vi.fn();
  store.setSaveHook(salvar);

  store.setClaudeSessionId(a.id, 'abc');
  store.setClaudeSessionId(a.id, 'abc');
  expect(store.byId(a.id)?.claudeSessionId).toBe('abc');
  expect(salvar).toHaveBeenCalledTimes(1);
});

test('restaurar layout: descarta painéis de sessões que não existem mais e ajusta o foco', async () => {
  const a = await nova('A');
  const b = await nova('B');
  store.restoreLayout({ n: 2, panes: [b.id, 'sumiu'], focus: 5 }, 'C:\\outra', 'light');

  const st = store.getState();
  expect(st.preferredN).toBe(2);
  expect(st.layout.panes).toHaveLength(4);
  expect(visiveis()).toEqual([b.id, a.id]);
  expect(st.layout.focus).toBe(1);
  expect(st.lastCwd).toBe('C:\\outra');
  expect(st.theme).toBe('light');
});

test('quem assina é avisado a cada mudança e para de ser avisado ao cancelar', async () => {
  const ouvinte = vi.fn();
  const cancelar = store.subscribe(ouvinte);
  store.setTheme('dark');
  expect(ouvinte).toHaveBeenCalledTimes(1);
  cancelar();
  store.setTheme('light');
  expect(ouvinte).toHaveBeenCalledTimes(1);
});
