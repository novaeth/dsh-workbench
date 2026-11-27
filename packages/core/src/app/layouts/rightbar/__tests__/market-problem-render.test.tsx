import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Translate, UnitManifest } from '@dsh-workbench/shared';
import { dictionaries } from '@dsh-workbench/shared';
import type { MarketAct } from '../market-act';
import type { MarketFailure, MarketRow } from '../market-row-types';
import { installedRows, marketRows } from '../market-rows';
import { WORKBENCH_ROW_ID, workbenchRow } from '../market-workbench-row';
import { selfUpdateFailureCardOf } from '../market-problem-card';
import { MarketSection } from '../market-section';
import { MarketBody } from '../market-body';

const CORE = '@dsh-workbench/core';
const AT = '2026-11-27T00:00:00.000Z';

const t: Translate = (key, params) => {
  const text = (dictionaries.zh as Record<string, string>)[key] ?? key;
  if (params === undefined) return text;
  return Object.keys(params).reduce(
    (out, name) => out.replaceAll(`{${name}}`, String(params[name])),
    text,
  );
};

const MANIFEST: UnitManifest = {
  id: 'issues',
  titleKey: 'issues.mine',
  card: { order: 10 },
  tools: [],
  host: { inject: [] },
};

const act: MarketAct = Object.assign(async () => undefined, { many: async () => undefined });

function section(rows: readonly MarketRow[], failureOf: (id: string) => MarketFailure | null = () => null): string {
  return renderToStaticMarkup(
    h(MarketSection, {
      t,
      rows,
      pending: null,
      failureOf,
      act,
      confirmActions: [],
      onConfirming: () => undefined,
      onRecheck: () => undefined,
      rechecking: false,
    }),
  );
}

describe('市场页上的失败卡（渲染）', () => {
  it('★ 启动失败：行上说「启动失败」，卡里说影响面与出口，不再出现「安装已损坏」', () => {
    const rows = marketRows(
      [MANIFEST],
      { issues: { unit: 'issues', status: 'failed', needs: [], detail: 'Error: boom' } },
      {},
      new Set(),
      {},
      new Set(),
    );

    const html = section(rows);

    expect(html).toContain('这个模块启动失败');
    expect(html).toContain('启动失败');
    expect(html).toContain('其他模块不受影响');
    expect(html).not.toContain('安装已损坏');
  });

  it('★ 工作台安装损坏：命令原样在卡里，给「复制安装命令」', () => {
    const broken = workbenchRow({
      pkg: CORE,
      installed: '',
      broken: true,
      rescue: 'dsh plugin --profile workbench add x',
    });

    const html = section(broken === undefined ? [] : [broken]);

    expect(html).toContain('工作台的安装已损坏');
    expect(html).toContain('dsh plugin --profile workbench add x');
  });

  it('★ 依赖没有重新安装：行上是 quiet 的，也要把卡画出来', () => {
    const reinstall = workbenchRow(
      { pkg: CORE, installed: '0.1.19' },
      { state: 'ok', at: AT, version: '0.1.19', reinstall: { state: 'failed', attempts: 1, reason: 'ERR' } },
    );

    const html = section(reinstall === undefined ? [] : [reinstall]);

    expect(html).toContain('更新已完成，依赖没有重新安装');
    expect(html).toContain('请重启工作台后重试');
  });

  it('★ 配置不一致：长句变成卡，按钮叫「重新安装」', () => {
    const drift = installedRows(
      [{ unit: 'issues', pkg: 'pkg-issues', installed: '0.4.1', declared: '0.4.2' }],
      [MANIFEST],
      new Set(),
    );

    const html = section(drift);

    expect(html).toContain('工作台配置和实际安装不一致');
    expect(html).toContain('重新安装');
  });

  it('★ 更新失败：失败当场出一张卡，标题只有「更新失败」，原因进「查看输出」', () => {
    const row = workbenchRow({ pkg: CORE, installed: '0.1.18' });
    const failure: MarketFailure = {
      id: WORKBENCH_ROW_ID,
      message: '更新失败，请再次点击「更新」。',
      card: selfUpdateFailureCardOf(t, '换版没成 / ERR'),
      retry: 'update-workbench',
    };

    const html = section(row === undefined ? [] : [row], (id) => (id === WORKBENCH_ROW_ID ? failure : null));

    expect(html).toContain('更新失败');
    expect(html).not.toContain('现在可以继续用');
  });

  it('★ 清单读不出来：顶部换成卡，带重试与复制详情', () => {
    const html = renderToStaticMarkup(
      h(MarketBody, {
        t,
        self: undefined,
        shown: [],
        pluginList: [],
        installedList: [],
        unreadable: [],
        readFailure: 'EACCES: /x/installed.json',
        pending: null,
        failed: null,
        notice: null,
        act,
        onConfirming: () => undefined,
        setDefault: async () => undefined,
        boardBusy: false,
        checks: { modules: null, plugins: null },
        onRecheck: () => undefined,
        rechecking: false,
        onOpenDetail: () => undefined,
      }),
    );

    expect(html).toContain('无法读取安装清单');
    expect(html).toContain('已安装列表可能不完整');
  });
});
