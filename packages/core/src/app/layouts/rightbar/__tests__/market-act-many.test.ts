import { describe, expect, it } from 'vitest';
import { marketActOf } from '../market-act';
import type { MarketRow } from '../market-row-types';

function seatsOf() {
  return {
    setPending: () => undefined,
    setHeld: () => undefined,
    setConfirming: () => undefined,
    setFailed: () => undefined,
    setNotice: () => undefined,
  };
}

function rowOf(id: string): MarketRow {
  return { id, name: id, kind: 'plugin', titleKey: 'panels.market.sectionPlugins', pkg: id } as unknown as MarketRow;
}

function actOf(rows: readonly MarketRow[]) {
  const reloads: unknown[] = [];
  const sent: unknown[] = [];
  const act = marketActOf({
    t: ((key: string) => key) as never,
    rowOf: (id) => rows.find((row) => row.id === id),
    seats: seatsOf(),
    send: async (body) => {
      sent.push(body);
      return { ok: true, value: undefined } as never;
    },
    onChanged: (options) => reloads.push(options),
  });
  return { act, reloads, sent };
}

describe('装/更新：把市场条目已知的形态一起交上去', () => {
  function moduleRowOf(market: Record<string, unknown>): MarketRow {
    return {
      id: 'mod',
      name: 'mod',
      kind: 'module',
      titleKey: 'panels.market.sectionModules',
      pkg: '@t/mod',
      market: {
        pkg: '@t/mod',
        unit: 'mod',
        version: '1.2.0',
        sourceId: 's1',
        sourceLabel: 's1',
        source: {
          type: 'git',
          url: 'https://host/org/repo.git',
          commit: 'a'.repeat(40),
          path: 'packages/@t/mod',
        },
        ...market,
      },
    } as unknown as MarketRow;
  }

  it('★ 条目说是工作台模块 → install-version 带上 route=module', async () => {
    const { act, sent } = actOf([moduleRowOf({ route: 'module' })]);

    await act('mod', 'install-version');

    expect(sent[0]).toMatchObject({ action: 'install-version', route: 'module' });
  });

  it('★ 清单与盘上不一致那条：按行上的 reinstall 重装，不带 route', async () => {
    const row = {
      id: 'mod',
      name: 'mod',
      kind: 'module',
      titleKey: 'panels.market.sectionModules',
      pkg: '@t/mod',
      reinstall: '@t/mod@1.1.8',
      canUpdate: true,
    } as unknown as MarketRow;
    const { act, sent } = actOf([row]);

    await act('mod', 'install-version');

    expect(sent[0]).toMatchObject({ action: 'install-version', spec: '@t/mod@1.1.8' });
    expect((sent[0] as { route?: string }).route).toBeUndefined();
  });

  it('条目没说是模块 → 不带 route（让宿主自己判）', async () => {
    const { act, sent } = actOf([moduleRowOf({})]);

    await act('mod', 'install-version');

    expect((sent[0] as { route?: string }).route).toBeUndefined();
  });
});

describe('批量升级：过程里不刷新，收尾刷一次', () => {
  it('★ 三个插件批量升级 → 只重新加载一次', async () => {
    const rows = [rowOf('a'), rowOf('b'), rowOf('c')];
    const { act, reloads } = actOf(rows);

    await act.many(['a', 'b', 'c'], 'update-plugin');

    expect(reloads).toHaveLength(1);
    expect(reloads[0]).toEqual({ force: true });
  });

  it('★ 三个都真的发出去了（不是只发第一个）', async () => {
    const rows = [rowOf('a'), rowOf('b'), rowOf('c')];
    const { act, sent } = actOf(rows);

    await act.many(['a', 'b', 'c'], 'update-plugin');

    expect(sent).toHaveLength(3);
    expect(sent.map((one) => (one as { name: string }).name)).toEqual(['a', 'b', 'c']);
  });

  it('★ 单个点还是每次都刷新（批量只是一层包装）', async () => {
    const rows = [rowOf('a'), rowOf('b')];
    const { act, reloads } = actOf(rows);

    await act('a', 'update-plugin');
    await act('b', 'update-plugin');

    expect(reloads).toHaveLength(2);
  });

  it('★ 中间有一条抛了也不留在安静态（下一次单个动作照常刷新）', async () => {
    const rows = [rowOf('a'), rowOf('b'), rowOf('c')];
    const reloads: unknown[] = [];
    const act = marketActOf({
      t: ((key: string) => key) as never,
      rowOf: (id) => rows.find((row) => row.id === id),
      seats: seatsOf(),
      send: async (body) => {
        if ((body as { name?: string }).name === 'b') throw new Error('boom');
        return { ok: true, value: undefined } as never;
      },
      onChanged: (options) => reloads.push(options),
    });

    await expect(act.many(['a', 'b', 'c'], 'update-plugin')).rejects.toThrow('boom');
    await act('c', 'update-plugin');

    expect(reloads).toEqual([{ force: true }]);
  });
});
