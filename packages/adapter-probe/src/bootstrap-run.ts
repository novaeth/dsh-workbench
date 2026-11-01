import { homedir } from 'node:os';
import { isolatedRoot } from '@dsh-workbench/adapter-runtime';
import { bootstrapEnvOf, tailLines } from '@dsh-workbench/shared/host';
import type { Seam, ShellKind } from '@dsh-workbench/shared/host';
import { desktopRuntimeEnvPath } from './desktop-runtime.js';
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
  readonly seam?: Seam | undefined;
}

export interface BootstrapRunResult {
  readonly ok: boolean;
  readonly detail: string;
}

export function bootstrapEnv(options: BootstrapEnvOptions = {}): Record<string, string> {
  const parent = options.parent ?? process.env;
  return bootstrapEnvOf({
    root: options.opencliRoot ?? isolatedRoot(),
    realHome: options.realHome ?? homedir(),
    shellKind: options.shellKind ?? currentShellKind(),
    parent,
    path: desktopRuntimeEnvPath(parent.PATH),
  });
}

function commandArgsOf(
  line: string,
  shellKind: ShellKind,
): { readonly file: string; readonly args: readonly string[] } {
  return shellKind === 'pwsh'
    ? { file: 'pwsh', args: ['-NoProfile', '-NonInteractive', '-Command', line] }
    : { file: 'bash', args: ['-c', line] };
}

async function seamSpawn(
  seam: Seam | undefined,
  line: string,
  shellKind: ShellKind,
  env: Readonly<Record<string, string>>,
  timeoutMs: number,
): Promise<BootstrapSpawnResult> {
  if (seam === undefined) throw new Error('没有执行缝，自举命令起不来');
  const result = await seam.run({
    command: line,
    shellKind,
    intent: { kind: 'host' },
    env,
    timeoutMs,
  });
  return {
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export async function runBootstrapCommand(
  line: string,
  options: BootstrapRunOptions,
): Promise<BootstrapRunResult> {
  const shellKind = options.shellKind ?? currentShellKind();
  const env = { ...bootstrapEnv({ shellKind }), ...(options.env ?? {}) };
  const command = commandArgsOf(line, shellKind);
  try {
    const result =
      options.spawn === undefined
        ? await seamSpawn(options.seam, line, shellKind, env, options.timeoutMs)
        : await options.spawn(command.file, command.args, { env, timeout: options.timeoutMs });
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
