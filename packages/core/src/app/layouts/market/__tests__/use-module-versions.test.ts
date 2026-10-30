import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResponse } from '@dsh-workbench/shared';
import type { InstalledPluginsPayload } from '@/shared/api/installed-plugins';
import type { ModuleVersionsPayload } from '@/kernel/contract/bundle-install';
import { readInstalledPlugins, readModuleVersions } from '@/shared/hooks/bundle-queries';
import { readMarketInstalled } from '@/shared/hooks/market-queries';
import {
  bumpModuleVersionsEpoch,
  moduleVersionsValue,
  resetModuleVersions,
  runInstalledRead,
  runModuleVersionsRead,
} from '../use-module-versions';

vi.mock('@/shared/hooks/bundle-queries', () => ({
  readModuleVersions: vi.fn(),
  readInstalledPlugins: vi.fn(),
}));

vi.mock('@/shared/hooks/market-queries', () => ({
  readMarketInstalled: vi.fn(),
}));

const versions = (installed: string): ApiResponse<ModuleVersionsPayload> => ({
  ok: true,
  modules: [{ unit: 'm', pkg: '@a/m', installed }],
});

const versionsWithLatest = (installed: string, latest: string): ApiResponse<ModuleVersionsPayload> => ({
  ok: true,
  modules: [{ unit: 'm', pkg: '@a/m', installed, latest }],
});

const noPlugins: ApiResponse<InstalledPluginsPayload> = { ok: true, plugins: [] };

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  resetModuleVersions();
  vi.mocked(readInstalledPlugins).mockResolvedValue(noPlugins);
  vi.mocked(readInstalledPlugins).mockClear();
  vi.mocked(readMarketInstalled).mockResolvedValue({ ok: true, modules: [] });
  vi.mocked(readMarketInstalled).mockClear();
  vi.mocked(readModuleVersions).mockReset();
});

describe('版本读数在写完之后不许被旧的在飞读取盖回去', () => {
  it('★ 写前发出去的读取（改之前那一份）晚回来也不许发布', async () => {
    const oldRead = deferred<ApiResponse<ModuleVersionsPayload>>();
    const newRead = deferred<ApiResponse<ModuleVersionsPayload>>();
    vi.mocked(readModuleVersions)
      .mockReturnValueOnce(oldRead.promise)
      .mockReturnValueOnce(newRead.promise);

    const before = runModuleVersionsRead(false);
    bumpModuleVersionsEpoch();
    const after = runModuleVersionsRead(true, true);

    newRead.resolve(versions('0.1.1'));
    await after;
    oldRead.resolve(versions('0.1.0'));
    await before;

    expect(moduleVersionsValue().modules?.[0]?.installed).toBe('0.1.1');
  });

  it('★ fresh 不搭旧一次强读的车（哪怕它也是 force）', async () => {
    const oldRead = deferred<ApiResponse<ModuleVersionsPayload>>();
    const newRead = deferred<ApiResponse<ModuleVersionsPayload>>();
    vi.mocked(readModuleVersions)
      .mockReturnValueOnce(oldRead.promise)
      .mockReturnValueOnce(newRead.promise);

    const before = runModuleVersionsRead(true);
    bumpModuleVersionsEpoch();
    const after = runModuleVersionsRead(true, true);

    newRead.resolve(versions('0.2.0'));
    await after;
    oldRead.resolve(versions('0.1.0'));
    await before;

    expect(moduleVersionsValue().modules?.[0]?.installed).toBe('0.2.0');
  });
});

