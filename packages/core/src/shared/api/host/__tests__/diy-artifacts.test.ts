import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { artifactsDirOf, ensureDirOf } from '../diy-artifacts';

const made: string[] = [];
const previous = process.env.DSH_WORKBENCH_HOME;

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  if (previous === undefined) delete process.env.DSH_WORKBENCH_HOME;
  else process.env.DSH_WORKBENCH_HOME = previous;
});

function withRoot<T>(run: () => T): T {
  process.env.DSH_WORKBENCH_HOME = '/Users/x/.dsh/workbench';
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.DSH_WORKBENCH_HOME;
    else process.env.DSH_WORKBENCH_HOME = previous;
  }
}

describe('artifactsDirOf（截图与录制的落点）', () => {
  it('★ 按工作区分桶：目录名 + 路径哈希前 8 位，落在运行时根的 artifacts 下', () => {
    const root = '/Users/x/.dsh/workbench';
    const dir = withRoot(() => artifactsDirOf('/w/modules-repo'));

    expect(dir.startsWith(join(root, 'artifacts', 'modules-repo-'))).toBe(true);
    expect(dir.slice(join(root, 'artifacts', 'modules-repo-').length)).toMatch(/^[0-9a-f]{8}$/u);
  });

  it('★ 只看运行时根：同一次调用里两回一致，不同工作区不撞', () => {
    withRoot(() => {
      expect(artifactsDirOf('/w/a/modules-repo')).toBe(artifactsDirOf('/w/a/modules-repo'));
      expect(artifactsDirOf('/w/a/modules-repo')).not.toBe(artifactsDirOf('/w/b/modules-repo'));
    });
  });

  it('目录名里的怪字符收成短横；收完为空就退回 workspace', () => {
    const slash = (value: string): string => value.replaceAll('\\', '/');
    const workspace = withRoot(() => slash(artifactsDirOf('/w/我的 项目')));
    const root = withRoot(() => slash(artifactsDirOf('/')));

    expect(workspace).toMatch(/\/artifacts\/workspace-[0-9a-f]{8}$/u);
    expect(root).toMatch(/\/artifacts\/workspace-[0-9a-f]{8}$/u);
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
