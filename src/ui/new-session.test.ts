// @vitest-environment happy-dom
import { test, expect, vi, beforeEach } from 'vitest';

vi.mock('../terminal/termhost', () => import('../test/fake-termhost'));
const escolherPasta = vi.fn();
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: (...a: unknown[]) => escolherPasta(...a) }));

let store: typeof import('../state/store');
let ns: typeof import('./new-session');

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = '';
  escolherPasta.mockReset();
  store = await import('../state/store');
  ns = await import('./new-session');
});

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const tick = () => new Promise(r => setTimeout(r, 0));
function escolherTipo(k: string) {
  const r = $<HTMLInputElement>(`#k-${k}`);
  r.checked = true;
  r.dispatchEvent(new Event('change', { bubbles: true }));
}
async function enviar() {
  $<HTMLFormElement>('form.dialog').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await tick();
}

test('abre com Claude marcado, bypass ligado e a última pasta usada', async () => {
  await store.createSession({ name: 'Antiga', kind: 'ps', cwd: 'C:\\ultima', bypass: false });
  ns.openNewSession();

  expect($<HTMLInputElement>('#k-claude').checked).toBe(true);
  expect($<HTMLInputElement>('#ns-bypass').checked).toBe(true);
  expect($<HTMLInputElement>('#ns-cwd').value).toBe('C:\\ultima');
  expect(document.activeElement).toBe($('#ns-name'));
});

test('sem nome ou com nome repetido, avisa e não cria', async () => {
  await store.createSession({ name: 'Financeiro', kind: 'ps', cwd: 'C:\\a', bypass: false });
  ns.openNewSession();

  await enviar();
  expect($('#ns-name-err').textContent).toBe('Dê um nome para a sessão.');
  expect($('#ns-name-err').hidden).toBe(false);

  $<HTMLInputElement>('#ns-name').value = ' financeiro ';
  await enviar();
  expect($('#ns-name-err').textContent).toBe('Já existe uma sessão com esse nome.');
  expect($('#ns-name').getAttribute('aria-invalid')).toBe('true');
  expect(store.getState().sessions).toHaveLength(1);
  expect(document.querySelector('.overlay')).not.toBeNull();
});

test('agente sem pasta não é criado', async () => {
  ns.openNewSession();
  $<HTMLInputElement>('#ns-name').value = 'Sem pasta';
  $<HTMLInputElement>('#ns-cwd').value = '   ';
  await enviar();

  expect(store.getState().sessions).toHaveLength(0);
  expect(document.querySelector('.overlay')).not.toBeNull();
});

test('cria o Claude com nome, pasta e bypass, e fecha o diálogo', async () => {
  ns.openNewSession();
  $<HTMLInputElement>('#ns-name').value = '  Orquestrador ';
  $<HTMLInputElement>('#ns-cwd').value = ' C:\\proj ';
  await enviar();

  expect(store.getState().sessions).toHaveLength(1);
  expect(store.getState().sessions[0]).toMatchObject({ name: 'Orquestrador', kind: 'claude', cwd: 'C:\\proj', bypass: true });
  expect(document.querySelector('.overlay')).toBeNull();
});

test('PowerShell e CMD nunca vão com bypass', async () => {
  ns.openNewSession();
  escolherTipo('ps');
  expect($<HTMLInputElement>('#ns-bypass').disabled).toBe(true);
  expect($('#ns-bypass-hint').textContent).toBe('Só vale para agentes (Claude, Codex, Gemini).');

  $<HTMLInputElement>('#ns-name').value = 'Shell';
  $<HTMLInputElement>('#ns-cwd').value = 'C:\\proj';
  await enviar();
  expect(store.getState().sessions[0]).toMatchObject({ kind: 'ps', bypass: false });
});

test('nota esconde a pasta e é criada sem pasta nem bypass', async () => {
  ns.openNewSession();
  escolherTipo('nota');
  expect($('#ns-cwd-field').hidden).toBe(true);

  $<HTMLInputElement>('#ns-name').value = 'Ideias';
  await enviar();
  expect(store.getState().sessions[0]).toMatchObject({ name: 'Ideias', kind: 'nota', cwd: '', bypass: false, status: 'note' });
});

test('"Escolher…" preenche a pasta com a que o usuário selecionou; cancelar mantém a atual', async () => {
  ns.openNewSession();
  $<HTMLInputElement>('#ns-cwd').value = 'C:\\atual';

  escolherPasta.mockResolvedValueOnce(null);
  $<HTMLButtonElement>('#ns-pick').click();
  await tick();
  expect($<HTMLInputElement>('#ns-cwd').value).toBe('C:\\atual');
  expect(escolherPasta).toHaveBeenCalledWith({ directory: true, defaultPath: 'C:\\atual' });

  escolherPasta.mockResolvedValueOnce('C:\\nova');
  $<HTMLButtonElement>('#ns-pick').click();
  await tick();
  expect($<HTMLInputElement>('#ns-cwd').value).toBe('C:\\nova');
});

test('tipo não encontrado no computador só avisa (com atalho para instalar), sem impedir a escolha', async () => {
  const instalar = vi.fn();
  ns.setInstallLink(instalar);
  ns.unavailable.add('codex');
  ns.openNewSession();

  expect($('#nsMissing').hidden).toBe(true);
  escolherTipo('codex');
  expect($('#nsMissing').hidden).toBe(false);
  expect($('#nsMissing').textContent).toContain('Não encontrei o Codex');
  expect($<HTMLInputElement>('#k-codex').disabled).toBe(false);

  $<HTMLButtonElement>('#ns-install').click();
  expect(instalar).toHaveBeenCalledTimes(1);
  expect(document.querySelector('.overlay')).toBeNull();
});

test('cancelar fecha sem criar', () => {
  ns.openNewSession();
  $<HTMLButtonElement>('#ns-cancel').click();
  expect(document.querySelector('.overlay')).toBeNull();
  expect(store.getState().sessions).toHaveLength(0);
});
