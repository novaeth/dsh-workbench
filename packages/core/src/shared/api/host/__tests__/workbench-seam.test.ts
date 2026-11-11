import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { DshHostContext, DshSandboxPolicy } from '@dsh-workbench/shared';
import { WORKBENCH_SEAM } from '@dsh-workbench/shared/host';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { provideWorkbenchSeam } from '../workbench-seam';

const ROOT = mkdtempSync(join(tmpdir(), 'wb-seam-provider-'));
const previousWorkbench = process.env.DSH_WORKBENCH_HOME;

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
  if (previousWorkbench === undefined) delete process.env.DSH_WORKBENCH_HOME;
  else process.env.DSH_WORKBENCH_HOME = previousWorkbench;
});

function contextOf(options: {
  readonly shell?: unknown;
  readonly grant?: { readonly mode: string; readonly workspaceRoot: string };
  readonly provided: Map<string, unknown>;
}): DshHostContext {
  return {
    get: (name: string) => {
      if (name === 'shell') return options.shell;
      if (name === 'sandboxPolicy' && options.grant !== undefined) {
        return {
          resolve: () => options.grant,
        } as unknown as DshSandboxPolicy;
      }
      return undefined;
    },
    provide: (name: string, value: unknown) => {
      options.provided.set(name, value);
      return () => {};
    },
    logger: { info: () => {}, warn: () => {} },
  } as unknown as DshHostContext;
}

describe('provideWorkbenchSeam', () => {
  it('没有 shell 服务时返回 undefined，也不 provide', () => {
    const provided = new Map<string, unknown>();
    expect(provideWorkbenchSeam(contextOf({ provided }))).toBeUndefined();
    expect(provided.has(WORKBENCH_SEAM)).toBe(false);
  });

  it('产品域钉在运行时根，并把执行缝挂成服务', async () => {
    process.env.DSH_WORKBENCH_HOME = ROOT;
    const fake = createFakeShell([{}]);
    const provided = new Map<string, unknown>();
    const seam = provideWorkbenchSeam(contextOf({ shell: fake.shell, provided }));
    expect(seam).toBeDefined();
    expect(provided.get(WORKBENCH_SEAM)).toBe(seam);
    await seam?.run({ command: 'npm view left-pad version', intent: { kind: 'product' } });
    expect(fake.calls[0]?.sandboxPolicy).toEqual({ mode: 'workspace-write', workspaceRoot: ROOT });
    expect(fake.calls[0]?.env?.['DSH_WORKBENCH_HOME']).toBe(ROOT);
  });

  it('工作区域按会话解析，会话只读在起进程前拒绝', async () => {
    process.env.DSH_WORKBENCH_HOME = ROOT;
    const fake = createFakeShell([{}]);
    const granted = contextOf({
      shell: fake.shell,
      grant: { mode: 'workspace-write', workspaceRoot: join(ROOT, 'project') },
      provided: new Map(),
    });
    await provideWorkbenchSeam(granted)?.run({ command: 'touch x', intent: { kind: 'workspace' }, session: {} });
    expect(fake.calls[0]?.sandboxPolicy).toEqual({
      mode: 'workspace-write',
      workspaceRoot: join(ROOT, 'project'),
    });

    const readOnlyFake = createFakeShell([{}]);
    const readOnly = contextOf({
      shell: readOnlyFake.shell,
      grant: { mode: 'read-only', workspaceRoot: join(ROOT, 'project') },
      provided: new Map(),
    });
    await expect(
      provideWorkbenchSeam(readOnly)?.run({ command: 'touch x', intent: { kind: 'workspace' }, session: {} }),
    ).rejects.toMatchObject({ code: 'read-only' });
    expect(readOnlyFake.calls).toHaveLength(0);
  });
});
