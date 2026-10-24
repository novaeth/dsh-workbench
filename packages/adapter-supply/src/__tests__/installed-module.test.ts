import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared';
import {
  createDeclarationLookup,
  declarationGaps,
  declaredPluginCommands,
  isLocalDependencySpec,
  isPackageName,
  isPackedArtifactSpec,
  packageVersionAt,
  profileDirOf,
  profileModules,
  readInstalledModule,
  readProfilePackage,
} from '../index.js';

const dirs: string[] = [];

function profileWith(pkg: string, manifest: unknown): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-installed-'));
  dirs.push(root);
  const dir = path.join(root, 'node_modules', pkg);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest), 'utf8');
  return root;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('装进来的包是不是工作台模块（读它自己的自述）', () => {
  it('有 dsh.workbench.unit → module，并带上版本', () => {
    const root = profileWith('@dsh-workbench/module-hello', {
      name: '@dsh-workbench/module-hello',
      version: '0.1.2',
      dsh: { workbench: { unit: 'hello' }, bundle: { patch: './cordis.patch.yml' } },
    });
    expect(readInstalledModule(root, '@dsh-workbench/module-hello')).toEqual({
      kind: 'module',
      pkg: '@dsh-workbench/module-hello',
      unit: 'hello',
      version: '0.1.2',
    });
  });

  it('是 dsh 插件但不是工作台模块 → not-module（能说清，不是"读不到"）', () => {
    const root = profileWith('@deepseek-ai/dsh-client-ui-theme', {
      name: '@deepseek-ai/dsh-client-ui-theme',
      dsh: { client: { platform: 'web' } },
    });
    expect(readInstalledModule(root, '@deepseek-ai/dsh-client-ui-theme')).toEqual({
      kind: 'not-module',
      pkg: '@deepseek-ai/dsh-client-ui-theme',
    });
  });

  it('包不在 / 自述坏了 → unknown（结论缺失，不冒充"不是"）', () => {
    const root = profileWith('@a/b', { name: '@a/b' });
    fs.writeFileSync(path.join(root, 'node_modules', '@a', 'b', 'package.json'), '{ 坏掉的 json', 'utf8');
    expect(readInstalledModule(root, '@a/b')).toEqual({ kind: 'unknown', pkg: '@a/b' });
    expect(readInstalledModule(root, '@a/missing')).toEqual({ kind: 'unknown', pkg: '@a/missing' });
    expect(readInstalledModule(null, '@a/b')).toEqual({ kind: 'unknown', pkg: '@a/b' });
  });

  it('dsh.workbench 在但 unit 是空的 → not-module（没声明 unit 就等于不算模块）', () => {
    const root = profileWith('@a/b', { name: '@a/b', dsh: { workbench: {} } });
    expect(readInstalledModule(root, '@a/b')).toEqual({ kind: 'not-module', pkg: '@a/b' });
  });

  it('包名判据挡住路径穿越（pkg 会从 HTTP 进来）', () => {
    expect(isPackageName('@dsh-workbench/module-hello')).toBe(true);
    expect(isPackageName('dsh-workbench')).toBe(true);
    expect(isPackageName('../../etc/passwd')).toBe(false);
    expect(isPackageName('@a/../../b')).toBe(false);
    expect(isPackageName('UPPER')).toBe(false);
    expect(isPackageName('@a/')).toBe(false);
    expect(isPackageName('a'.repeat(215))).toBe(false);
    const root = profileWith('@a/b', { name: '@a/b', dsh: { workbench: { unit: 'x' } } });
    expect(readInstalledModule(root, '../../../etc/passwd')).toEqual({ kind: 'unknown', pkg: '../../../etc/passwd' });
  });

  it('profile 目录取自 profileContext.dir（没有就说没有，不猜环境变量）', () => {
    const ctx = (dir: unknown): DshHostContext =>
      ({ get: (name: string) => (name === 'profileContext' ? { dir } : undefined) }) as unknown as DshHostContext;
    expect(profileDirOf(ctx('/Users/x/.dsh/profiles/workbench'))).toBe('/Users/x/.dsh/profiles/workbench');
    expect(profileDirOf(ctx('  '))).toBeNull();
    expect(profileDirOf(ctx(7))).toBeNull();
    expect(profileDirOf({ get: () => undefined } as unknown as DshHostContext)).toBeNull();
  });
});

