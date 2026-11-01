import type { DshShell } from '@dsh-workbench/shared';
import { runShell } from '@dsh-workbench/shared/host';
import { quoteShellArg } from '@dsh-workbench/shared/host';
import { delimiter } from 'node:path';
import { homedir } from 'node:os';
import { execaSync } from 'execa';
import {
  desktopBundledBins,
  desktopNodeExecutable,
  desktopPnpmPath,
  desktopPnpmVersion,
  desktopResourcesDir,
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
  readonly hostBroken?: boolean | undefined;
}

async function toolVersion(
  shell: DshShell,
  line: string,
  extra?: { readonly workdir?: string | undefined } | undefined,
): Promise<{
  ok: boolean;
  text: string;
  stalled: boolean;
  code: number | null;
  raw: string;
  sandbox: string;
}> {
  try {
    const result = await runShell(shell, line, {
      timeoutMs: 10_000,
      ...(extra?.workdir === undefined ? {} : { workdir: extra.workdir }),
    });
    const text = (result.stdout || result.stderr).trim().split('\n')[0] ?? '';
    return {
      ok: result.exitCode === 0 && !result.timedOut,
      text,
      stalled: result.stalled,
      code: result.exitCode,
      raw: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(0, 2).join(' / '),
      sandbox:
        result.sandbox === undefined
          ? '（无）'
          : `mode=${result.sandbox.mode ?? '?'} denied=${String(result.sandbox.denied)} runnerFailed=${String(result.sandbox.runnerFailed)}`,
    };
  } catch (error) {
    return { ok: false, text: '', stalled: false, code: null, raw: String(error), sandbox: '（抛错）' };
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
  const [node, npm, pnpm] = await Promise.all([
    toolVersion(shell, `${nodeCommand} --version`),
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
  const control: string[] = [];
  if (nodeMissing) {
    for (const [label, file] of [
      ['direct bundled node', desktopNodeExecutable()],
      ['direct host node', process.execPath],
    ] as const) {
      if (file === undefined) {
        control.push(`control ${label}: （没有可执行文件）`);
        continue;
      }
      try {
        const out = execaSync(file, ['--version'], { timeout: 10_000, reject: false });
        control.push(`control ${label}: exit=${String(out.exitCode)} out=${(out.stdout || out.stderr).slice(0, 80)}`);
      } catch (error) {
        control.push(`control ${label}: 起不来 ${String(error).slice(0, 120)}`);
      }
    }
    for (const [label, workdir] of [
      ['default', undefined],
      ['home', homedir()],
      ['cwd', process.cwd()],
    ] as const) {
      const probe = await toolVersion(shell, 'echo workbench-probe', { workdir });
      control.push(`control ${label}: exit=${String(probe.code)} out=${probe.raw.slice(0, 80) || '（空）'}`);
    }
  }
  const hostBroken = control.some((line) => line.includes('exit=3221225794'));
  const diagnostics = [
    `deployment=${desktop ? 'desktop' : 'host'} · resources=${desktopResourcesDir() ?? '（无）'} · execPath=${process.execPath}`,
    `bundled node=${bundledNode ?? '（找不到）'} · bundled pnpm=${bundledPnpm ?? '（找不到）'} · bins=${desktopBundledBins().join('|') || '（无）'}`,
    `PATH 前两段=${(path ?? '').split(delimiter).slice(0, 2).join('|') || '（空）'}`,
    `node: exit=${String(node.code)} sandbox=${node.sandbox} out=${node.raw.slice(0, 160) || '（空）'} cmd=${nodeCommand}`,
    `pnpm: exit=${String(pnpm.code)} sandbox=${pnpm.sandbox} out=${pnpm.raw.slice(0, 160) || '（空）'} cmd=${pnpmLine}`,
    `npm: exit=${String(npm.code)} sandbox=${npm.sandbox} out=${npm.raw.slice(0, 120) || '（空）'}`,
    ...control,
  ];
  const base = parts.join(' · ');
  const detail = hostBroken
    ? `宿主执行通道起不了子进程（0xC0000142 · DLL 初始化失败）——不是没装 node：${base}`
    : base;
  return { ok: !nodeMissing, detail, nodeMissing, npmMissing, pnpmProblem, diagnostics, hostBroken };
}
