import type { ShellKind } from './shell-text.js';
import { quoteShellArgFor } from './shell-text.js';

export interface ShellInvocation {
  readonly file: string;
  readonly args: readonly string[];
}

const QUOTED_HEAD = /^\s*['"]/;

export function callOperatorOf(kind: ShellKind, script: string): string {
  if (kind !== 'pwsh' || !QUOTED_HEAD.test(script)) return script;
  return `& ${script}`;
}

export function invocationOf(kind: ShellKind, script: string): ShellInvocation {
  return kind === 'pwsh'
    ? { file: 'pwsh', args: ['-NoProfile', '-NonInteractive', '-Command', callOperatorOf('pwsh', script)] }
    : { file: 'bash', args: ['-c', script] };
}

export function quotedArgvLine(argv: readonly string[], platform: NodeJS.Platform = process.platform): string {
  return argv.map((one) => quoteShellArgFor(one, platform)).join(' ');
}

export function quotedLineOf(invocation: ShellInvocation, platform: NodeJS.Platform = process.platform): string {
  return quotedArgvLine([invocation.file, ...invocation.args], platform);
}
