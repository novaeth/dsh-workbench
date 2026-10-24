import { describe, expect, it } from 'vitest';
import type { PluginSource, UnitManifest } from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import {
  MARKET_STATE_KEY,
  marketActions,
  marketHasUpdates,
  marketRows,
  marketSections,
  sharedRows,
} from '../market-rows';

function unit(id: string, plugin?: string, source?: PluginSource): UnitManifest {
  return {
    id,
    card: { titleKey: `${id}.mine`, order: 10 },
    tools: [],
    host: { inject: [] },
    ...(plugin === undefined
      ? {}
      : {
          env: {
            command: 'opencli',
            plugins: [
              { name: plugin, commands: ['x'], ...(source === undefined ? {} : { installSource: source }) },
            ],
          },
        }),
  };
}

function capability(
  id: string,
  status: CapabilityMap[string]['status'],
  install?: CapabilityMap[string]['install'],
): CapabilityMap {
  return {
    [id]: {
      unit: id,
      status,
      required: [],
      missing: [],
      detail: '假探测',
      ...(install === undefined ? {} : { install }),
    },
  };
}

describe('marketRows', () => {
  it('★ 目录就是交给它的那份：没有 env 供给的模块也进目录（供不供插件不是市场门槛）', () => {
    const rows = marketRows([unit('issues', 'demo'), unit('panels')], null);

    expect(rows.map((row) => row.id)).toEqual(['issues', 'panels']);
    expect(rows[0]?.titleKey).toBe('issues.mine');
    expect(Object.keys(rows[0] ?? {})).not.toContain('plugin');
    expect(JSON.stringify(rows[0])).not.toContain('demo');
  });

  it('拿到了回答但这一行没结论 → **状态未知**，不是未装，也不给动作', () => {
    const row = marketRows([unit('issues', 'demo')], {})[0];

    expect(row?.state).toBe('unknown');
    expect(MARKET_STATE_KEY.unknown).not.toBe(MARKET_STATE_KEY.missing);
    expect(row?.canInstall).toBe(false);
    expect(row?.canUpdate).toBe(false);
    expect(row?.canUninstall).toBe(false);
    expect(row?.note).toBeUndefined();
  });

  it('未装 + 来源解析得出 → 只能装（不能更新/卸载一个没装的东西）', () => {
    const row = marketRows([unit('issues', 'demo')], capability('issues', 'missing-plugin', 'ready'))[0];

    expect(row?.state).toBe('missing');
    expect(row?.canInstall).toBe(true);
    expect(row?.canUpdate).toBe(false);
    expect(row?.canUninstall).toBe(false);
  });

  it('★ 全都好用 → **不给「更新」**（拿不到"有没有新版"的事实，就不摆一个结果未知的按钮）', () => {
    const row = marketRows([unit('issues', 'demo')], capability('issues', 'ok', 'ready'))[0];

    expect(row?.state).toBe('installed');
    expect(row?.canInstall).toBe(false);
    expect(row?.canUpdate).toBe(false);
    expect(row?.canUninstall).toBe(true);
  });

  it('★ 缺必需命令 → 状态就是「要更新」，这时才给「更新」', () => {
    const row = marketRows([unit('issues', 'demo')], capability('issues', 'missing-commands'))[0];

    expect(row?.state).toBe('outdated');
    expect(MARKET_STATE_KEY.outdated).not.toBe(MARKET_STATE_KEY.installed);
    expect(row?.canUpdate).toBe(true);
    expect(row?.canInstall).toBe(false);
  });

  it('★ 命令都齐、但**源上有新版** → 模块行**不变黄**（升级归共用依赖行，2026-09-30）', () => {
    const newer: CapabilityMap = {
      issues: {
        unit: 'issues',
        status: 'ok',
        required: [],
        missing: [],
        detail: '假探测',
        plugins: [
          {
            name: 'demo',
            status: 'outdated',
            missing: [],
            release: { installed: '1.0.39', latest: '1.0.40' },
          },
        ],
      },
    };

    const row = marketRows([unit('issues', 'demo')], newer)[0];

    expect(row?.state).toBe('installed');
    expect(row?.canUpdate).toBe(false);
    expect(row?.canInstall).toBe(false);
    expect(row?.note).toBeUndefined();
    expect(JSON.stringify(row)).not.toContain('1.0.39');
    expect(JSON.stringify(row)).not.toContain('1.0.40');
    expect(marketActions(row as never)).toEqual(['uninstall']);
  });

  it('★ 版本相同（或没有版本信号）→ 仍然不给「更新」', () => {
    const same: CapabilityMap = {
      issues: {
        unit: 'issues',
        status: 'ok',
        required: [],
        missing: [],
        detail: '假探测',
        plugins: [
          {
            name: 'demo',
            status: 'ok',
            missing: [],
            release: { installed: '1.0.40', latest: '1.0.40' },
          },
        ],
      },
    };

    const row = marketRows([unit('issues', 'demo')], same)[0];

    expect(row?.state).toBe('installed');
    expect(row?.canUpdate).toBe(false);
    expect(row?.note).toBeUndefined();
  });

  it('★ 缺命令（没装好）也算"有更新"的信号', () => {
    const row = marketRows([unit('issues', 'demo')], capability('issues', 'missing-commands'))[0];

    expect(row?.state).toBe('outdated');
    expect(row?.canUpdate).toBe(true);
  });

  it('★ `ok` 就是 `ok`：没有"能凑合用但要点黄灯"的中间态了（旧口径那档降级已删，见 ADR-0016）', () => {
    const row = marketRows([unit('issues', 'demo')], capability('issues', 'ok'))[0];

    expect(row?.state).toBe('installed');
    expect(row?.canUpdate).toBe(false);
    expect(row?.note).toBeUndefined();
  });

  it('探不动（unchecked）+ 来源解析得出 → 仍然允许装（探测坏了不该连装都不让）', () => {
    const row = marketRows([unit('issues', 'demo')], capability('issues', 'unchecked', 'ready'))[0];

    expect(row?.state).toBe('unchecked');
    expect(row?.canInstall).toBe(true);
  });

  it('★ 来源拿不到时**给一句能照做的话**，而不是一个灰按钮', () => {
    const local = marketRows(
      [unit('issues', 'demo', { kind: 'local', env: 'DSH_WORKBENCH_DEMO_PLUGIN' })],
      capability('issues', 'missing-plugin', 'env-missing'),
    )[0];
    expect(local?.canInstall).toBe(false);
    expect(local?.note).toEqual({
      key: 'panels.market.needEnv',
      params: { env: 'DSH_WORKBENCH_DEMO_PLUGIN' },
    });

    const npmEnv = marketRows(
      [
        unit('issues', 'demo', {
          kind: 'npm',
          package: 'opencli-plugin-demo',
          registryEnv: 'DSH_WORKBENCH_DEMO_REGISTRY',
        }),
      ],
      capability('issues', 'missing-plugin', 'env-missing'),
    )[0];
    expect(npmEnv?.canInstall).toBe(false);
    expect(npmEnv?.note).toEqual({
      key: 'panels.market.needEnv',
      params: { env: 'DSH_WORKBENCH_DEMO_REGISTRY' },
    });

    const none = marketRows([unit('issues', 'demo')], capability('issues', 'missing-plugin', 'not-declared'))[0];
    expect(none?.note?.key).toBe('panels.market.noSource');

    const bad = marketRows([unit('issues', 'demo')], capability('issues', 'missing-plugin', 'malformed'))[0];
    expect(bad?.note?.key).toBe('panels.market.badSource');
  });

  it('已装时不给"点不动"的理由（那是未装才有的问题）', () => {
    const row = marketRows([unit('issues', 'demo')], capability('issues', 'ok', 'env-missing'))[0];

    expect(row?.note).toBeUndefined();
  });
});

