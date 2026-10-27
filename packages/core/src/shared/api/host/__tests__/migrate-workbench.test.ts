import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateWorkbench, type MigrationRunInput } from '../migrate-workbench';

const roots: string[] = [];

function homeWithScript(pkg: string): string {
  const root = mkdtempSync(join(tmpdir(), 'wb-migrate-workbench-'));
  roots.push(root);
  const dir = join(root, 'profiles', 'workbench', 'node_modules', pkg, 'scripts');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'share-data-root.mjs'), '', 'utf8');
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('工作台迁移动作：只认脚本和它的输出', () => {
  it('找不到脚本 → 说清这一份没装全', async () => {
    const home = mkdtempSync(join(tmpdir(), 'wb-migrate-workbench-'));
    roots.push(home);

    await expect(
      migrateWorkbench({
        home,
        profile: 'workbench',
        pkg: '@dsh-workbench/core',
        run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      }),
    ).rejects.toThrow(/找不到迁移脚本/);
  });

  it('跑起来时把 DSH_HOME / profile / 运行时根传进去，并从输出里读补了多少', async () => {
    const home = homeWithScript('@dsh-workbench/core');
    const seen: MigrationRunInput[] = [];
    const result = await migrateWorkbench({
      home,
      profile: 'workbench',
      pkg: '@dsh-workbench/core',
      run: async (input) => {
        seen.push(input);
        return {
          exitCode: 0,
          stdout: '迁移完成：新增 4 个项目，补了 2 个文件；旧目录保留。\n',
          stderr: '',
        };
      },
    });

    expect(result).toEqual({ added: 4, files: 2 });
    expect(seen[0]?.script).toBe(
      join(home, 'profiles', 'workbench', 'node_modules', '@dsh-workbench/core', 'scripts', 'share-data-root.mjs'),
    );
    expect(seen[0]?.env).toMatchObject({
      DSH_HOME: home,
      WORKBENCH_PROFILE: 'workbench',
      DSH_WORKBENCH_HOME: process.env.DSH_WORKBENCH_HOME ?? join(home, 'workbench'),
    });
  });

  it('非零退出 → 把最后几行原文带回来，不假装成功', async () => {
    const home = homeWithScript('@dsh-workbench/core');

    await expect(
      migrateWorkbench({
        home,
        profile: 'workbench',
        pkg: '@dsh-workbench/core',
        run: async () => ({ exitCode: 1, stdout: '', stderr: '第一行\n第二行\n这次没有迁移' }),
      }),
    ).rejects.toThrow(/第二行[\s\S]*这次没有迁移/);
  });
});
