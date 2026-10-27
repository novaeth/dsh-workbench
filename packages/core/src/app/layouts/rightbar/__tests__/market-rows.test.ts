import { describe, expect, it } from 'vitest';
import type { NeedState, UnitManifest } from '@dsh-workbench/shared/host';
import { unitTitleKey } from '@dsh-workbench/shared/host';
import {
  binNeedOf,
  capabilityOf,
  extensionNeedOf,
  fakeNpmSource,
  libNeedOf,
  manifestOf,
  needStateOf,
} from '@dsh-workbench/shared/testing';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import {
  MARKET_STATE_KEY,
  marketActions,
  marketHasUpdates,
  marketRowTitle,
  marketRows,
  marketSections,
  sharedRows,
} from '../market-rows';

const DEMO = extensionNeedOf('demo', { commands: ['x'], sources: [fakeNpmSource] });

function unit(id: string, needs: UnitManifest['needs'] = [DEMO]): UnitManifest {
  return manifestOf({ id, needs });
}

function capsOf(
  id: string,
  status: CapabilityMap[string]['status'],
  needs: readonly NeedState[] = [],
): CapabilityMap {
  return { [id]: capabilityOf(id, needs, { status }) };
}

function installed(id = 'issues'): CapabilityMap {
  return capsOf(id, 'ok', [needStateOf(DEMO, 'ok')]);
}

function missing(extra: Partial<NeedState> = {}, id = 'issues'): CapabilityMap {
  return capsOf(id, 'missing', [needStateOf(DEMO, 'missing', extra)]);
}

function outdated(extra: Partial<NeedState> = {}): CapabilityMap {
  return capsOf('issues', 'outdated', [needStateOf(DEMO, 'outdated', { missing: ['x'], ...extra })]);
}

