import { describe, expect, it } from 'vitest';
import { marketActOf } from '../market-act';
import type { MarketFailure, MarketRow } from '../market-row-types';

const row: MarketRow = {
  id: 'mod',
  name: 'mod',
  kind: 'module',
  titleKey: 'panels.market.sectionModules',
  pkg: '@t/mod',
  state: 'installed',
} as unknown as MarketRow;

function rig(outcome: unknown) {
  const sent: Record<string, unknown>[] = [];
  const failed: (MarketFailure | null)[] = [];
  const act = marketActOf({
    t: ((key: string) => key) as never,
    rowOf: (id) => (id === row.id ? row : undefined),
    seats: {
      setPending: () => undefined,
      setHeld: () => undefined,
      setConfirming: () => undefined,
      setFailed: (next) => failed.push(next),
      setNotice: () => undefined,
    },
    send: async (body) => {
      sent.push(body);
      return outcome as never;
    },
    onChanged: () => undefined,
  });
  return { act, sent, failed };
}

describe('批准构建脚本：把清单带回来，并原样带着它重发同一个动作', () => {
  it('失败里带 pendingBuilds → 失败位记住清单和动作', async () => {
    const { act, failed } = rig({
      ok: false,
      message: '命令失败（退出码 1）',
      pendingBuilds: ['sharp'],
    });

    await act('mod', 'update');

    expect(failed.at(-1)).toMatchObject({ id: 'mod', action: 'update', pendingBuilds: ['sharp'] });
  });

  it('批准后重发：同一个动作多带一份 approvedBuilds', async () => {
    const { act, sent } = rig({ ok: true, value: undefined });

    await act('mod', 'update', { approvedBuilds: ['sharp'] });

    expect(sent[0]).toMatchObject({ action: 'update', unit: 'mod', approvedBuilds: ['sharp'] });
  });

  it('没批准清单时不多带字段', async () => {
    const { act, sent } = rig({ ok: true, value: undefined });

    await act('mod', 'update');

    expect(sent[0]).not.toHaveProperty('approvedBuilds');
  });
});
