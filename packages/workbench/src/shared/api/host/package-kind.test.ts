import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OPENCLI_MANIFEST_FILE, isCommandFile, splitNpmSpec, verdictOf } from './package-kind';

const roots: string[] = [];

function dirOf(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-kind-'));
  roots.push(root);
  const at = path.join(root, name);
  fs.mkdirSync(at, { recursive: true });
  return at;
}

function put(at: string, file: string, body: unknown): void {
  const target = path.join(at, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
}

function pluginDir(name = 'plugin-a', manifest: unknown = { name: 'plugina', version: '1.0.0' }): string {
  const at = dirOf(name);
  put(at, 'package.json', { name: `@t/${name}`, version: '1.0.0' });
  put(at, OPENCLI_MANIFEST_FILE, manifest);
  put(at, 'list.js', 'export const list = 1;\n');
  return at;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('按内容认一个包：opencli 插件与工作台模块', () => {
  it('★ 真判据：可解析的 opencli-plugin.json + 顶层至少一个命令文件 → opencli 插件', () => {
    const at = pluginDir();

    expect(verdictOf(at)).toEqual({ kind: 'opencli-plugin', pkg: '@t/plugin-a', pluginName: 'plugina' });
  });

  it('★ manifest 里没写 name → 还是插件，只是没有显示名', () => {
    expect(verdictOf(pluginDir('plugin-b', { version: '1.0.0' }))).toEqual({
      kind: 'opencli-plugin',
      pkg: '@t/plugin-b',
    });
  });

  it('★ 只有 package.json 里的 dsh.bundle / dsh.workbench → dsh 扩展包', () => {
    const bundle = dirOf('dsh-bundle');
    put(bundle, 'package.json', { name: '@t/plain-bundle', dsh: { bundle: {} } });
    const workbench = dirOf('dsh-workbench');
    put(workbench, 'package.json', { name: '@t/module-a', dsh: { workbench: { unit: 'a' } } });

    expect(verdictOf(bundle)).toEqual({ kind: 'dsh-bundle', pkg: '@t/plain-bundle' });
    expect(verdictOf(workbench)).toEqual({ kind: 'dsh-bundle', pkg: '@t/module-a' });
  });

  it('★ 两样都有 → both（路由那一侧按 dsh 走，不许装两遍）', () => {
    const at = dirOf('both-a');
    put(at, 'package.json', { name: '@t/both-a', dsh: { bundle: {} } });
    put(at, OPENCLI_MANIFEST_FILE, { name: 'botha' });
    put(at, 'list.js', 'export const list = 1;\n');

    expect(verdictOf(at)).toEqual({ kind: 'both', pkg: '@t/both-a', pluginName: 'botha' });
  });

  it('★ 两样都没有（但 package.json 读得到）→ neither', () => {
    const at = dirOf('plain');
    put(at, 'package.json', { name: '@t/plain' });

    expect(verdictOf(at)).toEqual({ kind: 'neither', pkg: '@t/plain' });
  });

  it('★ 不算命令文件的那些：.d.ts / .test.ts / .d.js 都填不满"至少一个命令文件"', () => {
    expect(isCommandFile('list.js')).toBe(true);
    expect(isCommandFile('list.ts')).toBe(true);
    expect(isCommandFile('list.d.ts')).toBe(false);
    expect(isCommandFile('list.test.ts')).toBe(false);
    expect(isCommandFile('list.d.js')).toBe(false);
    expect(isCommandFile('README.md')).toBe(false);

    const at = dirOf('only-types');
    put(at, 'package.json', { name: '@t/only-types' });
    put(at, OPENCLI_MANIFEST_FILE, { name: 'onlytypes' });
    put(at, 'index.d.ts', 'export declare const x: number;\n');

    expect(verdictOf(at)).toEqual({ kind: 'neither', pkg: '@t/only-types' });
  });

  it('★ manifest 解不开 / 是数组 / 是个字符串 → 不是插件（解不开就当没有）', () => {
    for (const manifest of ['{ not json', '[]', '"just a string"']) {
      const at = dirOf('broken-manifest');
      put(at, 'package.json', { name: '@t/no-manifest' });
      put(at, OPENCLI_MANIFEST_FILE, manifest);
      put(at, 'list.js', 'export const list = 1;\n');

      expect(verdictOf(at)).toEqual({ kind: 'neither', pkg: '@t/no-manifest' });
    }
  });

  it('★ 有命令文件但没有 manifest → 不是插件（两样都得有）', () => {
    const at = dirOf('no-manifest');
    put(at, 'package.json', { name: '@t/no-manifest' });
    put(at, 'list.js', 'export const list = 1;\n');

    expect(verdictOf(at)).toEqual({ kind: 'neither', pkg: '@t/no-manifest' });
  });

  it('★ package.json 不在 / 解不开 → 判不了（不是"都不是"：ADR-0038 那条 fail-open 不许变成拒因）', () => {
    const missing = dirOf('no-package-json');
    put(missing, OPENCLI_MANIFEST_FILE, { name: 'x' });
    const broken = dirOf('broken-package-json');
    put(broken, 'package.json', '{ not json');

    expect(verdictOf(missing)).toBeUndefined();
    expect(verdictOf(broken)).toBeUndefined();
  });

  it('★ 反例（spec §1.8）：只有传递依赖叫 opencli-plugin-* 的目录 → 不是插件', () => {
    const at = dirOf('opencli-workflow');
    put(at, 'package.json', { name: 'opencli-workflow', version: '1.1.24' });
    put(at, 'node_modules/opencli-plugin-demo/package.json', { name: 'opencli-plugin-demo' });
    put(at, 'node_modules/opencli-plugin-demo/opencli-plugin.json', { name: 'demo' });
    put(at, 'node_modules/opencli-plugin-demo/list.js', 'export const list = 1;\n');

    expect(verdictOf(at)).toEqual({ kind: 'neither', pkg: 'opencli-workflow' });
  });

  it('★ 反例（同一条的另一面）：判据只看这一层的目录 —— 那个嵌套目录自己是插件', () => {
    const at = dirOf('opencli-workflow');
    put(at, 'package.json', { name: 'opencli-workflow' });
    put(at, 'node_modules/opencli-plugin-demo/package.json', { name: 'opencli-plugin-demo' });
    put(at, 'node_modules/opencli-plugin-demo/opencli-plugin.json', { name: 'demo' });
    put(at, 'node_modules/opencli-plugin-demo/list.js', 'export const list = 1;\n');

    expect(verdictOf(path.join(at, 'node_modules/opencli-plugin-demo'))).toEqual({
      kind: 'opencli-plugin',
      pkg: 'opencli-plugin-demo',
      pluginName: 'demo',
    });
  });
});

describe('spec 切成 npm 包名与版本（键始终是包名，插件名只用于显示）', () => {
  it('@scope/name@1.2.3 / name / name@latest', () => {
    expect(splitNpmSpec('@t/plugin-a@1.2.3')).toEqual({ name: '@t/plugin-a', version: '1.2.3' });
    expect(splitNpmSpec('@t/plugin-a')).toEqual({ name: '@t/plugin-a' });
    expect(splitNpmSpec('plugina')).toEqual({ name: 'plugina' });
    expect(splitNpmSpec('plugina@latest')).toEqual({ name: 'plugina', version: 'latest' });
    expect(splitNpmSpec('  plugina  ')).toEqual({ name: 'plugina' });
  });

  it('★ 不是 npm 包名的写法一律回 undefined（git 地址 / tarball / 本地路径不走这条路）', () => {
    for (const spec of ['github:o/r', 'git@x:r.git', 'https://example.test/a.tgz', '/opt/plugin', 'file:/opt/a', '']) {
      expect(splitNpmSpec(spec), spec).toBeUndefined();
    }
  });
});
