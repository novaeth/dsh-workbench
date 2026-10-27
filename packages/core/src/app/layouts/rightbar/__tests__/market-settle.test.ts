import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import type { ModuleUpdate } from '../market-row-types';
import {
  MODULE_SETTLE_MS,
  WORKBENCH_SWAP_MS,
  awaitsReadBack,
  holdBack,
  holdWindowMs,
  readBackDone,
  settleLanded,
  selfUpdateStop,
  swapLanded,
  swapUntil,
} from '../market-settle';

const set = (...ids: string[]): ReadonlySet<string> => new Set(ids);

describe('刚装上的模块：等它真在浏览器这侧生效再露面', () => {
  it('★ 宿主已经加载了（capability 表里有它），只是花名册还没拉到 → 先不露面', () => {
    expect(holdBack(['inventory'], set(), set('inventory'), set())).toEqual(['inventory']);
  });

  it('★ 宿主还没加载、但它是刚出现的 → 也先不露面（装完那一瞬间）', () => {
    expect(holdBack(['inventory'], set(), set(), set())).toEqual(['inventory']);
  });

  it('打开页面第一次读：宿主没加载的（真没生效的那档）→ 照旧露面，带一句"重启一次"', () => {
    expect(holdBack(['inventory'], set(), set(), null)).toEqual([]);
  });

  it('一直在、宿主也不认识（重启前一直这样）→ 不藏它，它得留着卸载按钮', () => {
    expect(holdBack(['inventory'], set(), set(), set('inventory'))).toEqual([]);
  });

  it('花名册里已经有了（真生效了）→ 不藏', () => {
    expect(holdBack(['inventory'], set('inventory'), set('inventory'), set())).toEqual([]);
  });

  it('只藏挂着的那个，生效的不受影响', () => {
    expect(holdBack(['a', 'b'], set('b'), set('a'), set())).toEqual(['a']);
  });
});

describe('工作台自己那一跳：换到哪一版为止', () => {
  it('★ 只有「工作台更新 + restart-required」才挂住，模块行不挂', () => {
    expect(swapUntil('update-workbench', 'restart-required', '0.2.6')).toBe('0.2.6');
    expect(swapUntil('update', 'restart-required', '0.2.6')).toBeUndefined();
    expect(swapUntil('update-workbench', 'applied', '0.2.6')).toBeUndefined();
    expect(swapUntil('update-workbench', 'restart-required', undefined)).toBeUndefined();
  });

  it('★ 盘上真到那一版才收工', () => {
    expect(swapLanded('0.2.6', '0.2.5')).toBe(false);
    expect(swapLanded('0.2.6', '0.2.6')).toBe(true);
    expect(swapLanded(undefined, '0.2.6')).toBe(false);
  });
});

