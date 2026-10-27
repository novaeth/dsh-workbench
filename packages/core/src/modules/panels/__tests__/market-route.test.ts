import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DshShell } from '@dsh-workbench/shared';
import { createWorkspaceStore } from '@dsh-workbench/shared/host';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import type { BundleChange, BundleInstallRequest } from '@/kernel/contract/bundle-install';
import type { BundleManager } from '@dsh-workbench/shared/host';
import { OPENCLI_MANIFEST_FILE, refusalReason } from '@dsh-workbench/adapters-default';
import { resetPackageRouteCache } from '@dsh-workbench/adapters-default';
import { createMarketService } from '../model/market';
import { bundleNameOf, installRouted, type BundleInstallDeps } from '../model/market-route';
import type { BundleInstallOutcome } from '../model/market-types';
import { createPluginLedger, type PluginLedger } from '../model/plugin-ledger';

const REGISTRY = 'https://npm.example.com/team/';
const roots: string[] = [];

function dirOf(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-market-route-'));
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

function pluginFixture(): string {
  const at = dirOf('plugin-a');
  put(at, 'package.json', { name: '@t/plugin-a', version: '1.0.0' });
  put(at, OPENCLI_MANIFEST_FILE, { name: 'plugina' });
  put(at, 'list.js', 'x');
  return at;
}

function bothFixture(): string {
  const at = dirOf('both-a');
  put(at, 'package.json', { name: '@t/both-a', dsh: { bundle: {} } });
  put(at, OPENCLI_MANIFEST_FILE, { name: 'botha' });
  put(at, 'list.js', 'x');
  return at;
}

function plainFixture(): string {
  const at = dirOf('plain');
  put(at, 'package.json', { name: '@t/plain' });
  return at;
}

function change(spec: string): BundleChange {
  return { application: 'applied', stage: 'install', changed: true, target: spec, bundle: spec };
}

function bundlesOf(): { manager: BundleManager; install: ReturnType<typeof vi.fn> } {
  const install = vi.fn(async (request: BundleInstallRequest) => change(request.spec));
  const manager: BundleManager = {
    registries: async () => null,
    inspect: async () => null,
    install,
    remove: async () => null,
    cancel: async () => null,
  };
  return { manager, install };
}

function packingShell(view: string): { shell: DshShell; commands: string[] } {
  const commands: string[] = [];
  const shell = {
    resolve: (request: { readonly command: string }) => {
      commands.push(request.command);
      return request;
    },
    execute: async (spec: { readonly command?: string }) => {
      const command = String(spec?.command ?? '');
      let exitCode = 0;
      let stdout = '';
      if (command.startsWith('npm view')) {
        stdout = view;
      } else {
        const packTo = /--pack-destination '([^']+)'/.exec(command)?.[1];
        const unpackTo = /-C '([^']+)'/.exec(command)?.[1];
        if (packTo !== undefined) {
          fs.writeFileSync(path.join(packTo, 'demo-1.0.0.tgz'), 'tgz');
          stdout = '[{"filename":"demo-1.0.0.tgz"}]';
        } else if (unpackTo !== undefined) {
          for (const [name, body] of Object.entries({
            'package.json': '{"name":"@t/demo"}',
            'opencli-plugin.json': '{"name":"demo"}',
            'list.js': 'x',
          })) {
            const target = path.join(unpackTo, 'package', name);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, body, 'utf8');
          }
        } else {
          exitCode = 1;
        }
      }
      return {
        result: async () => ({
          exitCode,
          timedOut: false,
          aborted: false,
          stdout: { text: stdout, truncated: false },
          stderr: { text: '', truncated: false },
        }),
      };
    },
  } as unknown as DshShell;
  return { shell, commands };
}

