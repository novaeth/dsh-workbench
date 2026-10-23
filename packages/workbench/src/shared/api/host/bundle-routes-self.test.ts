import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DshHostContext, DshShell } from '@dsh-workbench/shared';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { moduleVersionsHandler, resetHoldLog } from './bundle-routes';
import { resetReleaseCache } from './release';

beforeEach(() => {
  resetReleaseCache();
  resetHoldLog();
});

function fakeContext(
  manager: unknown,
  dir?: string,
  logger?: { warn?(message: string): void },
): DshHostContext {
  const known: Record<string, unknown> = { pluginManager: manager };
  if (dir !== undefined) known.profileContext = { dir };
  return {
    get: (name: string) => known[name],
    ...(logger === undefined ? {} : { logger }),
  } as unknown as DshHostContext;
}

type Source = Readonly<Record<string, readonly string[]>>;

function shellWith(source: Source): { shell: DshShell; commands: () => string[] } {
  const fake = createFakeShell((call) => {
    const spec = (/npm view (\S+)/.exec(call.command)?.[1] ?? '').replace(/^'|'$/g, '');
    const cut = spec.lastIndexOf('@');
    const name = cut <= 0 ? spec : spec.slice(0, cut);
    const asked = cut <= 0 ? '' : spec.slice(cut + 1);
    const known = source[name] ?? [];
    const hit = asked === '' ? known.at(-1) : known.includes(asked) ? asked : undefined;
    return hit === undefined ? { exitCode: 1, stdout: '' } : { stdout: `${hit}\n` };
  });
  return { shell: fake.shell, commands: fake.commands };
}

const MANAGER = {
  installBundle: async () => ({ application: 'applied', stage: 'install', changed: true, target: 'x' }),
  removeBundle: async () => ({ application: 'applied', stage: 'remove', changed: true, target: 'x' }),
};