describe('marketRows：共用同一份安装', () => {
  it('★ 共用不进交互层：两行都是普通行、都能卸，模型里也没有"和谁共用"这种字段', () => {
    const both = { ...capability('issues', 'ok'), ...capability('builds', 'ok') };
    const rows = marketRows([unit('issues', 'demo'), unit('builds', 'demo')], both);

    expect(rows.map((row) => row.id)).toEqual(['issues', 'builds']);
    for (const row of rows) expect(marketActions(row)).toEqual(['uninstall']);
    expect(Object.keys(rows[0] ?? {})).not.toContain('sharedWith');
  });

  it('没装的时候本来就没有卸载', () => {
    const row = marketRows([unit('issues', 'demo'), unit('builds', 'demo')], capability('issues', 'missing-plugin', 'ready'))[0];

    expect(row?.canUninstall).toBe(false);
    expect(row?.canInstall).toBe(true);
  });
});

describe('marketRows：卸载过的模块（released）', () => {
  const releasedOk: CapabilityMap = {
    issues: { unit: 'issues', status: 'ok', required: [], missing: [], detail: '假探测', released: true },
  };

  it('★ 卸载过 → 未装（即使插件还在），给「安装」，不再给「卸载」', () => {
    const row = marketRows([unit('issues', 'demo')], releasedOk)[0];

    expect(row?.state).toBe('missing');
    expect(marketActions(row as never)).toEqual(['install']);
    expect(row?.canUninstall).toBe(false);
  });

  it('★ 卸载过、插件真不在且来源拿不到 → 不给按钮，但仍给能照做的话', () => {
    const row = marketRows(
      [unit('issues', 'demo', { kind: 'local', env: 'DSH_WORKBENCH_DEMO_PLUGIN' })],
      {
        issues: {
          unit: 'issues',
          status: 'missing-plugin',
          required: [],
          missing: [],
          detail: '假探测',
          install: 'env-missing',
          released: true,
        },
      },
    )[0];

    expect(row?.state).toBe('missing');
    expect(row?.canInstall).toBe(false);
    expect(row?.note?.key).toBe('panels.market.needEnv');
  });

  it('没卸载过的共用模块照旧是「已装」（共享本身不进交互层）', () => {
    const both = { ...capability('issues', 'ok'), ...capability('builds', 'ok') };
    const rows = marketRows([unit('issues', 'demo'), unit('builds', 'demo')], both);

    expect(rows[0]?.state).toBe('installed');
    expect(rows[1]?.state).toBe('installed');
  });
});

