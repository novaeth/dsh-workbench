import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pluginDirOf, pluginNameOf } from './plugin-name';

const roots: string[] = [];

function temp(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-plugin-name-'));
  roots.push(root);
  return root;
}

function pluginAt(dir: string, manifest: unknown, files: readonly string[] = ['list.js']): string {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'opencli-plugin.json'), JSON.stringify(manifest), 'utf8');
  for (const file of files) fs.writeFileSync(path.join(dir, file), 'x', 'utf8');
  return dir;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  delete process.env['DSH_HOME'];
});

describe('插件名住哪：记过就用记的，没记就现读一次', () => {
  it('台账记过名字 → 直接用（不摸盘）', () => {
    process.env['DSH_HOME'] = temp();
    expect(pluginNameOf({ package: 'opencli-plugin-inventory', name: 'inventory' })).toBe('inventory');
  });

  it('★ 来源上的那一份落在 plugins-npm/node_modules/<包名>（与安装器同一个落点）', () => {
    const home = temp();
    process.env['DSH_HOME'] = home;
    pluginAt(path.join(home, 'workbench', 'opencli', 'plugins-npm', 'node_modules', '@a/plugin'), { name: 'mine' });

    expect(pluginDirOf({ package: '@a/plugin' })).toBe(
      path.join(home, 'workbench', 'opencli', 'plugins-npm', 'node_modules', '@a/plugin'),
    );
    expect(pluginNameOf({ package: '@a/plugin' })).toBe('mine');
  });

  it('★ 本地目录装的那一份：包名列里存的就是那个目录', () => {
    const at = pluginAt(temp(), { name: 'local-one' });

    expect(pluginDirOf({ package: at, local: true })).toBe(at);
    expect(pluginNameOf({ package: at, local: true })).toBe('local-one');
  });

  it('★ 读不出来就是读不出来（清单不在 / 解不开 / 没有命令文件 / 名字是空的）—— 不拿包名冒充', () => {
    const home = temp();
    process.env['DSH_HOME'] = home;
    const vendor = path.join(home, 'workbench', 'opencli', 'plugins-npm', 'node_modules');
    pluginAt(path.join(vendor, 'no-command'), { name: 'x' }, []);
    pluginAt(path.join(vendor, 'no-name'), {});
    fs.mkdirSync(path.join(vendor, 'bad-json'), { recursive: true });
    fs.writeFileSync(path.join(vendor, 'bad-json', 'opencli-plugin.json'), '{ 坏掉的', 'utf8');
    fs.writeFileSync(path.join(vendor, 'bad-json', 'list.js'), 'x', 'utf8');

    expect(pluginNameOf({ package: 'missing' })).toBeUndefined();
    expect(pluginNameOf({ package: 'no-command' })).toBeUndefined();
    expect(pluginNameOf({ package: 'no-name' })).toBeUndefined();
    expect(pluginNameOf({ package: 'bad-json' })).toBeUndefined();
  });

  it('清单里的名字两边留白也算没写（它进不了 opencli 的注册表）', () => {
    const home = temp();
    process.env['DSH_HOME'] = home;
    pluginAt(path.join(home, 'workbench', 'opencli', 'plugins-npm', 'node_modules', 'blank'), { name: '   ' });

    expect(pluginNameOf({ package: 'blank' })).toBeUndefined();
  });
});
