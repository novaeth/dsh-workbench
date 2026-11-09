import type { PluginPlanStep } from '../contract/plugin-source.js';
import type { ShellKind } from './shell-text.js';
import { quoteShellArgFor, shellKindOf } from './shell-text.js';

export interface ShellInvocation {
  readonly file: string;
  readonly args: readonly string[];
}

const QUOTED_HEAD = /^\s*['"]/;

const PLAN_SEPARATOR: Record<ShellKind, string> = { posix: ' && ', pwsh: '; ' };

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

/**
 * 目录链接在两种 shell 下的落法：POSIX 是符号链接，Windows 是 junction（建它不需要开发者模式或管理员）。
 * @param kind - 目标 shell 种类。
 * @returns 交给 `node:fs` 的 `symlink` 类型。
 */
export function dirLinkTypeOf(kind: ShellKind): 'junction' | 'dir' {
  return kind === 'pwsh' ? 'junction' : 'dir';
}

function displayEnvOf(
  env: Readonly<Record<string, string>> | undefined,
  platform: NodeJS.Platform,
): string {
  if (env === undefined) return '';
  const entries = Object.entries(env);
  if (entries.length === 0) return '';
  const quote = (value: string): string => quoteShellArgFor(value, platform);
  return shellKindOf(platform) === 'pwsh'
    ? entries.map(([name, value]) => `$env:${name}=${quote(value)}; `).join('')
    : entries.map(([name, value]) => `${name}=${quote(value)} `).join('');
}

function displayRunOf(
  step: Extract<PluginPlanStep, { readonly kind: 'run' }>,
  platform: NodeJS.Platform,
): string {
  return `${displayEnvOf(step.env, platform)}${callOperatorOf(shellKindOf(platform), step.line)}`;
}

/**
 * 把一个安装计划步骤渲染成人能读的一行；`run` 给原命令（带上它的环境变量与 pwsh 的 `&` 调用符），
 * 文件操作按平台给等价写法。这一行只用于展示与事实记录：文件操作真跑在 `node:fs` 上，不经过 shell。
 * @param step - 计划步骤。
 * @param platform - 目标平台，默认当前 `process.platform`。
 * @returns 该步骤的一行文本。
 */
export function planStepText(step: PluginPlanStep, platform: NodeJS.Platform = process.platform): string {
  const quote = (value: string): string => quoteShellArgFor(value, platform);
  if (step.kind === 'run') return displayRunOf(step, platform);
  if (step.kind === 'remove') {
    return platform === 'win32'
      ? `Remove-Item -Recurse -Force ${quote(step.path)}`
      : `rm -rf ${quote(step.path)}`;
  }
  if (step.kind === 'mkdir') {
    return platform === 'win32' ? `New-Item -ItemType Directory -Force ${quote(step.path)}` : `mkdir -p ${quote(step.path)}`;
  }
  if (step.kind === 'link') {
    return platform === 'win32'
      ? `New-Item -ItemType Junction -Path ${quote(step.path)} -Target ${quote(step.target)}`
      : `ln -s ${quote(step.target)} ${quote(step.path)}`;
  }
  return platform === 'win32'
    ? `Copy-Item -Recurse -Force ${quote(step.from)} ${quote(step.to)}`
    : `cp -R ${quote(step.from)}/. ${quote(step.to)}/`;
}

/**
 * 把整个安装计划渲染成一行（步骤之间按目标 shell 的串联符连起来）。
 * @param steps - 计划步骤。
 * @param platform - 目标平台，默认当前 `process.platform`。
 * @returns 计划的一行文本。
 */
export function planLineOf(steps: readonly PluginPlanStep[], platform: NodeJS.Platform = process.platform): string {
  return steps
    .map((step) => planStepText(step, platform))
    .join(PLAN_SEPARATOR[shellKindOf(platform)]);
}
