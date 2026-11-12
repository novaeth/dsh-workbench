import { describe, expect, it } from 'vitest';
import type { Translate, WriteOutcome } from '@dsh-workbench/shared';
import { unitTitleKey } from '@dsh-workbench/shared';
import type { MarketRow } from '../market-row-types';
import { marketActOf } from '../market-act';
import { marketRowTitle } from '../market-rows';
import { pendingRowOf, type HeldRow, type Pending } from '../market-view-text';

const t = ((key: string) => key) as unknown as Translate;

const row = (id: string): MarketRow => ({
  id,
  titleKey: `${id}.mine`,
  state: 'outdated',
  canInstall: false,
  canUpdate: true,
  canUninstall: true,
  pkg: `@p/${id}`,
  version: { installed: '0.8.0', latest: '0.9.0' },
});

function seatsOf() {
  const seen = {
    pending: [] as Array<Pending | null>,
    held: [] as Array<HeldRow | undefined>,
    failed: [] as Array<{ id: string; message: string } | null>,
    notice: [] as Array<string | null>,
  };
  return {
    seen,
    seats: {
      setPending: (next: Pending | null) => seen.pending.push(next),
      setHeld: (next: HeldRow | undefined) => seen.held.push(next),
      setConfirming: () => undefined,
      setFailed: (next: { id: string; message: string } | null) => seen.failed.push(next),
      setNotice: (next: string | null) => seen.notice.push(next),
    },
  };
}

const landed = (application: string): WriteOutcome<unknown> => ({
  ok: true,
  value: { change: { application, stage: 'install', changed: true, target: 'x' } },
});

