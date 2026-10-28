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
  titleKey: 'hello.mine', card: { order: 10 },
  tools: [],
  host: { inject: [] },
  needs: [{ kind: 'extension', runtime: 'opencli', name: 'hello', commands: ['x'], purpose: '测试' }],
};

const BARE: UnitManifest = {
  id: 'ghost',
  titleKey: 'ghost.mine', card: { order: 20 },
  tools: [],
  host: { inject: [] },
};

const OK: CapabilityMap = {
  hello: { unit: 'hello', status: 'ok', needs: [] },
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
        needs: [{ id: 'extension:hello', kind: 'extension', name: 'hello', status: 'outdated', missing: [], detail: '假探测' }],
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

  it('★ 源上的新版装不了（要更新的工作台）→ 不写 latest 之外的判断，也不点亮「有新版本」', () => {
    const modules = [
      {
        unit: 'hello',
        pkg: 'pkg-hello',
        installed: '0.1.8',
        latest: '0.2.0',
        latestBlocked: 'needs-workbench',
      },
    ] as const;

    expect(marketUpdatesOf(modules)).toEqual({
      hello: { installed: '0.1.8', latest: '0.2.0', blocked: 'needs-workbench' },
    });
    expect(marketHintOf({ manifests: [MANIFEST], capabilities: OK, modules })).toBeNull();
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

  it('哪一档都没有 → 什么都不亮', () => {
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

const OTHER: UnitManifest = { ...MANIFEST, id: 'other' };

describe('状态未知那一档（黄）：让用户知道读数缺口，但不当成模块异常', () => {
  it('★ 探测结果里没有这一行 → 亮「状态未知」，不是红档', () => {
    expect(marketHintOf({ manifests: [MANIFEST], capabilities: {}, modules: [] })).toEqual({
      labelKey: 'panels.market.unchecked',
      tone: 'warning',
    });
  });

  it('★ 探测服务自己说检测不了（unchecked）→ 同一档', () => {
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: { hello: { unit: 'hello', status: 'unchecked', needs: [] } },
        modules: [],
      }),
    ).toEqual({ labelKey: 'panels.market.unchecked', tone: 'warning' });
  });

  it('★ 名单还没读回来 → 不亮「状态未知」（刷新那一闪：没依赖要探的那份，装没装全看名单）', () => {
    expect(
      marketHintOf({
        manifests: [BARE],
        installable: new Set(['ghost']),
        capabilities: {},
        modules: null,
      }),
    ).toBeNull();
  });

  it('★ 名单读回来了、本机确实没有它 → 照旧「状态未知」（判据没被放宽）', () => {
    expect(
      marketHintOf({
        manifests: [BARE],
        installable: new Set(['ghost']),
        capabilities: {},
        modules: [],
      }),
    ).toEqual({ labelKey: 'panels.market.unchecked', tone: 'warning' });
  });

  it('★ 探测自己说检测不了 → 名单还没读回来也照旧亮（那是探测的结论，不是名册在路上的那一缝）', () => {
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: { hello: { unit: 'hello', status: 'unchecked', needs: [] } },
        modules: null,
      }),
    ).toEqual({ labelKey: 'panels.market.unchecked', tone: 'warning' });
  });

  it('★ 有更具体的档时让位：重启后生效 > 状态未知 > 有新版本', () => {
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: {},
        modules: [],
        workbench: { pkg: CORE, installed: '0.1.19', running: '0.1.18' },
      }),
    ).toEqual({
      labelKey: 'panels.market.pendingRestart',
      tone: 'warning',
      moreKeys: ['panels.market.unchecked'],
    });
    expect(
      marketHintOf({
        manifests: [MANIFEST, OTHER],
        capabilities: {},
        modules: [{ unit: 'hello', pkg: 'pkg-hello', installed: '0.1.8', latest: '0.1.9' }],
      }),
    ).toEqual({
      labelKey: 'panels.market.unchecked',
      tone: 'warning',
      moreKeys: ['panels.market.hasNew'],
    });
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
} satisfies Partial<Record<MarketState, () => MarketHintInput>>;

const RESTART_CASES = {
  inactive: () => ({
    manifests: [MANIFEST],
    capabilities: OK,
    modules: [],
    installed: [{ unit: 'ghost', pkg: '@a/ghost', installed: '1.0.0' }],
  }),
  'pending-restart': () => ({
    manifests: [MANIFEST],
    capabilities: OK,
    modules: [],
    workbench: { pkg: CORE, installed: '0.1.19', running: '0.1.18' },
  }),
} satisfies Partial<Record<MarketState, () => MarketHintInput>>;