describe('模块行的更新：解锁要等读数追上来，不是等写响应回来', () => {
  it('★ 只有「写回 applied + 是更新/卸载那几跳」才留下来等读数（命令那一跳没版本也要等能力表）', () => {
    expect(awaitsReadBack('update', 'applied', '0.9.0')).toBe(true);
    expect(awaitsReadBack('update-bundle', 'applied', '0.9.0')).toBe(true);
    expect(awaitsReadBack('update', 'restart-required', '0.9.0')).toBe(false);
    expect(awaitsReadBack('update', 'applied', undefined)).toBe(true);
    expect(awaitsReadBack('update-dependency', 'applied', undefined)).toBe(true);
    expect(awaitsReadBack('update-plugin', 'applied', undefined)).toBe(true);
    expect(awaitsReadBack('install', 'applied', '0.9.0')).toBe(false);
    expect(awaitsReadBack('remove-bundle', 'applied', undefined)).toBe(true);
    expect(awaitsReadBack('uninstall', 'applied', undefined)).toBe(true);
    expect(awaitsReadBack('uninstall-plugin', 'applied', undefined)).toBe(true);
    expect(awaitsReadBack('remove-bundle', 'failed', undefined)).toBe(false);
    expect(awaitsReadBack('update-workbench', 'applied', '0.9.0')).toBe(false);
  });

  it('★ 版本那一跳（update-bundle）：盘上那一版已经不是点下去时那一版（或已追平 latest）→ 追上了', () => {
    const version = (entry: ModuleUpdate | undefined, clicked: string | undefined): boolean =>
      readBackDone({ action: 'update-bundle', entry, clicked, outdated: false });

    expect(version({ installed: '0.10.0', latest: '0.10.0' }, '0.9.0')).toBe(true);
    expect(version({ installed: '0.10.0', latest: '0.11.0' }, '0.9.0')).toBe(true);
    expect(version({ installed: '0.9.0', latest: '0.10.0' }, '0.9.0')).toBe(false);
  });

  it('没得等的（这一格都没读出来 / 本地那份 / 问不到 latest）→ 当场算追上', () => {
    const version = (entry: ModuleUpdate | undefined, clicked: string | undefined): boolean =>
      readBackDone({ action: 'update-bundle', entry, clicked, outdated: false });

    expect(version(undefined, '0.9.0')).toBe(true);
    expect(version({ installed: '0.9.0', latest: '0.10.0', local: true }, '0.9.0')).toBe(true);
    expect(version({ installed: '0.9.0' }, '0.9.0')).toBe(true);
    expect(version({ installed: '0.9.0', latest: '0.10.0' }, undefined)).toBe(true);
  });

  it('★ 能力那一跳（update）：那几条命令还在缺 → 还挂着；不缺了才放行', () => {
    const commands = (outdated: boolean): boolean =>
      readBackDone({ action: 'update', entry: undefined, clicked: '0.9.0', outdated });

    expect(commands(true)).toBe(false);
    expect(commands(false)).toBe(true);
  });

  it('★ 工作台那一跳照旧按「盘上真到那一版」收工，模块那两跳按读数', () => {
    expect(
      settleLanded({
        action: 'update-workbench',
        until: '0.2.6',
        readBack: undefined,
        installed: '0.2.5',
        entry: undefined,
        clicked: undefined,
        outdated: false,
      }),
    ).toBe(false);
    expect(
      settleLanded({
        action: 'update-workbench',
        until: '0.2.6',
        readBack: undefined,
        installed: '0.2.6',
        entry: undefined,
        clicked: undefined,
        outdated: false,
      }),
    ).toBe(true);
    expect(
      settleLanded({
        action: 'update-bundle',
        until: undefined,
        readBack: true,
        installed: undefined,
        entry: { installed: '0.9.0', latest: '0.10.0' },
        clicked: '0.9.0',
        outdated: false,
      }),
    ).toBe(false);
    expect(
      settleLanded({
        action: 'update-bundle',
        until: undefined,
        readBack: true,
        installed: undefined,
        entry: { installed: '0.10.0', latest: '0.10.0' },
        clicked: '0.9.0',
        outdated: false,
      }),
    ).toBe(true);
    expect(
      settleLanded({
        action: 'update',
        until: undefined,
        readBack: undefined,
        installed: undefined,
        entry: undefined,
        clicked: undefined,
        outdated: true,
      }),
    ).toBe(true);
  });

  it('★ 两档窗口：工作台那一跳 3 分钟，模块这一跳 15 秒', () => {
    expect(holdWindowMs(undefined)).toBe(MODULE_SETTLE_MS);
    expect(holdWindowMs('0.2.6')).toBe(WORKBENCH_SWAP_MS);
  });

  it('★ 共用依赖 / opencli 插件那两跳也要等读数，不能写完就解锁', () => {
    const base = { until: undefined, installed: undefined, entry: undefined, clicked: undefined, outdated: false, readBack: true };
    expect(settleLanded({ ...base, action: 'update-dependency', sharedState: 'outdated' })).toBe(false);
    expect(settleLanded({ ...base, action: 'update-dependency', sharedState: 'unsatisfied' })).toBe(false);
    expect(settleLanded({ ...base, action: 'update-dependency', sharedState: 'installed' })).toBe(true);
    expect(settleLanded({ ...base, action: 'update-plugin', pluginOutdated: true })).toBe(false);
    expect(settleLanded({ ...base, action: 'update-plugin', pluginOutdated: false })).toBe(true);
    expect(settleLanded({ ...base, action: 'update-plugin', pluginOutdated: null })).toBe(false);
  });

  it('★ 卸载三跳也要等读数：名单里没有它了才解锁（读不到就继续等）', () => {
    const base = { until: undefined, installed: undefined, entry: undefined, clicked: undefined, outdated: false, readBack: true };
    for (const action of ['remove-bundle', 'uninstall'] as const) {
      expect(settleLanded({ ...base, action, unitGone: false }), action).toBe(false);
      expect(settleLanded({ ...base, action, unitGone: null }), action).toBe(false);
      expect(settleLanded({ ...base, action, unitGone: true }), action).toBe(true);
    }
    expect(settleLanded({ ...base, action: 'uninstall-plugin', pluginGone: false })).toBe(false);
    expect(settleLanded({ ...base, action: 'uninstall-plugin', pluginGone: null })).toBe(false);
    expect(settleLanded({ ...base, action: 'uninstall-plugin', pluginGone: true })).toBe(true);
  });
});

describe('工作台自更新：外面那个进程判死了就别再让用户等', () => {
  const at = '2026-10-23T01:00:00.000Z';

  it('★ 目标对得上、时间不早于点下去那一刻 → failed 带日志尾最后一句', () => {
    expect(
      selfUpdateStop({
        until: '0.3.10',
        since: dayjs(at).valueOf() - 1000,
        update: { state: 'failed', to: '0.3.10', version: '0.3.9', at, tail: '开始 / 换版没成 / 救法：dsh plugin add x' },
      }),
    ).toEqual({ kind: 'failed', version: '0.3.9', reason: '救法：dsh plugin add x' });
  });

  it('★ 回滚成功也算收尾（不再等 3 分钟）', () => {
    expect(
      selfUpdateStop({
        until: '0.3.10',
        since: dayjs(at).valueOf() - 1000,
        update: { state: 'rolled-back', to: '0.3.10', version: '0.3.9', at },
      }),
    ).toEqual({ kind: 'rolled-back', version: '0.3.9' });
  });

  it('★ 还在跑、目标不是这一版、或现场比点下去还早 → 不算', () => {
    expect(
      selfUpdateStop({ until: '0.3.10', since: 0, update: { state: 'running', to: '0.3.10', at } }),
    ).toBeUndefined();
    expect(
      selfUpdateStop({ until: '0.3.10', since: 0, update: { state: 'failed', to: '0.3.9', at } }),
    ).toBeUndefined();
    expect(
      selfUpdateStop({
        until: '0.3.10',
        since: dayjs(at).valueOf() + 60000,
        update: { state: 'failed', to: '0.3.10', at },
      }),
    ).toBeUndefined();
  });
});