describe('profile 里装了哪些工作台模块（unit → 包名，卸载前必须问到）', () => {
  function profile(bundles: unknown, deps: Record<string, string>, packages: Record<string, unknown>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-profile-'));
    dirs.push(root);
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'dsh-profile-workbench', dsh: { profile: { bundles } }, dependencies: deps }),
      'utf8',
    );
    for (const [pkg, manifest] of Object.entries(packages)) {
      const dir = path.join(root, 'node_modules', pkg);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest), 'utf8');
    }
    return root;
  }

  it('按 dsh.profile.bundles 走，只留声明了 dsh.workbench 的包', () => {
    const root = profile(
      ['@deepseek-ai/dsh-base', '@dsh-workbench/core', '@dsh-workbench/module-hello'],
      { '@dsh-workbench/module-hello': '^0.1.2' },
      {
        '@dsh-workbench/core': { name: '@dsh-workbench/core', version: '0.1.2' },
        '@dsh-workbench/module-hello': {
          name: '@dsh-workbench/module-hello',
          version: '0.1.2',
          dsh: { workbench: { unit: 'hello' } },
        },
      },
    );
    expect(profileModules(root)).toEqual([
      { pkg: '@dsh-workbench/module-hello', unit: 'hello', version: '0.1.2', local: false },
    ]);
  });

  it('没有 bundles 清单就退回 dependencies 的键（老 profile 也认）', () => {
    const root = profile(undefined, { '@a/mod': '^1.0.0' }, {
      '@a/mod': { name: '@a/mod', version: '1.2.0', dsh: { workbench: { unit: 'mod' } } },
    });
    expect(profileModules(root)).toEqual([
      { pkg: '@a/mod', unit: 'mod', version: '1.2.0', local: false },
    ]);
  });

  it('★ link: 装进来的记成 local（DIY 工坊那种）', () => {
    const root = profile(
      ['@deepseek-ai/dsh-base', '@dsh-workbench/module-wallet'],
      {
        '@dsh-workbench/module-wallet':
          'link:/Users/x/.dsh/workbench/diy/packages/module-wallet',
      },
      {
        '@dsh-workbench/module-wallet': {
          name: '@dsh-workbench/module-wallet',
          version: '0.1.0',
          dsh: { workbench: { unit: 'wallet' } },
        },
      },
    );
    expect(profileModules(root)).toEqual([
      { pkg: '@dsh-workbench/module-wallet', unit: 'wallet', version: '0.1.0', local: true },
    ]);
  });

  it('profile 目录没有 / 读不到 → 空数组，不抛', () => {
    expect(profileModules(null)).toEqual([]);
    expect(profileModules('/nope/never')).toEqual([]);
  });
});

describe('引用可信不可信：装进来的模块，它的说明都得读得出来', () => {
  function profile(bundles: readonly string[], packages: Record<string, unknown>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-gaps-'));
    dirs.push(root);
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'dsh-profile-workbench', dsh: { profile: { bundles } }, dependencies: {} }),
      'utf8',
    );
    for (const [pkg, manifest] of Object.entries(packages)) {
      const dir = path.join(root, 'node_modules', pkg);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest), 'utf8');
    }
    return root;
  }

  const DONE = {
    name: '@a/done',
    version: '1.0.0',
    dsh: {
      workbench: {
        apiVersion: 1,
        unit: 'done',
        card: null,
        tools: [],
        host: { inject: [] },
      },
    },
  };

  it('★ 全部读得出来 → 一条都没有（引用可信，物理删才敢做）', () => {
    const root = profile(['@deepseek-ai/dsh-base', '@a/done'], {
      '@a/done': DONE,
      '@dsh-workbench/core': { name: '@dsh-workbench/core', version: '1.0.0' },
    });
    expect(declarationGaps(root)).toEqual([]);
  });

  it('★ 协议前的模块（有 unit、没有静态半）→ 点它的名，说清缺什么', () => {
    const root = profile(['@a/mod'], {
      '@a/mod': { name: '@a/mod', version: '0.1.9', dsh: { workbench: { unit: 'mod' } } },
    });

    const gaps = declarationGaps(root) ?? [];
    expect(gaps.map((gap) => gap.pkg)).toEqual(['@a/mod']);
    expect(gaps[0]?.problems.join('；')).toContain('apiVersion');
  });

  it('壳自己（bundle 但没有 unit）与 dsh 自带的那几个都不算：它们不是"装进来的模块"', () => {
    const root = profile(['@deepseek-ai/dsh-base', '@dsh-workbench/core', '@deepseek-ai/dsh-web-app'], {
      '@dsh-workbench/core': { name: '@dsh-workbench/core', version: '1.0.0', dsh: { bundle: { patch: './x.yml' } } },
    });
    expect(profileModules(root)).toEqual([]);
    expect(declarationGaps(root)).toEqual([]);
  });

  it('★ 读不到这份 profile（没有目录 / package.json 解不开）→ undefined（不是"空"）', () => {
    expect(declarationGaps(null)).toBeUndefined();
    expect(declarationGaps('/nope/never')).toBeUndefined();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-gaps-broken-'));
    dirs.push(root);
    fs.writeFileSync(path.join(root, 'package.json'), '{ 坏掉的 json', 'utf8');
    expect(declarationGaps(root)).toBeUndefined();
  });
});

