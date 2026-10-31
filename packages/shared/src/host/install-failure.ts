import { accessSync, constants, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { InstallFailure, InstallFailureKind } from '../contract/command.js';

const TARGET_FLAGS = ['--prefix', '--cache', '--dir', '--store-dir'];

const INSTALL_VERBS = /^\s*(?:npm\s+(?:i|install|add)|pnpm\s+(?:add|install))\b/;

const NPM_PATH = /^npm (?:error|ERR!) path (.+)$/m;

export interface DirFacts {
  readonly mode: string;
  readonly owner: { readonly uid: number; readonly gid: number };
  readonly writable: boolean;
}

export function commandTokens(command: string): string[] {
  const tokens: string[] = [];
  const token = /'([^']*)'|"([^"]*)"|(\S+)/g;
  for (let match = token.exec(command); match !== null; match = token.exec(command)) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens;
}

export function installTargets(command: string): string[] {
  const tokens = commandTokens(command);
  const targets: string[] = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (TARGET_FLAGS.includes(tokens[index] ?? '')) targets.push(tokens[index + 1] ?? '');
  }
  return targets.filter((target) => target !== '');
}

export function failurePathIn(output: string): string | undefined {
  const path = NPM_PATH.exec(output)?.[1]?.trim();
  return path === undefined || path === '' ? undefined : path;
}

export function nearestDir(path: string): string | undefined {
  let at = path;
  for (;;) {
    const here = (): boolean => {
      try {
        return statSync(at).isDirectory();
      } catch {
        return false;
      }
    };
    if (here()) return at;
    const up = dirname(at);
    if (up === at) return undefined;
    at = up;
  }
}

export type WriteState = 'ok' | 'denied' | 'unknown';

export function writeStateOf(dir: string): WriteState {
  try {
    accessSync(dir, constants.W_OK);
    return 'ok';
  } catch (error) {
    return (error as { code?: string }).code === 'EACCES' ? 'denied' : 'unknown';
  }
}

export function dirFacts(dir: string): DirFacts | undefined {
  try {
    const stats = statSync(dir);
    return {
      mode: (stats.mode & 0o777).toString(8),
      owner: { uid: stats.uid, gid: stats.gid },
      writable: writeStateOf(dir) === 'ok',
    };
  } catch {
    return undefined;
  }
}

export function currentUser(): { readonly uid: number; readonly gid: number } {
  return { uid: process.getuid?.() ?? -1, gid: process.getgid?.() ?? -1 };
}

export function classifyInstallFailure(output: string): InstallFailureKind {
  const text = output.toLowerCase();
  if (/enospc|no space left/.test(text)) return 'disk-full';
  if (/eacces|eperm|permission denied|operation not permitted|access is denied/.test(text)) return 'permission';
  return 'unknown';
}

export interface InstallFailureFacts {
  readonly command: string;
  readonly exitCode: number | null;
  readonly output: string;
  readonly kind?: InstallFailureKind | undefined;
  readonly path?: string | undefined;
  readonly mode?: string | undefined;
  readonly owner?: { readonly uid: number; readonly gid: number } | undefined;
  readonly writable?: boolean | undefined;
  readonly current: { readonly uid: number; readonly gid: number };
}

export function installFailureOf(facts: InstallFailureFacts): InstallFailure {
  const kind = facts.kind ?? classifyInstallFailure(facts.output);
  const path = facts.path;
  const base = {
    command: facts.command,
    exitCode: facts.exitCode,
    output: facts.output,
    ...(path === undefined ? {} : { path }),
    ...(facts.mode === undefined ? {} : { mode: facts.mode }),
    ...(facts.owner === undefined ? {} : { owner: facts.owner }),
    current: facts.current,
  };
  if (kind === 'disk-full') {
    return { ...base, kind, fix: path === undefined ? { kind: 'handoff' } : { kind: 'space', path } };
  }
  if (kind === 'permission' && path !== undefined) {
    const owner = facts.owner;
    if (owner !== undefined && owner.uid !== facts.current.uid && facts.current.uid >= 0) {
      return { ...base, kind, fix: { kind: 'chown', path, uid: facts.current.uid, gid: facts.current.gid } };
    }
    if (facts.writable === false) {
      return { ...base, kind, fix: { kind: 'chmod', path } };
    }
    if (facts.writable === true) {
      return { ...base, kind: 'sandbox', fix: { kind: 'handoff' } };
    }
  }
  return { ...base, kind, fix: { kind: 'handoff' } };
}

export function diagnoseInstallFailure(input: {
  readonly command: string;
  readonly exitCode: number | null;
  readonly output: string;
  readonly fallback?: string | undefined;
}): InstallFailure {
  const current = currentUser();
  const candidates = [
    failurePathIn(input.output),
    ...installTargets(input.command),
    input.fallback,
  ].filter((path): path is string => path !== undefined && path !== '');
  for (const candidate of candidates) {
    const dir = nearestDir(candidate);
    if (dir === undefined) continue;
    const facts = dirFacts(dir);
    if (facts === undefined) continue;
    return installFailureOf({
      command: input.command,
      exitCode: input.exitCode,
      output: input.output,
      path: dir,
      mode: facts.mode,
      owner: facts.owner,
      writable: facts.writable,
      current,
    });
  }
  return installFailureOf({
    command: input.command,
    exitCode: input.exitCode,
    output: input.output,
    current,
  });
}

export function installWriteProblem(input: {
  readonly command: string;
  readonly fallback?: string | undefined;
}): InstallFailure | undefined {
  if (!INSTALL_VERBS.test(input.command)) return undefined;
  const current = currentUser();
  const candidates = [...installTargets(input.command), input.fallback].filter(
    (path): path is string => path !== undefined && path !== '',
  );
  for (const candidate of candidates) {
    const dir = nearestDir(candidate);
    if (dir === undefined) continue;
    if (writeStateOf(dir) !== 'denied') continue;
    const facts = dirFacts(dir);
    if (facts === undefined) continue;
    return installFailureOf({
      command: input.command,
      exitCode: null,
      output: '',
      kind: 'permission',
      path: dir,
      mode: facts.mode,
      owner: facts.owner,
      writable: facts.writable,
      current,
    });
  }
  return undefined;
}
