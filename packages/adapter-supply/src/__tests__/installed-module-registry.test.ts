import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { rememberPackageSource } from '@dsh-workbench/shared/host';
import { isRegistryDependencySpec, readInstalledModule, readProfilePackage } from '../index.js';

const dirs: string[] = [];

function profileWith(pkg: string, manifest: unknown): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-registry-'));
  dirs.push(root);
  const dir = path.join(root, 'node_modules', pkg);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest), 'utf8');
  return root;
}

function profileWithNpmrc(pkg: string, manifest: unknown, npmrc: string): string {
  const root = profileWith(pkg, manifest);
  fs.writeFileSync(path.join(root, '.npmrc'), npmrc, 'utf8');
  return root;
}

function moduleManifest(pkg: string, extra: Record<string, unknown> = {}): unknown {
  return {
    name: pkg,
    version: '0.3.1',
    dsh: { workbench: { unit: 'x' } },
    ...extra,
  };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('registry 从哪来（publishConfig → lockfile → profile .npmrc）', () => {
  it('★ 包里没写 publishConfig 时，按 .npmrc 的 @scope:registry 找源', () => {
    const pkg = '@pagoda-dsh-workbench/module-x';
    const root = profileWithNpmrc(
      pkg,
      moduleManifest(pkg),
      '# dsh-workbench 写的\n@pagoda-dsh-workbench:registry=https://private.example/npm/\n',
    );

    expect(readInstalledModule(root, pkg)).toMatchObject({
      kind: 'module',
      registry: 'https://private.example/npm/',
    });
  });

  it('不带 scope 的包用 .npmrc 里的默认 registry（带引号也能读）', () => {
    const root = profileWithNpmrc('module-x', moduleManifest('module-x'), 'registry="https://mirror.example/npm/"\n');

    expect(readInstalledModule(root, 'module-x')).toMatchObject({
      registry: 'https://mirror.example/npm/',
    });
  });

  it('★ publishConfig 与 .npmrc 都在时，包自己写的那份优先', () => {
    const pkg = '@a/mod';
    const root = profileWithNpmrc(
      pkg,
      moduleManifest(pkg, { publishConfig: { registry: 'https://declared.example/' } }),
      '@a:registry=https://npmrc.example/\n',
    );

    expect(readInstalledModule(root, pkg)).toMatchObject({ registry: 'https://declared.example/' });
  });

  it('scope 对不上、也没有默认 registry → 仍是"不知道"', () => {
    const pkg = '@a/mod';
    const root = profileWithNpmrc(pkg, moduleManifest(pkg), '@b:registry=https://other.example/\n');

    expect(readInstalledModule(root, pkg)).not.toHaveProperty('registry');
  });

  it('★ 工作台自己那一行（readProfilePackage）也走同一条链', () => {
    const root = profileWith('@dsh-workbench/core', { name: '@dsh-workbench/core', version: '1.1.4' });
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'p', dsh: { profile: { bundles: ['@dsh-workbench/core'] } } }),
      'utf8',
    );
    fs.writeFileSync(path.join(root, '.npmrc'), 'registry=https://mirror.example/npm/\n', 'utf8');

    expect(readProfilePackage(root, '@dsh-workbench/core')).toMatchObject({
      registry: 'https://mirror.example/npm/',
    });
  });
});

describe('哪些依赖写法算"从 registry 装"', () => {
  it('版本范围与空串算，link / git / tarball 不算', () => {
    for (const spec of ['^0.1.2', '0.1.2', 'latest', '']) expect(isRegistryDependencySpec(spec), spec).toBe(true);
    for (const spec of [
      'link:/Users/x/module',
      'file:../module',
      'git+ssh://git@example.com/o/r.git#main',
      'github:o/r',
      'https://example.com/module.tgz',
      'workspace:*',
    ])
      expect(isRegistryDependencySpec(spec), spec).toBe(false);
  });
});

describe('按包记录的来源（install 时写下，检查更新只认它）', () => {
  const pkg = '@x/a';

  it('★ 只有按包记录时也能解析出来（不再依赖 .npmrc 的 scope 映射）', () => {
    const root = profileWith(pkg, moduleManifest(pkg));
    rememberPackageSource(root, pkg, { version: '0.3.1', registry: 'https://r1.example/' });

    expect(readInstalledModule(root, pkg)).toMatchObject({ registry: 'https://r1.example/' });
  });

  it('★ 同一个 scope 的两个包各问各的源（.npmrc 只能给一个）', () => {
    const root = profileWith(pkg, moduleManifest(pkg));
    const other = '@x/b';
    fs.mkdirSync(path.join(root, 'node_modules', other), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'node_modules', other, 'package.json'),
      JSON.stringify(moduleManifest(other)),
      'utf8',
    );
    fs.writeFileSync(path.join(root, '.npmrc'), '@x:registry=https://r1.example/\n', 'utf8');
    rememberPackageSource(root, pkg, { version: '0.3.1', registry: 'https://r1.example/' });
    rememberPackageSource(root, other, { version: '0.4.0', registry: 'https://r2.example/' });

    expect(readInstalledModule(root, pkg)).toMatchObject({ registry: 'https://r1.example/' });
    expect(readInstalledModule(root, other)).toMatchObject({ registry: 'https://r2.example/' });
  });

  it('包自己写的 publishConfig 仍然优先于记录（作者说了算）', () => {
    const root = profileWith(pkg, moduleManifest(pkg, { publishConfig: { registry: 'https://declared.example/' } }));
    rememberPackageSource(root, pkg, { version: '0.3.1', registry: 'https://r1.example/' });

    expect(readInstalledModule(root, pkg)).toMatchObject({ registry: 'https://declared.example/' });
  });
});
