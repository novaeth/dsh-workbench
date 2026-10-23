import { describe, expect, it } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import {
  MARKET_STATE_KEY,
  installedRows,
  marketActions,
  marketRows,
  marketSections,
  marketSwitchLocked,
  marketUpdatesOf,
} from '../market-rows';

function unit(id: string, plugin?: string): UnitManifest {
  return {
    id,
    card: { titleKey: `${id}.mine`, order: 10 },
    tools: [],
    host: { inject: [] },
    ...(plugin === undefined
      ? {}
      : { env: { command: 'opencli', plugins: [{ name: plugin, commands: ['x'] }] } }),
  };
}

function capability(
  id: string,
  status: CapabilityMap[string]['status'],
  extra: Partial<CapabilityMap[string]> = {},
): CapabilityMap {
  return { [id]: { unit: id, status, required: [], missing: [], detail: '假探测', ...extra } };
}

describe('装没装：本机的名单说了算，没得探不等于不知道', () => {
  it('★ 本机装着、又没有依赖要探（DIY 本地那份那种）→ 已安装 + 卸载', () => {
    const row = marketRows([unit('hello')], {}, { hello: { installed: '0.1.0' } })[0];

    expect(row?.state).toBe('installed');
    expect(row?.canUninstall).toBe(true);
    expect(row?.canInstall).toBe(false);
    expect(marketActions(row as never)).toEqual(['uninstall']);
  });

  it('★ 但要探依赖时，没结论仍旧是「状态未知」—— 不替它担保', () => {
    const row = marketRows([unit('issues', 'demo')], {}, { issues: { installed: '0.1.0' } })[0];

    expect(row?.state).toBe('unknown');
    expect(row?.canUninstall).toBe(false);
  });

  it('★ 本机名单里没有它、又没结论 → 还是「状态未知」（不是已安装）', () => {
    const row = marketRows([unit('hello')], {})[0];

    expect(row?.state).toBe('unknown');
    expect(row?.canUninstall).toBe(false);
  });
});

describe('本机那份（link: 装的，含 DIY 工坊造的）', () => {
  it('★ 源上就算有更新的版本，也不给「有新版」、也不摆「更新」（点了会顶掉本地那份）', () => {
    const updates = marketUpdatesOf([
      { unit: 'hello', pkg: '@p/hello', installed: '0.1.0', latest: '0.2.0', local: true },
    ]);

    expect(updates).toEqual({ hello: { installed: '0.1.0', local: true } });
  });

  it('★ 行上带「本地」标记；非本地那份不带', () => {
    const local = marketRows(
      [unit('hello')],
      capability('hello', 'ok'),
      { hello: { installed: '0.1.0', local: true } },
    )[0];
    const fromRegistry = marketRows(
      [unit('hello')],
      capability('hello', 'ok'),
      { hello: { installed: '0.1.0' } },
    )[0];

    expect(local?.local).toBe(true);
    expect(local?.canUpdate).toBe(false);
    expect(marketActions(local as never)).toEqual(['uninstall']);
    expect(fromRegistry?.local).toBeUndefined();
  });

  it('★ 「装了但用不上」那一行（本机那份 + 声明坏了）也不给「更新」，只剩卸载', () => {
    const rows = installedRows(
      [
        {
          unit: 'hello',
          pkg: '@p/hello',
          installed: '0.1.0',
          latest: '0.2.0',
          local: true,
          refused: ['声明坏了'],
        },
      ],
      [],
      new Set(),
    );

    expect(rows[0]?.state).toBe('unusable');
    expect(rows[0]?.moduleUpdate).toBeUndefined();
    expect(rows[0]?.local).toBe(true);
    expect(rows[0]?.version).toEqual({ installed: '0.1.0' });
    expect(marketActions(rows[0] as never)).toEqual(['remove-bundle']);
  });
});

describe('为什么该更新：一句话 + 底下说清缘由', () => {
  it('★ 缺必需命令 → 状态就是「有新版」，底下说缺哪几条（不再另起一句「要更新」）', () => {
    const row = marketRows(
      [unit('issues', 'demo')],
      capability('issues', 'missing-commands', { missing: ['x', 'y'] }),
    )[0];

    expect(row?.state).toBe('outdated');
    expect(MARKET_STATE_KEY.outdated).toBe('panels.market.moduleOutdated');
    expect(row?.note).toEqual({
      key: 'panels.market.needCommands',
      params: { commands: 'x、y' },
      tone: 'plain',
    });
  });

  it('模块包有新版 → 同一句「有新版」，理由靠版本箭头说', () => {
    const row = marketRows(
      [unit('issues', 'demo')],
      capability('issues', 'ok'),
      { issues: { installed: '0.1.2', latest: '0.2.0' } },
    )[0];

    expect(row?.state).toBe('outdated');
    expect(row?.note).toBeUndefined();
    expect(row?.version).toEqual({ installed: '0.1.2', latest: '0.2.0' });
  });
});

describe('异常的行：那颗「全局默认」照画，但禁用', () => {
  const refused = installedRows(
    [{ unit: 'old', pkg: '@p/old', installed: '0.1.0', refused: ['声明坏了'] }],
    [],
    new Set(),
    undefined,
    new Set(['old']),
  )[0];
  const notLoaded = installedRows(
    [{ unit: 'inventory', pkg: '@p/inventory', installed: '0.2.0' }],
    [],
    new Set(),
    undefined,
    new Set(['inventory']),
  )[0];

  it('★ 不可用 ⇒ 钮在（带机器板那份读数）但禁用', () => {
    expect(refused?.state).toBe('unusable');
    expect(refused?.defaultShown).toBe(true);
    expect(marketSwitchLocked(refused as never)).toBe(true);
  });

  it('★ 未生效 ⇒ 钮是能动的（重启完正好用上；面板配置页现在看不到它）', () => {
    expect(notLoaded?.state).toBe('inactive');
    expect(notLoaded?.defaultShown).toBe(true);
    expect(marketSwitchLocked(notLoaded as never)).toBe(false);
  });

  it('★ 好好的 / 有新版 / 只是没装 ⇒ 都不禁用', () => {
    const rows = [
      ...marketRows([unit('hello')], capability('hello', 'ok'), { hello: { installed: '0.1.0' } }),
      ...marketRows([unit('two')], capability('two', 'missing-plugin', { install: 'ready' })),
      ...marketRows([unit('three')], capability('three', 'ok'), {
        three: { installed: '0.1.0', latest: '0.2.0' },
      }),
    ];

    for (const row of rows) expect(marketSwitchLocked(row), row.id).toBe(false);
  });
});

describe('段落：装了但市场还没认识它的，也在「已安装模块」那一段', () => {
  it('★ 未生效 / 不可用 的行与能用的模块同段；没装的才进「未安装」', () => {
    const rows = marketRows(
      [unit('issues', 'demo')],
      capability('issues', 'missing-plugin', { install: 'ready' }),
    );
    const notLoaded = installedRows(
      [
        { unit: 'inventory', pkg: '@p/inventory', installed: '0.2.0' },
        { unit: 'old', pkg: '@p/old', installed: '0.1.0', refused: ['声明坏了'] },
      ],
      [],
      new Set(),
    );

    const sections = marketSections([...rows, ...notLoaded]);

    expect(sections.map((section) => section.id)).toEqual(['installed', 'not-installed']);
    expect(sections[0]?.rows.map((row) => row.id)).toEqual(['inventory', 'old']);
    expect(sections[0]?.rows.map((row) => row.state)).toEqual(['inactive', 'unusable']);
    expect(sections[1]?.rows.map((row) => row.id)).toEqual(['issues']);
  });
});
