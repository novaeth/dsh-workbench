import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dismissFollowUp } from '../follow-up-dismiss';
import { migrationFollowUp } from '../migration-follow-up';

const roots: string[] = [];

function home(): string {
  const root = mkdtempSync(join(tmpdir(), 'wb-migration-follow-up-'));
  roots.push(root);
  return root;
}

function workspaceFile(root: string, paths: readonly string[]): void {
  const tables: Record<string, unknown> = {};
  paths.forEach((path, index) => {
    tables[`w${index}`] = {
      path,
      title: path,
      sessionIds: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  });
  mkdirSync(join(root, 'storages'), { recursive: true });
  writeFileSync(
    join(root, 'storages', 'workspace.json'),
    JSON.stringify({
      unit: { name: 'workspace', version: 2 },
      global: { initialized: true, workspaceIds: paths.map((_, index) => `w${index}`) },
      tables: { workspaces: tables },
    }),
    'utf8',
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('市场工作台行的迁移待办：只认真实条件', () => {
  it('没有旧数据 → 不出现', () => {
    const root = home();
    expect(migrationFollowUp({ home: root, profile: 'workbench' })).toBeUndefined();
  });

  it('有旧会话、还没迁过 → 待迁移', () => {
    const root = home();
    mkdirSync(join(root, 'workbench', 'sessions', 'w1'), { recursive: true });
    writeFileSync(join(root, 'workbench', 'sessions', 'w1', 's1.jsonl'), 'x\n', 'utf8');

    expect(migrationFollowUp({ home: root, profile: 'workbench' })).toEqual({
      id: 'data-root-migration',
      kind: 'data-migration',
      hard: false,
    });
  });

  it('迁过一次、旧目录里的项目都在共用根 → 不出现', () => {
    const root = home();
    workspaceFile(join(root, 'workbench'), ['/a']);
    workspaceFile(root, ['/a']);
    writeFileSync(join(root, 'workbench', '.data-root-shared'), '{}\n', 'utf8');

    expect(migrationFollowUp({ home: root, profile: 'workbench' })).toBeUndefined();
  });

  it('迁过一次但还有项目不在共用根 → 仍然待迁移', () => {
    const root = home();
    workspaceFile(join(root, 'workbench'), ['/a', '/b']);
    workspaceFile(root, ['/a']);
    writeFileSync(join(root, 'workbench', '.data-root-shared'), '{}\n', 'utf8');

    expect(migrationFollowUp({ home: root, profile: 'workbench' })).toEqual({
      id: 'data-root-migration',
      kind: 'data-migration',
      hard: false,
    });
  });

  it('点过「不再提醒」→ 条件还在也不出现', () => {
    const root = home();
    mkdirSync(join(root, 'workbench', 'sessions', 'w1'), { recursive: true });
    writeFileSync(join(root, 'workbench', 'sessions', 'w1', 's1.jsonl'), 'x\n', 'utf8');
    dismissFollowUp(join(root, 'workbench'), 'data-root-migration');

    expect(migrationFollowUp({ home: root, profile: 'workbench' })).toBeUndefined();
  });

  it('运行时根就是 DSH_HOME → 没有"旧目录"这回事', () => {
    const root = home();
    mkdirSync(join(root, 'sessions', 'w1'), { recursive: true });
    writeFileSync(join(root, 'sessions', 'w1', 's1.jsonl'), 'x\n', 'utf8');

    expect(migrationFollowUp({ home: root, profile: 'workbench', runtimeRoot: root })).toBeUndefined();
  });
});
