import { describe, expect, it } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import { createFactLog, toolUnits, wroteNow } from '@dsh-workbench/shared/host';
import { unitTitleKey } from '@dsh-workbench/shared/host';

function manifest(id: string, tools: Array<{ name: string; writes: boolean }>): UnitManifest {
  return { id, titleKey: unitTitleKey(id), card: null, tools, host: { inject: [] } };
}

describe('toolUnits', () => {
  it('★ 读工具也进表（事实归属由套件的 factsOf 说；不进表就永远没人问它）', () => {
    const map = toolUnits([
      manifest('issues', [
        { name: 'workbench_demo_issues', writes: false },
        { name: 'workbench_demo_issue', writes: false },
      ]),
      manifest('panels', [{ name: 'workbench_panels', writes: true }]),
    ]);

    expect([...map.entries()]).toEqual([
      ['workbench_demo_issues', { unit: 'issues', writes: false }],
      ['workbench_demo_issue', { unit: 'issues', writes: false }],
      ['workbench_panels', { unit: 'panels', writes: true }],
    ]);
  });

  it('写工具那个标记还在（套件没有 factsOf 时靠它退回"整块刷"）', () => {
    const map = toolUnits([manifest('panels', [{ name: 'workbench_modules', writes: true }])]);

    expect(map.get('workbench_modules')).toEqual({ unit: 'panels', writes: true });
  });
});

describe('createFactLog', () => {
  it('写一次 → since(0) 报这个单元；since 推进后不再报', () => {
    const log = createFactLog();
    log.bump(['panels']);

    expect(log.since(0)).toMatchObject({ rev: 1, facts: ['panels'] });
    expect(log.since(1)).toMatchObject({ rev: 1, facts: [] });
  });

  it('同一单元连写多次只算一条（但序号会推进）', () => {
    const log = createFactLog();
    log.bump(['panels']);
    log.bump(['panels']);
    log.bump(['panels']);

    expect(log.since(0)).toMatchObject({ rev: 3, facts: ['panels'] });
  });

  it('多个单元各写一次 → 都报出来', () => {
    const log = createFactLog();
    log.bump(['issues']);
    log.bump(['panels']);

    expect([...log.since(0).facts].sort()).toEqual(['issues', 'panels']);
  });

  it('at-least-once：带旧序号回来问，仍会得到答案（漏一次不会永久丢）', () => {
    const log = createFactLog();
    log.bump(['issues']);

    expect(log.since(0).facts).toEqual(['issues']);
    expect(log.since(0).facts).toEqual(['issues']);
  });

  it('没有任何写入 → facts 为空、rev 为 0', () => {
    expect(createFactLog().since(0)).toMatchObject({ rev: 0, facts: [] });
  });

  it('★ 一次写入点名多个事实（供给同时改能力与面板配置）', () => {
    const log = createFactLog();
    log.bump(['capability', 'panels']);

    expect([...log.since(0).facts].sort()).toEqual(['capability', 'panels']);
  });

  it('★ 同一个事实点名两遍只算一条（笔误不该在推送里出现两次）', () => {
    const log = createFactLog();
    expect(log.bump(['inventory/binding', 'inventory/binding']).facts).toEqual(['inventory/binding']);
  });

  it('★ 宿主重载（新纪元、rev 归零）时纪元变了 —— 客户端据此全部重读', () => {
    const before = createFactLog({ epoch: 'e1' });
    before.bump(['panels']);

    const after = createFactLog({ epoch: 'e2' });
    const snapshot = after.since(before.since(0).rev);
    expect(snapshot.epoch).toBe('e2');
    expect(snapshot.rev).toBe(0);
  });

  it('订阅：一次写入通知一次（推送通道就靠它）', () => {
    const log = createFactLog();
    const seen: Array<readonly string[]> = [];
    const off = log.subscribe((change) => seen.push(change.facts));
    log.bump(['inventory/summary']);
    log.bump(['panels']);
    off();
    log.bump(['issues']);

    expect(seen).toEqual([['inventory/summary'], ['panels']]);
  });
});

describe('wroteNow（预览不算写）', () => {
  it('写工具如实说"落笔了没有"', () => {
    expect(wroteNow({ value: { wrote: true } })).toBe(true);
    expect(wroteNow({ value: { wrote: false } })).toBe(false);
  });

  it('说不清就给 undefined（调用方按"照旧刷"处理）', () => {
    expect(wroteNow({ value: { text: '…' } })).toBeUndefined();
    expect(wroteNow({ isError: true })).toBeUndefined();
    expect(wroteNow(undefined)).toBeUndefined();
    expect(wroteNow({ value: { wrote: 'yes' } })).toBeUndefined();
  });
});
