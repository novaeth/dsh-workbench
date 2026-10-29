import type { GitProbePayload } from '@/kernel/contract/market-index';
import { param, type RouteHandler } from '@dsh-workbench/shared/host';
import type { GitRunner } from './git-process.js';
import { probeGitAddress } from './git-probe.js';

export interface GitProbeHandlerOptions {
  readonly runGit?: GitRunner;
}

export function gitProbeHandler(options: GitProbeHandlerOptions = {}): RouteHandler {
  return async (search): Promise<{ ok: true } & GitProbePayload | { ok: false; error: { code: string; message: string } }> => {
    const url = param(search, 'url');
    if (url === undefined) {
      return { ok: false, error: { code: 'workbench/no-url', message: '要探哪个地址？缺 url。' } };
    }
    return { ok: true, ...(await probeGitAddress(url, options)) };
  };
}
