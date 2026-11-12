import { productWrite, quoteShellArg, type Seam } from '@dsh-workbench/shared/host';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import {
  desktopBundledBins,
  desktopNodeExecutable,
  desktopPnpmPath,
  desktopPnpmVersion,
  desktopResourcesDir,
  desktopRuntimeEnv,
} from './desktop-runtime.js';
import { hostSurface } from './platform.js';

const LOCAL_PROBE_TIMEOUT_MS = 10_000;

export function skippableNpmProbe(input: {
  readonly desktop: boolean;
  readonly bundledNode: string | undefined;
  readonly exists?: ((path: string) => boolean) | undefined;
}): boolean {
  if (!input.desktop || input.bundledNode === undefined) return false;
  const exists = input.exists ?? existsSync;
  return !['npm.cmd', 'npm.exe', 'npm']
    .map((name) => join(dirname(input.bundledNode as string), name))
    .some((path) => exists(path));
}

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
  seam: Seam,
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
    const result = await seam.run({
      command: line,
      intent: productWrite(),
      retry: 'safe',
      timeoutMs: LOCAL_PROBE_TIMEOUT_MS,
      ...(extra?.workdir === undefined ? {} : { workdir: extra.workdir }),
    });
    const text = (result.stdout || result.stderr).trim().split('\n')[0] ?? '';
    const fact = seam.facts().filter((entry) => entry.command === line).at(-1);
    const sandbox =
      fact === undefined
        ? '（无）'
        : `mode=${fact.mode} root=${fact.workspaceRoot}${fact.denial === undefined ? '' : ` denial=${fact.denial.scope}`}`;
    return {
      ok: result.exitCode === 0 && !result.timedOut,
      text,
      stalled: result.stalled,
      code: result.exitCode,
      raw: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(0, 2).join(' / '),
      sandbox,
    };
  } catch (error) {
    return { ok: false, text: '', stalled: false, code: null, raw: String(error), sandbox: '（抛错）' };
  }
}

export async function probeDesktopToolchain(seam: Seam): Promise<ToolchainReport> {
  const bundledNode = desktopNodeExecutable();
  const bundledPnpm = desktopPnpmPath();
  const bundledMajor = desktopPnpmVersion()?.split('.')[0];
  const preferBundled = bundledPnpm !== undefined && Number(bundledMajor ?? '0') >= 10;
  const nodeCommand = bundledNode === undefined ? 'node' : quoteShellArg(bundledNode);
  const pnpmLine = preferBundled
    ? `${nodeCommand} ${quoteShellArg(bundledPnpm ?? '')} --config.manage-package-manager-versions=false --version`
    : 'pnpm --config.manage-package-manager-versions=false --version';
  const path = desktopRuntimeEnv().PATH;
  const desktop = hostSurface({ proc: process }).deployment === 'desktop';
  const skipNpmProbe = skippableNpmProbe({ desktop, bundledNode });
  const [node, npm, pnpm] = await Promise.all([
    toolVersion(seam, `${nodeCommand} --version`),
    skipNpmProbe
      ? Promise.resolve({ ok: false, text: '', stalled: false, code: 127, raw: 'Desktop 自带的 node 不带 npm', sandbox: '（跳过探测）' })
      : toolVersion(seam, 'npm --version'),
    toolVersion(seam, pnpmLine),
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
  const parts = [
    nodeMissing
      ? `node 跑不起来（exit=${node.code === null ? '没返回' : String(node.code)}${node.raw === '' ? '' : `：${node.raw}`}）`
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
        const out = await seam.run({
          argv: [file, '--version'],
          intent: { kind: 'host' },
          timeoutMs: 10_000,
        });
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
      const probe = await toolVersion(seam, 'echo workbench-probe', { workdir });
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