function rig(options: {
  readonly spec: string;
  readonly shell?: DshShell | undefined;
  readonly registry?: string | undefined;
  readonly ledger?: PluginLedger | undefined;
}): { deps: BundleInstallDeps; install: ReturnType<typeof vi.fn>; commands: string[] } {
  const commands: string[] = [];
  const { manager, install } = bundlesOf();
  return {
    install,
    commands,
    deps: {
      spec: options.spec,
      command: 'opencli',
      manager,
      installed: (pkg) => ({ kind: 'unknown', pkg }),
      runAll: async (steps) => {
        for (const step of steps) commands.push(step.line);
      },
      supplyAfter: async () => ({ state: 'no-needs' }),
      rememberSource: async () => {},
      ...(options.shell === undefined ? {} : { shell: options.shell }),
      ...(options.registry === undefined ? {} : { registry: options.registry }),
      ...(options.ledger === undefined ? {} : { ledger: options.ledger }),
    },
  };
}

function ledgerAt(home: string): PluginLedger {
  return createPluginLedger({ store: createWorkspaceStore({ root: dirOf('store') }), home });
}

beforeEach(() => {
  resetPackageRouteCache();
});

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('添加一个 spec：按内容判它是什么，再决定走哪条路', () => {
  it('★ 判成 opencli 插件 → 走我们自己的安装器，dsh 的安装管理器一次也不叫', async () => {
    const at = pluginFixture();
    const { deps, install, commands } = rig({ spec: at });

    const outcome: BundleInstallOutcome = await installRouted(deps);

    expect(install).not.toHaveBeenCalled();
    expect(commands).toEqual([`'opencli' plugin install '${at}'`]);
    expect(outcome.change).toMatchObject({ application: 'applied', stage: 'install' });
    expect(outcome.plugin).toEqual({ kind: 'opencli-plugin', pkg: '@t/plugin-a', name: 'plugina' });
    expect(outcome.supply).toEqual({ state: 'no-needs' });
  });

  it('★ 判成 dsh 扩展包 → 交回 installBundle，原样的 spec（带版本）一个字不改', async () => {
    const { shell, commands: shellCommands } = packingShell('{"bundle":{}}');
    const { deps, install, commands } = rig({ spec: '@t/mod@1.2.3', shell, registry: REGISTRY });

    const outcome = await installRouted({ ...deps, options: { registry: REGISTRY } });

    expect(install).toHaveBeenCalledTimes(1);
    expect(install.mock.calls[0]?.[0]).toEqual({ spec: '@t/mod@1.2.3', registry: REGISTRY });
    expect(shellCommands).toHaveLength(1);
    expect(shellCommands.some((line) => line.includes('npm pack'))).toBe(false);
    expect(commands).toEqual([]);
    expect(outcome.plugin).toBeUndefined();
  });

  it('★ 两样都有 → 按 dsh 走，且只装一遍（不给自己再装一次）', async () => {
    const at = bothFixture();
    const { deps, install, commands } = rig({ spec: at });

    const outcome = await installRouted(deps);

    expect(install).toHaveBeenCalledTimes(1);
    expect(install.mock.calls[0]?.[0]).toEqual({ spec: at });
    expect(commands).toEqual([]);
    expect(outcome.plugin).toBeUndefined();
    expect(outcome.change.application).toBe('applied');
  });

  it('★ 源上的包判成插件 → 走 plugin-source 的 npm 分支（装进 plugins-npm 再让 opencli 认它）', async () => {
    const { shell } = packingShell('{}');
    const ledger = ledgerAt('/tmp/wb-route-home/workbench/opencli/home');
    const { deps, install, commands } = rig({ spec: '@t/demo@1.0.0', shell, registry: REGISTRY, ledger });

    const outcome = await installRouted(deps);

    expect(install).not.toHaveBeenCalled();
    expect(commands[0]).toContain('npm i --prefix');
    expect(commands.at(-1)).toContain("'opencli' plugin install");
    expect(outcome.plugin).toEqual({ kind: 'opencli-plugin', pkg: '@t/demo', name: 'demo' });
    expect(ledger.read('@t/demo')).toMatchObject({ package: '@t/demo', registry: REGISTRY });
    expect(ledger.read('@t/demo')?.local).toBeUndefined();
  });

  it('★ 都不是 → 拒（记一笔、不抛），dsh 与 opencli 两边都不动', async () => {
    const { deps, install, commands } = rig({ spec: plainFixture() });

    const outcome = await installRouted(deps);

    expect(install).not.toHaveBeenCalled();
    expect(commands).toEqual([]);
    expect(outcome.change).toMatchObject({
      application: 'failed',
      stage: 'install',
      changed: false,
      target: '@t/plain',
      errorCode: 'not-a-module-or-plugin',
      errorDetail: refusalReason(),
    });
    expect(outcome.supply).toEqual({ state: 'no-needs' });
    expect(outcome.plugin).toBeUndefined();
  });

  it('★ 读不动 / 没有源 → 判不了就交给 dsh（fail-open：判据不许变成拒因）', async () => {
    const empty = dirOf('no-package-json');
    const missing = rig({ spec: empty });
    const noRegistry = rig({ spec: '@t/mod' });

    await expect(installRouted(missing.deps)).resolves.toMatchObject({ change: { application: 'applied' } });
    expect(missing.install).toHaveBeenCalledTimes(1);
    await expect(installRouted(noRegistry.deps)).resolves.toMatchObject({ change: { application: 'applied' } });
    expect(noRegistry.install).toHaveBeenCalledTimes(1);
  });

  it('★ 拒因是给人看的：外壳 / 协议 / 声明 / 清单 / apiVersion 一个都不出现', () => {
    const banned = ['外壳', '协议', '声明', '清单', 'apiVersion'];
    const text = refusalReason();

    for (const word of banned) expect(text, word).not.toContain(word);
    expect(text).toContain('opencli');
  });
});

