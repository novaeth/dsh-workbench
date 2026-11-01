import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeam } from '@dsh-workbench/shared/host';
import { createFakeProcesses, createFakeShell } from '@dsh-workbench/shared/testing';
import { isFollowUpDismissed } from '@/shared/api/host/follow-up-dismiss';
import { createWorkbenchFollowUps } from '../model/market-follow-up';

const roots: string[] = [];

function homeWithScript(): string {
  const root = mkdtempSync(join(tmpdir(), 'wb-market-follow-up-'));
  roots.push(root);
  const dir = join(root, 'profiles', 'workbench', 'node_modules', '@dsh-workbench', 'core', 'scripts');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'share-data-root.mjs'), '', 'utf8');
  return root;
}

function seamWith(replies: Parameters<typeof createFakeProcesses>[0]) {
  const processes = createFakeProcesses(replies);
  const seam = createSeam({
    shell: createFakeShell([{}]).shell,
    runtimeRoot: '/tmp/wb-seam-test',
    allowHost: true,
    processes: processes.host,
  });
  return { seam, calls: processes.calls };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.useRealTimers();
});

describe('工作台待办动作：迁移和收起提醒', () => {
  it('迁移：把 home / profile 交给同一个脚本，并把补了多少读回来', async () => {
    const root = homeWithScript();
    const previous = process.env.DSH_WORKBENCH_HOME;
    process.env.DSH_WORKBENCH_HOME = join(root, 'workbench');
    try {
      const actions = createWorkbenchFollowUps({
        dshHome: () => root,
        profileName: () => 'workbench',
        workbench: () => ({ pkg: '@dsh-workbench/core', version: '1.0.1' }),
        runMigration: async (input) => {
          expect(input.script).toContain('share-data-root.mjs');
          expect(input.env).toMatchObject({
            DSH_HOME: root,
            WORKBENCH_PROFILE: 'workbench',
            DSH_WORKBENCH_HOME: join(root, 'workbench'),
          });
          return { exitCode: 0, stdout: '迁移完成：新增 2 个项目，补了 1 个文件；旧目录保留。\n', stderr: '' };
        },
      });

      await expect(actions.migrateWorkbench()).resolves.toEqual({ added: 2, files: 1 });
    } finally {
      if (previous === undefined) delete process.env.DSH_WORKBENCH_HOME;
      else process.env.DSH_WORKBENCH_HOME = previous;
    }
  });

  it('★ 默认走执行缝的宿主域：脚本 argv、禁交互环境与 120 秒超时都交出去', async () => {
    const root = homeWithScript();
    const previous = process.env.DSH_WORKBENCH_HOME;
    process.env.DSH_WORKBENCH_HOME = join(root, 'workbench');
    try {
      const { seam, calls } = seamWith([
        { exitCode: 0, stdout: '迁移完成：新增 2 个项目，补了 1 个文件；旧目录保留。\n' },
      ]);
      const actions = createWorkbenchFollowUps({
        dshHome: () => root,
        profileName: () => 'workbench',
        workbench: () => ({ pkg: '@dsh-workbench/core', version: '1.0.1' }),
        seam,
      });

      await expect(actions.migrateWorkbench()).resolves.toEqual({ added: 2, files: 1 });

      const call = calls[0];
      expect(call?.file).toBe(process.execPath);
      expect(call?.args.slice(1)).toEqual(['--migrate', '--force']);
      expect(call?.args[0]).toContain('share-data-root.mjs');
      expect(call?.env['ELECTRON_RUN_AS_NODE']).toBe('1');
      expect(call?.env['DSH_HOME']).toBe(root);
      expect(call?.env['WORKBENCH_PROFILE']).toBe('workbench');
      expect(call?.env['DSH_WORKBENCH_HOME']).toBe(join(root, 'workbench'));
      expect(call?.detached).toBe(false);
      expect(call?.windowsHide).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.DSH_WORKBENCH_HOME;
      else process.env.DSH_WORKBENCH_HOME = previous;
    }
  });

  it('迁移脚本非 0 退出 → 带尾部输出报「迁移没成」', async () => {
    const root = homeWithScript();
    const { seam } = seamWith([{ exitCode: 1, stderr: 'fatal: 写不进去\n' }]);
    const actions = createWorkbenchFollowUps({
      dshHome: () => root,
      profileName: () => 'workbench',
      workbench: () => ({ pkg: '@dsh-workbench/core', version: '1.0.1' }),
      seam,
    });

    await expect(actions.migrateWorkbench()).rejects.toThrow(/迁移没成.*写不进去/s);
  });

  it('超时：按退出码 1 报，不挂住界面', async () => {
    vi.useFakeTimers();
    const root = homeWithScript();
    const { seam } = seamWith([{ hang: true }]);
    const actions = createWorkbenchFollowUps({
      dshHome: () => root,
      profileName: () => 'workbench',
      workbench: () => ({ pkg: '@dsh-workbench/core', version: '1.0.1' }),
      seam,
    });

    const pending = actions.migrateWorkbench();
    pending.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(120_001);

    await expect(pending).rejects.toThrow(/迁移没成（退出码 1）/);
  });

  it('没有执行缝也没有注入迁移口 → 说清跑不起来', async () => {
    const root = homeWithScript();
    const actions = createWorkbenchFollowUps({
      dshHome: () => root,
      profileName: () => 'workbench',
      workbench: () => ({ pkg: '@dsh-workbench/core', version: '1.0.1' }),
    });

    await expect(actions.migrateWorkbench()).rejects.toThrow(/执行缝/);
  });

  it('不再提醒：把 follow-up id 写进当前 profile 的 follow-ups.json', async () => {
    const root = homeWithScript();
    const previous = process.env.DSH_WORKBENCH_HOME;
    process.env.DSH_WORKBENCH_HOME = join(root, 'workbench');
    try {
      const actions = createWorkbenchFollowUps({
        dshHome: () => root,
        profileName: () => 'workbench',
        workbench: () => ({ pkg: '@dsh-workbench/core', version: '1.0.1' }),
      });

      await actions.dismissFollowUp('data-root-migration');

      expect(isFollowUpDismissed(join(root, 'workbench'), 'data-root-migration')).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.DSH_WORKBENCH_HOME;
      else process.env.DSH_WORKBENCH_HOME = previous;
    }
  });

  it('拿不到 DSH_HOME / profile 或装的那份 → 不硬来，给一句能照做的', async () => {
    const actions = createWorkbenchFollowUps({
      dshHome: undefined,
      profileName: () => 'workbench',
      workbench: () => ({ pkg: '@dsh-workbench/core', version: '1.0.1' }),
    });

    await expect(actions.migrateWorkbench()).rejects.toThrow(/DSH_HOME|profile/);
    await expect(actions.dismissFollowUp('data-root-migration')).rejects.toThrow(/DSH_HOME|profile/);
  });
});
