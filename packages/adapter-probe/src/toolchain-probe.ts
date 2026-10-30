import type { DshShell } from '@dsh-workbench/shared';
import { runShell } from '@dsh-workbench/shared/host';
import { desktopPnpmPath } from './toolchain.js';

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
  const [node, npm, pnpm] = await Promise.all([
    toolVersion(shell, 'node --version'),
    toolVersion(shell, 'npm --version'),
    toolVersion(shell, 'pnpm --version'),
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
  const hasBundledPnpm = desktopPnpmPath() !== undefined;
  const pnpmMajor = /^v?(\d+)/.exec(pnpm.text)?.[1];
  const pnpmProblem = !pnpm.ok || pnpmMajor !== '10';
  const parts = [
    nodeMissing ? 'node 不在 PATH（Desktop 自带 Node 的 shim 没生效）' : `node ${node.text}（Desktop 自带）`,
    npmMissing
      ? hasBundledPnpm
        ? 'npm 缺（opencli 安装走 pnpm；插件安装/模块库仍需 npm）'
        : 'npm 缺（装不了 opencli：bundled pnpm 也没找到）'
      : `npm ${npm.text}`,
    pnpmProblem
      ? pnpm.ok
        ? `pnpm ${pnpm.text}（工坊按 10 方言）`
        : 'pnpm 缺（只影响工坊 build/install）'
      : `pnpm ${pnpm.text}`,
  ];
  return { ok: !nodeMissing, detail: parts.join(' · '), nodeMissing, npmMissing, pnpmProblem };
}
