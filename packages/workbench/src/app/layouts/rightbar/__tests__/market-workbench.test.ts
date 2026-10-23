import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dictionaries } from '@dsh-workbench/shared';
import type { WorkbenchVersion } from '@/shared/api/bundle-install';
import { MARKET_DOT, MARKET_STATE_KEY, installedRows, marketActions, marketRows } from '../market-rows';
import { marketHintOf } from '../market-hint';
import { workbenchRow } from '../market-workbench-row';
import type { MarketRow } from '../market-rows';

const CORE = '@dsh-workbench/core';

describe('市场里「工作台」自己那一行（四种处境）', () => {
  it('① 源上有新版 → 行上给一颗「更新」，段还是它自己那一段', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.18', latest: '0.1.19' });

    expect(row).toMatchObject({
      state: 'outdated',
      canUpdate: true,
      moduleUpdate: { installed: '0.1.18', latest: '0.1.19' },
      version: { installed: '0.1.18', latest: '0.1.19' },
      pkg: CORE,
    });
    expect(marketActions(row as MarketRow)).toEqual(['update-workbench']);
  });

  it('② 已经最新 → 只显示版本，不给按钮（也不许说"有新版"）', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.19', latest: '0.1.19' });

    expect(row).toMatchObject({ state: 'installed', canUpdate: false, version: { installed: '0.1.19' } });
    expect(row?.moduleUpdate).toBeUndefined();
    expect(marketActions(row as MarketRow)).toEqual([]);
  });

  it('② 连源上的版本都问不到（没有 latest）→ 照样只是没按钮，不是"有新版"', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.19' });

    expect(row?.state).toBe('installed');
    expect(marketActions(row as MarketRow)).toEqual([]);
  });

  it('③ 本仓那份（link: 装的）→ 不给更新，行上说清"不从源上取"（源上有新版也不比）', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.18', latest: '0.1.19', local: true });

    expect(row).toMatchObject({ state: 'installed', canUpdate: false, version: { installed: '0.1.18' } });
    expect(row?.note?.key).toBe('panels.market.workbenchLocal');
    expect(marketActions(row as MarketRow)).toEqual([]);
  });

  it('④ 盘上是新版、运行中还是旧的 → 状态就是「重启后生效」（红点，不是绿点「已安装」）', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.19', running: '0.1.18' });

    expect(row).toMatchObject({
      state: 'pending-restart',
      canUpdate: false,
      version: { installed: '0.1.19' },
    });
    expect(row?.hint).toBeUndefined();
    expect(MARKET_DOT['pending-restart']).toBe('error');
    expect(MARKET_STATE_KEY['pending-restart']).toBe('panels.market.pendingRestart');
    expect(marketActions(row as MarketRow)).toEqual([]);
  });

  it('④ 已经重启过（运行中 = 盘上）→ 就是绿的「已安装」，那半句不再挂', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.19', running: '0.1.19' });

    expect(row?.state).toBe('installed');
    expect(row?.hint).toBeUndefined();
  });

  it('④ 老宿主没报"运行中那一版" → 不瞎说（宁可不说，也不乱劝人重启）', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.19' });

    expect(row?.hint).toBeUndefined();
  });

  it('④ 本仓那份（link:）→ 不按"盘上 vs 运行中"判，照旧只说"不从源上取"', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.18', running: '0.1.19', local: true });

    expect(row?.hint).toBeUndefined();
    expect(row?.note?.key).toBe('panels.market.workbenchLocal');
  });

  it('④ 更新完又出了更新的版本 → 直接给「更新」，中间没有"还没生效"那一档', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.19', latest: '0.1.20' });

    expect(row?.hint).toBeUndefined();
    expect(marketActions(row as MarketRow)).toEqual(['update-workbench']);
  });

  it('读不到装的是哪一份 → 这一行不出现（宁可不摆，也不摆一行瞎猜的）', () => {
    expect(workbenchRow(undefined)).toBeUndefined();
    expect(workbenchRow(null)).toBeUndefined();
    expect(workbenchRow({ pkg: CORE, installed: '' })).toBeUndefined();
  });
});

describe('工作台那一行：不混进模块里，也不单占一段', () => {
  it('★ 它不是模块行：模块名单（marketRows / installedRows）里永远不会出现它', () => {
    const manifests = [
      {
        id: 'issues',
        card: { titleKey: 'issues.mine', order: 10 },
        tools: [],
        host: { inject: [] },
        env: { command: 'opencli', plugins: [{ name: 'x', commands: ['y'] }] },
      },
    ] as const;
    const capabilities = {
      issues: { unit: 'issues', status: 'ok' as const, required: [], missing: [], detail: '' },
    };
    const row = workbenchRow({ pkg: CORE, installed: '0.1.18', latest: '0.1.19' });

    expect(row?.workbench).toBe(true);
    expect(marketRows(manifests, capabilities).map((item) => item.id)).toEqual(['issues']);
    expect(installedRows([{ unit: 'issues', pkg: '@a/issues', installed: '0.1.0' }], manifests, new Set()).map((item) => item.id)).toEqual(['issues']);
  });

  it('★ 它不再有自己那一段（段头说一遍、行里再说一遍 = 白占地方）', () => {
    const view = readFileSync(new URL('../MarketView.tsx', import.meta.url), 'utf8');

    expect(view).not.toContain('sectionWorkbench');
    for (const language of ['zh', 'en'] as const) {
      expect(dictionaries[language]['panels.market.sectionWorkbench' as never]).toBeUndefined();
    }
  });

  it('★ 左栏那枚「有新版本」也认它（否则面板上有新版、侧栏一声不响）', () => {
    const manifests = [
      {
        id: 'issues',
        card: { titleKey: 'issues.mine', order: 10 },
        tools: [],
        host: { inject: [] },
        env: { command: 'opencli', plugins: [{ name: 'x', commands: ['y'] }] },
      },
    ] as const;
    const capabilities = {
      issues: { unit: 'issues', status: 'ok' as const, required: [], missing: [], detail: '' },
    };
    const hintOf = (workbench: WorkbenchVersion | null) =>
      marketHintOf({ manifests, capabilities, modules: [], workbench });

    expect(hintOf(null)).toBeNull();
    expect(hintOf({ pkg: CORE, installed: '0.1.18' })).toBeNull();
    expect(hintOf({ pkg: CORE, installed: '0.1.18', latest: '0.1.19' })).toEqual({
      labelKey: 'panels.market.hasNew',
      tone: 'warning',
    });
    expect(hintOf({ pkg: CORE, installed: '0.1.18', latest: '0.1.19', local: true })).toBeNull();
    expect(hintOf({ pkg: CORE, installed: '0.1.19', running: '0.1.18' })).toEqual({
      labelKey: 'panels.market.pendingRestart',
      tone: 'warning',
    });
  });
});

describe('工作台那一行上的人话', () => {
  it('★ 名字与"本仓那份"的解释两种语言都有，且不许出现内部词', () => {
    const internal = ['外壳', '协议', '声明', '清单', 'apiVersion'];
    for (const language of ['zh', 'en'] as const) {
      for (const key of ['panels.market.workbenchName', 'panels.market.workbenchLocal'] as const) {
        const sentence = dictionaries[language][key] ?? '';
        expect(sentence.length, `${language}:${key}`).toBeGreaterThan(0);
        for (const word of internal) expect(sentence, `${language}:${key}:${word}`).not.toContain(word);
      }
    }
    expect(dictionaries.zh['panels.market.workbenchName']).toBe('工作台');
    expect(dictionaries.en['panels.market.workbenchName']).toBe('Workbench');
  });
});