describe('★ 检查更新的转圈要罩到读数落地', () => {
  it('起读就亮，落地才灭', async () => {
    const read = deferred<ApiResponse<ModuleVersionsPayload>>();
    vi.mocked(readModuleVersions).mockReturnValueOnce(read.promise);

    const run = runModuleVersionsRead(true, true);
    expect(moduleVersionsValue().allChecking).toBe(true);

    read.resolve(versions('0.1.1'));
    await run;

    expect(moduleVersionsValue().allChecking).toBe(false);
    expect(moduleVersionsValue().read).toBe(true);
  });

  it('★ 被新读数盖掉的旧读数落地，不许熄灭新读数的转圈', async () => {
    const oldRead = deferred<ApiResponse<ModuleVersionsPayload>>();
    const newRead = deferred<ApiResponse<ModuleVersionsPayload>>();
    vi.mocked(readModuleVersions)
      .mockReturnValueOnce(oldRead.promise)
      .mockReturnValueOnce(newRead.promise);

    const before = runModuleVersionsRead(true, true);
    bumpModuleVersionsEpoch();
    const after = runModuleVersionsRead(true, true);

    oldRead.resolve(versions('0.1.0'));
    await before;
    expect(moduleVersionsValue().allChecking).toBe(true);

    newRead.resolve(versions('0.2.0'));
    await after;
    expect(moduleVersionsValue().allChecking).toBe(false);
  });

  it('同一次读数被两处要（非 fresh 去重）→ 只亮一次、也只灭一次', async () => {
    const read = deferred<ApiResponse<ModuleVersionsPayload>>();
    vi.mocked(readModuleVersions).mockReturnValueOnce(read.promise);

    const first = runModuleVersionsRead(false);
    const second = runModuleVersionsRead(false);
    expect(second).toBe(first);
    expect(moduleVersionsValue().allChecking).toBe(true);

    read.resolve(versions('0.1.1'));
    await first;

    expect(moduleVersionsValue().allChecking).toBe(false);
  });
});

describe('最近检查：只有读成功才记时间', () => {
  it('★ 读成功 → 记下这次时间，失败态清掉', async () => {
    vi.mocked(readModuleVersions).mockResolvedValueOnce({
      ok: false,
      error: { code: 'net', message: '没连上' },
    });
    await runModuleVersionsRead(true, true);
    expect(moduleVersionsValue().modulesCheck.failed).toBe(true);
    expect(moduleVersionsValue().modulesCheck.checkedAt).toBeNull();

    vi.mocked(readModuleVersions).mockResolvedValueOnce(versions('0.1.1'));
    await runModuleVersionsRead(true, true);
    expect(moduleVersionsValue().modulesCheck.failed).toBe(false);
    expect(moduleVersionsValue().modulesCheck.checkedAt).not.toBeNull();
  });

  it('★ 读失败 → 上一次的版本和检查时间都留着，不假装刚查过', async () => {
    vi.mocked(readModuleVersions).mockResolvedValueOnce(versions('0.1.0'));
    await runModuleVersionsRead(true, true);
    const checkedAt = moduleVersionsValue().modulesCheck.checkedAt;
    expect(checkedAt).not.toBeNull();

    vi.mocked(readModuleVersions).mockResolvedValueOnce({
      ok: false,
      error: { code: 'net', message: '没连上' },
    });
    await runModuleVersionsRead(true, true);

    expect(moduleVersionsValue().modules?.[0]?.installed).toBe('0.1.0');
    expect(moduleVersionsValue().modulesCheck.checkedAt).toBe(checkedAt);
    expect(moduleVersionsValue().modulesCheck.failed).toBe(true);
  });
});

