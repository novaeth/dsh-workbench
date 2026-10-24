import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { insideRoot, modulesIn, readDesignOfModule, shapeOf, syncStateOf, toolchainOf } from '../diy-modules';

let root = '';
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-diy-modules-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const PACKAGES = (): string => path.join(root, 'packages');

function writeManifest(at: string, manifest: unknown): void {
  fs.mkdirSync(at, { recursive: true });
  fs.writeFileSync(path.join(at, 'package.json'), JSON.stringify(manifest));
}

function workspaceFile(body = 'packages:\n  - packages/*\n'): void {
  fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), body);
}

function scaffold(unit: string, description = `${unit} 的一句话`): string {
  const dir = path.join(PACKAGES(), `module-${unit}`);
  writeManifest(dir, {
    name: `@dsh-workbench/module-${unit}`,
    version: '0.0.0',
    private: true,
    description,
    dsh: { workbench: { unit } },
  });
  return dir;
}

describe('insideRoot', () => {
  it('工作区里是，外面不是（往上一级也不算）', () => {
    scaffold('demo');

    expect(insideRoot(root, path.join(PACKAGES(), 'module-demo'))).toBe(true);
    expect(insideRoot(root, path.join(root, '..'))).toBe(false);
    expect(insideRoot(root, path.join(os.tmpdir(), 'elsewhere'))).toBe(false);
  });

  it('★ 软链出工作区的不算（前缀比的是 realpath，不是字符串）', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-diy-outside-'));
    try {
      writeManifest(outside, { name: 'x', version: '0.0.0', dsh: { workbench: { unit: 'demo' } } });
      fs.mkdirSync(PACKAGES(), { recursive: true });
      fs.symlinkSync(outside, path.join(PACKAGES(), 'module-demo'), 'dir');

      expect(insideRoot(root, path.join(PACKAGES(), 'module-demo'))).toBe(false);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('modulesIn（模块按工作区自己的 workspace 配置找）', () => {
  it('读 pnpm-workspace.yaml 的 packages globs；只收声明了 dsh.workbench.unit 的包，按 unit 排序', () => {
    workspaceFile();
    scaffold('other');
    scaffold('demo');
    writeManifest(path.join(PACKAGES(), 'not-a-module'), { name: 'x', version: '0.0.0' });

    const modules = modulesIn(root);

    expect(modules.map((one) => one.unit)).toEqual(['demo', 'other']);
    expect(modules.find((one) => one.unit === 'demo')?.description).toBe('demo 的一句话');
  });

  it('★ 工作区根自己就是一个模块包也认', () => {
    writeManifest(root, { name: '@x/root-module', version: '0.0.0', dsh: { workbench: { unit: 'rootmod' } } });

    expect(modulesIn(root).map((one) => one.unit)).toEqual(['rootmod']);
  });

  it('★ 没有 pnpm-workspace.yaml ⇒ 只看工作区根，不猜 packages/（目录由工作区自己说）', () => {
    scaffold('demo');
    writeManifest(root, { name: 'x', version: '0.0.0' });

    expect(modulesIn(root)).toEqual([]);
  });

  it('装了没按传进来的 unit 名单标（不自己猜）', () => {
    workspaceFile();
    scaffold('demo');
    scaffold('other');

    const modules = modulesIn(root, ['other']);

    expect(modules.find((one) => one.unit === 'demo')?.installed).toBe(false);
    expect(modules.find((one) => one.unit === 'other')?.installed).toBe(true);
  });

  it('package.json 坏掉的那个目录跳过，不把整份名单带下水', () => {
    workspaceFile();
    scaffold('demo');
    fs.mkdirSync(path.join(PACKAGES(), 'broken'), { recursive: true });
    fs.writeFileSync(path.join(PACKAGES(), 'broken', 'package.json'), '{ 这不是 JSON');

    expect(modulesIn(root).map((one) => one.unit)).toEqual(['demo']);
  });

  it('glob 带 ** 或更怪的形状就跳过（不猜它想说什么）', () => {
    workspaceFile('packages:\n  - "packages/**"\n');
    scaffold('demo');

    expect(modulesIn(root)).toEqual([]);
  });
});

describe('npm / yarn 的 workspaces 也算声明（不只 pnpm）', () => {
  it('package.json 的 workspaces 数组', () => {
    writeManifest(root, { name: 'x', version: '0.0.0', workspaces: ['apps/*'] });
    writeManifest(path.join(root, 'apps', 'demo'), {
      name: '@dsh-workbench/module-demo',
      version: '0.0.0',
      dsh: { workbench: { unit: 'demo' } },
    });

    expect(modulesIn(root).map((one) => one.unit)).toEqual(['demo']);
  });

  it('package.json 的 workspaces.packages', () => {
    writeManifest(root, { name: 'x', version: '0.0.0', workspaces: { packages: ['libs/*'] } });
    writeManifest(path.join(root, 'libs', 'demo'), {
      name: '@dsh-workbench/module-demo',
      version: '0.0.0',
      dsh: { workbench: { unit: 'demo' } },
    });

    expect(modulesIn(root).map((one) => one.unit)).toEqual(['demo']);
  });
});

describe('shapeOf（只用来把话说清，不用来拒绝）', () => {
  it('声明了 workspace ⇒ workspace；有 package.json ⇒ package；都没有 ⇒ bare', () => {
    expect(shapeOf(root)).toBe('bare');

    writeManifest(root, { name: 'x', version: '0.0.0' });
    expect(shapeOf(root)).toBe('package');

    workspaceFile();
    expect(shapeOf(root)).toBe('workspace');
  });

  it('npm workspaces 也算 workspace', () => {
    writeManifest(root, { name: 'x', version: '0.0.0', workspaces: ['apps/*'] });

    expect(shapeOf(root)).toBe('workspace');
  });
});

describe('readDesignOfModule', () => {
  it('★ 有那份 design.json 就读回来；没有 / 坏了就 undefined（别把 throw 漏给上层）', () => {
    const dir = scaffold('demo');
    expect(readDesignOfModule(dir)).toBeUndefined();

    fs.writeFileSync(path.join(dir, 'design.json'), JSON.stringify({ writes: [{ command: 'POST /api/x' }] }));
    expect(readDesignOfModule(dir)).toEqual({ writes: [{ command: 'POST /api/x' }] });

    fs.writeFileSync(path.join(dir, 'design.json'), '{ 这不是 json');
    expect(readDesignOfModule(dir)).toBeUndefined();
  });
});

function writeSync(body: string): void {
  fs.writeFileSync(path.join(root, '.sync.json'), body);
}

describe('syncStateOf', () => {
  it('没有文件 = 还没有同步记录（不是错误，也不抛）', () => {
    expect(syncStateOf(root)).toBeUndefined();
  });

  it('坏 JSON / 不是对象 = undefined', () => {
    for (const body of ['', '{', '{ 这不是 JSON', '[1,2,3]', 'null']) {
      writeSync(body);
      expect(syncStateOf(root)).toBeUndefined();
    }
  });

  it('state 是没见过的值 = undefined（不把不认识的状态当状态说）', () => {
    writeSync('{"state":"weird","version":"0.3.0","at":"2026-10-18T00:00:00Z"}');

    expect(syncStateOf(root)).toBeUndefined();
  });

  it('三种态都认，reason 留原文、缺字段不编造', () => {
    writeSync('{"state":"failed","version":"0.3.0","at":"2026-10-18T00:00:00Z","reason":" 没有 pnpm "}');

    expect(syncStateOf(root)).toEqual({
      state: 'failed',
      version: '0.3.0',
      at: '2026-10-18T00:00:00Z',
      reason: '没有 pnpm',
    });

    writeSync('{"state":"syncing","version":"0.3.0","at":"2026-10-18T00:00:00Z"}');
    expect(syncStateOf(root)).toEqual({ state: 'syncing', version: '0.3.0', at: '2026-10-18T00:00:00Z' });

    writeSync('{"state":"ok","version":"0.3.0","at":"2026-10-18T00:00:00Z"}');
    expect(syncStateOf(root)?.state).toBe('ok');
  });
});

describe('toolchainOf', () => {
  function install(name: string, version: unknown): void {
    writeManifest(path.join(root, 'node_modules', '@dsh-workbench', name), {
      name: `@dsh-workbench/${name}`,
      version,
    });
  }

  it('三个包都在：一次给齐（T1 entry 的判据就是这三个）', () => {
    install('core', '0.2.9');
    install('module-tools', '0.2.9');
    install('shared', '0.2.9');

    expect(toolchainOf(root)).toEqual({ core: '0.2.9', moduleTools: '0.2.9', shared: '0.2.9' });
  });

  it('缺一个包 = undefined（读不到就是读不到，不拿半个当判据）', () => {
    install('core', '0.2.9');
    install('module-tools', '0.2.9');

    expect(toolchainOf(root)).toBeUndefined();
  });

  it('version 是空的 / 还没装 = undefined', () => {
    expect(toolchainOf(root)).toBeUndefined();

    install('core', '');
    install('module-tools', '0.2.9');
    install('shared', '0.2.9');
    expect(toolchainOf(root)).toBeUndefined();
  });
});