describe('marketRows', () => {
  it('★ 目录就是交给它的那份：没有 needs 的模块也进目录（供不供依赖不是市场门槛）', () => {
    const rows = marketRows([unit('issues'), unit('panels', [])], null);

    expect(rows.map((row) => row.id)).toEqual(['issues', 'panels']);
    expect(rows[0]?.titleKey).toBe(unitTitleKey('issues'));
    expect(Object.keys(rows[0] ?? {})).not.toContain('plugin');
    expect(JSON.stringify(rows[0])).not.toContain('demo');
  });

  it('★ 清单说没有卡片（card: null）：标题键还是清单里那个，不退回单元 id', () => {
    const row = marketRows([{ ...unit('gitops'), card: null }], null)[0];
    const t = (key: string): string =>
      ({ 'dsh-workbench.unit.gitops.title': 'GitOps' })[key] ?? key;

    expect(row?.titleKey).toBe('dsh-workbench.unit.gitops.title');
    expect(marketRowTitle(row as never, t)).toBe('GitOps');
  });

  it('拿到了回答但这一行没结论 → **状态未知**，不是未装，也不给动作', () => {
    const row = marketRows([unit('issues')], {})[0];

    expect(row?.state).toBe('unknown');
    expect(MARKET_STATE_KEY.unknown).not.toBe(MARKET_STATE_KEY.missing);
    expect(row?.canInstall).toBe(false);
    expect(row?.canUpdate).toBe(false);
    expect(row?.canUninstall).toBe(false);
    expect(row?.note).toBeUndefined();
    expect(row?.hint).toBe('panels.market.uncheckedHint');
  });

  it('未装 + 来源解析得出 → 只能装（不能更新/卸载一个没装的东西）', () => {
    const row = marketRows([unit('issues')], missing({ provision: 'ready' }))[0];

    expect(row?.state).toBe('missing');
    expect(row?.canInstall).toBe(true);
    expect(row?.canUpdate).toBe(false);
    expect(row?.canUninstall).toBe(false);
  });

  it('★ 全都好用 → **不给「更新」**', () => {
    const row = marketRows([unit('issues')], installed())[0];

    expect(row?.state).toBe('installed');
    expect(row?.canInstall).toBe(false);
    expect(row?.canUpdate).toBe(false);
    expect(row?.canUninstall).toBe(true);
  });

  it('★ 源上的新版要更新的工作台 → 说「有新版」，但不给更新按钮，并说清为什么', () => {
    const row = marketRows([unit('issues')], installed(), {
      issues: { installed: '1.0.0', latest: '2.0.0', blocked: 'needs-workbench' },
    })[0];

    expect(row).toMatchObject({
      state: 'outdated',
      hint: 'panels.market.updateNeedsWorkbench',
      moduleUpdate: { installed: '1.0.0', latest: '2.0.0', blocked: 'needs-workbench' },
    });
    expect(marketActions(row as never)).toEqual(['uninstall']);
    expect(marketHasUpdates([row as never])).toBe(false);
  });

  it('★ 新版和这一版工作台不匹配（更旧或形状不对）→ 也不给更新，换一句说清', () => {
    const row = marketRows([unit('issues')], installed(), {
      issues: { installed: '1.0.0', latest: '1.1.0', blocked: 'incompatible' },
    })[0];

    expect(row?.hint).toBe('panels.market.updateIncompatible');
    expect(marketActions(row as never)).toEqual(['uninstall']);
  });

  it('★ 缺的是机器上的二进制命令 → 状态 missing，note 指到那条命令，不给安装', () => {
    const gitops = binNeedOf('gitops');
    const row = marketRows(
      [unit('gitops', [gitops])],
      capsOf('gitops', 'missing', [needStateOf(gitops, 'missing')]),
    )[0];

    expect(row?.state).toBe('missing');
    expect(row?.note?.key).toBe('panels.market.needBinary');
    expect(row?.note?.params).toEqual({ command: 'gitops' });
    expect(row?.canInstall).toBe(false);
  });

  it('★ 缺必需命令 → 状态就是「要更新」，这时才给「更新」', () => {
    const row = marketRows([unit('issues')], outdated())[0];

    expect(row?.state).toBe('outdated');
    expect(MARKET_STATE_KEY.outdated).not.toBe(MARKET_STATE_KEY.installed);
    expect(row?.canUpdate).toBe(true);
    expect(row?.canInstall).toBe(false);
  });

  it('★ 命令都齐、但**源上有新版** → 模块行**不变黄**（升级归共用依赖行）', () => {
    const row = marketRows(
      [unit('issues')],
      capsOf('issues', 'ok', [needStateOf(DEMO, 'ok', { installed: '1.0.39', latest: '1.0.40' })]),
    )[0];

    expect(row?.state).toBe('installed');
    expect(row?.canUpdate).toBe(false);
    expect(row?.note).toBeUndefined();
    expect(JSON.stringify(row)).not.toContain('1.0.39');
    expect(JSON.stringify(row)).not.toContain('1.0.40');
    expect(marketActions(row as never)).toEqual(['uninstall']);
  });

  it('★ 版本相同（或没有版本信号）→ 仍然不给「更新」', () => {
    const row = marketRows(
      [unit('issues')],
      capsOf('issues', 'ok', [needStateOf(DEMO, 'ok', { installed: '1.0.40', latest: '1.0.40' })]),
    )[0];

    expect(row?.state).toBe('installed');
    expect(row?.canUpdate).toBe(false);
    expect(row?.note).toBeUndefined();
  });

  it('探不动（unchecked）+ 来源解析得出 → 仍然允许装（探测坏了不该连装都不让）', () => {
    const row = marketRows([unit('issues')], capsOf('issues', 'unchecked', [needStateOf(DEMO, 'unchecked', { provision: 'ready' })]))[0];

    expect(row?.state).toBe('unchecked');
    expect(row?.canInstall).toBe(true);
    expect(row?.hint).toBe('panels.market.uncheckedHint');
  });

  it('★ 来源拿不到时**给一句能照做的话**，而不是一个灰按钮', () => {
    const local = marketRows(
      [unit('issues', [extensionNeedOf('demo', { sources: [{ kind: 'local', env: 'DSH_WORKBENCH_DEMO_PLUGIN' }] })])],
      missing({ provision: 'env-missing' }),
    )[0];
    expect(local?.canInstall).toBe(false);
    expect(local?.note).toEqual({
      key: 'panels.market.needEnv',
      params: { env: 'DSH_WORKBENCH_DEMO_PLUGIN' },
    });

    const npmEnv = marketRows(
      [
        unit('issues', [
          extensionNeedOf('demo', {
            sources: [{ kind: 'npm', package: 'opencli-plugin-demo', registryEnv: 'DSH_WORKBENCH_DEMO_REGISTRY' }],
          }),
        ]),
      ],
      missing({ provision: 'env-missing' }),
    )[0];
    expect(npmEnv?.canInstall).toBe(false);
    expect(npmEnv?.note).toEqual({
      key: 'panels.market.needEnv',
      params: { env: 'DSH_WORKBENCH_DEMO_REGISTRY' },
    });

    expect(marketRows([unit('issues')], missing({ provision: 'not-declared' }))[0]?.note?.key).toBe(
      'panels.market.noSource',
    );
    expect(marketRows([unit('issues')], missing({ provision: 'malformed' }))[0]?.note?.key).toBe(
      'panels.market.badSource',
    );
  });

  it('已装时不给"点不动"的理由（那是未装才有的问题）', () => {
    const row = marketRows(
      [unit('issues')],
      capsOf('issues', 'ok', [needStateOf(DEMO, 'ok', { provision: 'env-missing' })]),
    )[0];

    expect(row?.note).toBeUndefined();
  });

  it('★ 缺环境变量（env kind）→ note 指名那个变量', () => {
    const token = { kind: 'env' as const, name: 'DSH_TOKEN', purpose: '测试' };
    const row = marketRows(
      [unit('issues', [token])],
      capsOf('issues', 'missing', [needStateOf(token, 'missing')]),
    )[0];

    expect(row?.note).toEqual({ key: 'panels.market.needEnv', params: { env: 'DSH_TOKEN' } });
  });

  it('★ 缺共用依赖（lib kind）→ note 指名那份库', () => {
    const lib = libNeedOf('opencli-workflow');
    const row = marketRows(
      [unit('issues', [lib])],
      capsOf('issues', 'missing', [needStateOf(lib, 'missing', { command: 'npm i opencli-workflow' })]),
    )[0];

    expect(row?.note).toEqual({ key: 'panels.market.needLib', params: { name: 'opencli-workflow' } });
  });
});

