import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWorkspaceStore, workspaceKey } from '@dsh-workbench/shared/host';

let root = '';
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-store-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('workspaceKey：按 id 分文件夹时那一段工作区名', () => {
  it('可读名 + 短哈希；同一条路径的不同写法落到同一个文件夹', () => {
    expect(workspaceKey('/w/operate-web')).toBe(workspaceKey('/w/./operate-web'));
    expect(workspaceKey('/w/operate-web')).toMatch(/^operate-web-[0-9a-f]{8}$/);
  });

  it('不同目录同名也不同：哈希把它们分开（只按名字分会互相覆盖）', () => {
    expect(workspaceKey('/a/apps')).not.toBe(workspaceKey('/b/apps'));
  });

  it('中文 / 空格等字符压成 `-`，压不出可读名时给 `workspace`', () => {
    expect(workspaceKey('/w/我的 项目')).toMatch(/^-[0-9a-f]{8}$|^[A-Za-z0-9._-]+-[0-9a-f]{8}$/);
    expect(workspaceKey('/')).toMatch(/^[A-Za-z0-9._-]+-[0-9a-f]{8}$/);
  });
});

describe('createWorkspaceStore：模块读写自己的文件夹', () => {
  it('落点是 <root>/<工作区>/<模块>，写进去能读回来、能列出来、能删掉', () => {
    const store = createWorkspaceStore({ root });
    const dir = store.for('inventory', '/w/operate-web');

    expect(dir.dir.startsWith(path.join(root, workspaceKey('/w/operate-web'), 'inventory'))).toBe(true);
    expect(dir.read('binding.json')).toBeNull();
    dir.write('binding.json', { envs: ['test'] });
    expect(dir.read('binding.json')).toEqual({ envs: ['test'] });
    expect(dir.list()).toEqual(['binding.json']);
    dir.remove('binding.json');
    expect(dir.read('binding.json')).toBeNull();
    expect(dir.list()).toEqual([]);
  });

  it('不同的模块 / 不同的工作区互不串门（这是这条需求的本体）', () => {
    const store = createWorkspaceStore({ root });
    store.for('inventory', '/w/a').write('x.json', { who: 'inventory-a' });
    store.for('panels', '/w/a').write('x.json', { who: 'panels-a' });
    store.for('inventory', '/w/b').write('x.json', { who: 'inventory-b' });

    expect(store.for('inventory', '/w/a').read('x.json')).toEqual({ who: 'inventory-a' });
    expect(store.for('panels', '/w/a').read('x.json')).toEqual({ who: 'panels-a' });
    expect(store.for('inventory', '/w/b').read('x.json')).toEqual({ who: 'inventory-b' });
  });

  it('★ 只能在里面：`..` / 绝对路径 / 空名一律抛，且外面什么都没被碰到', () => {
    const store = createWorkspaceStore({ root });
    const dir = store.for('inventory', '/w/a');

    for (const name of ['../escape.json', '../../escape.json', '/tmp/escape.json', '', '  ', '.', '\0x']) {
      expect(() => dir.write(name, { nope: true })).toThrow();
      expect(() => dir.read(name)).toThrow();
    }
    expect(fs.existsSync(path.join(root, 'escape.json'))).toBe(false);
    expect(fs.existsSync('/tmp/escape.json')).toBe(false);
  });

  it('模块想写子目录可以（只要求仍在自己的文件夹里）', () => {
    const store = createWorkspaceStore({ root });
    const dir = store.for('inventory', '/w/a');
    dir.write('runs/1.json', { ok: true });
    expect(dir.read('runs/1.json')).toEqual({ ok: true });
    expect(() => dir.write('runs/../../escape.json', {})).toThrow();
  });

  it('坏文件当"还没有配置"（不拦住整个模块）', () => {
    const store = createWorkspaceStore({ root });
    const dir = store.for('inventory', '/w/a');
    dir.write('binding.json', { ok: true });
    fs.writeFileSync(path.join(dir.dir, 'binding.json'), '{ 这不是 JSON', 'utf8');
    expect(dir.read('binding.json')).toBeNull();
  });

  it('没有工作区 / 没有可写根 → 只在内存里生效，并 warn 一次', () => {
    const warnings: string[] = [];
    const store = createWorkspaceStore({ root: null, logger: { warn: (m: string) => warnings.push(m) } });

    const none = store.for('inventory', null);
    none.write('binding.json', { ok: true });
    expect(none.read('binding.json')).toEqual({ ok: true });

    const other = store.machine('inventory');
    other.write('released.json', { ids: ['x'] });
    expect(other.read('released.json')).toEqual({ ids: ['x'] });
    expect(warnings).toHaveLength(1);
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it('机器级文件夹不与任何工作区混在一起', () => {
    const store = createWorkspaceStore({ root });
    store.machine('panels').write('released.json', { ids: ['x'] });
    expect(store.machine('panels').dir).toBe(path.join(root, '_machine', 'panels'));
    expect(store.for('panels', '/w/a').read('released.json')).toBeNull();
  });
});
