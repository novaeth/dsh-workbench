import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared';
import { BUNDLE_REGISTRY_DEFAULT } from '@/kernel/contract/bundle-install';
import {
  bundleInspectHandler,
  bundleRegistriesHandler,
  moduleVersionsHandler,
  resetRefusalLog,
} from './bundle-routes';

function fakeContext(
  manager: unknown,
  dir?: string,
  logger?: { warn?(message: string): void },
  shell?: unknown,
): DshHostContext {
  const known: Record<string, unknown> = { pluginManager: manager };
  if (dir !== undefined) known.profileContext = { dir };
  if (shell !== undefined) known.shell = shell;
  return { get: (name: string) => known[name], ...(logger === undefined ? {} : { logger }) } as unknown as DshHostContext;
}

function fakeShell(versions: Readonly<Record<string, string>>): { shell: unknown; commands: string[] } {
  const commands: string[] = [];
  const shell = {
    resolve: (request: { readonly command: string }) => {
      commands.push(request.command);
      return request;
    },
    execute: async (spec: { readonly command?: string }) => {
      const command = String(spec?.command ?? '');
      const name = (/npm view (\S+)/.exec(command)?.[1] ?? '').replace(/^'|'$/g, '');
      const text = versions[name] ?? '';
      return {
        result: async () => ({
          exitCode: text === '' ? 1 : 0,
          timedOut: false,
          aborted: false,
          stdout: { text, truncated: false },
          stderr: { text: '', truncated: false },
        }),
      };
    },
  };
  return { shell, commands };
}

const MANAGER = {
  installBundle: async () => ({ application: 'applied', stage: 'install', changed: true, target: 'x' }),
  removeBundle: async () => ({ application: 'applied', stage: 'remove', changed: true, target: 'x' }),
};

describe('bundle 只读路由：源清单与装前预检', () => {
  it('源清单：没有管理器就说不可用，不抛', async () => {
    expect(await bundleRegistriesHandler(fakeContext(undefined))(new URLSearchParams())).toEqual({
      ok: true,
      available: false,
      registries: null,
    });
  });

  it('源清单：管理器在就归一', async () => {
    const ctx = fakeContext({
      ...MANAGER,
      registries: async () => ({ registry: 'https://r.example/', fallbackRegistries: [], resolved: null }),
    });
    expect(await bundleRegistriesHandler(ctx)(new URLSearchParams())).toEqual({
      ok: true,
      available: true,
      registries: { registry: 'https://r.example/', fallbackRegistries: [], resolved: null },
    });
  });

  it('预检：缺 spec 打回，且不去问管理器', async () => {
    let asked = 0;
    const ctx = fakeContext({
      ...MANAGER,
      inspect: async () => {
        asked += 1;
        return { status: 'accepted', kind: 'registry', registry: null, bundle: true };
      },
    });
    const result = await bundleInspectHandler(ctx)(new URLSearchParams());
    expect(result).toMatchObject({ ok: false, error: { code: 'workbench/no-spec' } });
    expect(asked).toBe(0);
  });

  it('预检：没有管理器就说清装不了', async () => {
    expect(await bundleInspectHandler(fakeContext(undefined))(new URLSearchParams({ spec: 'x' }))).toMatchObject({
      ok: false,
      error: { code: 'workbench/no-bundle-manager' },
    });
  });

  it('预检：registry 三种取值 —— 缺省 = 管理器自己配的，default = pnpm 自己那份，其余照传', async () => {
    const seen: unknown[] = [];
    const ctx = fakeContext({
      ...MANAGER,
      inspect: async (_spec: string, options: unknown) => {
        seen.push(options);
        return { status: 'accepted', kind: 'registry', name: 'pkg', bundle: true, registry: null };
      },
    });
    const handler = bundleInspectHandler(ctx);
    await handler(new URLSearchParams({ spec: 'pkg' }));
    await handler(new URLSearchParams({ spec: 'pkg', registry: BUNDLE_REGISTRY_DEFAULT }));
    await handler(new URLSearchParams({ spec: 'pkg', registry: 'https://r.example/' }));
    expect(seen).toEqual([undefined, { registry: null }, { registry: 'https://r.example/' }]);
  });

  it('预检：accepted 与 refused 都原样往上传（refused 也带得出问过哪些源）', async () => {
    const accepted = bundleInspectHandler(
      fakeContext({
        ...MANAGER,
        inspect: async () => ({
          status: 'accepted',
          kind: 'registry',
          name: 'pkg',
          version: '1.2.3',
          description: '一句话',
          bundle: true,
          registry: null,
        }),
      }),
    );
    expect(await accepted(new URLSearchParams({ spec: 'pkg' }))).toEqual({
      ok: true,
      inspection: {
        status: 'accepted',
        kind: 'registry',
        name: 'pkg',
        version: '1.2.3',
        description: '一句话',
        bundle: true,
        registry: null,
      },
    });

    const refused = bundleInspectHandler(
      fakeContext({
        ...MANAGER,
        inspect: async () => ({
          status: 'refused',
          problem: 'not-found',
          reason: '没有这个包',
          registries: ['https://a.example/'],
        }),
      }),
    );
    expect(await refused(new URLSearchParams({ spec: 'nope' }))).toEqual({
      ok: true,
      inspection: {
        status: 'refused',
        problem: 'not-found',
        reason: '没有这个包',
        registries: ['https://a.example/'],
      },
    });
  });

  it('预检：管理器回的东西看不懂就说看不懂，不编一个结论', async () => {
    const ctx = fakeContext({ ...MANAGER, inspect: async () => ({ status: 'weird' }) });
    expect(await bundleInspectHandler(ctx)(new URLSearchParams({ spec: 'x' }))).toMatchObject({
      ok: false,
      error: { code: 'workbench/bad-inspection' },
    });
  });
});

