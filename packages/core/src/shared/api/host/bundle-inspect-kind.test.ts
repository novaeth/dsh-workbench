import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared';
import { OPENCLI_MANIFEST_FILE } from '@dsh-workbench/shared/host';
import { resetPackageRouteCache } from '@dsh-workbench/adapter-supply';
import { bundleInspectHandler } from './bundle-routes';

function fakeContext(manager: unknown, shell?: unknown): DshHostContext {
  const known: Record<string, unknown> = { pluginManager: manager };
  if (shell !== undefined) known.shell = shell;
  return { get: (name: string) => known[name] } as unknown as DshHostContext;
}

const MANAGER = {
  installBundle: async () => ({ application: 'applied', stage: 'install', changed: true, target: 'x' }),
  removeBundle: async () => ({ application: 'applied', stage: 'remove', changed: true, target: 'x' }),
};

describe('装机预检：dsh 拒了也自己按内容再判一次（插件那条正门）', () => {
  const RESOLVED = 'https://npm.example.com/team/';

  function fixtureDir(files: Readonly<Record<string, unknown>>): { dir: string; cleanup: () => void } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-inspect-kind-'));
    for (const [name, body] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
    }
    return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
  }

  function packShell(options: { readonly view?: string; readonly files?: Readonly<Record<string, string>> }): {
    shell: unknown;
    commands: string[];
  } {
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
          stdout = options.view ?? '';
          exitCode = options.view === undefined ? 1 : 0;
        } else if (command.startsWith('npm pack')) {
          const packTo = /--pack-destination '([^']+)'/.exec(command)?.[1] ?? '';
          fs.writeFileSync(path.join(packTo, 'demo-1.0.0.tgz'), 'tgz');
          stdout = '[{"filename":"demo-1.0.0.tgz"}]';
        } else {
          const unpackTo = /-C '([^']+)'/.exec(command)?.[1] ?? '';
          for (const [name, body] of Object.entries(options.files ?? {})) {
            const target = path.join(unpackTo, 'package', name);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, body, 'utf8');
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
    };
    return { shell, commands };
  }

  function refusedContext(options: {
    readonly view?: string;
    readonly files?: Readonly<Record<string, string>>;
    readonly problem?: string;
    readonly reason?: string;
  }): { ctx: DshHostContext; commands: string[] } {
    const built = packShell(options);
    const ctx = fakeContext(
      {
        ...MANAGER,
        registries: async () => ({ registry: null, fallbackRegistries: [], resolved: RESOLVED }),
        inspect: async () => ({
          status: 'refused',
          problem: options.problem ?? 'not-a-bundle',
          reason: options.reason ?? '这个包没有声明组合包，无法作为模块安装',
        }),
      },
      built.shell,
    );
    return { ctx, commands: built.commands };
  }

  beforeEach(() => {
    resetPackageRouteCache();
  });

  it('★ 拒了 + 按内容判成 opencli 插件 → 回插件态（不是 dsh 那句 not-a-bundle）', async () => {
    const { dir, cleanup } = fixtureDir({
      'package.json': { name: 'opencli-plugin-dashboards', version: '1.0.16' },
      [OPENCLI_MANIFEST_FILE]: { name: 'dashboards' },
      'commands.js': 'x',
    });
    try {
      const { ctx } = refusedContext({});

      expect(await bundleInspectHandler(ctx)(new URLSearchParams({ spec: dir }))).toEqual({
        ok: true,
        inspection: {
          status: 'plugin',
          pkg: 'opencli-plugin-dashboards',
          registry: RESOLVED,
          pluginName: 'dashboards',
        },
      });
    } finally {
      cleanup();
    }
  });

  it('★ 按包名来的也一样：元数据里没有信号就把包拉下来看内容，版本从 spec 带过来', async () => {
    const { ctx, commands } = refusedContext({
      view: '{}',
      files: {
        'package.json': '{"name":"opencli-plugin-dashboards"}',
        'opencli-plugin.json': '{"name":"dashboards"}',
        'commands.js': 'x',
      },
    });

    expect(
      await bundleInspectHandler(ctx)(new URLSearchParams({ spec: 'opencli-plugin-dashboards@1.0.16' })),
    ).toEqual({
      ok: true,
      inspection: {
        status: 'plugin',
        pkg: 'opencli-plugin-dashboards',
        registry: RESOLVED,
        pluginName: 'dashboards',
        version: '1.0.16',
      },
    });
    expect(commands.some((line) => line.includes('npm pack'))).toBe(true);
  });

  it('★ 判不出来就照旧交回 dsh 的结论：普通包 / 读不动的目录 / git / tarball', async () => {
    const plain = fixtureDir({ 'package.json': { name: 'some-plain-package' } });
    const empty = fixtureDir({ 'readme.md': 'not a package' });
    try {
      const { ctx } = refusedContext({
        problem: 'not-a-bundle',
        reason: '这个包没有声明组合包，无法作为模块安装',
      });
      const expected = {
        ok: true,
        inspection: {
          status: 'refused',
          problem: 'not-a-bundle',
          reason: '这个包没有声明组合包，无法作为模块安装',
        },
      };

      for (const spec of [
        plain.dir,
        empty.dir,
        path.join(os.tmpdir(), 'wb-inspect-kind-nope'),
        'github:o/r',
        'https://example.test/a.tgz',
      ]) {
        expect(await bundleInspectHandler(ctx)(new URLSearchParams({ spec })), spec).toEqual(expected);
      }
    } finally {
      plain.cleanup();
      empty.cleanup();
    }
  });

  it('★ 只在"拒了"那一支插一脚：dsh 认了的照旧按 dsh 走（不抢它的结论）', async () => {
    const { dir, cleanup } = fixtureDir({
      'package.json': { name: 'both-a', dsh: { bundle: {} } },
      [OPENCLI_MANIFEST_FILE]: { name: 'botha' },
      'commands.js': 'x',
    });
    try {
      const ctx = fakeContext(
        {
          ...MANAGER,
          registries: async () => ({ registry: null, fallbackRegistries: [], resolved: RESOLVED }),
          inspect: async () => ({
            status: 'accepted',
            kind: 'path',
            name: 'both-a',
            bundle: true,
            registry: null,
          }),
        },
        packShell({}).shell,
      );

      expect(await bundleInspectHandler(ctx)(new URLSearchParams({ spec: dir }))).toEqual({
        ok: true,
        inspection: { status: 'accepted', kind: 'path', name: 'both-a', bundle: true, registry: null },
      });
    } finally {
      cleanup();
    }
  });

  it('★ accepted + 内容里两样都没有 → 还是老那句 not-a-module-or-plugin（这条判据没被放松）', async () => {
    const { dir, cleanup } = fixtureDir({ 'package.json': { name: 'plain-module' } });
    try {
      const ctx = fakeContext(
        {
          ...MANAGER,
          registries: async () => ({ registry: null, fallbackRegistries: [], resolved: RESOLVED }),
          inspect: async () => ({
            status: 'accepted',
            kind: 'path',
            name: 'plain-module',
            bundle: null,
            registry: null,
          }),
        },
        packShell({}).shell,
      );

      expect(await bundleInspectHandler(ctx)(new URLSearchParams({ spec: dir }))).toMatchObject({
        ok: true,
        inspection: { status: 'refused', problem: 'not-a-module-or-plugin' },
      });
    } finally {
      cleanup();
    }
  });
});