describe('工作台自己那一行的更新：只走三拍，不额外加话', () => {
  it('★ 更新成功（restart-required）→ 面板不多说一句；那一行**一直挂到真换上**（不许闪回「更新」）', async () => {
    const { seen, seats } = seatsOf();
    const act = marketActOf({
      t,
      mocked: false,
      rowOf: () => row('workbench'),
      seats,
      send: async () => landed('restart-required'),
      onChanged: () => undefined,
    });

    await act('workbench', 'update-workbench');

    expect(seen.notice.filter((n) => n !== null)).toEqual([]);
    const last = seen.pending.at(-1);
    expect(last?.until).toBe('0.9.0');
    expect(last?.action).toBe('update-workbench');
  });

  const followUpRow = (hard: boolean): MarketRow => ({
    ...row('workbench'),
    workbench: true,
    state: 'pending-followup',
    followUp: { id: 'data-root-migration', kind: 'data-migration', hard },
  });

  it('★ 迁移成功 → 不挂 pending，给一条完成提示', async () => {
    const { seen, seats } = seatsOf();
    const sent: Array<Record<string, unknown>> = [];
    const act = marketActOf({
      t,
      mocked: false,
      rowOf: () => followUpRow(false),
      seats,
      send: async (body) => {
        sent.push(body);
        return { ok: true, value: { added: 2, files: 0 } };
      },
      onChanged: () => undefined,
    });

    await act('workbench', 'migrate-workbench');

    expect(sent).toEqual([{ action: 'migrate-workbench', name: '@p/workbench' }]);
    expect(seen.pending.at(-1)).toBeNull();
    expect(seen.notice.at(-1)).toBe('panels.market.migrateDone');
  });

  it('★ 非硬性的待办可以不再提醒 → 发的是 follow-up id，并给一条"旧数据还在"的提示', async () => {
    const { seen, seats } = seatsOf();
    const sent: Array<Record<string, unknown>> = [];
    const act = marketActOf({
      t,
      mocked: false,
      rowOf: () => followUpRow(false),
      seats,
      send: async (body) => {
        sent.push(body);
        return { ok: true, value: {} };
      },
      onChanged: () => undefined,
    });

    await act('workbench', 'dismiss-followup');

    expect(sent).toEqual([{ action: 'dismiss-followup', id: 'data-root-migration' }]);
    expect(seen.pending.at(-1)).toBeNull();
    expect(seen.notice.at(-1)).toBe('panels.market.dismissed');
  });

  it('★ 模块行的 restart-required 不挂（它当场就落在盘上了）', async () => {
    const { seen, seats } = seatsOf();
    const act = marketActOf({
      t,
      mocked: false,
      rowOf: () => row('hello'),
      seats,
      send: async () => landed('restart-required'),
      onChanged: () => undefined,
    });

    await act('hello', 'update');

    expect(seen.pending.at(-1)).toBeNull();
  });

  it('★ 模块行更新跑完（applied）→ 那一行还挂着，等版本读数追上来才解锁', async () => {
    const { seen, seats } = seatsOf();
    const act = marketActOf({
      t,
      mocked: false,
      rowOf: () => row('hello'),
      seats,
      send: async () => landed('applied'),
      onChanged: () => undefined,
    });

    await act('hello', 'update');

    const last = seen.pending.at(-1);
    expect(last?.action).toBe('update');
    expect(last?.readBack).toBe(true);
    expect(last?.until).toBeUndefined();
    expect(seen.held.at(-1)).toBeUndefined();
  });

  it('版本那一跳点上那一刻没有装着的版本（没得对账）→ 不长挂，当场解锁', async () => {
    const { seen, seats } = seatsOf();
    const act = marketActOf({
      t,
      mocked: false,
      rowOf: () => ({ ...row('hello'), version: undefined }),
      seats,
      send: async () => landed('applied'),
      onChanged: () => undefined,
    });

    await act('hello', 'update-bundle');

    expect(seen.pending.at(-1)).toBeNull();
  });

  it('★ 跑完盘上还是点下去那一版 → 当场给红字，不再让人等 15 秒再冒出「更新」', async () => {
    const { seen, seats } = seatsOf();
    const act = marketActOf({
      t,
      mocked: false,
      rowOf: () => row('hello'),
      seats,
      send: async () => ({
        ok: true,
        value: {
          change: { application: 'failed', stage: 'install', changed: false, target: 'x', errorCode: 'no-change' },
          module: { kind: 'module', pkg: '@p/hello', version: '0.8.0' },
        },
      }),
      onChanged: () => undefined,
    });

    await act('hello', 'update-bundle');

    expect(seen.pending.at(-1)).toBeNull();
    expect(seen.failed.at(-1)).toEqual({ id: 'hello', message: 'panels.market.updateNoChange' });
  });

  it('★ dsh 不肯卸掉正在用的旧版 → 不许说成「版本没变」，要把终端命令一起给出来', async () => {
    const { seen, seats } = seatsOf();
    const command = "dsh plugin --profile workbench add '@p/hello@0.9.0'";
    const act = marketActOf({
      t,
      mocked: false,
      rowOf: () => row('hello'),
      seats,
      send: async () => ({
        ok: true,
        value: {
          change: { application: 'failed', stage: 'remove', changed: false, target: 'x', errorCode: 'stop-profile' },
          module: { kind: 'module', pkg: '@p/hello', version: '0.8.0' },
          remedy: { command },
        },
      }),
      onChanged: () => undefined,
    });

    await act('hello', 'update-bundle');

    expect(seen.pending.at(-1)).toBeNull();
    expect(seen.failed.at(-1)).toMatchObject({
      id: 'hello',
      message: 'panels.market.failed',
      card: {
        title: 'panels.market.updateStuck.title',
        fact: 'panels.market.add.failureStopProfile',
        fix: command,
        fixLabel: 'panels.market.failure.copyFix',
        copiedHint: 'panels.market.updateStuck.copiedHint',
      },
    });
  });

  it('★ 新版装丢了、旧版回滚成功 → 红字说清「已装回」，而不是假装更新成功', async () => {
    const { seen, seats } = seatsOf();
    const act = marketActOf({
      t,
      mocked: false,
      rowOf: () => row('hello'),
      seats,
      send: async () => ({
        ok: true,
        value: {
          change: { application: 'applied', stage: 'install', changed: true, target: 'x' },
          module: { kind: 'module', pkg: '@p/hello', version: '0.8.0' },
          restored: '0.8.0',
        },
      }),
      onChanged: () => undefined,
    });

    await act('hello', 'update-bundle');

    expect(seen.failed.at(-1)?.message).toBe('panels.market.updateRestored');
  });

  it('★ 命令那一跳没有 change 回包，也要留在「正在更新」里等能力表（不许写完就解锁）', async () => {
    const { seen, seats } = seatsOf();
    const act = marketActOf({
      t,
      mocked: false,
      rowOf: () => row('hello'),
      seats,
      send: async () => ({
        ok: true,
        value: { action: 'update', module: { unit: 'hello', titleKey: 'hello.mine', plugins: [], libs: [], capability: { unit: 'hello', status: 'ok', required: [], missing: [], detail: '' } } },
      }),
      onChanged: () => undefined,
    });

    await act('hello', 'update');

    const last = seen.pending.at(-1);
    expect(last?.action).toBe('update');
    expect(last?.readBack).toBe(true);
  });

  it('★ 名字跟着快照一起冻住：模块"先卸再装"那一段它的字典会被撤走，只剩 key 就露馅', async () => {
    const named = ((key: string) => (key === 'hello.mine' ? '你好模块' : key)) as unknown as Translate;
    const { seen, seats } = seatsOf();
    const act = marketActOf({
      t: named,
      mocked: false,
      rowOf: () => row('hello'),
      seats,
      send: async () => landed('applied'),
      onChanged: () => undefined,
    });

    await act('hello', 'update');

    const last = seen.pending.at(-1);
    expect(last?.label).toBe('你好模块');
    expect(last?.row?.label).toBe('你好模块');
    expect(last?.row?.titleKey).toBe('hello.mine');
  });

  it('★ 写失败：不留快照（不当场压住"重启后生效"那类话），并把红字给出去', async () => {
    const { seen, seats } = seatsOf();
    const act = marketActOf({
      t,
      mocked: false,
      rowOf: () => row('workbench'),
      seats,
      send: async () => ({ ok: false, message: '炸了' }),
      onChanged: () => undefined,
    });

    await act('workbench', 'update-workbench');

    expect(seen.held.at(-1)).toBeUndefined();
    expect(seen.failed.at(-1)).toEqual({ id: 'workbench', message: 'panels.market.failed' });
  });
});