describe('装机预检：本地 path spec 读得到那份 package.json', () => {
  const DECLARED = { apiVersion: 1, unit: 'local', card: null, tools: [], host: { inject: [] } };

  function fixturePackage(manifest: unknown): { dir: string; cleanup: () => void } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-path-'));
    if (manifest !== undefined) {
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
        'utf8',
      );
    }
    return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
  }

  function accepted(kind: string, name?: string, registry: string | null = null): unknown {
    return { status: 'accepted', kind, bundle: true, registry, ...(name === undefined ? {} : { name }) };
  }

  function inspectContext(inspection: unknown): { ctx: DshHostContext; asked: string[]; shell: unknown } {
    const asked: string[] = [];
    const built = fakeShell({});
    const ctx = fakeContext(
      {
        ...MANAGER,
        inspect: async (spec: string) => {
          asked.push(spec);
          return inspection;
        },
      },
      undefined,
      undefined,
      built.shell,
    );
    return { ctx, asked, shell: built };
  }

  function payloadOf(result: unknown): { status: string; problem?: string; reason?: string } {
    return (result as { inspection: { status: string; problem?: string; reason?: string } }).inspection;
  }

  it('★ path spec：清单声明合格 → 不拒，回的就是管理器那份预检', async () => {
    const { dir, cleanup } = fixturePackage({ name: '@t/local-a', dsh: { workbench: DECLARED } });
    try {
      const { ctx, asked } = inspectContext(accepted('path', '@t/local-a'));

      const result = await bundleInspectHandler(ctx)(new URLSearchParams({ spec: dir }));

      expect(result).toEqual({
        ok: true,
        inspection: { status: 'accepted', kind: 'path', bundle: true, registry: null, name: '@t/local-a' },
      });
      expect(asked).toEqual([dir]);
    } finally {
      cleanup();
    }
  });

  it('★ path spec：声明缺 apiVersion → 装前就拒，理由点名那个包（file: 前缀与 spec 同形）', async () => {
    const { dir, cleanup } = fixturePackage({
      name: '@t/local-b',
      dsh: { workbench: { unit: 'local-b', card: null, tools: [], host: { inject: [] } } },
    });
    try {
      const { ctx } = inspectContext(accepted('path', '@t/local-b'));

      const result = await bundleInspectHandler(ctx)(new URLSearchParams({ spec: `file:${dir}` }));

      expect(result).toMatchObject({ ok: true, inspection: { status: 'refused', problem: 'not-a-workbench-module' } });
      expect(payloadOf(result).reason).toContain('@t/local-b');
      expect(payloadOf(result).reason).toMatch(/apiVersion/);
    } finally {
      cleanup();
    }
  });

  it('★ path spec：包里根本没有 dsh.workbench → 不拒（市场也装普通 dsh 包）', async () => {
    const { dir, cleanup } = fixturePackage({ name: '@t/plain', dsh: { bundle: {} } });
    try {
      const { ctx } = inspectContext(accepted('path', '@t/plain'));

      expect(await bundleInspectHandler(ctx)(new URLSearchParams({ spec: dir }))).toEqual({
        ok: true,
        inspection: { status: 'accepted', kind: 'path', bundle: true, registry: null, name: '@t/plain' },
      });
    } finally {
      cleanup();
    }
  });

  it('★ path spec：package.json 缺失 / 读不动 → 放行（fail-open，与 registry 那半同口径）', async () => {
    const missing = fixturePackage(undefined);
    const broken = fixturePackage('{ not json');
    try {
      for (const { dir } of [missing, broken]) {
        const { ctx } = inspectContext(accepted('path', '@t/broken'));
        expect(await bundleInspectHandler(ctx)(new URLSearchParams({ spec: dir }))).toEqual({
          ok: true,
          inspection: { status: 'accepted', kind: 'path', bundle: true, registry: null, name: '@t/broken' },
        });
      }
    } finally {
      missing.cleanup();
      broken.cleanup();
    }
  });

  it('★ 相对路径 spec 不做预检（dsh 自己就拒相对路径，这里不编一条往 cwd 找的路）', async () => {
    const { ctx, asked } = inspectContext(accepted('path', '@t/rel'));

    expect(await bundleInspectHandler(ctx)(new URLSearchParams({ spec: 'some/relative/dir' }))).toEqual({
      ok: true,
      inspection: { status: 'accepted', kind: 'path', bundle: true, registry: null, name: '@t/rel' },
    });
    expect(asked).toEqual(['some/relative/dir']);
  });

  it('★ path 但管理器没给包名 → 不拒（与 registry 同一条护栏：没有名字就没有理由点名）', async () => {
    const { dir, cleanup } = fixturePackage({ name: '@t/named-elsewhere', dsh: { workbench: { unit: 'x' } } });
    try {
      const { ctx } = inspectContext(accepted('path'));
      expect(await bundleInspectHandler(ctx)(new URLSearchParams({ spec: dir }))).toMatchObject({
        ok: true,
        inspection: { status: 'accepted', kind: 'path' },
      });
    } finally {
      cleanup();
    }
  });

  it('★ registry 照旧：声明的形状有问题就拒（问源那一路一个字没动）', async () => {
    const { shell } = fakeShell({ '@t/reg-d': JSON.stringify({ workbench: { unit: 'reg-d' } }) });
    const ctx = fakeContext(
      {
        ...MANAGER,
        inspect: async () => accepted('registry', '@t/reg-d', 'https://r.test/'),
      },
      undefined,
      undefined,
      shell,
    );

    const result = await bundleInspectHandler(ctx)(new URLSearchParams({ spec: '@t/reg-d' }));

    expect(result).toMatchObject({ ok: true, inspection: { status: 'refused', problem: 'not-a-workbench-module' } });
    expect(payloadOf(result).reason).toContain('@t/reg-d');
  });

  it('★ git / tarball 的 accepted 不拒（预检载荷里没有名字、也没有本地文件）', async () => {
    for (const [kind, spec] of [
      ['git', 'github:o/r'],
      ['tarball', 'https://example.test/a.tgz'],
    ] as const) {
      const { ctx } = inspectContext(accepted(kind));
      expect(await bundleInspectHandler(ctx)(new URLSearchParams({ spec }))).toEqual({
        ok: true,
        inspection: { status: 'accepted', kind, bundle: true, registry: null },
      });
    }
  });

  it('★ 只有 registry 走问源那一路：git / tarball 即便带了名字也不去问源', async () => {
    for (const kind of ['git', 'tarball'] as const) {
      const { ctx, shell } = inspectContext(accepted(kind, '@t/named-not-registry'));

      await bundleInspectHandler(ctx)(new URLSearchParams({ spec: 'github:o/r' }));

      expect((shell as { commands: string[] }).commands).toEqual([]);
    }
  });
});

