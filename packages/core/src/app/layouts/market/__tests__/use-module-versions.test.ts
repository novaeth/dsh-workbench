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
  vi.mocked(readMarketInstalled).mockResolvedValue({ ok: true, modules: [] });
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
    expect(moduleVersionsValue().checking).toBe(true);

    read.resolve(versions('0.1.1'));
    await run;

    expect(moduleVersionsValue().checking).toBe(false);
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
    expect(moduleVersionsValue().checking).toBe(true);

    newRead.resolve(versions('0.2.0'));
    await after;
    expect(moduleVersionsValue().checking).toBe(false);
  });

  it('同一次读数被两处要（非 fresh 去重）→ 只亮一次、也只灭一次', async () => {
    const read = deferred<ApiResponse<ModuleVersionsPayload>>();
    vi.mocked(readModuleVersions).mockReturnValueOnce(read.promise);

    const first = runModuleVersionsRead(false);
    const second = runModuleVersionsRead(false);
    expect(second).toBe(first);
    expect(moduleVersionsValue().checking).toBe(true);

    read.resolve(versions('0.1.1'));
    await first;

    expect(moduleVersionsValue().checking).toBe(false);
  });
});