describe('marketActions', () => {
  const cap = (status: CapabilityMap[string]['status']): CapabilityMap => capability('issues', status);

  it('★ 要更新 → [更新][卸载]（黄点亮着却一个按钮都没有，就是这里漏了）', () => {
    const row = marketRows([unit('issues', 'demo')], capability('issues', 'missing-commands'))[0];

    expect(row?.state).toBe('outdated');
    expect(marketActions(row as never)).toEqual(['update', 'uninstall']);
  });

  it('未装且装得了 → [安装]', () => {
    const row = marketRows([unit('issues', 'demo')], capability('issues', 'missing-plugin', 'ready'))[0];

    expect(marketActions(row as never)).toEqual(['install']);
  });

  it('健康已装 → 只有 [卸载]（没有"更新"）', () => {
    const row = marketRows([unit('issues', 'demo')], capability('issues', 'ok'))[0];

    expect(marketActions(row as never)).toEqual(['uninstall']);
  });

  it('共用同一份安装 → 仍然给 [卸载]（那份会留着，不是不能卸）', () => {
    const rows = marketRows([unit('issues', 'demo'), unit('builds', 'demo')], capability('issues', 'ok'));

    expect(marketActions(rows[0] as never)).toEqual(['uninstall']);
  });

  it('还没探完 / 探不动 → 没有按钮（别给一个结果未知的）', () => {
    expect(marketActions(marketRows([unit('issues', 'demo')], null)[0] as never)).toEqual([]);
    expect(marketActions(marketRows([unit('issues', 'demo')], cap('unchecked'))[0] as never)).toEqual([]);
  });
});