describe('已装模块的最新版（打开市场页问一次 registry）', () => {
  function profileWith(version: string, scope = '@a'): { dir: string; cleanup: () => void } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-versions-'));
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'p', dsh: { profile: { bundles: [`${scope}/mod`, `${scope}/other`] } } }),
      'utf8',
    );
    for (const [pkg, unit] of [
      [`${scope}/mod`, 'mod'],
      [`${scope}/other`, 'other'],
    ] as const) {
      const at = path.join(dir, 'node_modules', pkg);
      fs.mkdirSync(at, { recursive: true });
      fs.writeFileSync(
        path.join(at, 'package.json'),
        JSON.stringify({
          name: pkg,
          version,
          dsh: { workbench: { unit } },
          ...(pkg === `${scope}/mod` ? { publishConfig: { registry: 'https://declared.example/' } } : {}),
        }),
        'utf8',
      );
    }
    fs.writeFileSync(
      path.join(dir, 'pnpm-lock.yaml'),
      [
        "lockfileVersion: '9.0'",
        '',
        'packages:',
        '',
        `  '${scope}/mod@0.1.2':`,
        `    resolution: {integrity: sha512-x, tarball: https://lockfile.example/${scope}/mod/-/mod-0.1.2.tgz}`,
        '',
        `  '${scope}/other@0.1.2':`,
        `    resolution: {integrity: sha512-y, tarball: https://custom.example/team/npm/${scope}/other/-/other-0.1.2.tgz}`,
        '',
      ].join('\n'),
      'utf8',
    );
    return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
  }

  it('★ 每个模块问一次源：有新版的带上 latest，问不到就不带（界面据此决定给不给「更新」）', async () => {
    const { dir, cleanup } = profileWith('0.1.2');
    const { shell, commands } = fakeShell({ '@a/mod': '0.2.0' });
    const ctx = fakeContext({ ...MANAGER }, dir);

    const result = (await moduleVersionsHandler(ctx, shell as never)(new URLSearchParams())) as {
      modules: unknown[];
    };

    expect(commands.some((line) => line.includes('@a/mod') && line.includes('https://declared.example/'))).toBe(
      true,
    );
    expect(
      commands.some(
        (line) => line.includes('@a/other') && line.includes('https://custom.example/team/npm'),
      ),
    ).toBe(true);
    expect(result.modules).toMatchObject([
      { unit: 'mod', pkg: '@a/mod', installed: '0.1.2', latest: '0.2.0' },
      { unit: 'other', pkg: '@a/other', installed: '0.1.2' },
    ]);
    cleanup();
  });

  it('★ 挂不上也要在这一行说清为什么 —— 按 unit 查不到拒因时，就地核这份声明', async () => {
    const { dir, cleanup } = profileWith('0.1.2');

    const result = (await moduleVersionsHandler(fakeContext({ ...MANAGER }, dir), undefined)(
      new URLSearchParams(),
    )) as { modules: { unit: string; refused?: readonly string[] }[] };

    expect(result.modules[0]?.refused?.join(' ')).toMatch(/apiVersion/);
    cleanup();
  });

  it('★ 装上了却用不了：技术细节落在日志里，而且同一份原因只报一次（市场页会反复问）', async () => {
    resetRefusalLog();
    const { dir, cleanup } = profileWith('0.1.2');
    const warned: string[] = [];
    const ctx = fakeContext({ ...MANAGER }, dir, { warn: (message) => warned.push(message) });

    await moduleVersionsHandler(ctx, undefined)(new URLSearchParams());
    const first = warned.length;
    await moduleVersionsHandler(ctx, undefined)(new URLSearchParams());

    expect(first).toBeGreaterThan(0);
    expect(warned).toHaveLength(first);
    expect(warned.join(' ')).toContain('apiVersion');
    expect(warned.join(' ')).toContain('@a/mod');
    cleanup();
  });

  it('没有管理器 / 没有 profile 目录 → 空清单，不抛', async () => {
    expect(await moduleVersionsHandler(fakeContext(undefined), undefined)(new URLSearchParams())).toEqual({
      ok: true,
      modules: [],
    });
    expect(await moduleVersionsHandler(fakeContext({ ...MANAGER }), undefined)(new URLSearchParams())).toEqual({
      ok: true,
      modules: [],
    });
  });

  it('源问炸了 → 那一条不带 latest，别的照常（一个新版查不到不该把整页拖垮）', async () => {
    const { dir, cleanup } = profileWith('0.1.2', '@b');
    const { shell } = fakeShell({ '@b/other': '9.9.9' });
    const ctx = fakeContext({ ...MANAGER }, dir);
    const result = (await moduleVersionsHandler(ctx, shell as never)(new URLSearchParams())) as {
      modules: { unit: string; latest?: string }[];
    };
    expect(result.modules).toMatchObject([
      { unit: 'mod', pkg: '@b/mod', installed: '0.1.2' },
      { unit: 'other', pkg: '@b/other', installed: '0.1.2', latest: '9.9.9' },
    ]);
    cleanup();
  });
});
