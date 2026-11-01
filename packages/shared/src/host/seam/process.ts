import { closeSync, openSync } from 'node:fs';
import type { Readable, Writable } from 'node:stream';
import { execa, type Options, type ResultPromise } from 'execa';
import type {
  ProcessChild,
  ProcessExitEvent,
  ProcessHost,
  ProcessSpawnOptions,
  ProcessStream,
} from './exec.js';

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

export function createNodeProcessHost(): ProcessHost {
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
          detached: options.detached,
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
      };
    },
  };
}
