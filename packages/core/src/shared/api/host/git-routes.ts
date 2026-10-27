import type { DshHostContext, DshShell } from '@dsh-workbench/shared';
import type { GitProbePayload } from '@/kernel/contract/market-index';
import { param, type RouteHandler } from '@dsh-workbench/shared/host';
import { probeGitAddress } from './git-probe.js';

export function gitProbeHandler(ctx: DshHostContext): RouteHandler {
  return async (search): Promise<{ ok: true } & GitProbePayload | { ok: false; error: { code: string; message: string } }> => {
    const url = param(search, 'url');
    if (url === undefined) {
      return { ok: false, error: { code: 'workbench/no-url', message: '要探哪个地址？缺 url。' } };
    }
    const shell = ctx.get<DshShell>('shell');
    if (shell === undefined) {
      return { ok: false, error: { code: 'workbench/no-shell', message: '这台机器上没有执行缝，探不了 git 地址' } };
    }
    return { ok: true, ...(await probeGitAddress(shell, url)) };
  };
}
