import { closeSync, openSync } from 'node:fs';
import { win32 } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { execa, type Options, type ResultPromise } from 'execa';
import { shellKindOf } from '../shell-text.js';
import type {
  ProcessChild,
  ProcessExitEvent,
  ProcessHost,
  ProcessSpawnOptions,
  ProcessStream,
} from './exec.js';

export interface NodeProcessHostOptions {
  readonly platform?: NodeJS.Platform | undefined;
  readonly systemRoot?: string | undefined;
  readonly spawnTaskkill?: TreeKillSpawner | undefined;
}

export type TreeKillSpawner = (file: string, args: readonly string[], onFailure: () => void) => void;

function windowsRootOf(systemRoot: string | undefined): string | undefined {
  const candidate = systemRoot ?? process.env['SystemRoot'] ?? process.env['windir'];
  return candidate !== undefined && /^[A-Za-z]:[\\/]/.test(candidate) ? candidate : undefined;
}

function taskkillArgvOf(
  pid: number,
  systemRoot: string,
): { readonly file: string; readonly args: readonly string[] } {
  return { file: win32.join(systemRoot, 'System32', 'taskkill.exe'), args: ['/pid', String(pid), '/T', '/F'] };
}

function defaultSpawnTaskkill(file: string, args: readonly string[], onFailure: () => void): void {
  execa(file, [...args], { reject: false, stdio: 'ignore' })
    .then((result) => {
      if (result.exitCode !== 0) onFailure();
    })
    .catch(() => onFailure());
}

function streamOf(readable: Readable | null | undefined): ProcessStream | null {
  if (readable === null || readable === undefined) return null;
  return {
    onData(listener) {
      const handler = (chunk: unknown): void => listener(String(chunk));
      readable.on('data', handler);
      return () => {
        readable.off('data', handler);
      };
    },
  };
}

export function createNodeProcessHost(hostOptions: NodeProcessHostOptions = {}): ProcessHost {
  const windows =
    hostOptions.platform === undefined ? shellKindOf() === 'pwsh' : hostOptions.platform === 'win32';
  const systemRoot = windowsRootOf(hostOptions.systemRoot);
  const spawnTaskkill = hostOptions.spawnTaskkill ?? defaultSpawnTaskkill;
  return {
    spawn(options: ProcessSpawnOptions): ProcessChild {
      const logFd =
        options.stdio === 'log' && options.logFile !== undefined ? openSync(options.logFile, 'a') : undefined;
      const stdio: Options['stdio'] =
        options.stdio === 'pipe'
          ? 'pipe'
          : logFd === undefined
            ? 'ignore'
            : (['ignore', logFd, logFd] as unknown as Options['stdio']);
      let logClosed = false;
      const closeLog = (): void => {
        if (logClosed || logFd === undefined) return;
        logClosed = true;
        closeSync(logFd);
      };
      let child: ResultPromise;
      try {
        child = execa(options.file, [...options.args], {
          ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
          env: { ...options.env },
          detached: options.detached || (options.killTree === true && !windows),
          stdio,
          windowsHide: options.windowsHide,
          reject: false,
          buffer: false,
        } as Options);
      } catch (error) {
        closeLog();
        throw error;
      }
      if (logFd !== undefined) {
        child.nodeChildProcess.once('spawn', closeLog);
        child.nodeChildProcess.once('error', closeLog);
      }
      const stdin = child.stdin as Writable | null | undefined;
      const killTree = (signal?: string): void => {
        const sig = (signal ?? 'SIGTERM') as NodeJS.Signals;
        const pid = child.pid;
        const exited = child.nodeChildProcess.exitCode !== null || child.nodeChildProcess.signalCode !== null;
        if (pid === undefined || exited) return;
        if (!windows) {
          try {
            process.kill(-pid, sig);
            return;
          } catch {
            child.kill(sig);
            return;
          }
        }
        if (systemRoot === undefined) {
          child.kill(sig);
          return;
        }
        const argv = taskkillArgvOf(pid, systemRoot);
        spawnTaskkill(argv.file, argv.args, () => child.kill(sig));
      };
      return {
        pid: child.pid,
        stdin: stdin === null || stdin === undefined ? null : { write: (chunk: string) => stdin.write(chunk) },
        stdout: streamOf(child.stdout as Readable | null | undefined),
        stderr: streamOf(child.stderr as Readable | null | undefined),
        onExit(listener) {
          const handler = (code: number | null, signal: string | null): void =>
            listener({ code, signal } satisfies ProcessExitEvent);
          child.nodeChildProcess.on('exit', handler);
          return () => {
            child.nodeChildProcess.off('exit', handler);
          };
        },
        onError(listener) {
          child.nodeChildProcess.on('error', listener);
          return () => {
            child.nodeChildProcess.off('error', listener);
          };
        },
        unref() {
          child.nodeChildProcess.unref();
        },
        kill(signal) {
          child.kill(signal as NodeJS.Signals | undefined);
        },
        killTree,
      };
    },
  };
}
