import type { DshShell } from '@dsh-workbench/shared';
import { runShell } from '@dsh-workbench/shared/host';
import { quoteShellArg } from '@dsh-workbench/shared/host';
import { desktopPnpmPath, desktopPnpmVersion } from './toolchain.js';

export interface ToolchainReport {
  readonly ok: boolean;
  readonly detail: string;
  readonly nodeMissing: boolean;
  readonly npmMissing: boolean;
  readonly pnpmProblem: boolean;
  readonly stalled?: boolean | undefined;
}

async function toolVersion(
  shell: DshShell,
  line: string,
): Promise<{ ok: boolean; text: string; stalled: boolean }> {
  try {
    const result = await runShell(shell, line, { timeoutMs: 10_000 });
    const text = (result.stdout || result.stderr).trim().split('\n')[0] ?? '';
    return { ok: result.exitCode === 0 && !result.timedOut, text, stalled: result.stalled };
  } catch {
    return { ok: false, text: '', stalled: false };
  }
}

export async function probeDesktopToolchain(shell: DshShell): Promise<ToolchainReport> {
  const bundledPnpm = desktopPnpmPath();
  const bundledMajor = desktopPnpmVersion()?.split('.')[0];
  const preferBundled = bundledPnpm !== undefined && bundledMajor === '10';
  const pnpmLine = preferBundled
    ? `node ${quoteShellArg(bundledPnpm ?? '')} --version`
    : 'pnpm --version';
  const [node, npm, pnpm] = await Promise.all([
    toolVersion(shell, 'node --version'),
    toolVersion(shell, 'npm --version'),
    toolVersion(shell, pnpmLine),
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
  const pnpmMajor = /^v?(\d+)/.exec(pnpm.text)?.[1];
  const pnpmProblem = !pnpm.ok || pnpmMajor !== '10';
  const parts = [
    nodeMissing ? 'node 不在 PATH（Desktop 自带 Node 的 shim 没生效）' : `node ${node.text}（Desktop 自带）`,
    npmMissing ? 'npm 缺（已改用 pnpm）' : `npm ${npm.text}`,
    pnpmProblem
      ? pnpm.ok
        ? `pnpm ${pnpm.text}（工坊按 10 方言）`
        : 'pnpm 缺（装不了 opencli/插件/模块库）'
      : preferBundled
        ? `pnpm ${pnpm.text}（Desktop 自带）`
        : `pnpm ${pnpm.text}`,
  ];
  return { ok: !nodeMissing, detail: parts.join(' · '), nodeMissing, npmMissing, pnpmProblem };
}