describe('分区检查：页头查全部，两段各查各的', () => {
  it('★ 只查模块 → 不碰插件，也不点亮页头那颗全局 ⟳', async () => {
    vi.mocked(readModuleVersions).mockResolvedValueOnce(versions('0.1.1'));
    const run = runModuleVersionsRead(true, true, 'modules');

    expect(moduleVersionsValue().allChecking).toBe(false);
    expect(moduleVersionsValue().modulesCheck.checking).toBe(true);
    expect(moduleVersionsValue().pluginsCheck.checking).toBe(false);

    await run;

    expect(readInstalledPlugins).not.toHaveBeenCalled();
    expect(moduleVersionsValue().modulesCheck.checking).toBe(false);
    expect(moduleVersionsValue().modulesCheck.checkedAt).not.toBeNull();
    expect(moduleVersionsValue().pluginsCheck.checkedAt).toBeNull();
  });

  it('★ 只查插件 → 模块的版本与「最近检查」一个都不动', async () => {
    vi.mocked(readModuleVersions).mockResolvedValueOnce(versions('0.1.1'));
    await runModuleVersionsRead(true, true, 'modules');
    const at = moduleVersionsValue().modulesCheck.checkedAt;

    vi.mocked(readInstalledPlugins).mockResolvedValueOnce({ ok: true, plugins: [{ pkg: '@a/p' }] });
    await runModuleVersionsRead(true, true, 'plugins');

    expect(readModuleVersions).toHaveBeenCalledTimes(1);
    expect(moduleVersionsValue().modulesCheck.checkedAt).toBe(at);
    expect(moduleVersionsValue().plugins?.[0]?.pkg).toBe('@a/p');
    expect(moduleVersionsValue().allChecking).toBe(false);
  });

  it('★ 全局检查把两段一起点亮、一起熄灭', async () => {
    const read = deferred<ApiResponse<ModuleVersionsPayload>>();
    vi.mocked(readModuleVersions).mockReturnValueOnce(read.promise);
    const run = runModuleVersionsRead(true, true);

    expect(moduleVersionsValue().allChecking).toBe(true);
    expect(moduleVersionsValue().modulesCheck.checking).toBe(true);
    expect(moduleVersionsValue().pluginsCheck.checking).toBe(true);

    read.resolve(versions('0.1.1'));
    await run;

    expect(moduleVersionsValue().allChecking).toBe(false);
    expect(moduleVersionsValue().modulesCheck.checking).toBe(false);
    expect(moduleVersionsValue().pluginsCheck.checking).toBe(false);
    expect(moduleVersionsValue().modulesCheck.checkedAt).not.toBeNull();
    expect(moduleVersionsValue().pluginsCheck.checkedAt).not.toBeNull();
  });

  it('★ 分区检查失败只记在自己那一段上', async () => {
    vi.mocked(readModuleVersions).mockResolvedValueOnce({
      ok: false,
      error: { code: 'net', message: '没连上' },
    });
    await runModuleVersionsRead(true, true, 'modules');

    expect(moduleVersionsValue().modulesCheck.failed).toBe(true);
    expect(moduleVersionsValue().pluginsCheck.failed).toBe(false);
  });
});

