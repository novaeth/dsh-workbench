import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DshHostContext, DshWorkspaceRecord, DshWorkspaceRegistry } from '@dsh-workbench/shared';
import { sessionWorkspaceOf } from '../workspace-root';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-session-workspace-'));
  roots.push(dir);
  return dir;
}

function ctxFor(registry: DshWorkspaceRegistry | undefined): DshHostContext {
  return { get: (name: string) => (name === 'workspaceRegistry' ? registry : undefined) } as unknown as DshHostContext;
}

function looseRegistry(...records: DshWorkspaceRecord[]): DshWorkspaceRegistry {
  return {
    get: () => undefined,
    create: async () => undefined,
    resolveByPath: async (dir: string) => records.find((record) => record.path === dir),
  };
}

function strictRegistry(seen: string[], record: DshWorkspaceRecord): DshWorkspaceRegistry {
  return {
    get: () => undefined,
    create: async () => undefined,
    resolveByPath: async (dir: string) => {
      seen.push(dir);
      if (dir === record.path) return record;
      throw new Error(`ENOENT: ${dir}`);
    },
  };
}

describe('sessionWorkspaceOf（会话的登记工作区）', () => {
  it('cwd 就是登记工作区的根：直接命中', async () => {
    const root = tempRoot();
    const workspace = { id: 'w1', path: root, title: '演示工作区' };

    expect(await sessionWorkspaceOf(ctxFor(looseRegistry(workspace)), root)).toEqual({
      root,
      title: '演示工作区',
    });
  });

  it('★ cwd 在它的子目录里：逐级向上，命中登记的根（板与模块都按工作区根算）', async () => {
    const root = tempRoot();
    const workspace = { id: 'w1', path: root, title: '演示工作区' };

    expect(await sessionWorkspaceOf(ctxFor(looseRegistry(workspace)), join(root, 'modules-repo', 'packages', 'x'))).toEqual({
      root,
      title: '演示工作区',
    });
  });

  it('★★ 登记表里没有 ⇒ null —— 不扫"像工作区的目录"，不替用户挑一个', async () => {
    const root = tempRoot();

    expect(await sessionWorkspaceOf(ctxFor(looseRegistry()), join(root, 'nowhere', 'deeper'))).toBeNull();
  });

  it('没有 workspaceRegistry 服务 ⇒ null（不知道就是不知道）', async () => {
    expect(await sessionWorkspaceOf(ctxFor(undefined), '/w/a')).toBeNull();
  });

  it('没 cwd / 空串 ⇒ null', async () => {
    expect(await sessionWorkspaceOf(ctxFor(looseRegistry()), null)).toBeNull();
    expect(await sessionWorkspaceOf(ctxFor(looseRegistry()), '')).toBeNull();
    expect(await sessionWorkspaceOf(ctxFor(looseRegistry()), '   ')).toBeNull();
  });

  it('★ resolveByPath 抛（路径不存在 / realpath 失败）就跳过这一级，继续向上', async () => {
    const root = tempRoot();
    const workspace = { id: 'w1', path: root, title: '登记名' };
    const seen: string[] = [];
    const deep = join(root, 'a', 'b', 'c');

    expect(await sessionWorkspaceOf(ctxFor(strictRegistry(seen, workspace)), deep)).toEqual({
      root,
      title: '登记名',
    });
    expect(seen).toEqual([deep, join(root, 'a', 'b'), join(root, 'a'), root]);
  });

  it('★ 走到文件系统根就停下（不无限循环），没命中回 null', async () => {
    const root = tempRoot();
    const workspace = { id: 'w1', path: join(root, 'elsewhere'), title: '别处' };
    const seen: string[] = [];
    const deep = join(root, 'x', 'y', 'z');

    expect(await sessionWorkspaceOf(ctxFor(strictRegistry(seen, workspace)), deep)).toBeNull();
    expect(seen.length).toBeLessThan(64);
  });
});
