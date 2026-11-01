import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshShell } from '@dsh-workbench/shared';
import { SHELL_SANDBOX_POLICY, provideWorkbenchShell } from '@/shared/api/host/workbench-shell';
import { WORKBENCH_SHELL, dshHome } from '@dsh-workbench/shared/host';

function shellWith(request: unknown): DshShell {
  return {
    resolve: () => request,
    execute: async () => ({ result: async () => ({ exitCode: 0 }) }),
  } as unknown as DshShell;
}

describe('provideWorkbenchShell', () => {
  it('★ 把可写根声明包进 shell 服务：三条安装路径都拿这一份', () => {
    const provided: Record<string, unknown> = {};
    const seen: unknown[] = [];
    const raw = shellWith('spec');
    const ctx = {
      get: (name: string) => (name === 'shell' ? { ...raw, resolve: (request: unknown) => seen.push(request) } : undefined),
      provide: (name: string, value: unknown) => {
        provided[name] = value;
      },
      logger: { info: () => undefined },
    } as unknown as DshHostContext;

    const shell = provideWorkbenchShell(ctx);

    expect(provided[WORKBENCH_SHELL]).toBe(shell);
    expect(SHELL_SANDBOX_POLICY.workspaceRoot).toBe(dshHome());
    expect(SHELL_SANDBOX_POLICY.mode).toBe('workspace-write');
  });

  it('★ 包过的 shell 每次 resolve 都带上策略（调用点不必记着传）', () => {
    const provided: Record<string, unknown> = {};
    const seen: unknown[] = [];
    const ctx = {
      get: (name: string) =>
        name === 'shell'
          ? {
              resolve: (request: unknown) => {
                seen.push(request);
                return 'spec';
              },
              execute: async () => ({ result: async () => ({ exitCode: 0 }) }),
            }
          : undefined,
      provide: (name: string, value: unknown) => {
        provided[name] = value;
      },
      logger: { info: () => undefined },
    } as unknown as DshHostContext;

    const shell = provideWorkbenchShell(ctx);
    shell?.resolve({ command: 'node --version' });

    expect(seen).toHaveLength(1);
    expect((seen[0] as { sandboxPolicy?: unknown }).sandboxPolicy).toEqual(SHELL_SANDBOX_POLICY);
  });

  it('宿主没有 shell 服务时什么都不提供（桩宿主照样能起）', () => {
    const provided: Record<string, unknown> = {};
    const ctx = {
      get: () => undefined,
      provide: (name: string, value: unknown) => {
        provided[name] = value;
      },
      logger: { info: () => undefined },
    } as unknown as DshHostContext;

    expect(provideWorkbenchShell(ctx)).toBeUndefined();
    expect(provided[WORKBENCH_SHELL]).toBeUndefined();
  });
});