describe('从安装结果里认包名：git 源那种 spec 不许在 path 的 @ 上乱切', () => {
  const failed = (over: Partial<BundleChange> = {}): BundleChange =>
    ({ application: 'failed', stage: 'install', changed: false, target: '', ...over }) as BundleChange;

  it('★ path 里带 scope 时，包名就是路径末段（不是把 spec 从 @ 处切一半）', () => {
    const spec =
      'git+ssh://git@host/org/repo.git#0123456789012345678901234567890123456789&path:/packages/@dsh-workbench/module-mcp';
    expect(bundleNameOf(failed(), spec)).toBe('@dsh-workbench/module-mcp');
  });

  it('path 不带 scope 也给得对；dsh 回了 bundle 就听 dsh 的', () => {
    const spec = 'git+https://host/org/repo.git#0123456789012345678901234567890123456789&path:/packages/module-x';
    expect(bundleNameOf(failed(), spec)).toBe('module-x');
    expect(bundleNameOf(failed({ bundle: '@t/real' }), spec)).toBe('@t/real');
  });

  it('npm 那种带版本的 spec 照旧按最后一个 @ 切', () => {
    expect(bundleNameOf(failed(), '@t/module@1.2.3')).toBe('@t/module');
    expect(bundleNameOf(failed(), '@t/module')).toBe('@t/module');
  });
});

describe('接线：市场那条路交给路由，且没有插件管理器时还是先说那句话', () => {
  it('★ 装一个本地插件目录：管理器一次不叫，命令走我们自己的安装器', async () => {
    const at = pluginFixture();
    const fake = createFakeShell([{ stdout: '' }]);
    const { manager, install } = bundlesOf();
    const market = createMarketService({ manifests: [], shell: fake.shell, bundles: manager });

    const outcome = await market.installBundle(at);

    expect(install).not.toHaveBeenCalled();
    expect(fake.commands()).toEqual([`'opencli' plugin install '${at}'`]);
    expect(outcome.plugin?.pkg).toBe('@t/plugin-a');
  });

  it('★ 没有插件管理器 → 还是先抛那句人话（路由不许把老错误吞掉）', async () => {
    const market = createMarketService({ manifests: [] });

    await expect(market.installBundle('@a/b')).rejects.toThrow(/没有插件管理器/);
  });
});
