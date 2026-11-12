import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createInstalledPackageReader } from '../installed-package';

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'wb-installed-package-'));
  roots.push(root);
  return root;
}

function writePackage(dir: string, manifest: Record<string, unknown>, files: Record<string, string> = {}): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('已安装包的元数据与文档：先从本机包目录读，读不到就说缺失', () => {
  it('★ 元数据、README 与 CHANGELOG 都从 profile 的 node_modules 里取', () => {
    const root = tempRoot();
    const profileDir = join(root, 'profile');
    const dir = join(profileDir, 'node_modules', '@a', 'hello');
    writePackage(
      dir,
      {
        name: '@a/hello',
        version: '1.2.3',
        description: '一个演示模块',
        author: { name: '张三', email: 'z@example.com' },
        homepage: 'https://example.com/hello',
        keywords: ['演示', '模块'],
      },
      { 'README.md': '# 说明', 'CHANGELOG.md': '## 1.2.3' },
    );
    const reader = createInstalledPackageReader({
      profileDir,
      sharedLibsDir: null,
      workbenchRoot: root,
    });

    expect(reader.info('@a/hello')).toEqual({
      pkg: '@a/hello',
      version: '1.2.3',
      description: '一个演示模块',
      author: '张三 <z@example.com>',
      homepage: 'https://example.com/hello',
      keywords: ['演示', '模块'],
    });
    expect(reader.doc('@a/hello', '1.2.3', 'readme')).toEqual({
      ok: true,
      kind: 'readme',
      version: '1.2.3',
      text: '# 说明',
    });
    expect(reader.doc('@a/hello', '1.2.3', 'changelog')).toEqual({
      ok: true,
      kind: 'changelog',
      version: '1.2.3',
      text: '## 1.2.3',
    });
  });

  it('★ 版本对不上时不拿别的版本冒充，直接说缺失', () => {
    const root = tempRoot();
    const profileDir = join(root, 'profile');
    writePackage(
      join(profileDir, 'node_modules', '@a', 'hello'),
      { name: '@a/hello', version: '1.2.3' },
      { 'README.md': '# 说明' },
    );
    const reader = createInstalledPackageReader({
      profileDir,
      sharedLibsDir: null,
      workbenchRoot: root,
    });

    expect(reader.doc('@a/hello', '1.0.0', 'readme')).toEqual({
      ok: false,
      kind: 'readme',
      version: '1.0.0',
      reason: 'missing',
    });
  });

  it('★ 包里没带文档时给 missing，不编内容', () => {
    const root = tempRoot();
    const profileDir = join(root, 'profile');
    writePackage(join(profileDir, 'node_modules', 'plain'), { version: '1.0.0' });
    const reader = createInstalledPackageReader({
      profileDir,
      sharedLibsDir: null,
      workbenchRoot: root,
    });

    expect(reader.doc('plain', '1.0.0', 'readme')).toMatchObject({
      ok: false,
      reason: 'missing',
    });
    expect(reader.info('plain')).toMatchObject({ pkg: 'plain', version: '1.0.0', keywords: [] });
  });

  it('★ 本机插件目录按插件账本给出的路径读', () => {
    const root = tempRoot();
    const pluginDir = join(root, 'plugins', 'mine');
    writePackage(pluginDir, { name: 'mine', version: '2.0.0', description: '本机插件' });
    const reader = createInstalledPackageReader({
      profileDir: null,
      sharedLibsDir: null,
      workbenchRoot: root,
      pluginDirOf: (pkg) => (pkg === '/tmp/mine' ? pluginDir : undefined),
    });

    expect(reader.info('/tmp/mine')).toMatchObject({ description: '本机插件', version: '2.0.0' });
  });

  it('★ 共用依赖从 opencli 的 libs/node_modules 里读', () => {
    const root = tempRoot();
    const sharedLibsDir = join(root, 'opencli', 'libs', 'node_modules');
    writePackage(join(sharedLibsDir, 'opencli-workflow'), {
      name: 'opencli-workflow',
      version: '1.1.28',
      keywords: ['workflow'],
    });
    const reader = createInstalledPackageReader({
      profileDir: null,
      sharedLibsDir,
      workbenchRoot: root,
    });

    expect(reader.info('opencli-workflow')).toMatchObject({
      version: '1.1.28',
      keywords: ['workflow'],
    });
  });

  it('★ 包名带路径穿越时不往目录外读', () => {
    const root = tempRoot();
    const profileDir = join(root, 'profile');
    mkdirSync(join(profileDir, 'node_modules'), { recursive: true });
    mkdirSync(join(root, 'secret'), { recursive: true });
    writeFileSync(join(root, 'secret', 'package.json'), JSON.stringify({ version: '9.9.9' }));
    const reader = createInstalledPackageReader({
      profileDir,
      sharedLibsDir: null,
      workbenchRoot: root,
    });

    expect(reader.info('../secret')).toBeNull();
    expect(reader.doc('../secret', '9.9.9', 'readme')).toMatchObject({
      ok: false,
      reason: 'missing',
    });
  });
});
