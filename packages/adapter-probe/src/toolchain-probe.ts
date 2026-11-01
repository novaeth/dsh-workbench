import type { DshShell } from '@dsh-workbench/shared';
import { runShell } from '@dsh-workbench/shared/host';
import { quoteShellArg } from '@dsh-workbench/shared/host';
import { delimiter } from 'node:path';
import {
  desktopBundledBins,
  desktopNodeExecutable,
  desktopPnpmPath,
  desktopPnpmVersion,
  desktopResourcesDir,
  desktopRuntimeEnv,
  desktopRuntimeEnvPath,
} from './toolchain.js';
import { hostSurface } from './platform.js';

export interface ToolchainReport {
  readonly ok: boolean;
  readonly detail: string;
  readonly nodeMissing: boolean;
  readonly npmMissing: boolean;
  readonly pnpmProblem: boolean;
  readonly stalled?: boolean | undefined;
  readonly diagnostics?: readonly string[] | undefined;
}

async function toolVersion(
  shell: DshShell,
  line: string,
  env: Readonly<Record<string, string>>,
): Promise<{ ok: boolean; text: string; stalled: boolean; code: number | null; raw: string }> {
  try {
    const result = await runShell(shell, line, { timeoutMs: 10_000, env });
    const text = (result.stdout || result.stderr).trim().split('\n')[0] ?? '';
    return {
      ok: result.exitCode === 0 && !result.timedOut,
      text,
      stalled: result.stalled,
      code: result.exitCode,
      raw: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(0, 2).join(' / '),
    };
  } catch (error) {
    return { ok: false, text: '', stalled: false, code: null, raw: String(error) };
  }
}

export async function probeDesktopToolchain(shell: DshShell): Promise<ToolchainReport> {
  const bundledNode = desktopNodeExecutable();
  const bundledPnpm = desktopPnpmPath();
  const bundledMajor = desktopPnpmVersion()?.split('.')[0];
  const preferBundled = bundledPnpm !== undefined && Number(bundledMajor ?? '0') >= 10;
  const nodeCommand = bundledNode === undefined ? 'node' : quoteShellArg(bundledNode);
  const pnpmLine = preferBundled
    ? `${nodeCommand} ${quoteShellArg(bundledPnpm ?? '')} --version`
    : 'pnpm --version';
  const path = desktopRuntimeEnvPath(process.env.PATH);
  const env: Readonly<Record<string, string>> = desktopRuntimeEnv(process.env);
  const [node, npm, pnpm] = await Promise.all([
    toolVersion(shell, `${nodeCommand} --version`, env),
    toolVersion(shell, 'npm --version', env),
    toolVersion(shell, pnpmLine, env),
  ]);
  if (node.stalled || npm.stalled || pnpm.stalled) {
    return {
      ok: false,
      detail: '版本探测没有返回：node / npm / pnpm 的命令都没把结果交回来（不是没装）',
      nodeMissing: false,
      npmMissing: false,
      pnpmProblem: false,
      stalled: true,
    };
  }
  const nodeMissing = !node.ok;
  const npmMissing = !npm.ok;
  const pnpmMajor = Number(/^v?(\d+)/.exec(pnpm.text)?.[1] ?? '0');
  const pnpmProblem = !pnpm.ok || pnpmMajor < 10;
  const desktop = hostSurface({ proc: process }).deployment === 'desktop';
  const parts = [
    nodeMissing
      ? desktop
        ? 'node 不在 PATH（Desktop 自带 Node 的 shim 没生效）'
        : 'node 不在 PATH'
      : desktop
        ? `node ${node.text}（Desktop 自带）`
        : `node ${node.text}`,
    npmMissing ? 'npm 缺（已改用 pnpm）' : `npm ${npm.text}`,
    pnpmProblem
      ? pnpm.ok
        ? `pnpm ${pnpm.text}（工坊按 10 方言）`
        : 'pnpm 缺（装不了 opencli/插件/模块库）'
      : preferBundled
        ? `pnpm ${pnpm.text}（Desktop 自带）`
        : `pnpm ${pnpm.text}`,
  ];
  const diagnostics = [
    `deployment=${desktop ? 'desktop' : 'host'} · resources=${desktopResourcesDir() ?? '（无）'} · execPath=${process.execPath}`,
    `bundled node=${bundledNode ?? '（找不到）'} · bundled pnpm=${bundledPnpm ?? '（找不到）'} · bins=${desktopBundledBins().join('|') || '（无）'}`,
    `PATH 前两段=${(path ?? '').split(delimiter).slice(0, 2).join('|') || '（空）'}`,
    `node: exit=${String(node.code)} out=${node.raw.slice(0, 160) || '（空）'} cmd=${nodeCommand}`,
    `pnpm: exit=${String(pnpm.code)} out=${pnpm.raw.slice(0, 160) || '（空）'} cmd=${pnpmLine}`,
    `npm: exit=${String(npm.code)} out=${npm.raw.slice(0, 120) || '（空）'}`,
  ];
  return { ok: !nodeMissing, detail: parts.join(' · '), nodeMissing, npmMissing, pnpmProblem, diagnostics };
}
