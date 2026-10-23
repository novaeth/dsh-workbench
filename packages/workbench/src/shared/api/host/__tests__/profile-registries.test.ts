import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BundleChange } from '@/shared/api/bundle-install';
import {
  REGISTRY_MARKER,
  createRegistryNotebook,
  mergeRegistryConfig,
  normalizeRegistry,
  registryFailure,
  sameRegistry,
  scopeOf,
  sourcesFromLockfile,
} from '../profile-registries';

const LOCKFILE = `lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      '@acme-dsh-workbench/module-inventory':
        specifier: ^0.1.7
        version: 0.1.7
      lodash:
        specifier: ^4.17.21
        version: 4.17.21

packages:

  '@deepseek-ai/cosmokit@1.8.5':
    resolution: {integrity: sha512-LXsrlem9z8dq4s}

  '@acme-dsh-workbench/module-inventory@0.1.7':
    resolution: {integrity: sha512-hHCwgEKzkH3, tarball: https://npm.example.com/team/@acme-dsh-workbench/module-inventory/-/@acme-dsh-workbench/module-inventory-0.1.7.tgz}

  '@acme-dsh-workbench/module-issues@0.1.7':
    resolution: {integrity: sha512-tPU9ZdtMQUF, tarball: https://npm.example.com/team/@acme-dsh-workbench/module-issues/-/@acme-dsh-workbench/module-issues-0.1.7.tgz}

  lodash@4.17.21:
    resolution: {integrity: sha512-abc}

snapshots:

  '@acme-dsh-workbench/module-inventory@0.1.7':
    dependencies:
      '@dsh-workbench/shared': 0.1.8
`;

const temporary: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-registry-'));
  temporary.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const change = (over: Partial<BundleChange> = {}): BundleChange => ({
  application: 'failed',
  stage: 'remove',
  changed: false,
  target: '@acme-dsh-workbench/module-inventory',
  ...over,
});

describe('scopeOf / sameRegistry', () => {
  it('scope 只从带斜杠的 @ 包里来', () => {
    expect(scopeOf('@acme-dsh-workbench/module-inventory')).toBe('@acme-dsh-workbench');
    expect(scopeOf('lodash')).toBeNull();
    expect(scopeOf('@broken')).toBeNull();
  });

  it('比源的时候不管结尾那个斜杠', () => {
    expect(normalizeRegistry('https://r.example.com/x')).toBe('https://r.example.com/x/');
    expect(sameRegistry('https://r.example.com/x/', 'https://r.example.com/x')).toBe(true);
    expect(sameRegistry('https://a.example.com/', 'https://b.example.com/')).toBe(false);
    expect(sameRegistry(null, 'https://b.example.com/')).toBe(false);
  });
});

describe('sourcesFromLockfile：从已装的包里推出"谁来自哪个源"', () => {
  it('★ 带 tarball 的（= 不是默认源解析的）按 scope 归并；没 tarball 的公共包不参与', () => {
    expect(sourcesFromLockfile(LOCKFILE)).toEqual([
      {
        scope: '@acme-dsh-workbench',
        registry: 'https://npm.example.com/team/',
      },
    ]);
  });

  it('同一 scope 指向两个源（歧义）→ 宁可不猜', () => {
    const two = LOCKFILE.replace(
      'https://npm.example.com/team/@acme-dsh-workbench/module-issues',
      'https://other.example.com/@acme-dsh-workbench/module-issues',
    );
    expect(sourcesFromLockfile(two)).toEqual([]);
  });

  it('没有 tarball 的 lockfile → 一条都没有', () => {
    expect(sourcesFromLockfile("lockfileVersion: '9.0'\n")).toEqual([]);
  });
});

describe('mergeRegistryConfig：只加不改、不重复', () => {
  const entry = { scope: '@a', registry: 'https://r.example.com/' };

  it('★ 空文件 → 写标记 + 一行', () => {
    const merged = mergeRegistryConfig('', [entry]);
    expect(merged.added).toEqual(['@a:registry']);
    expect(merged.text).toBe(`${REGISTRY_MARKER}\n@a:registry=https://r.example.com/\n`);
  });

  it('★ 别人的行一个字节不动，标记只写一次', () => {
    const before = '//r.example.com/:_authToken=xxx\nregistry=https://public.example.com/\n';
    const once = mergeRegistryConfig(before, [entry]);
    expect(once.text.startsWith(before)).toBe(true);
    expect(once.text.match(new RegExp(REGISTRY_MARKER, 'g'))).toHaveLength(1);

    const twice = mergeRegistryConfig(once.text, [entry]);
    expect(twice.added).toEqual([]);
    expect(twice.text).toBe(once.text);
  });

  it('已经有同一个 scope 的行 → 不动它（哪怕值不同）', () => {
    const merged = mergeRegistryConfig('@a:registry=https://old.example.com/\n', [entry]);
    expect(merged.added).toEqual([]);
    expect(merged.text).toBe('@a:registry=https://old.example.com/\n');
  });
});

describe('registryFailure：只认"源"这一类失败', () => {
  it('★ 404 / FETCH 类算；别的失败不算', () => {
    expect(registryFailure(change({ packageResult: { exitCode: 1, output: '', truncated: false, logPath: '', kind: 'not-found' } }))).toBe(true);
    expect(
      registryFailure(change({ packageResult: { exitCode: 1, output: 'ERR_PNPM_FETCH_404 GET https://x', truncated: false, logPath: '', kind: 'unknown' } })),
    ).toBe(true);
    expect(registryFailure(change())).toBe(false);
    expect(registryFailure(change({ application: 'applied' }))).toBe(false);
    expect(
      registryFailure(change({ packageResult: { exitCode: 1, output: 'bundle-in-use', truncated: false, logPath: '', kind: 'unknown' } })),
    ).toBe(false);
  });
});

describe('createRegistryNotebook：读 lockfile、写 .npmrc', () => {
  it('★ 记一次 → profile 的 .npmrc 多一行（追加、保留已有内容）；再记不重复', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), LOCKFILE);
    fs.writeFileSync(path.join(dir, '.npmrc'), '//r.example.com/:_authToken=keep\n');
    const notebook = createRegistryNotebook(dir);

    expect(notebook.sources()).toEqual([
      { scope: '@acme-dsh-workbench', registry: 'https://npm.example.com/team/' },
    ]);

    const added = notebook.remember(notebook.sources());
    expect(added).toEqual(['@acme-dsh-workbench:registry']);
    const text = fs.readFileSync(path.join(dir, '.npmrc'), 'utf8');
    expect(text).toContain('//r.example.com/:_authToken=keep');
    expect(text).toContain('@acme-dsh-workbench:registry=https://npm.example.com/team/');

    expect(notebook.remember(notebook.sources())).toEqual([]);
  });

  it('没有 profile 目录 / 没有 lockfile → 安安静静，不抛', () => {
    expect(createRegistryNotebook(null).sources()).toEqual([]);
    expect(createRegistryNotebook(null).remember([{ scope: '@a', registry: 'https://r.example.com/' }])).toEqual([]);
    expect(createRegistryNotebook(tempDir()).sources()).toEqual([]);
  });
});
