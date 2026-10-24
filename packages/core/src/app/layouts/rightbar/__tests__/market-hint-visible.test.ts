import { describe, expect, it } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import { installedPluginRows } from '../market-plugin-rows';
import { marketHintOf, type MarketHintInput } from '../market-hint';
import { MARKET_DOT, installedRows, marketUpdatesOf, type MarketState } from '../market-rows';
import { workbenchRow } from '../market-workbench-row';

const CORE = '@dsh-workbench/core';

const MANIFEST: UnitManifest = {
  id: 'hello',
  card: { titleKey: 'hello.mine', order: 10 },
  tools: [],
  host: { inject: [] },
  env: { command: 'opencli', plugins: [{ name: 'hello', commands: ['x'] }] },
};

const BARE: UnitManifest = {
  id: 'ghost',
  card: { titleKey: 'ghost.mine', order: 20 },
  tools: [],
  host: { inject: [] },
};

const OK: CapabilityMap = {
  hello: { unit: 'hello', status: 'ok', required: [], missing: [], detail: '假探测' },
};

const BEHIND = [{ unit: 'hello', pkg: 'pkg-hello', installed: '0.1.8', latest: '0.1.9' }];

const NEW = { labelKey: 'panels.market.hasNew', tone: 'warning' };
const PROBLEM = { labelKey: 'panels.market.hasProblem', tone: 'danger' };
const RESTART = { labelKey: 'panels.market.pendingRestart', tone: 'warning' };

describe('左栏入口那枚标签：与市场页读同一份模块版本', () => {
  it('★ 模块包有新版本 → 标签亮（入口漏带这份读数时它永远不亮）', () => {
    expect(marketHintOf({ manifests: [MANIFEST], capabilities: OK, modules: BEHIND })).toEqual(NEW);
  });

  it('已是最新 / 还没读数 / 没问到 latest → 标签不亮', () => {
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: OK,
        modules: [{ unit: 'hello', pkg: 'pkg-hello', installed: '0.1.8', latest: '0.1.8' }],
      }),
    ).toBeNull();
    expect(marketHintOf({ manifests: [MANIFEST], capabilities: OK, modules: null })).toBeNull();
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: OK,
        modules: [{ unit: 'hello', pkg: 'pkg-hello', installed: '0.1.8' }],
      }),
    ).toBeNull();
  });

  it('共用依赖（opencli 插件）旧了照样亮', () => {
    const shared: CapabilityMap = {
      hello: {
        unit: 'hello',
        status: 'ok',
        required: [],
        missing: [],
        detail: '假探测',
        plugins: [{ name: 'hello', status: 'outdated', missing: [] }],
      },
    };
    expect(marketHintOf({ manifests: [MANIFEST], capabilities: shared, modules: null })).toEqual(NEW);
  });

  it('marketUpdatesOf：没有读数就是空表；没问到 latest 就不写这个键', () => {
    expect(marketUpdatesOf(null)).toEqual({});
    expect(
      marketUpdatesOf([
        { unit: 'a', pkg: 'pkg-a', installed: '1.0.0' },
        { unit: 'b', pkg: 'pkg-b', installed: '1.0.0', latest: '1.0.1' },
      ]),
    ).toEqual({ a: { installed: '1.0.0' }, b: { installed: '1.0.0', latest: '1.0.1' } });
  });

  it('★ 本机那份（link:）不问源：就算源上有新版，也不写 latest、也不让标签亮', () => {
    const updates = marketUpdatesOf([
      { unit: 'hello', pkg: 'pkg-hello', installed: '0.1.8', latest: '0.1.9', local: true },
    ]);

    expect(updates).toEqual({ hello: { installed: '0.1.8', local: true } });
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: OK,
        modules: [{ unit: 'hello', pkg: 'pkg-hello', installed: '0.1.8', latest: '0.1.9', local: true }],
      }),
    ).toBeNull();
  });
});

