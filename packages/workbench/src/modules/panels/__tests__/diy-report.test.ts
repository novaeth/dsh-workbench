import { describe, expect, it } from 'vitest';
import type { PanelUnitReport } from '@dsh-workbench/shared/host';

import { ageText, healthOf, readText, renderList, renderPanel, renderStatus, statusOf } from '../model/diy-report';

function registry(options: {
  mounted?: readonly string[];
  refused?: readonly { unit: string; reasons: readonly string[] }[];
  failures?: Readonly<Record<string, string>>;
}) {
  return {
    all: () => (options.mounted ?? []).map((unit) => ({ unit })),
    refusals: () => options.refused ?? [],
    failureOf: (unit: string) => options.failures?.[unit],
  };
}

describe('healthOf（起得来没：装配失败的现场）', () => {
  it('挂上了 = ok', () => {
    expect(healthOf({ registry: registry({ mounted: ['demo'] }), unit: 'demo', installed: true })).toEqual({
      state: 'ok',
    });
  });

  it('装配期抛过 = failed + 原因（优先于"挂上了没有"）', () => {
    expect(
      healthOf({ registry: registry({ mounted: ['demo'], failures: { demo: 'routes 少了 overview' } }), unit: 'demo', installed: true }),
    ).toEqual({ state: 'failed', reason: 'routes 少了 overview' });
  });

  it('声明被拒 = failed + 拒因（不是"还没重启"）', () => {
    expect(
      healthOf({ registry: registry({ refused: [{ unit: 'demo', reasons: ['apiVersion 是 99', 'unit 撞了'] }] }), unit: 'demo', installed: true }),
    ).toEqual({ state: 'failed', reason: 'apiVersion 是 99；unit 撞了' });
  });

  it('装了但没挂上、也没有拒因 = absent（说清"还没读到声明"）', () => {
    const health = healthOf({ registry: registry({}), unit: 'demo', installed: true });
    expect(health.state).toBe('absent');
    expect(health.reason).toContain('重启');
  });

  it('没装 = absent"还没装"（不假装它在跑）', () => {
    expect(healthOf({ registry: registry({}), unit: 'demo', installed: false })).toEqual({
      state: 'absent',
      reason: '还没装',
    });
  });

  it('这台机器没给注册表：不报 ok，也不炸', () => {
    expect(healthOf({ registry: undefined, unit: 'demo', installed: true }).state).toBe('absent');
  });
});

describe('时间与人话', () => {
  const now = 1_700_000_000_000;

  it('新鲜度分档（刚刚 / 秒 / 分钟 / 小时）', () => {
    expect(ageText(now - 1_000, now)).toBe('刚刚');
    expect(ageText(now - 30_000, now)).toBe('30 秒前');
    expect(ageText(now - 120_000, now)).toBe('2 分钟前');
    expect(ageText(now - 7_200_000, now)).toBe('2 小时前');
  });

  it('每种取数收尾都有一句人话（读不到时把码与原文都带上）', () => {
    expect(readText({ unit: 'demo', route: 'demo/o', phase: 'ready', at: now }, now)).toContain('读到了');
    expect(readText({ unit: 'demo', route: 'demo/o', phase: 'error', at: now }, now)).toContain('读不到（unknown）');
    expect(
      readText(
        { unit: 'demo', route: 'demo/o', phase: 'error', at: now, error: { code: 'host-500', message: '宿主炸了' } },
        now,
      ),
    ).toContain('读不到（host-500）：宿主炸了');
  });
});

describe('statusOf / renderStatus', () => {
  it('failed 时下一步是修它，不是重装（哪怕产物齐、也上了板）', () => {
    const status = statusOf({
      dir: '/tmp/nowhere',
      unit: 'demo',
      name: 'demo',
      installed: true,
      known: true,
      open: true,
      health: { state: 'failed', reason: 'boom' },
    });

    expect(status.next).toContain('它起不来');
    expect(status.next).toContain('别去重装');
    expect(renderStatus('/w', [status])).toContain('起得来：不是 —— boom');
  });

  it('空的清单回到 list 那一屏（不打印"工作区："加一片空白）', () => {
    expect(renderStatus('/w', [])).toContain('没有模块源码');
  });
});

describe('renderPanel（面板上现在究竟是什么样）', () => {
  const now = 1_700_000_000_000;
  const report = (unit: string): PanelUnitReport => ({
    unit,
    at: now - 5_000,
    okAt: now - 5_000,
    cards: [{ unit, route: `${unit}/overview`, phase: 'ready', at: now - 5_000 }],
  });

  it('没有任何上报：说清两种可能，并且把没上报的卡也列出来', () => {
    const text = renderPanel({
      root: '/proj',
      rows: [{ unit: 'demo', name: 'demo', health: { state: 'ok' } }],
      board: ['demo'],
      at: 0,
      now,
    });

    expect(text).toContain('还没有一条面板运行态上报');
    expect(text).toContain('没上报');
  });

  it('有上报：每行带状态、取数收尾与崩溃次数', () => {
    const text = renderPanel({
      root: '/proj',
      rows: [
        { unit: 'demo', name: 'demo', health: { state: 'ok' }, report: report('demo') },
        {
          unit: 'bad',
          name: 'bad',
          health: { state: 'failed', reason: 'mount 抛了' },
          report: { ...report('bad'), crash: { unit: 'bad', reason: 'boom', at: now - 1_000, count: 3 } },
        },
      ],
      board: ['demo', 'bad'],
      at: now - 5_000,
      now,
    });

    expect(text).toContain('面板上有 2 张卡');
    expect(text).toContain('demo/overview 读到了');
    expect(text).toContain('崩过：没有');
    expect(text).toContain('不是 —— mount 抛了');
    expect(text).toContain('共 3 次');
  });
});

describe('renderList', () => {
  it('都装过时明说不要再装（这一跳一辈子只走一次）', () => {
    const text = renderList('/w', [
      { unit: 'demo', name: 'demo', description: '', installed: true, dir: '/w/demo' },
    ]);
    expect(text).toContain('不要再装');
    expect(text).toContain('demo · 已装');
  });

  it('还有没装的：给出 install 的调用形状', () => {
    const text = renderList('/w', [
      { unit: 'demo', name: 'demo', description: '一句话', installed: false, dir: '/w/demo' },
    ]);
    expect(text).toContain('workbench_diy_install');
    expect(text).toContain('一句话');
  });
});