describe('卸载：写回不算完，读数里没它了才解锁', () => {
  const reply = (value: Record<string, unknown>): WriteOutcome<unknown> => ({ ok: true, value });

  const pendingOf = async (
    action: 'remove-bundle' | 'uninstall' | 'uninstall-plugin',
    value: Record<string, unknown>,
  ): Promise<Pending | null | undefined> => {
    const { seen, seats } = seatsOf();
    const act = marketActOf({
      t,
      mocked: false,
      rowOf: () => row('hello'),
      seats,
      send: async () => reply(value),
      onChanged: () => undefined,
    });

    await act('hello', action);

    return seen.pending.at(-1);
  };

  it('★ remove-bundle（回包带 change）→ 留在「正在卸载」里等名单', async () => {
    const last = await pendingOf('remove-bundle', {
      action: 'remove-bundle',
      change: { application: 'applied', stage: 'install', changed: true, target: 'x' },
      keptFor: [],
    });

    expect(last?.action).toBe('remove-bundle');
    expect(last?.readBack).toBe(true);
    expect(last?.until).toBeUndefined();
  });

  it('★ uninstall（旧那跳可能没有 change 回包）→ 同样留到读数', async () => {
    const last = await pendingOf('uninstall', { action: 'uninstall', module: { unit: 'hello' }, keptFor: [] });

    expect(last?.action).toBe('uninstall');
    expect(last?.readBack).toBe(true);
  });

  it('★ uninstall-plugin（回包没有 change）→ 同样留到读数', async () => {
    const last = await pendingOf('uninstall-plugin', { action: 'uninstall-plugin', removed: true });

    expect(last?.action).toBe('uninstall-plugin');
    expect(last?.readBack).toBe(true);
  });
});

describe('卸载：名字在点下去那一刻就快照下来', () => {
  it('★ Pending 里带着那一刻的名字；包删掉、词表撤了之后，那一行还叫它', async () => {
    const titleOf = (key: string): string => (key === unitTitleKey('delivery') ? '交付流水线' : key);
    const { seen, seats } = seatsOf();
    const act = marketActOf({
      t: titleOf as unknown as Translate,
      mocked: false,
      rowOf: () => ({
        ...row('delivery'),
        titleKey: unitTitleKey('delivery'),
        state: 'installed',
        canUpdate: false,
        version: { installed: '0.9.0' },
      }),
      seats,
      send: async () => ({ ok: true, value: {} }),
      onChanged: () => undefined,
    });

    await act('delivery', 'remove-bundle');

    const pending = seen.pending.find((one) => one !== null) ?? null;
    expect(pending).toMatchObject({
      id: 'delivery',
      action: 'remove-bundle',
      titleKey: unitTitleKey('delivery'),
      label: '交付流水线',
      pkg: '@p/delivery',
      version: '0.9.0',
    });

    const shown = pendingRowOf({ pending, removing: 'delivery', rows: [], names: new Map() });
    expect(shown === undefined ? '' : marketRowTitle(shown, () => '###')).toBe('交付流水线');
  });
});