describe('marketSections', () => {
  it('★ 按"在不在机器上"分段：装了 / 要更新同段，还没装的是另一段，行序不变', () => {
    const rows = marketRows(
      [unit('issues', 'demo'), unit('builds', 'demo'), unit('perms', 'demo')],
      {
        ...capability('issues', 'ok'),
        ...capability('builds', 'missing-commands'),
        ...capability('perms', 'missing-plugin', 'ready'),
      },
    );

    const sections = marketSections(rows);

    expect(sections.map((section) => section.id)).toEqual(['installed', 'not-installed']);
    expect(sections[0]?.titleKey).toBe('panels.market.sectionInstalled');
    expect(sections[1]?.titleKey).toBe('panels.market.sectionPending');
    expect(sections[0]?.rows.map((row) => row.id)).toEqual(['issues', 'builds']);
    expect(sections[1]?.rows.map((row) => row.id)).toEqual(['perms']);
    expect(sections.flatMap((section) => section.rows).map((row) => row.id)).toEqual(rows.map((row) => row.id));
  });

  it('★ 空段不出现（只有未装时不给一个"已安装 0"）', () => {
    const onlyPending = marketRows([unit('issues', 'demo')], capability('issues', 'missing-plugin', 'ready'));
    expect(marketSections(onlyPending).map((section) => section.id)).toEqual(['not-installed']);

    const onlyInstalled = marketRows([unit('issues', 'demo')], capability('issues', 'ok'));
    expect(marketSections(onlyInstalled).map((section) => section.id)).toEqual(['installed']);

    expect(marketSections([])).toEqual([]);
  });

  it('★ 「还在探」与「探不动」都还没有结论说它在机器上 → 归未安装那一段', () => {
    expect(marketSections(marketRows([unit('issues', 'demo')], null))[0]?.id).toBe('not-installed');
    expect(
      marketSections(marketRows([unit('issues', 'demo')], capability('issues', 'unchecked', 'ready')))[0]?.id,
    ).toBe('not-installed');
  });
});

describe('marketHasUpdates', () => {
  const newer: CapabilityMap[string]['plugins'] = [
    {
      name: 'demo',
      status: 'outdated',
      missing: [],
      release: { installed: '1.0.16', latest: '1.0.17' },
    },
  ];

  it('★ 有要更新的行 → 亮（模块缺命令；或一份**共用依赖**有新版）', () => {
    const manifests = [unit('issues', 'demo')];
    const commands = marketRows(manifests, capability('issues', 'missing-commands'));
    const release: CapabilityMap = {
      issues: {
        unit: 'issues',
        status: 'ok',
        required: [],
        missing: [],
        detail: '假探测',
        plugins: newer,
      },
    };

    expect(marketHasUpdates(commands)).toBe(true);
    expect(marketHasUpdates(marketRows(manifests, release))).toBe(false);
    expect(marketHasUpdates([], sharedRows(manifests, release))).toBe(true);
  });

  it('★ 全都好用 / 未装 / 还没探完 / 探不动 → 不亮（没有结论就不许点灯）', () => {
    expect(marketHasUpdates(marketRows([unit('issues', 'demo')], capability('issues', 'ok')))).toBe(false);
    expect(
      marketHasUpdates(marketRows([unit('issues', 'demo')], capability('issues', 'missing-plugin', 'ready'))),
    ).toBe(false);
    expect(marketHasUpdates(marketRows([unit('issues', 'demo')], null))).toBe(false);
    expect(
      marketHasUpdates(marketRows([unit('issues', 'demo')], capability('issues', 'unchecked', 'ready'))),
    ).toBe(false);
    expect(marketHasUpdates([])).toBe(false);
  });

  it('★ 探测结论换成"动作之后重探"的那一份 → 入口那颗标签就该灭（用户实测：升完还挂着）', () => {
    const manifests = [unit('issues', 'demo')];
    const stale = capability('issues', 'missing-commands');
    expect(marketHasUpdates(marketRows(manifests, stale))).toBe(true);

    const afterAction = capability('issues', 'ok');
    expect(marketHasUpdates(marketRows(manifests, afterAction))).toBe(false);
  });

  it('多行里有**一行**要更新就够了', () => {
    const rows = marketRows(
      [unit('issues', 'demo'), unit('builds', 'demo')],
      { ...capability('issues', 'ok'), ...capability('builds', 'missing-commands') },
    );

    expect(marketHasUpdates(rows)).toBe(true);
  });
});