describe('★ 已装模块声明过哪些 opencli 命令（合成插件工具时要按它去重）', () => {
  function profile(packages: Record<string, unknown>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-declared-'));
    dirs.push(root);
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'dsh-profile-workbench',
        dsh: { profile: { bundles: Object.keys(packages) } },
        dependencies: {},
      }),
      'utf8',
    );
    for (const [pkg, manifest] of Object.entries(packages)) {
      const dir = path.join(root, 'node_modules', pkg);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest), 'utf8');
    }
    return root;
  }

  function moduleWith(unit: string, plugins: readonly { name: string; commands?: readonly string[] }[]) {
    return {
      name: `@a/${unit}`,
      version: '1.0.0',
      dsh: {
        workbench: {
          apiVersion: 1,
          unit,
          card: null,
          tools: [],
          host: { inject: [] },
          env: { plugins },
        },
      },
    };
  }

  it('★ 两个模块声明同一个插件 ⇒ 命令并成一份（按插件名合）', () => {
    const root = profile({
      '@a/one': moduleWith('one', [{ name: 'inventory', commands: ['builds', 'build'] }]),
      '@a/two': moduleWith('two', [{ name: 'inventory', commands: ['build', 'envs'] }, { name: 'demo', commands: ['issues'] }]),
    });

    const declared = declaredPluginCommands(root);

    expect([...declared.keys()].sort()).toEqual(['demo', 'inventory']);
    expect([...declared.get('inventory')!].sort()).toEqual(['build', 'builds', 'envs']);
    expect([...declared.get('demo')!]).toEqual(['issues']);
  });

  it('没声明 env.plugins 的模块 / 读不到的 profile ⇒ 空表（不是报错）', () => {
    const root = profile({ '@a/plain': moduleWith('plain', []) });
    expect(declaredPluginCommands(root).size).toBe(0);
    expect(declaredPluginCommands(null).size).toBe(0);
    expect(declaredPluginCommands('/nope/never').size).toBe(0);
  });
});

