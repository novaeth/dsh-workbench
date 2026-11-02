import { type Seam } from '@dsh-workbench/shared/host';
import { jsonOf, runBrowserStep, type LineMaker, textOf, type BrowserStep } from './diy-browser';

export const ACT_TIMEOUT_MS = 15000;

export interface ActStep extends BrowserStep {
  readonly payload: Record<string, unknown> | undefined;
}

export async function actBrowser(
  seam: Seam,
  command: string,
  session: string,
  argv: readonly string[],
  timeoutMs = ACT_TIMEOUT_MS,
  line?: LineMaker,
): Promise<ActStep> {
  const step = await runBrowserStep(seam, command, ['browser', session, ...argv, '--window', 'background'], timeoutMs, line);
  return { ...step, payload: jsonOf(step.stdout) };
}

export function actErrorOf(step: ActStep): string {
  if (step.timedOut) return `运行时没在 ${String(Math.round(ACT_TIMEOUT_MS / 1000))} 秒内回来`;
  const error = step.payload?.['error'];
  if (typeof error === 'object' && error !== null) {
    const message = textOf((error as Record<string, unknown>)['message']);
    if (message !== '') return message;
  }
  if (step.ok) return '';
  return step.stderr || step.stdout || '运行时报了个错';
}

export const SWEEP_TIMEOUT_MS = 4000;

