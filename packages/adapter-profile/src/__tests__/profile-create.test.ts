import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { profileCreateApply, profileCreateHandler, profileCreateSnapshot } from '../index.js';

function homeOf(): string {
  const home = mkdtempSync(join(tmpdir(), 'wb-profile-'));
  for (const name of ['web', 'workbench']) {
    mkdirSync(join(home, 'profiles', name), { recursive: true });
    writeFileSync(
      join(home, 'profiles', name, 'package.json'),
      JSON.stringify({
        name,
        dsh: { profile: { bundles: name === 'workbench' ? ['@dsh-workbench/core'] : ['@deepseek-ai/dsh-web-app'] } },
      }),
      'utf8',
    );
  }
  return home;
}

function makeTarget(home: string, profile: string): void {
  mkdirSync(join(home, 'profiles', profile), { recursive: true });
  writeFileSync(
    join(home, 'profiles', profile, 'package.json'),
    JSON.stringify({ name: profile, dsh: { profile: { bundles: ['@dsh-workbench/core'] } } }),
    'utf8',
  );
  mkdirSync(join(home, profile), { recursive: true });
}

describe('新建工作台：来源列表', () => {
  it('路由回 ok:true 信封（少了客户端当失败）', () => {
    const home = homeOf();
    const payload = profileCreateHandler({ home, self: 'workbench', packageRoot: '/pkg' })(
      new URLSearchParams(),
    ) as { ok?: unknown; current?: unknown; profiles?: unknown };
    expect(payload.ok).toBe(true);
    expect(payload.current).toBe('workbench');
    expect(Array.isArray(payload.profiles)).toBe(true);
  });

  it('列出所有 profile，并标出当前这个', () => {
    const home = homeOf();
    const snapshot = profileCreateSnapshot({ home, self: 'workbench', packageRoot: '/pkg' });
    expect(snapshot.current).toBe('workbench');
    expect(snapshot.profiles).toEqual([
      { name: 'web', current: false, readable: true },
      { name: 'workbench', current: true, readable: true },
    ]);
  });
});

describe('新建工作台：创建', () => {
  it('把选择传给 setup，并回报启动命令', async () => {
    const home = homeOf();
    let seen: Readonly<Record<string, string>> | null = null;
    const result = await profileCreateApply(
      {
        home,
        self: 'workbench',
        packageRoot: '/pkg',
        runSetup: async (env) => {
          seen = env;
          makeTarget(home, 'wb2');
          return { ok: true, log: 'ok' };
        },
      },
      {
        profile: 'wb2',
        source: 'web',
        copy: { settings: true },
      },
    );
    expect('ok' in result && result.ok === false).toBe(false);
    if ('profile' in result) {
      expect(result.ok).toBe(true);
      expect(result.profile).toBe('wb2');
      expect(result.home).toBe(join(home, 'wb2'));
      expect(result.copied).toEqual(['settings']);
      expect(result.command).toContain("WORKBENCH_PROFILE='wb2'");
    }
    expect(seen).toMatchObject({
      WORKBENCH_PROFILE: 'wb2',
      WORKBENCH_SOURCE_PROFILE: 'web',
      WB_CLONE: '1',
      WB_COPY_SETTINGS: '1',
    });
    expect(seen).not.toHaveProperty('WB_SOURCE_HOME');
    expect(seen).not.toHaveProperty('WB_COPY_PROJECTS');
    expect(seen).not.toHaveProperty('WB_COPY_SESSIONS');
  });

  it('名字 / 来源 / 已存在 / 数据根已存在都拒绝', async () => {
    const home = homeOf();
    const deps = { home, self: 'workbench', packageRoot: '/pkg' };
    const copy = { settings: true };
    expect(await profileCreateApply(deps, { profile: '../x', source: 'web', copy })).toEqual({
      ok: false,
      text: '新工作台的名字不合法：只用字母、数字、点、下划线或短横线',
    });
    expect(await profileCreateApply(deps, { profile: 'wb2', source: 'nope', copy })).toEqual({
      ok: false,
      text: '没有这个 profile：nope',
    });
    expect(await profileCreateApply(deps, { profile: 'web', source: 'web', copy })).toEqual({
      ok: false,
      text: '来源不能是新工作台自己',
    });
    expect(await profileCreateApply(deps, { profile: 'workbench', source: 'web', copy })).toEqual({
      ok: false,
      text: '已经有一个叫 workbench 的 profile',
    });
    mkdirSync(join(home, 'wb2'), { recursive: true });
    expect(await profileCreateApply(deps, { profile: 'wb2', source: 'web', copy })).toEqual({
      ok: false,
      text: `运行时目录已经存在：${join(home, 'wb2')}`,
    });
  });

  it('setup 失败时把刚建的 profile 与数据根清掉', async () => {
    const home = homeOf();
    const result = await profileCreateApply(
      {
        home,
        self: 'workbench',
        packageRoot: '/pkg',
        runSetup: async () => {
          makeTarget(home, 'wb2');
          return { ok: false, log: 'npm 装不上' };
        },
      },
      {
        profile: 'wb2',
        source: 'web',
        copy: { settings: true },
      },
    );
    expect('ok' in result && result.ok === false).toBe(true);
    expect(existsSync(join(home, 'profiles', 'wb2'))).toBe(false);
    expect(existsSync(join(home, 'wb2'))).toBe(false);
  });

  it('setup 成功但 bundle 没选中：拒绝并说清楚', async () => {
    const home = homeOf();
    const result = await profileCreateApply(
      {
        home,
        self: 'workbench',
        packageRoot: '/pkg',
        runSetup: async () => {
          mkdirSync(join(home, 'profiles', 'wb2'), { recursive: true });
          writeFileSync(join(home, 'profiles', 'wb2', 'package.json'), JSON.stringify({ name: 'wb2' }), 'utf8');
          return { ok: true, log: 'ok' };
        },
      },
      {
        profile: 'wb2',
        source: 'web',
        copy: { settings: false },
      },
    );
    expect(result).toEqual({ ok: false, text: 'profile 建好了，但工作台 bundle 没被选中；先跑一次 setup 修好它' });
    expect(existsSync(join(home, 'profiles', 'wb2'))).toBe(false);
  });
});