describe('模块包有新版本：行的「更新」改成升包，并且照实说"要重启"', () => {
  const manifest: UnitManifest = {
    id: 'hello',
    card: { titleKey: 'hello.mine', order: 10 },
    tools: [],
    host: { inject: [] },
    env: { command: 'opencli', plugins: [{ name: 'hello', commands: ['x'] }] },
  };
  const update = { hello: { installed: '0.1.2', latest: '0.2.0' } };

  it('★ 有新版 → 「更新」的意思是升包（update-bundle），不是升插件', () => {
    const rows = marketRows([manifest], capability('hello', 'ok'), update);
    expect(marketActions(rows[0] as never)).toEqual(['update-bundle', 'uninstall']);
    expect(rows[0]?.moduleUpdate).toEqual({ installed: '0.1.2', latest: '0.2.0' });
    expect(rows[0]?.version).toEqual({ installed: '0.1.2', latest: '0.2.0' });
    expect(rows[0]?.state).toBe('outdated');
    expect(rows[0]?.note).toBeUndefined();
  });

  it('没有新版 → 一行不动（还是老的供给「更新」）', () => {
    const rows = marketRows([manifest], capability('hello', 'missing-commands'), {});
    expect(marketActions(rows[0] as never)).toEqual(['update', 'uninstall']);
    expect(rows[0]?.moduleUpdate).toBeUndefined();
  });

  it('供给也没装 + 包有新版本 → 两个动作都在，但话只说升级那一句（升级会把供给一起处理）', () => {
    const rows = marketRows([manifest], capability('hello', 'missing-plugin', 'ready'), update);
    expect(marketActions(rows[0] as never)).toEqual(['install', 'update-bundle']);
    expect(rows[0]?.note).toBeUndefined();
  });

  it('★ 顶上那枚"有新版本"标签也认包的新版（不然列表说有条目、标签说没有）', () => {
    const rows = marketRows([manifest], capability('hello', 'ok'), update);
    expect(marketHasUpdates(rows)).toBe(true);
    expect(marketHasUpdates(marketRows([manifest], capability('hello', 'ok'), {}))).toBe(false);
  });
});

describe('C：市场里那颗「默认启用」（机器级默认板）', () => {
  it('★ 模块行带机器级默认的真假；没在默认名单里的是 false（不是 undefined）', () => {
    const rows = marketRows([unit('a', 'plug'), unit('b', 'plug')], null, {}, new Set(['b']));
    expect(rows.map((row) => [row.id, row.defaultShown])).toEqual([
      ['a', false],
      ['b', true],
    ]);
  });

  it('★ 影响面：几个工作区在这一行改过，跟着行一起带出来（0 = 没人改过）', () => {
    const rows = marketRows([unit('a', 'plug'), unit('b', 'plug')], null, {}, new Set(['a']), { a: 3 });
    expect(rows.map((row) => row.defaultChanged)).toEqual([3, 0]);
  });
  it('★ 不带默认名单时也给出 false：这颗开关按"有没有这个字段"决定画不画，不能靠 undefined 混过去', () => {
    const rows = marketRows([unit('a', 'plug')], null);
    expect(rows[0]?.defaultShown).toBe(false);
    expect(rows[0]?.defaultChanged).toBe(0);
  });

  it('★ 不是模块的那几类不许带这个字段（工作台自己 / opencli 插件 / 共用依赖都不吃机器级默认板）', async () => {
    const { installedPluginRows } = await import('../market-plugin-rows');
    const { workbenchRow } = await import('../market-workbench-row');

    expect(installedPluginRows([])).toEqual([]);
    expect(workbenchRow(null)).toBeUndefined();
    expect(sharedRows([unit('a', 'plug')], null).every((row) => !('defaultShown' in row))).toBe(true);
  });
});
