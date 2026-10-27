import type { DshShell } from '@dsh-workbench/shared';
import { runShell } from '@dsh-workbench/shared/host';
import { backgroundLine } from '@dsh-workbench/shared/host';
import { PAGE_PROBE } from './diy-scripts';

export const LOOK_TIMEOUT_MS = 30000;

export interface BrowserStep {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly truncated: boolean;
}

export async function runBrowserStep(
  shell: DshShell,
  command: string,
  argv: readonly string[],
  timeoutMs = LOOK_TIMEOUT_MS,
): Promise<BrowserStep> {
  const result = await runShell(shell, backgroundLine(command, argv), { timeoutMs });
  return {
    ok: result.exitCode === 0 && !result.timedOut,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    truncated: result.truncated,
  };
}

export function jsonOf(raw: string): Record<string, unknown> | undefined {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export interface BoundTab {
  readonly ok: boolean;
  readonly url: string;
  readonly title: string;
  readonly reason: string;
}

export async function bindCurrentTab(shell: DshShell, command: string, session: string): Promise<BoundTab> {
  const step = await runBrowserStep(shell, command, ['browser', session, 'bind', '--window', 'background']);
  const parsed = jsonOf(step.stdout);
  if (parsed === undefined) {
    return { ok: false, url: '', title: '', reason: step.timedOut ? '没在 30 秒内返回' : step.stderr || step.stdout };
  }
  const error = parsed['error'];
  if (typeof error === 'object' && error !== null) {
    const message = textOf((error as Record<string, unknown>)['message']);
    return { ok: false, url: '', title: '', reason: message === '' ? 'opencli 报了个错' : message };
  }
  return { ok: true, url: textOf(parsed['url']), title: textOf(parsed['title']), reason: '' };
}

export interface WorkbenchPage {
  readonly ok: boolean;
  readonly url: string;
  readonly title: string;
  readonly where: string;
  readonly board: string;
  readonly open: boolean | null;
  readonly shown: boolean;
}

export async function workbenchPageOf(shell: DshShell, command: string, session: string): Promise<WorkbenchPage> {
  const step = await runBrowserStep(shell, command, ['browser', session, 'eval', PAGE_PROBE, '--window', 'background']);
  const parsed = jsonOf(step.stdout);
  if (parsed === undefined) return { ok: false, url: '', title: '', where: '', board: '', open: null, shown: false };
  const raw = parsed['open'];
  return {
    ok: textOf(parsed['plugin']) === '@dsh-workbench/core',
    url: textOf(parsed['url']),
    title: textOf(parsed['title']),
    where: textOf(parsed['where']),
    board: textOf(parsed['board']),
    open: typeof raw === 'boolean' ? raw : null,
    shown: parsed['shown'] === true,
  };
}

export async function writeShotsDir(shell: DshShell, dir: string): Promise<boolean> {
  const line = ['mkdir', '-p', dir].map((one) => `'${one}'`).join(' ');
  const result = await runShell(shell, line, { timeoutMs: LOOK_TIMEOUT_MS });
  return result.exitCode === 0 && !result.timedOut;
}

export interface PageHandshake {
  readonly ok: boolean;
  readonly bound: boolean;
  readonly page: WorkbenchPage;
  readonly reason: string;
}

export async function readyPageOf(
  shell: DshShell,
  command: string,
  session: string,
): Promise<PageHandshake> {
  const already = await workbenchPageOf(shell, command, session);
  if (already.ok) return { ok: true, bound: false, page: already, reason: '' };
  const bound = await bindCurrentTab(shell, command, session);
  if (!bound.ok) {
    return { ok: false, bound: false, page: already, reason: bound.reason };
  }
  const after = await workbenchPageOf(shell, command, session);
  return { ok: after.ok, bound: true, page: after, reason: '' };
}
