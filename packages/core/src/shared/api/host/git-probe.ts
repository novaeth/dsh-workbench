import type { DshShell } from '@dsh-workbench/shared';
import type { GitProbePayload, GitProbeStatus } from '@/kernel/contract/market-index';
import { quoteShellArg, runShell, tailLines } from '@dsh-workbench/shared/host';
import { gitNoPromptPrefix, withoutAskpassNoise } from './git-exec.js';

const PROBE_TIMEOUT_MS = 10 * 1000;

const AUTH_TEXT =
  /authentication failed|could not read (username|password)|permission denied|terminal prompts disabled|host key verification failed|repository not found|no such identity|access denied|unauthorized|forbidden/;

export function classifyGitProbe(stderr: string, timedOut: boolean): GitProbeStatus {
  if (timedOut) return 'unreachable';
  return AUTH_TEXT.test(stderr.toLowerCase()) ? 'auth' : 'unreachable';
}

export async function probeGitAddress(
  shell: DshShell,
  url: string,
  options: { readonly timeoutMs?: number } = {},
): Promise<GitProbePayload> {
  const line = [
    gitNoPromptPrefix(),
    quoteShellArg('git'),
    quoteShellArg('ls-remote'),
    quoteShellArg(url),
    quoteShellArg('HEAD'),
  ].join(' ');
  let result;
  try {
    result = await runShell(shell, line, { timeoutMs: options.timeoutMs ?? PROBE_TIMEOUT_MS });
  } catch (error) {
    return { status: 'unreachable', detail: error instanceof Error ? error.message : String(error) };
  }
  if (result.exitCode === 0) return { status: 'ok' };
  const detail = tailLines(withoutAskpassNoise(result.stderr || result.stdout), 3);
  return {
    status: classifyGitProbe(`${result.stderr}\n${result.stdout}`, result.timedOut),
    ...(detail === '' ? {} : { detail }),
  };
}

const PROBE_CACHE_MS = 60 * 1000;
const probeCache = new Map<string, { readonly at: number; readonly payload: GitProbePayload }>();

export async function probeGitAddressCached(
  shell: DshShell,
  url: string,
  options: { readonly timeoutMs?: number } = {},
): Promise<GitProbePayload> {
  const hit = probeCache.get(url);
  if (hit !== undefined && Date.now() - hit.at < PROBE_CACHE_MS) return hit.payload;
  const payload = await probeGitAddress(shell, url, options);
  probeCache.set(url, { at: Date.now(), payload });
  return payload;
}