describe('读 profile 里某一份包（工作台自己那一行要的：版本 / 源 / 是不是本仓那份）', () => {
  function profile(spec: string, version: string | undefined, extra: Record<string, unknown> = {}): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-selfpkg-'));
    dirs.push(root);
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'dsh-profile-workbench',
        dsh: { profile: { bundles: ['@dsh-workbench/core'] } },
        dependencies: { '@dsh-workbench/core': spec },
      }),
      'utf8',
    );
    const at = path.join(root, 'node_modules', '@dsh-workbench', 'core');
    fs.mkdirSync(at, { recursive: true });
    fs.writeFileSync(
      path.join(at, 'package.json'),
      JSON.stringify({ name: '@dsh-workbench/core', ...(version === undefined ? {} : { version }), ...extra }),
      'utf8',
    );
    return root;
  }

  it('把版本、源与"是不是本仓那份"一次读出来（源优先自述里的 publishConfig）', () => {
    const root = profile('^0.1.18', '0.1.19', { publishConfig: { registry: 'https://r.example/' } });

    expect(readProfilePackage(root, '@dsh-workbench/core')).toEqual({
      pkg: '@dsh-workbench/core',
      version: '0.1.19',
      registry: 'https://r.example/',
    });
  });

  it('★ link: / 目录装的算本仓那份（不然开发副本也会被劝着"从源上更新"）', () => {
    for (const [spec, local] of [
      ['link:/Users/x/dsh-workbench/packages/core', true],
      ['file:../packages/core', true],
      ['./workbench', true],
      ['../core', true],
      ['/Users/x/workbench', true],
      ['^0.1.18', false],
      ['0.1.18', false],
    ] as const) {
      expect(isLocalDependencySpec(spec), spec).toBe(local);
      expect(readProfilePackage(profile(spec, '0.1.18'), '@dsh-workbench/core')?.local, spec).toBe(
        local ? true : undefined,
      );
    }
  });

  it('★ 从打好的包装的（file:*.tgz）**不算**本仓那份：它是发布产物，能比源上、也该让人更新', () => {
    for (const spec of [
      'file:/tmp/wb-pkg/dsh-workbench-core-0.3.8.tgz',
      'file:../core-core-0.3.8.tgz',
      './workbench-core-0.3.8.tgz',
      '/Users/x/workbench-core-0.3.8.tgz',
      'file:../core-core-0.3.8.tar.gz',
    ]) {
      expect(isPackedArtifactSpec(spec), spec).toBe(true);
      expect(isLocalDependencySpec(spec), spec).toBe(false);
      expect(readProfilePackage(profile(spec, '0.1.18'), '@dsh-workbench/core')?.local, spec).toBeUndefined();
    }
    expect(isPackedArtifactSpec('file:../packages/core')).toBe(false);
    expect(isPackedArtifactSpec('link:/Users/x/dsh-workbench/packages/core')).toBe(false);
  });

  it('没这份包 / 自述里没版本 → undefined（结论缺失，不冒充 0.0.0）', () => {
    expect(readProfilePackage(profile('^0.1.18', undefined), '@dsh-workbench/core')).toBeUndefined();
    expect(readProfilePackage(profile('^0.1.18', '0.1.18'), '@dsh-workbench/other')).toBeUndefined();
    expect(readProfilePackage(null, '@dsh-workbench/core')).toBeUndefined();
  });

  it('从某个包根读它自己的版本（宿主用它记"跑着的那份"）', () => {
    const root = profile('^0.1.18', '0.1.18');
    expect(packageVersionAt(root)).toBeUndefined();
    expect(packageVersionAt(path.join(root, 'node_modules', '@dsh-workbench', 'core'))).toBe('0.1.18');
    expect(packageVersionAt('/nope/never')).toBeUndefined();
  });
});

describe('createDeclarationLookup（unit → 声明来源；名单是懒的，不是启动快照）', () => {
  function profileRoot(bundles: readonly string[]): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-lookup-'));
    dirs.push(root);
    writeProfile(root, bundles);
    return root;
  }

  function writeProfile(root: string, bundles: readonly string[]): void {
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'dsh-profile-test',
        dsh: { profile: { bundles } },
        dependencies: Object.fromEntries(bundles.map((pkg) => [pkg, 'link:'])),
      }),
      'utf8',
    );
  }

  function installModule(root: string, pkg: string, unit: string): void {
    const dir = path.join(root, 'node_modules', pkg);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: pkg, version: '0.1.0', dsh: { workbench: { unit } } }),
      'utf8',
    );
  }

  it('装着的 → 给出包名与它自述里那段 dsh.workbench', () => {
    const root = profileRoot(['@acme/module-delivery']);
    installModule(root, '@acme/module-delivery', 'delivery');

    expect(createDeclarationLookup(root)('delivery')).toEqual({
      pkg: '@acme/module-delivery',
      declaration: { unit: 'delivery' },
    });
  });

  it('★ 第一次问的时候还没装、装进来之后再问就找得到（热装的那种：不用等重启）', () => {
    const root = profileRoot(['@dsh-workbench/core']);
    const lookup = createDeclarationLookup(root);

    expect(lookup('delivery')).toBeUndefined();

    writeProfile(root, ['@dsh-workbench/core', '@acme/module-delivery']);
    installModule(root, '@acme/module-delivery', 'delivery');

    expect(lookup('delivery')?.pkg).toBe('@acme/module-delivery');
  });

  it('真没装 → undefined（重扫也不编一个出来）', () => {
    const root = profileRoot(['@dsh-workbench/core']);

    expect(createDeclarationLookup(root)('delivery')).toBeUndefined();
  });

  it('profile 读不到（null）→ 一律 undefined，不抛', () => {
    expect(createDeclarationLookup(null)('delivery')).toBeUndefined();
  });
});
