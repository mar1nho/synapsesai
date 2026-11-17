// Ponte tipada com os comandos Rust do SynapseIA.
import { invoke, Channel } from '@tauri-apps/api/core';

export type PtyKind = 'claude' | 'codex' | 'gemini' | 'ps' | 'cmd';
export type Resume = { type: 'new' } | { type: 'claudeId'; id: string } | { type: 'continue' };

export interface SessionSpec {
  id: string;
  name: string;
  kind: PtyKind;
  cwd: string;
  bypass: boolean;
  addDirs: string[];
  parent: string | null;
  resume: Resume;
  startup: string | null;
}

export function ptySpawn(spec: SessionSpec, cols: number, rows: number, onData: (b: Uint8Array) => void): Promise<void> {
  const ch = new Channel<ArrayBuffer | number[]>();
  ch.onmessage = msg => onData(msg instanceof ArrayBuffer ? new Uint8Array(msg) : Uint8Array.from(msg));
  return invoke('pty_spawn', { spec, cols, rows, onOutput: ch });
}

export const ptyWrite = (id: string, data: string) => invoke<void>('pty_write', { id, data });
export const ptyResize = (id: string, cols: number, rows: number) => invoke<void>('pty_resize', { id, cols, rows });
export const ptyKill = (id: string) => invoke<void>('pty_kill', { id });