const ERROR_BUCKET: Partial<Record<MarketState, string>> = {
  unusable: PROBLEM.labelKey,
  broken: PROBLEM.labelKey,
};

describe('状态点与入口标签的对应', () => {
  it('★ 总表里每个 dot=error 的 state 都落进 problem 那一档', () => {
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

  it('★ 等重启那两格是黄点，且落进 restart 那一档', () => {
    for (const [state, make] of Object.entries(RESTART_CASES)) {
      expect(MARKET_DOT[state as MarketState], state).toBe('warning');
      expect(marketHintOf(make()), state).toEqual(RESTART);
    }
  });

  it('★ 每格夹具真的产出那个 state（不然穷尽性是空转：塌成同一档也照样绿）', () => {
    const listed: ReadonlySet<string> = new Set();

    expect(installedRows(RESTART_CASES.inactive().installed ?? [], [MANIFEST], listed)[0]?.state).toBe(
      'inactive',
    );
    expect(installedRows(ERROR_CASES.unusable().installed ?? [], [MANIFEST], listed)[0]?.state).toBe(
      'unusable',
    );
    expect(installedPluginRows(ERROR_CASES.broken().plugins ?? [])[0]?.state).toBe('broken');
    expect(workbenchRow(RESTART_CASES['pending-restart']().workbench)?.state).toBe('pending-restart');
  });
});

describe('安装进行中 / 刚装上：徽标不许按半截读数说话', () => {
  const UNKNOWN: MarketHintInput = { manifests: [MANIFEST], capabilities: {}, modules: [] };
  const WAITING: MarketHintInput = {
    manifests: [MANIFEST],
    capabilities: OK,
    modules: [],
    installed: [{ unit: 'ghost', pkg: '@a/ghost', installed: '1.0.0' }],
  };
  const APPLIED: MarketHintInput = { ...WAITING, applied: new Set(['ghost']) };

  it('★ 正在装：能力表还没跟上（状态未知）不当成问题亮出来', () => {
    expect(marketHintOf({ ...UNKNOWN, installing: true })).toBeNull();
    expect(marketHintOf(UNKNOWN)).toEqual({ labelKey: 'panels.market.unchecked', tone: 'warning' });
  });

  it('★ 正在装：装机名单已经有了、客户端还没挂上的那一行不报「重启后生效」', () => {
    expect(marketHintOf({ ...WAITING, installing: true })).toBeNull();
    expect(marketHintOf(WAITING)).toEqual(RESTART);
  });

  it('★ 正在装：工作台自己那档「重启后生效」照旧亮（那不是安装的副作用）', () => {
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: OK,
        modules: [],
        workbench: { pkg: CORE, installed: '0.1.19', running: '0.1.18' },
        installing: true,
      }),
    ).toEqual(RESTART);
  });

  it('★ 装完（applied）那一单元当它不在名单里：不报重启 / 状态未知 / 有新版本', () => {
    expect(marketHintOf(APPLIED)).toBeNull();
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: {},
        modules: [],
        applied: new Set(['hello']),
      }),
    ).toBeNull();
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: OK,
        modules: [{ unit: 'hello', pkg: 'pkg-hello', installed: '0.1.8', latest: '0.1.9' }],
        applied: new Set(['hello']),
      }),
    ).toBeNull();
  });

  it('★ applied 只管那一个单元：别的模块等重启照旧亮', () => {
    expect(
      marketHintOf({
        ...APPLIED,
        installed: [
          ...(APPLIED.installed ?? []),
          { unit: 'other', pkg: '@a/other', installed: '1.0.0' },
        ],
      }),
    ).toEqual(RESTART);
  });

  it('★ 正在装也不许盖掉真正的异常（红档照旧）', () => {
    expect(
      marketHintOf({
        manifests: [MANIFEST],
        capabilities: OK,
        modules: [],
        installed: [
          { unit: 'ghost', pkg: '@a/ghost', installed: '1.0.0', clientRefused: ['宿主把这份拒了'] },
        ],
        installing: true,
      }),
    ).toEqual(PROBLEM);
  });

  it('★ 说要重启的那种（没有 applied）当场按真实状态说，不压后', () => {
    expect(marketHintOf({ ...WAITING, installing: false })).toEqual(RESTART);
  });
});