describe('左栏入口那枚标签：三档（模块异常 / 重启后生效 / 有新版本）', () => {
  it('★ 装了没生效（未生效）→ 「重启后生效」，不是模块异常', () => {
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: OK,
        modules: [],
        installed: [{ unit: 'ghost', pkg: '@a/ghost', installed: '1.0.0' }],
      }),
    ).toEqual(RESTART);
  });

  it('★ 工作台 running ≠ installed（重启后生效）→ 同一档「重启后生效」', () => {
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: OK,
        modules: [],
        workbench: { pkg: CORE, installed: '0.1.19', running: '0.1.18' },
      }),
    ).toEqual(RESTART);
  });

  it('★ 装了但用不了（不可用）→ 模块异常', () => {
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: OK,
        modules: [],
        installed: [
          { unit: 'ghost', pkg: '@a/ghost', installed: '1.0.0', clientRefused: ['宿主把这份拒了'] },
        ],
      }),
    ).toEqual(PROBLEM);
  });

  it('★ opencli 插件装坏了 → 模块异常', () => {
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: OK,
        modules: [],
        plugins: [{ pkg: 'opencli-plugin-x', name: 'x', broken: true }],
      }),
    ).toEqual(PROBLEM);
  });

  it('★ 不可用 + 源上有新版 → 仍然是模块异常（黄 state 盖不住「声明被拒」）', () => {
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: OK,
        modules: [],
        installed: [
          {
            unit: 'ghost',
            pkg: '@a/ghost',
            installed: '1.0.0',
            latest: '1.1.0',
            clientRefused: ['宿主把这份拒了'],
          },
        ],
      }),
    ).toEqual({ ...PROBLEM, moreKeys: ['panels.market.hasNew'] });
  });

  it('★ 插件装坏了 + 源上有新版 → 同样是模块异常', () => {
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: OK,
        modules: [],
        plugins: [
          { pkg: 'opencli-plugin-x', name: 'x', installed: '1.0.0', latest: '1.1.0', broken: true },
        ],
      }),
    ).toEqual({ ...PROBLEM, moreKeys: ['panels.market.hasNew'] });
  });

  it('★ 三档同时真 → 徽标说模块异常，名字里按 problem > restart > updates 补齐', () => {
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: OK,
        modules: [],
        installed: [
          {
            unit: 'ghost',
            pkg: '@a/ghost',
            installed: '1.0.0',
            latest: '1.1.0',
            clientRefused: ['宿主把这份拒了'],
          },
        ],
        workbench: { pkg: CORE, installed: '0.1.19', running: '0.1.18' },
      }),
    ).toEqual({ ...PROBLEM, moreKeys: ['panels.market.pendingRestart', 'panels.market.hasNew'] });
  });

  it('★ 重启后生效 + 有新版 → 徽标说重启，名字里带上「有新版本」', () => {
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: OK,
        modules: [],
        workbench: { pkg: CORE, installed: '0.1.19', latest: '0.1.20', running: '0.1.18' },
      }),
    ).toEqual({ ...RESTART, moreKeys: ['panels.market.hasNew'] });
  });

  it('★ 未生效 + 源上有新版 → 仍然是「重启后生效」（黄 state 盖不住「装了没载入」）', () => {
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: OK,
        modules: [{ unit: 'ghost', pkg: '@a/ghost', installed: '1.0.0', latest: '1.1.0' }],
        installed: [{ unit: 'ghost', pkg: '@a/ghost', installed: '1.0.0', latest: '1.1.0' }],
      }),
    ).toEqual({ ...RESTART, moreKeys: ['panels.market.hasNew'] });
  });

  it('★ 市场目录里没有、本机装着的模块：名单要按全部 manifests 翻（传窄了会假红）', () => {
    expect(
      marketHintOf({
        manifests: [MANIFEST, BARE],
        capabilities: OK,
        modules: [],
        installed: [{ unit: 'ghost', pkg: '@a/ghost', installed: '1.0.0' }],
      }),
    ).toBeNull();
  });

  it('★ 还没探测结论 / 还没读装机名单 → 不许误报红', () => {
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: null,
        modules: [{ unit: 'hello', pkg: 'pkg-hello', installed: '0.1.8' }],
        installed: [],
      }),
    ).toBeNull();
    expect(marketHintOf({ manifests: [MANIFEST], capabilities: OK, modules: null })).toBeNull();
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: OK,
        modules: [{ unit: 'ghost', pkg: '@a/ghost', installed: '1.0.0' }],
        installed: undefined,
      }),
    ).toBeNull();
  });

  it('三档都没有 → 什么都不亮', () => {
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: OK,
        modules: [{ unit: 'hello', pkg: 'pkg-hello', installed: '0.1.8', latest: '0.1.8' }],
        installed: [],
        plugins: [],
        workbench: null,
      }),
    ).toBeNull();
  });
});

