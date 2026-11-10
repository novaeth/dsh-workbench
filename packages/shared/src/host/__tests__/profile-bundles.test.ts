import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ensureProfileBundle, profileBundlesOf, WORKBENCH_BUNDLE } from '../profile-bundles.js';

const ROOT = mkdtempSync(join(tmpdir(), 'dsh-wb-profile-bundles-'));

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

function profileOf(manifest: unknown): { dir: string; path: string } {
  const dir = mkdtempSync(join(ROOT, 'profile-'));
  const path = join(dir, 'package.json');
  writeFileSync(path, typeof manifest === 'string' ? manifest : `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { dir, path };
}

const BASE = {
  name: 'dsh-profile-workbench',
  private: true,
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
  dependencies: { '@deepseek-ai/dsh-base': '1.0.0', [WORKBENCH_BUNDLE]: 'link:../../workbench/versions/1.2.3-beta.3/node_modules/@dsh-workbench/core' },
};

describe('清单不变量：dsh.profile.bundles 那一行', () => {
  it('★ 缺了就追加到末尾，别的字段与 dependencies 一个字不动', () => {
    const { dir, path } = profileOf({ ...BASE, scripts: { dev: 'keep me' } });
    const check = ensureProfileBundle(dir);
    expect(check).toMatchObject({ selected: true, repaired: true });
    expect(check.refusal).toBeUndefined();
    expect(check.bundles).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', WORKBENCH_BUNDLE]);
    const after = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> & {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      dsh: { profile: { bundles: readonly string[] } };
    };
    expect(after.scripts).toEqual({ dev: 'keep me' });
    expect(after.dependencies[WORKBENCH_BUNDLE]).toBe(BASE.dependencies[WORKBENCH_BUNDLE]);
    expect(after.dsh.profile.bundles).toContain(WORKBENCH_BUNDLE);
  });

  it('★ 已经在里面 → 一个字节都不写', () => {
    const { dir, path } = profileOf({ ...BASE, dsh: { profile: { bundles: [...BASE.dsh.profile.bundles, WORKBENCH_BUNDLE] } } });
    const before = statSync(path).mtimeMs;
    const check = ensureProfileBundle(dir);
    expect(check).toMatchObject({ selected: true, repaired: false });
    expect(statSync(path).mtimeMs).toBe(before);
  });

  it('★ 依赖不在清单里就不塞（塞了只会让 profile 组不起来，比不出现更糟）', () => {
    const { dir, path } = profileOf({ ...BASE, dependencies: { '@deepseek-ai/dsh-base': '1.0.0' } });
    const before = readFileSync(path, 'utf8');
    const check = ensureProfileBundle(dir);
    expect(check).toMatchObject({ selected: false, repaired: false, refusal: 'dependency-missing' });
    expect(readFileSync(path, 'utf8')).toBe(before);
  });

  it('dsh.profile 整个不在也能补出这一行（依赖要在）', () => {
    const { dir, path } = profileOf({ ...BASE, dsh: {} });
    expect(ensureProfileBundle(dir)).toMatchObject({ selected: true, repaired: true });
    expect(profileBundlesOf(dir)).toEqual([WORKBENCH_BUNDLE]);
    expect((JSON.parse(readFileSync(path, 'utf8')) as { dsh: { profile: { bundles: readonly string[] } } }).dsh.profile.bundles).toEqual([
      WORKBENCH_BUNDLE,
    ]);
  });

  it('读不了清单：没有 / 坏了都如实说，一个字节都不写', () => {
    const missing = mkdtempSync(join(ROOT, 'empty-'));
    expect(ensureProfileBundle(missing)).toMatchObject({ refusal: 'no-manifest', repaired: false });
    const { dir, path } = profileOf('{ 这不是 JSON');
    expect(ensureProfileBundle(dir)).toMatchObject({ refusal: 'broken-manifest', repaired: false });
    expect(readFileSync(path, 'utf8')).toBe('{ 这不是 JSON');
  });

  it('profileBundlesOf 读得出来；没有那一格就是空', () => {
    const { dir } = profileOf(BASE);
    expect(profileBundlesOf(dir)).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']);
    expect(profileBundlesOf(join(ROOT, '没有这个目录'))).toEqual([]);
  });

  it('目录不存在时不硬造一个清单出来', () => {
    const dir = join(ROOT, 'never-');
    expect(ensureProfileBundle(dir)).toMatchObject({ refusal: 'no-manifest' });
    expect(() => statSync(join(dir, 'package.json'))).toThrow();
  });

  it('外部传别的 bundle 名也照办（同一份做法不只服务工作台自己）', () => {
    const { dir } = profileOf({ ...BASE, dependencies: { ...BASE.dependencies, '@dsh-workbench/module-cmdb': '1.1.5' } });
    expect(ensureProfileBundle(dir, '@dsh-workbench/module-cmdb').bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      '@dsh-workbench/module-cmdb',
    ]);
  });

  it('清单得是对象、bundles 那格得是数组，不然按「没有」处理', () => {
    const notObject = profileOf('[]');
    expect(ensureProfileBundle(notObject.dir)).toMatchObject({ refusal: 'broken-manifest' });
    const weird = profileOf({ ...BASE, dsh: { profile: { bundles: 'nope' } } });
    expect(ensureProfileBundle(weird.dir)).toMatchObject({ selected: true, repaired: true, bundles: [WORKBENCH_BUNDLE] });
  });
});
