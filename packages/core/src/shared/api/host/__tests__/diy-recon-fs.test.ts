import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { installedPluginsOf, reconCatalogOf } from '../diy-recon-fs';

const roots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'diy-recon-'));
  roots.push(dir);
  return dir;
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe('读那份自带目录（真实文件）', () => {
  it('读得到就解析成命令；路径不对回 undefined（不抛）', () => {
    const dir = tempDir();
    const path = join(dir, 'cli-manifest.json');
    writeFileSync(
      path,
      JSON.stringify([
        { command: 'arxiv/search', site: 'arxiv', name: 'search', access: 'read', strategy: 'public' },
      ]),
    );
    expect(reconCatalogOf(path)?.map((one) => one.command)).toEqual(['arxiv/search']);
    expect(reconCatalogOf(join(dir, 'nope.json'))).toBeUndefined();
  });

  it('坏 JSON 也算读不到（不给半份目录）', () => {
    const dir = tempDir();
    const path = join(dir, 'cli-manifest.json');
    writeFileSync(path, '{ 半个 json');
    expect(reconCatalogOf(path)).toEqual([]);
  });
});

describe('看这台机器装了哪些插件', () => {
  it('只认 opencli-plugin-*，命令取包里的 .js', () => {
    const dir = tempDir();
    mkdirSync(join(dir, 'opencli-plugin-inventory'));
    writeFileSync(join(dir, 'opencli-plugin-inventory', 'envs.js'), '');
    writeFileSync(join(dir, 'opencli-plugin-inventory', 'index.js'), '');
    mkdirSync(join(dir, 'dayjs'));
    writeFileSync(join(dir, 'dayjs', 'index.js'), '');

    const plugins = installedPluginsOf(dir, 'opencli-plugin-');
    expect(plugins.map((one) => one.name)).toEqual(['inventory']);
    expect(plugins[0]?.commands).toEqual(['envs']);
  });

  it('目录不存在就回空数组（这台机器还没装任何插件）', () => {
    expect(installedPluginsOf(join(tmpdir(), 'definitely-not-here'), 'opencli-plugin-')).toEqual([]);
  });
});