describe('工作台自己那份的新版（与模块同一条探针里一起回）', () => {
  const CORE = '@dsh-workbench/core';
  const SHARED = '@dsh-workbench/shared';
  const TOOLS = '@dsh-workbench/module-tools';

  const released = (version: string): Source => ({
    [CORE]: [version],
    [SHARED]: [version],
    [TOOLS]: [version],
  });

  function coreProfile(options: {
    version?: string;
    spec?: string;
    manifest?: Record<string, unknown>;
  }): { dir: string; cleanup: () => void } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-self-'));
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: 'dsh-profile-workbench',
        dsh: { profile: { bundles: [CORE] } },
        dependencies: { [CORE]: options.spec ?? '^0.1.18' },
      }),
      'utf8',
    );
    const at = path.join(dir, 'node_modules', CORE);
    fs.mkdirSync(at, { recursive: true });
    fs.writeFileSync(
      path.join(at, 'package.json'),
      JSON.stringify({
        name: CORE,
        version: options.version ?? '0.1.18',
        publishConfig: { registry: 'https://self.example/' },
        ...options.manifest,
      }),
      'utf8',
    );
    return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
  }

  it('★ 三包都铺开了 → 同一条回包里带上它（界面据此给「更新」，不需要第二次往返）', async () => {
    const { dir, cleanup } = coreProfile({});
    const { shell, commands } = shellWith(released('0.1.19'));

    const result = (await moduleVersionsHandler(fakeContext({ ...MANAGER }, dir), shell)(
      new URLSearchParams(),
    )) as { modules: unknown[]; workbench?: Record<string, unknown> };

    const views = commands().filter((line) => line.includes('npm view'));
    expect(views).toHaveLength(3);
    expect(views.every((line) => line.includes('https://self.example/'))).toBe(true);
    expect(result.modules).toEqual([]);
    expect(result.workbench).toEqual({
      pkg: CORE,
      installed: '0.1.18',
      latest: '0.1.19',
    });
    cleanup();
  });

  it('★ 只有外壳这一份上去了（另外两包还没铺到这一版）→ 不给「更新」，只记一次日志', async () => {
    resetHoldLog();
    const { dir, cleanup } = coreProfile({});
    const { shell } = shellWith({ [CORE]: ['0.1.19'], [SHARED]: ['0.1.18'], [TOOLS]: ['0.1.18'] });
    const warned: string[] = [];
    const ctx = fakeContext({ ...MANAGER }, dir, { warn: (message) => warned.push(message) });

    const first = (await moduleVersionsHandler(ctx, shell)(new URLSearchParams())) as {
      workbench?: Record<string, unknown>;
    };
    const after = warned.length;
    const second = (await moduleVersionsHandler(ctx, shell)(new URLSearchParams())) as {
      workbench?: Record<string, unknown>;
    };

    expect(first.workbench).toEqual({ pkg: CORE, installed: '0.1.18' });
    expect(second.workbench).toEqual({ pkg: CORE, installed: '0.1.18' });
    expect(after).toBe(1);
    expect(warned).toHaveLength(1);
    expect(warned.join(' ')).toContain(SHARED);
    expect(warned.join(' ')).toContain(TOOLS);
    cleanup();
  });

  it('★ 铺齐之后（点「重新检查」强制复探）→ 「更新」回来', async () => {
    resetHoldLog();
    const { dir, cleanup } = coreProfile({});
    const source: Record<string, string[]> = {
      [CORE]: ['0.1.19'],
      [SHARED]: ['0.1.18'],
      [TOOLS]: ['0.1.18'],
    };
    const { shell } = shellWith(source);
    const ctx = fakeContext({ ...MANAGER }, dir);

    const before = (await moduleVersionsHandler(ctx, shell)(new URLSearchParams())) as {
      workbench?: Record<string, unknown>;
    };
    source[SHARED] = ['0.1.18', '0.1.19'];
    source[TOOLS] = ['0.1.18', '0.1.19'];
    const after = (await moduleVersionsHandler(ctx, shell)(new URLSearchParams({ force: '1' }))) as {
      workbench?: Record<string, unknown>;
    };

    expect(before.workbench).toEqual({ pkg: CORE, installed: '0.1.18' });
    expect(after.workbench).toEqual({ pkg: CORE, installed: '0.1.18', latest: '0.1.19' });
    cleanup();
  });

  it('★ 源上那份还没盘上这份新（或一样）→ 不带 latest，也不去问另外两包', async () => {
    const { dir, cleanup } = coreProfile({ version: '0.1.19' });
    const { shell, commands } = shellWith({ [CORE]: ['0.1.18'] });

    const result = (await moduleVersionsHandler(fakeContext({ ...MANAGER }, dir), shell)(
      new URLSearchParams(),
    )) as { workbench?: Record<string, unknown> };

    expect(commands().filter((line) => line.includes('npm view'))).toHaveLength(1);
    expect(result.workbench).toEqual({ pkg: CORE, installed: '0.1.19' });
    cleanup();
  });

  it('★ 盘上那份与运行中那份都报出去（差多少由界面判，不在这里替它下结论）', async () => {
    const { dir, cleanup } = coreProfile({ version: '0.1.19' });
    const { shell } = shellWith(released('0.1.19'));

    const same = (await moduleVersionsHandler(fakeContext({ ...MANAGER }, dir), shell, '0.1.19')(
      new URLSearchParams(),
    )) as { workbench?: Record<string, unknown> };

    expect(same.workbench).toEqual({ pkg: CORE, installed: '0.1.19', running: '0.1.19' });

    const swapped = (await moduleVersionsHandler(fakeContext({ ...MANAGER }, dir), shell, '0.1.18')(
      new URLSearchParams(),
    )) as { workbench?: Record<string, unknown> };

    expect(swapped.workbench).toEqual({ pkg: CORE, installed: '0.1.19', running: '0.1.18' });
    cleanup();
  });

  it('拿不到运行中那一版（老宿主 / 读不到 package.json）→ 少一格，不瞎说', async () => {
    const { dir, cleanup } = coreProfile({ version: '0.1.19' });
    const { shell } = shellWith(released('0.1.19'));

    const result = (await moduleVersionsHandler(fakeContext({ ...MANAGER }, dir), shell)(
      new URLSearchParams(),
    )) as { workbench?: Record<string, unknown> };

    expect(Object.keys(result.workbench ?? {}).sort()).toEqual(['installed', 'pkg']);
    cleanup();
  });

  it('★ link: 装的那份 → 记成本仓那份，**不去问源**（它不从源上取，问了也没用）', async () => {
    const { dir, cleanup } = coreProfile({ spec: 'link:/Users/x/dsh-workbench/packages/workbench' });
    const { shell, commands } = shellWith(released('0.1.19'));

    const result = (await moduleVersionsHandler(fakeContext({ ...MANAGER }, dir), shell)(
      new URLSearchParams(),
    )) as { workbench?: Record<string, unknown> };

    expect(result.workbench).toEqual({ pkg: CORE, installed: '0.1.18', local: true });
    expect(commands().filter((line) => line.includes('npm view'))).toEqual([]);
    cleanup();
  });

  it('profile 里没有这份 / 没有 profile 目录 → 不提这一条（不摆一行瞎猜的）', async () => {
    const modRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-self-mod-'));
    fs.writeFileSync(
      path.join(modRoot, 'package.json'),
      JSON.stringify({ name: 'p', dsh: { profile: { bundles: ['@a/mod'] } }, dependencies: {} }),
      'utf8',
    );
    const at = path.join(modRoot, 'node_modules', '@a', 'mod');
    fs.mkdirSync(at, { recursive: true });
    fs.writeFileSync(
      path.join(at, 'package.json'),
      JSON.stringify({ name: '@a/mod', version: '0.1.2', dsh: { workbench: { unit: 'mod' } } }),
      'utf8',
    );
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-self-none-'));
    fs.writeFileSync(path.join(empty, 'package.json'), JSON.stringify({ name: 'p', dependencies: {} }), 'utf8');

    const there = (await moduleVersionsHandler(fakeContext({ ...MANAGER }, modRoot), undefined)(
      new URLSearchParams(),
    )) as { modules: unknown[]; workbench?: unknown };
    const none = (await moduleVersionsHandler(fakeContext({ ...MANAGER }, empty), undefined)(
      new URLSearchParams(),
    )) as { workbench?: unknown };

    expect(there.modules).toHaveLength(1);
    expect(there.workbench).toBeUndefined();
    expect(none.workbench).toBeUndefined();
    fs.rmSync(modRoot, { recursive: true, force: true });
    fs.rmSync(empty, { recursive: true, force: true });
  });

  it('★ 外面那个自更新进程的现场跟着工作台那一格回（没有就少一格）', async () => {
    const { dir, cleanup } = coreProfile({});
    const { shell } = shellWith(released('0.1.18'));
    const update = {
      state: 'failed' as const,
      from: '0.1.18',
      to: '0.1.19',
      version: '0.1.18',
      at: '2026-10-23T01:00:00.000Z',
      tail: '换版没成 / 救法：dsh plugin add x',
    };

    const withUpdate = (await moduleVersionsHandler(
      fakeContext({ ...MANAGER }, dir),
      shell,
      undefined,
      () => update,
    )(new URLSearchParams())) as { selfUpdate?: Record<string, unknown> };
    const without = (await moduleVersionsHandler(fakeContext({ ...MANAGER }, dir), shell, undefined, () => undefined)(
      new URLSearchParams(),
    )) as { selfUpdate?: Record<string, unknown> };

    expect(withUpdate.selfUpdate).toEqual(update);
    expect(without.selfUpdate).toBeUndefined();
    cleanup();
  });
});