describe('首屏那一趟（已安装）与「检测更新」那一趟是两趟', () => {
  it('★ 已安装那一趟不问源（check=0），落地就把骨架收起来：不转圈、不写「最近检查」', async () => {
    vi.mocked(readModuleVersions).mockResolvedValueOnce(versions('0.1.1'));

    const run = runInstalledRead();
    expect(moduleVersionsValue().read).toBe(false);
    expect(moduleVersionsValue().allChecking).toBe(false);

    await run;

    expect(readModuleVersions).toHaveBeenCalledWith(false, false);
    expect(readInstalledPlugins).toHaveBeenCalledWith(false, false);
    expect(moduleVersionsValue().read).toBe(true);
    expect(moduleVersionsValue().modules?.[0]?.installed).toBe('0.1.1');
    expect(moduleVersionsValue().allChecking).toBe(false);
    expect(moduleVersionsValue().modulesCheck.checking).toBe(false);
    expect(moduleVersionsValue().modulesCheck.checkedAt).toBeNull();
  });

  it('★ 检测更新那一趟才问源、才转圈、才写「最近检查」', async () => {
    const read = deferred<ApiResponse<ModuleVersionsPayload>>();
    vi.mocked(readModuleVersions).mockReturnValueOnce(read.promise);

    const run = runModuleVersionsRead(true, true);
    expect(moduleVersionsValue().allChecking).toBe(true);

    read.resolve(versionsWithLatest('0.1.1', '0.1.2'));
    await run;

    expect(readModuleVersions).toHaveBeenCalledWith(true, true);
    expect(moduleVersionsValue().modules?.[0]?.latest).toBe('0.1.2');
    expect(moduleVersionsValue().modulesCheck.checkedAt).not.toBeNull();
  });

  it('★ 进页面两趟同时起飞时，已安装那一趟先落地就要把骨架收起来（不许被后起的检测挤掉）', async () => {
    const data = deferred<ApiResponse<ModuleVersionsPayload>>();
    const check = deferred<ApiResponse<ModuleVersionsPayload>>();
    vi.mocked(readModuleVersions).mockReturnValueOnce(data.promise).mockReturnValueOnce(check.promise);

    const first = runInstalledRead();
    const second = runModuleVersionsRead(true, true);

    data.resolve(versions('0.1.1'));
    await first;
    expect(moduleVersionsValue().read).toBe(true);
    expect(moduleVersionsValue().modules?.[0]?.installed).toBe('0.1.1');
    expect(moduleVersionsValue().modulesCheck.checkedAt).toBeNull();

    check.resolve(versionsWithLatest('0.1.1', '0.1.2'));
    await second;
    expect(moduleVersionsValue().modules?.[0]?.latest).toBe('0.1.2');
    expect(moduleVersionsValue().modulesCheck.checkedAt).not.toBeNull();
  });

  it('★ 已安装那一趟不许把上一次检测到的「有新版」擦掉，也不动那个时刻', async () => {
    vi.mocked(readModuleVersions).mockResolvedValueOnce(versionsWithLatest('0.1.1', '0.1.2'));
    await runModuleVersionsRead(true, true);
    const at = moduleVersionsValue().modulesCheck.checkedAt;

    vi.mocked(readModuleVersions).mockResolvedValueOnce(versions('0.1.1'));
    await runInstalledRead();

    expect(moduleVersionsValue().modules?.[0]).toMatchObject({ installed: '0.1.1', latest: '0.1.2' });
    expect(moduleVersionsValue().modulesCheck.checkedAt).toBe(at);
  });
});

describe('更新挂起期间每 800ms 一趟的落地轮询（只读已安装）', () => {
  it('★ 它照样把新版本换上，但不点亮「正在检查…」，也不把「最近检查」推成「刚刚」', async () => {
    vi.mocked(readModuleVersions).mockResolvedValueOnce(versions('0.1.1'));
    await runModuleVersionsRead(true, true);
    const at = moduleVersionsValue().modulesCheck.checkedAt;
    const pluginsAt = moduleVersionsValue().pluginsCheck.checkedAt;
    expect(at).not.toBeNull();

    vi.mocked(readModuleVersions).mockResolvedValueOnce(versions('0.1.2'));
    const poll = runInstalledRead();
    expect(moduleVersionsValue().allChecking).toBe(false);
    expect(moduleVersionsValue().modulesCheck.checking).toBe(false);

    await poll;

    expect(moduleVersionsValue().modules?.[0]?.installed).toBe('0.1.2');
    expect(moduleVersionsValue().modulesCheck.checking).toBe(false);
    expect(moduleVersionsValue().modulesCheck.checkedAt).toBe(at);
    expect(moduleVersionsValue().pluginsCheck.checkedAt).toBe(pluginsAt);
  });

  it('★ 连着一串轮询也不许把「正在检查…」和「最近检查：刚刚」来回拨', async () => {
    vi.mocked(readModuleVersions).mockResolvedValueOnce(versions('0.1.1'));
    await runModuleVersionsRead(true, true);
    const at = moduleVersionsValue().modulesCheck.checkedAt;

    const seen: string[] = [];
    for (let tick = 0; tick < 4; tick += 1) {
      vi.mocked(readModuleVersions).mockResolvedValueOnce(versions('0.1.1'));
      const poll = runInstalledRead();
      seen.push(moduleVersionsValue().modulesCheck.checking ? 'checking' : 'quiet');
      await poll;
      seen.push(moduleVersionsValue().modulesCheck.checkedAt === at ? 'quiet' : 'checking');
    }

    expect(seen).toEqual(['quiet', 'quiet', 'quiet', 'quiet', 'quiet', 'quiet', 'quiet', 'quiet']);
  });
});
