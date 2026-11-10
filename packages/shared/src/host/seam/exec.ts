import type { ShellResult } from '../shell.js';
import type { ShellKind } from '../shell-text.js';
import type { WriteIntent } from './intent.js';

export type SeamShellKind = ShellKind;

export interface HostWriteIntent {
  readonly kind: 'host';
}

export type ExecIntent = WriteIntent | HostWriteIntent;

export type SeamTarget =
  | { readonly argv: readonly string[] }
  | { readonly line: string; readonly shellKind?: SeamShellKind | undefined };

export interface SeamOutcomeWithTarget extends ShellResult {
  readonly outcome?: 'exited' | 'timed-out' | 'spawn-failed';
}

export interface SpawnRequest {
  readonly target: SeamTarget;
  readonly intent: ExecIntent;
  readonly lifetime: 'host';
  readonly cwd?: string | undefined;
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  readonly logFile?: string | undefined;
  readonly label?: string | undefined;
}

export interface SpawnExit {
  readonly code: number | null;
  readonly signal: string | null;
}

export interface SpawnHandle {
  readonly pid: number | undefined;
  readonly logFile: string | undefined;
  exit(): Promise<SpawnExit>;
  onError(listener: (error: Error) => void): () => void;
  kill(signal?: string): void;
}

export interface OpenRequest {
  readonly target: SeamTarget;
  readonly intent: ExecIntent;
  readonly cwd?: string | undefined;
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  readonly label?: string | undefined;
}

export interface ChannelHandle {
  readonly pid: number | undefined;
  write(chunk: string): void;
  onData(listener: (chunk: string) => void): () => void;
  onExit(listener: (event: SpawnExit) => void): () => void;
  onError(listener: (error: Error) => void): () => void;
  kill(signal?: string): void;
}

export interface ProcessSpawnOptions {
  readonly file: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly cwd?: string | undefined;
  readonly detached: boolean;
  readonly stdio: 'ignore' | 'pipe' | 'log';
  readonly logFile?: string | undefined;
  readonly windowsHide: boolean;
  readonly killTree?: boolean | undefined;
}

export interface ProcessExitEvent {
  readonly code: number | null;
  readonly signal: string | null;
}

export interface ProcessStream {
  onData(listener: (chunk: string) => void): () => void;
}

export interface ProcessChild {
  readonly pid: number | undefined;
  readonly stdin: { write(chunk: string): void } | null;
  readonly stdout: ProcessStream | null;
  readonly stderr: ProcessStream | null;
  onExit(listener: (event: ProcessExitEvent) => void): () => void;
  onError(listener: (error: Error) => void): () => void;
  unref(): void;
  kill(signal?: string): void;
  killTree?(signal?: string): void;
}

export interface ProcessHost {
  spawn(options: ProcessSpawnOptions): ProcessChild;
}