describe('marketRows：共用同一份安装', () => {
  it('★ 共用不进交互层：两行都是普通行、都能卸，模型里也没有"和谁共用"这种字段', () => {
    const both = { ...installed('issues'), ...installed('builds') };
    const rows = marketRows([unit('issues'), unit('builds')], both);

    expect(rows.map((row) => row.id)).toEqual(['issues', 'builds']);
    for (const row of rows) expect(marketActions(row)).toEqual(['uninstall']);
    expect(Object.keys(rows[0] ?? {})).not.toContain('sharedWith');
  });

  it('没装的时候本来就没有卸载', () => {
    const row = marketRows([unit('issues'), unit('builds')], missing({ provision: 'ready' }))[0];

    expect(row?.canUninstall).toBe(false);
    expect(row?.canInstall).toBe(true);
  });
});

describe('marketRows：卸载过的模块（released）', () => {
  const releasedOk: CapabilityMap = {
    issues: { unit: 'issues', status: 'ok', needs: [needStateOf(DEMO, 'ok')], released: true },
  };

  it('★ 卸载过 → 未装（即使插件还在），给「安装」，不再给「卸载」', () => {
    const row = marketRows([unit('issues')], releasedOk)[0];

    expect(row?.state).toBe('missing');
    expect(marketActions(row as never)).toEqual(['install']);
    expect(row?.canUninstall).toBe(false);
  });

  it('★ 卸载过、来源拿不到 → 不给按钮，但仍给能照做的话', () => {
    const row = marketRows(
      [unit('issues', [extensionNeedOf('demo', { sources: [{ kind: 'local', env: 'DSH_WORKBENCH_DEMO_PLUGIN' }] })])],
      {
        issues: {
          unit: 'issues',
          status: 'missing',
          needs: [needStateOf(DEMO, 'missing', { provision: 'env-missing' })],
          released: true,
        },
      },
    )[0];

    expect(row?.state).toBe('missing');
    expect(row?.canInstall).toBe(false);
    expect(row?.note?.key).toBe('panels.market.needEnv');
  });
});

