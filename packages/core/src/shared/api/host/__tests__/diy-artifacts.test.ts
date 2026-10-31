import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared';
import { artifactsDirOf, ensureDirOf } from '../diy-artifacts';

const made: string[] = [];

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function ctxWithHome(home: string | null): DshHostContext {
  return {
    get: (name: string) => {
      if (name !== 'dshHomePath') return undefined;
      if (home === null) return undefined;
      return (relative: string) => join(home, relative);
    },
  } as unknown as DshHostContext;
}

describe('artifactsDirOf（截图与录制的落点）', () => {
  it('★ 按工作区分桶：目录名 + 路径哈希前 8 位，落在 $DSH_HOME/workbench/artifacts 下', () => {
    const home = '/Users/x/.dsh';
    const dir = artifactsDirOf(ctxWithHome(home), '/w/modules-repo');

    expect(dir.startsWith(join(home, 'workbench', 'artifacts', 'modules-repo-'))).toBe(true);
    expect(dir.slice(join(home, 'workbench', 'artifacts', 'modules-repo-').length)).toMatch(/^[0-9a-f]{8}$/u);
  });

  it('同一个工作区每次都一样；不同工作区不撞（哪怕目录名相同）', () => {
    const ctx = ctxWithHome('/Users/x/.dsh');

    expect(artifactsDirOf(ctx, '/w/a/modules-repo')).toBe(artifactsDirOf(ctx, '/w/a/modules-repo'));
    expect(artifactsDirOf(ctx, '/w/a/modules-repo')).not.toBe(artifactsDirOf(ctx, '/w/b/modules-repo'));
  });

  it('目录名里的怪字符收成短横；收完为空就退回 workspace', () => {
    const ctx = ctxWithHome('/Users/x/.dsh');

    const slash = (value: string): string => value.replaceAll('\\', '/');
    expect(slash(artifactsDirOf(ctx, '/w/我的 项目'))).toMatch(/\/artifacts\/workspace-[0-9a-f]{8}$/u);
    expect(slash(artifactsDirOf(ctx, '/'))).toMatch(/\/artifacts\/workspace-[0-9a-f]{8}$/u);
  });

  it('★ 没有 dshHomePath 服务 ⇒ 当场拒（不猜一个可写目录）', () => {
    expect(() => artifactsDirOf(ctxWithHome(null), '/w/a')).toThrow(/dshHomePath/);
  });
});

describe('ensureDirOf', () => {
  it('建出来（含中间层），再建一次也不炸', () => {
    const base = mkdtempSync(join(tmpdir(), 'wb-artifacts-'));
    made.push(base);
    const dir = join(base, 'workbench', 'artifacts', 'demo-12345678');

    ensureDirOf(dir);
    expect(existsSync(dir)).toBe(true);
    expect(statSync(dir).isDirectory()).toBe(true);

    ensureDirOf(dir);
    expect(existsSync(dir)).toBe(true);
  });
});
