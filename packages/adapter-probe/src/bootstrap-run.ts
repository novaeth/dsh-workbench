import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { isolatedRoot } from '@dsh-workbench/adapter-runtime';
import { tailLines } from '@dsh-workbench/shared/host';
import type { ShellKind } from '@dsh-workbench/shared/host';
import { currentShellKind } from './platform.js';

export interface BootstrapEnvOptions {
  readonly opencliRoot?: string | undefined;
  readonly realHome?: string | undefined;
  readonly parent?: NodeJS.ProcessEnv | undefined;
  readonly shellKind?: ShellKind | undefined;
}

export interface BootstrapSpawnOptions {
  readonly env: Readonly<Record<string, string>>;
  readonly timeout: number;
  readonly reject: false;
  readonly stripFinalNewline: false;
}

export interface BootstrapSpawnResult {
  readonly exitCode: number | null;
  readonly timedOut?: boolean | undefined;
  readonly stdout: string;
  readonly stderr: string;
}

export type BootstrapSpawn = (
  file: string,
  args: readonly string[],
  options: BootstrapSpawnOptions,
) => Promise<BootstrapSpawnResult>;

export interface BootstrapRunOptions {
  readonly timeoutMs: number;
  readonly env?: Readonly<Record<string, string>> | undefined;
  readonly shellKind?: ShellKind | undefined;
  readonly spawn?: BootstrapSpawn | undefined;
}

export interface BootstrapRunResult {
  readonly ok: boolean;
  readonly detail: string;
}

export function bootstrapEnv(options: BootstrapEnvOptions = {}): Record<string, string> {
  const shellKind = options.shellKind ?? currentShellKind();
  const opencliRoot = options.opencliRoot ?? isolatedRoot();
  const realHome = options.realHome ?? homedir();
  const parent = options.parent ?? process.env;
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(parent)) {
    if (typeof value === 'string') env[key] = value;
  }
  const home = join(opencliRoot, 'home');
  env['HOME'] = home;
  if (shellKind === 'pwsh') env['USERPROFILE'] = home;
  const userConfig = join(realHome, '.npmrc');
  if (existsSync(userConfig)) env['NPM_CONFIG_USERCONFIG'] = userConfig;
  const cache = join(opencliRoot, 'npm-cache');
  env['npm_config_cache'] = cache;
  env['NPM_CONFIG_CACHE'] = cache;
  env['NO_COLOR'] = '1';
  env['TERM'] = 'dumb';
  return env;
}

function shellOf(
  line: string,
  shellKind: ShellKind,
): { readonly file: string; readonly args: readonly string[] } {
  return shellKind === 'pwsh'
    ? { file: 'pwsh', args: ['-NoProfile', '-NonInteractive', '-Command', line] }
    : { file: 'bash', args: ['-c', line] };
}

const defaultSpawn: BootstrapSpawn = async (file, args, options) => {
  const result = await execa(file, [...args], {
    env: { ...options.env },
    timeout: options.timeout,
    reject: options.reject,
    stripFinalNewline: options.stripFinalNewline,
  });
  return {
    exitCode: result.exitCode ?? null,
    timedOut: result.timedOut === true,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

export async function runBootstrapCommand(
  line: string,
  options: BootstrapRunOptions,
): Promise<BootstrapRunResult> {
  const shellKind = options.shellKind ?? currentShellKind();
  const spawn = options.spawn ?? defaultSpawn;
  const env = { ...bootstrapEnv({ shellKind }), ...(options.env ?? {}) };
  const command = shellOf(line, shellKind);
  try {
    const result = await spawn(command.file, command.args, {
      env,
      timeout: options.timeoutMs,
      reject: false,
      stripFinalNewline: false,
    });
    if (result.timedOut === true) return { ok: false, detail: `超时（${String(options.timeoutMs)} ms）：${line}` };
    if (result.exitCode === 0) return { ok: true, detail: tailLines(result.stdout, 1) };
    const detail = tailLines(result.stderr || result.stdout, 4);
    return {
      ok: false,
      detail: detail === '' ? `没跑通（退出码 ${String(result.exitCode)}）：${line}` : detail,
    };
  } catch (error) {
    return { ok: false, detail: `${String(error)}：${line}` };
  }
}
