import type { DshShell } from '@dsh-workbench/shared';
import { quoteShellArg, runShell } from '@dsh-workbench/shared/host';
import { jsonOf, runBrowserStep, textOf, type BrowserStep } from './diy-browser';

export const ACT_TIMEOUT_MS = 15000;

export interface ActStep extends BrowserStep {
  readonly payload: Record<string, unknown> | undefined;
}

export async function actBrowser(
  shell: DshShell,
  command: string,
  session: string,
  argv: readonly string[],
  timeoutMs = ACT_TIMEOUT_MS,
): Promise<ActStep> {
  const step = await runBrowserStep(shell, command, ['browser', session, ...argv, '--window', 'background'], timeoutMs);
  return { ...step, payload: jsonOf(step.stdout) };
}

export function actErrorOf(step: ActStep): string {
  if (step.timedOut) return `opencli 没在 ${String(Math.round(ACT_TIMEOUT_MS / 1000))} 秒内回来`;
  const error = step.payload?.['error'];
  if (typeof error === 'object' && error !== null) {
    const message = textOf((error as Record<string, unknown>)['message']);
    if (message !== '') return message;
  }
  if (step.ok) return '';
  return step.stderr || step.stdout || 'opencli 报了个错';
}

export const SWEEP_TIMEOUT_MS = 4000;

export async function stopNetworkExact(
  shell: DshShell,
  file: string,
  timeoutMs = SWEEP_TIMEOUT_MS,
): Promise<boolean> {
  const pidFile = quoteShellArg(`${file}.pid`);
  const reaperFile = quoteShellArg(`${file}.reaper`);
  const line = [
    `p="$(cat ${pidFile} 2>/dev/null)"`,
    `r="$(cat ${reaperFile} 2>/dev/null)"`,
    `[ -n "$p" ] && pkill -P "$p" 2>/dev/null`,
    `[ -n "$p" ] && kill "$p" 2>/dev/null`,
    `[ -n "$r" ] && pkill -P "$r" 2>/dev/null`,
    `[ -n "$r" ] && kill "$r" 2>/dev/null`,
    `if [ "$(cat ${pidFile} 2>/dev/null)" = "$p" ]; then rm -f ${pidFile} ${reaperFile}; fi`,
    'true',
  ].join('; ');
  const step = await runShell(shell, line, { timeoutMs });
  return step.exitCode === 0;
}
