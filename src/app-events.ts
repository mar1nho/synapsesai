// Eventos vindos do Rust: status por hook, id da conversa, filho criado, sessão encerrada, sair.
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isPermissionGranted, requestPermission, sendNotification, onAction } from '@tauri-apps/plugin-notification';
import { assignToFocus, byId, createSession, getState, hosts, onStatus, recordMessage, setClaudeSessionId, setError, setStatus, visibleIds } from './state/store';
import { shouldNotify } from './state/notify-rule';
import { saveNow } from './state/persist';
import type { SessionSpec } from './ipc';
import { hasUnsaved } from './ui/editor-panel';
import { confirmDialog } from './ui/dialog';

let lastWaiting: string | null = null;

async function notify(id: string) {
  const s = byId(id);
  if (!s) return;
  let ok = await isPermissionGranted();
  if (!ok) ok = (await requestPermission()) === 'granted';
  if (!ok) return;
  lastWaiting = id;
  sendNotification({ title: `${s.name} está esperando você`, body: 'Abra o SynapseIA para responder.', extra: { sessionId: id } });
}

async function openSession(id: string) {
  const w = getCurrentWindow();
  await w.show(); await w.unminimize(); await w.setFocus();
  if (byId(id)) assignToFocus(id);
}

export async function wireAppEvents() {
  await listen<{ id: string; status: 'run' | 'idle' | 'wait' }>('session://status', e => {
    const { id, status } = e.payload;
    const s = byId(id);
    if (!s) return;
    if (status === 'idle' && !visibleIds().has(id) && s.status === 'run') setStatus(id, 'done');
    else setStatus(id, status);
  });

  await listen<{ id: string; to: string; preview: string }>('session://message', e =>
    recordMessage(e.payload.id, e.payload.to, e.payload.preview));

  await listen<{ id: string; claudeSessionId: string }>('session://claude-id', e =>
    setClaudeSessionId(e.payload.id, e.payload.claudeSessionId));

  await listen<SessionSpec>('session://spawn', e => {
    const c = e.payload;
    void createSession({ id: c.id, name: c.name, kind: 'claude', cwd: c.cwd, bypass: c.bypass, addDirs: c.addDirs, parent: c.parent, focus: false });
  });

  await listen<{ id: string; code: number | null }>('session://exited', async e => {
    const { id, code } = e.payload;
    if (!byId(id)) return;
    // os agentes rodam direto (sem um shell em volta): se saírem com erro, o motivo está nas últimas linhas
    const fim = code === 0 ? '' : await (hosts.get(id)?.tail() ?? Promise.resolve(''));
    if (!byId(id)) return;
    setStatus(id, 'idle');
    setError(id, `A sessão terminou${code != null ? ` (código ${code})` : ''}.${fim ? `\n\n${fim}` : ''}`);
  });

  await listen('app://quit', async () => {
    if (hasUnsaved()) {
      const ok = await confirmDialog('Sair sem salvar os arquivos?', 'Há arquivos alterados no editor que ainda não foram salvos.', 'Sair sem salvar');
      if (!ok) return;
    }
    try { await saveNow(); } catch { /* segue saindo */ }
    await invoke('app_exit');
  });

  // notificação só ao entrar em "esperando você" e fora de vista
  onStatus((id, prev, next) => {
    const visible = visibleIds().has(id);
    if (shouldNotify(prev, next, document.hasFocus(), visible)) void notify(id);
  });

  // clique na notificação (quando o Windows entrega) abre a sessão
  try {
    await onAction(n => {
      const extra = (n as unknown as { notification?: { extra?: { sessionId?: string } } }).notification?.extra;
      const id = extra?.sessionId ?? lastWaiting;
      if (id) void openSession(id);
    });
  } catch { /* sem suporte no Windows: fica a reserva abaixo */ }

  // reserva: ao ganhar foco, leva ao painel a sessão esperando que não está visível
  window.addEventListener('focus', () => {
    const vis = visibleIds();
    const w = getState().sessions.find(s => s.status === 'wait' && !vis.has(s.id));
    if (w && lastWaiting === w.id) { assignToFocus(w.id); lastWaiting = null; }
  });
}
