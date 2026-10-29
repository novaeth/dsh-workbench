import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { LibNeed } from '@dsh-workbench/shared/host';
import { createLibReader } from '../index.js';

const NEED: LibNeed = {
  kind: 'lib',
  name: 'demo-lib',
  purpose: '测试',
  sources: [{ kind: 'npm', package: 'demo-lib' }],
};

const dirs: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-lib-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('createLibReader', () => {
  it('从 root/<name>/<entry> 加载 ESM', async () => {
    const root = tempRoot();
    mkdirSync(join(root, 'demo-lib', 'src'), { recursive: true });
    writeFileSync(join(root, 'demo-lib', 'src', 'hello.js'), 'export const hello = 42;\n');
    const reader = createLibReader({ roots: [root], env: {} });
    const loaded = await reader.load<{ hello: number }>(NEED, 'src/hello.js');
    expect(loaded.hello).toBe(42);
  });

  it('找不到时回 lib-missing，并带 npm 安装提示', async () => {
    const reader = createLibReader({ roots: [tempRoot()], env: {} });
    await expect(reader.load(NEED, 'src/hello.js')).rejects.toMatchObject({
      code: 'lib-missing',
      hint: expect.stringContaining('npm i'),
    });
  });

  it('拒绝绝对路径与跳出 lib 目录', async () => {
    const reader = createLibReader({ roots: [tempRoot()], env: {} });
    await expect(reader.load(NEED, '/etc/passwd')).rejects.toMatchObject({
      code: 'lib-path-invalid',
    });
    await expect(reader.load(NEED, '../x.js')).rejects.toMatchObject({
      code: 'lib-path-invalid',
    });
  });
});