describe('marketActions', () => {
  it('★ 要更新 → [更新][卸载]', () => {
    const row = marketRows([unit('issues')], outdated())[0];
    expect(marketActions(row as never)).toEqual(['update', 'uninstall']);
  });

  it('未装且装得了 → [安装]', () => {
    const row = marketRows([unit('issues')], missing({ provision: 'ready' }))[0];
    expect(marketActions(row as never)).toEqual(['install']);
  });

  it('健康已装 → 只有 [卸载]', () => {
    const row = marketRows([unit('issues')], installed())[0];
    expect(marketActions(row as never)).toEqual(['uninstall']);
  });

  it('还没探完 / 探不动 → 没有按钮', () => {
    expect(marketActions(marketRows([unit('issues')], null)[0] as never)).toEqual([]);
    expect(marketActions(marketRows([unit('issues')], capsOf('issues', 'unchecked'))[0] as never)).toEqual([]);
  });
});

describe('marketSections', () => {
  it('★ 按"在不在机器上"分段：装了 / 要更新同段，还没装的是另一段，行序不变', () => {
    const rows = marketRows(
      [unit('issues'), unit('builds'), unit('perms')],
      {
        ...installed('issues'),
        ...capsOf('builds', 'outdated', [needStateOf(DEMO, 'outdated', { missing: ['x'] })]),
        ...capsOf('perms', 'missing', [needStateOf(DEMO, 'missing', { provision: 'ready' })]),
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

  it('★ 空段不出现；「还在探」「探不动」归未安装那一段', () => {
    expect(marketSections(marketRows([unit('issues')], missing({ provision: 'ready' }))).map((s) => s.id)).toEqual([
      'not-installed',
    ]);
    expect(marketSections(marketRows([unit('issues')], installed())).map((s) => s.id)).toEqual(['installed']);
    expect(marketSections([])).toEqual([]);
    expect(marketSections(marketRows([unit('issues')], null))[0]?.id).toBe('not-installed');
    expect(marketSections(marketRows([unit('issues')], capsOf('issues', 'unchecked')))[0]?.id).toBe(
      'not-installed',
    );
  });
});

describe('marketHasUpdates', () => {
  const newer = capsOf('issues', 'outdated', [needStateOf(DEMO, 'outdated', { installed: '1.0.16', latest: '1.0.17' })]);

  it('★ 有要更新的行 → 亮（模块缺命令；或一份**共用依赖**有新版）', () => {
    const manifests = [unit('issues')];

    expect(marketHasUpdates(marketRows(manifests, outdated()))).toBe(true);
    expect(marketHasUpdates(marketRows(manifests, newer))).toBe(true);
    expect(marketHasUpdates([], sharedRows(manifests, newer))).toBe(true);
  });

  it('★ 全都好用 / 未装 / 还没探完 / 探不动 → 不亮', () => {
    expect(marketHasUpdates(marketRows([unit('issues')], installed()))).toBe(false);
    expect(marketHasUpdates(marketRows([unit('issues')], missing({ provision: 'ready' })))).toBe(false);
    expect(marketHasUpdates(marketRows([unit('issues')], null))).toBe(false);
    expect(marketHasUpdates(marketRows([unit('issues')], capsOf('issues', 'unchecked')))).toBe(false);
    expect(marketHasUpdates([])).toBe(false);
  });

  it('★ 动作之后重探的那一份 → 入口那颗标签就该灭', () => {
    const manifests = [unit('issues')];
    expect(marketHasUpdates(marketRows(manifests, outdated()))).toBe(true);
    expect(marketHasUpdates(marketRows(manifests, installed()))).toBe(false);
  });

  it('多行里有**一行**要更新就够了', () => {
    const rows = marketRows(
      [unit('issues'), unit('builds')],
      { ...installed('issues'), ...capsOf('builds', 'outdated', [needStateOf(DEMO, 'outdated')]) },
    );
    expect(marketHasUpdates(rows)).toBe(true);
  });
});