describe('更新跑着的那一单元：徽标当它不在名单里（不许闪「重启后生效」）', () => {
  const MID_UPDATE = {
    manifests: [MANIFEST],
    capabilities: OK,
    modules: [{ unit: 'ghost', pkg: '@a/ghost', installed: '1.0.0', latest: '1.1.0' }],
    installed: [{ unit: 'ghost', pkg: '@a/ghost', installed: '1.0.0', latest: '1.1.0' }],
  };

  it('★ 先卸再装把名册里那一份拿走的当口 → 不报「重启后生效」（用户看到的那一闪）', () => {
    expect(marketHintOf({ ...MID_UPDATE, busy: new Set(['ghost']) })).toBeNull();
  });

  it('同一份输入、不标 busy → 照旧是「重启后生效」（判据没被放宽）', () => {
    expect(marketHintOf(MID_UPDATE)).toEqual({ ...RESTART, moreKeys: ['panels.market.hasNew'] });
  });

  it('★ busy 只管那一个单元：别的模块等重启、别的问题照旧亮', () => {
    expect(
      marketHintOf({
        ...MID_UPDATE,
        installed: [
          ...MID_UPDATE.installed,
          { unit: 'other', pkg: '@a/other', installed: '1.0.0' },
        ],
        busy: new Set(['ghost']),
      }),
    ).toEqual(RESTART);
    expect(
      marketHintOf({
        ...MID_UPDATE,
        plugins: [{ pkg: 'opencli-plugin-x', name: 'x', broken: true }],
        busy: new Set(['ghost']),
      }),
    ).toEqual(PROBLEM);
  });

  it('★ 名册里回来了、读数还没追上（busy 还挂着）→ 不报「有新版本」', () => {
    expect(
      marketHintOf({ ...MID_UPDATE, manifests: [MANIFEST, BARE], busy: new Set(['ghost']) }),
    ).toBeNull();
  });

  it('★ 真落地（读数也追平、busy 撤了）→ 什么都不亮', () => {
    expect(
      marketHintOf({
        manifests: [MANIFEST, BARE],
        capabilities: OK,
        modules: [{ unit: 'ghost', pkg: '@a/ghost', installed: '1.1.0', latest: '1.1.0' }],
        installed: [{ unit: 'ghost', pkg: '@a/ghost', installed: '1.1.0', latest: '1.1.0' }],
      }),
    ).toBeNull();
  });
});

const ERROR_CASES = {
  inactive: () => ({
    manifests: [MANIFEST],
    capabilities: OK,
    modules: [],
    installed: [{ unit: 'ghost', pkg: '@a/ghost', installed: '1.0.0' }],
  }),
  unusable: () => ({
    manifests: [MANIFEST],
    capabilities: OK,
    modules: [],
    installed: [{ unit: 'ghost', pkg: '@a/ghost', installed: '1.0.0', clientRefused: ['宿主把这份拒了'] }],
  }),
  broken: () => ({
    manifests: [MANIFEST],
    capabilities: OK,
    modules: [],
    plugins: [{ pkg: 'opencli-plugin-x', name: 'x', broken: true }],
  }),
  'pending-restart': () => ({
    manifests: [MANIFEST],
    capabilities: OK,
    modules: [],
    workbench: { pkg: CORE, installed: '0.1.19', running: '0.1.18' },
  }),
} satisfies Partial<Record<MarketState, () => MarketHintInput>>;

const ERROR_BUCKET: Partial<Record<MarketState, string>> = {
  inactive: RESTART.labelKey,
  unusable: PROBLEM.labelKey,
  broken: PROBLEM.labelKey,
  'pending-restart': RESTART.labelKey,
};

describe('红点总表的穷尽性', () => {
  it('★ 总表里每个 dot=error 的 state 都落进 problem / restart，而且落对那一档', () => {
    const dots = Object.entries(MARKET_DOT)
      .filter(([, dot]) => dot === 'error')
      .map(([state]) => state);
    const cases = Object.entries(ERROR_CASES);

    expect(cases.map(([state]) => state).sort()).toEqual(dots.sort());
    for (const [state, make] of cases) {
      const hint = marketHintOf(make());
      expect(hint?.labelKey, state).toBe(ERROR_BUCKET[state as MarketState]);
    }
  });

  it('★ 每格夹具真的产出那个 state（不然穷尽性是空转：塌成同一档也照样绿）', () => {
    const listed: ReadonlySet<string> = new Set();

    expect(installedRows(ERROR_CASES.inactive().installed ?? [], [MANIFEST], listed)[0]?.state).toBe(
      'inactive',
    );
    expect(installedRows(ERROR_CASES.unusable().installed ?? [], [MANIFEST], listed)[0]?.state).toBe(
      'unusable',
    );
    expect(installedPluginRows(ERROR_CASES.broken().plugins ?? [])[0]?.state).toBe('broken');
    expect(workbenchRow(ERROR_CASES['pending-restart']().workbench)?.state).toBe('pending-restart');
  });
});
