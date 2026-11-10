import type { ShellResult } from '../shell.js';
import type { ProcessChild } from './exec.js';

export function abortedResult(): ShellResult {
  return {
    exitCode: null,
    timedOut: false,
    aborted: true,
    stdout: '',
    stderr: '',
    truncated: false,
    stalled: false,
  };
}

export function killTreeOf(child: ProcessChild, signal: string): void {
  if (child.killTree !== undefined) {
    child.killTree(signal);
    return;
  }
  child.kill(signal);
}

export function errorHookOf(
  failureOf: () => Error | undefined,
  errorListeners: Set<(error: Error) => void>,
): (listener: (error: Error) => void) => () => void {
  return (listener) => {
    const failure = failureOf();
    if (failure !== undefined) {
      listener(failure);
      return () => {};
    }
    errorListeners.add(listener);
    return () => errorListeners.delete(listener);
  };
}

export function killHookOf(child: ProcessChild): (signal?: string) => void {
  return (signal) => killTreeOf(child, signal ?? 'SIGTERM');
}
