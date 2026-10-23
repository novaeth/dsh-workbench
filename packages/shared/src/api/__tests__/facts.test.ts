import { describe, expect, it, vi } from 'vitest';
import {
  createFactChannel,
  factOfRoute,
  parseFactFrame,
  type FactFrame,
  type FactTransport,
} from '../facts.js';

function fakeTransport(): {
  transport: FactTransport;
  push(frame: Partial<FactFrame> & { readonly facts: readonly string[] }): void;
  starts: () => number;
  stops: () => number;
} {
  let onFrame: ((frame: FactFrame) => void) | null = null;
  let starts = 0;
  let stops = 0;
  return {
    starts: () => starts,
    stops: () => stops,
    push(frame) {
      onFrame?.({ epoch: 'e1', rev: 1, ...frame });
    },
    transport: {
      start(handlers) {
        starts += 1;
        onFrame = handlers.onFrame;
        return () => {
          stops += 1;
          onFrame = null;
        };
      },
    },
  };
}

describe('createFactChannel', () => {
  it('★ 建立起的第一帧只设基线，不惊动订阅者（挂载时那次取数已经包含它）', () => {
    const wire = fakeTransport();
    const channel = createFactChannel({ transport: wire.transport });
    const listener = vi.fn();
    channel.subscribe('capability', listener);

    channel.applyFrame({ epoch: 'e1', rev: 7, facts: ['capability', 'panels'] });

    expect(listener).not.toHaveBeenCalled();
    expect(channel.revisionOf('capability')).toBeGreaterThan(0);
    expect(channel.revisionOf('panels')).toBeGreaterThan(0);
  });

  it('★ 之后的帧只惊动它点名的事实（别的读者不该白跑一次）', () => {
    const wire = fakeTransport();
    const channel = createFactChannel({ transport: wire.transport });
    const inventory = vi.fn();
    const issues = vi.fn();
    channel.subscribe('inventory/summary', inventory);
    channel.subscribe('issues', issues);
    channel.applyFrame({ epoch: 'e1', rev: 1, facts: [] });

    channel.applyFrame({ epoch: 'e1', rev: 2, facts: ['inventory/summary'] });

    expect(inventory).toHaveBeenCalledTimes(1);
    expect(issues).not.toHaveBeenCalled();
    expect(channel.revisionOf('inventory/summary')).toBe(2);
    expect(channel.revisionOf('issues')).toBe(0);
  });

  it('★ 纪元变了（宿主热重载）→ 全部重读，哪怕修订号看着倒退了', () => {
    const wire = fakeTransport();
    const channel = createFactChannel({ transport: wire.transport });
    const listener = vi.fn();
    channel.subscribe('panels', listener);
    channel.applyFrame({ epoch: 'e1', rev: 9, facts: [] });
    const before = channel.revisionOf('panels');

    channel.applyFrame({ epoch: 'e2', rev: 1, facts: [] });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(channel.revisionOf('panels')).not.toBe(before);
  });

  it('★ refresh(fact) 与收到推送同一后果（用户按 ⟳）', () => {
    const wire = fakeTransport();
    const channel = createFactChannel({ transport: wire.transport });
    const listener = vi.fn();
    channel.subscribe('capability', listener);
    channel.applyFrame({ epoch: 'e1', rev: 1, facts: [] });

    channel.refresh('capability');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(channel.revisionOf('capability')).toBeGreaterThan(1);
  });

  it('★ 最后一个订阅者走了就关传输；再订回来重新起（没人听时不占连接）', () => {
    const wire = fakeTransport();
    const channel = createFactChannel({ transport: wire.transport });
    const off = channel.subscribe('panels', vi.fn());
    const offOther = channel.subscribe('issues', vi.fn());

    expect(wire.starts()).toBe(1);
    off();
    expect(wire.stops()).toBe(0);
    offOther();
    expect(wire.stops()).toBe(1);

    const offAgain = channel.subscribe('panels', vi.fn());
    expect(wire.starts()).toBe(2);
    offAgain();
  });

  it('★ 重连后的首帧**必须惊动**（它装着断线期间的差量）—— 只有这一页的第一帧才按基线', () => {
    const wire = fakeTransport();
    const channel = createFactChannel({ transport: wire.transport });
    const idle = vi.fn();
    const first = channel.subscribe('panels', idle);
    channel.applyFrame({ epoch: 'e1', rev: 3, facts: ['panels'] });
    expect(idle).not.toHaveBeenCalled();

    first();
    const listener = vi.fn();
    channel.subscribe('panels', listener);
    channel.applyFrame({ epoch: 'e1', rev: 5, facts: ['panels'] });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('★ 点名一个命名空间 = 惊动它下面每一条已订阅的事实（装/更/卸之后，用它的模块一起重读）', () => {
    const wire = fakeTransport();
    const channel = createFactChannel({ transport: wire.transport });
    const summary = vi.fn();
    const builds = vi.fn();
    const issues = vi.fn();
    channel.subscribe('inventory/summary', summary);
    channel.subscribe('inventory/builds?env=innettest', builds);
    channel.subscribe('issues/list', issues);
    channel.applyFrame({ epoch: 'e1', rev: 1, facts: [] });

    channel.applyFrame({ epoch: 'e1', rev: 2, facts: ['capability', 'panels', 'inventory*'] });

    expect(summary).toHaveBeenCalledTimes(1);
    expect(builds).toHaveBeenCalledTimes(1);
    expect(issues).not.toHaveBeenCalled();
    expect(channel.revisionOf('inventory/summary')).toBeGreaterThan(1);
  });

  it('命名空间不许凭空造出订阅（订阅表只由读者写），也不许越界到别的模块', () => {
    const wire = fakeTransport();
    const channel = createFactChannel({ transport: wire.transport });
    const demoAnalysis = vi.fn();
    const lookalike = vi.fn();
    channel.subscribe('analysis/summary', demoAnalysis);
    channel.subscribe('inventory-extra/summary', lookalike);
    channel.applyFrame({ epoch: 'e1', rev: 1, facts: [] });

    channel.applyFrame({ epoch: 'e1', rev: 2, facts: ['inventory*'] });

    expect(demoAnalysis).not.toHaveBeenCalled();
    expect(lookalike).not.toHaveBeenCalled();
    expect(channel.revisionOf('inventory/never-subscribed')).toBe(0);
    expect(channel.subscriberCount()).toBe(2);
  });

  it('★ 命名空间也走"第一帧只设基线"这条规则（重开页面不为历史那次动作白读一遍）', () => {
    const wire = fakeTransport();
    const channel = createFactChannel({ transport: wire.transport });
    const listener = vi.fn();
    channel.subscribe('inventory/builds?env=innettest', listener);

    channel.applyFrame({ epoch: 'e1', rev: 4, facts: ['inventory*'] });

    expect(listener).not.toHaveBeenCalled();
    expect(channel.revisionOf('inventory/builds?env=innettest')).toBeGreaterThan(0);
  });

  it('refresh(命名空间) 只惊动它下面的事实（本地失效也按模块点名，不是一律全量）', () => {
    const wire = fakeTransport();
    const channel = createFactChannel({ transport: wire.transport });
    const inventory = vi.fn();
    const issues = vi.fn();
    channel.subscribe('inventory/summary', inventory);
    channel.subscribe('issues/list', issues);
    channel.applyFrame({ epoch: 'e1', rev: 1, facts: [] });

    channel.refresh('inventory*');

    expect(inventory).toHaveBeenCalledTimes(1);
    expect(issues).not.toHaveBeenCalled();
  });

  it('传输把当前修订交回去（重连只要增量）', () => {
    const seen: number[] = [];
    const channel = createFactChannel({
      transport: {
        start(handlers) {
          seen.push(handlers.cursor());
          return () => {};
        },
      },
    });
    channel.applyFrame({ epoch: 'e1', rev: 4, facts: ['panels'] });
    channel.subscribe('panels', vi.fn());

    expect(seen).toEqual([4]);
  });
});

describe('parseFactFrame', () => {
  it('★ 推送帧没有纪元也认（宿主只在首帧带它）—— 认不出就是"拨了开关不亮"', () => {
    expect(parseFactFrame('{"type":"bump","rev":12,"facts":["panels","capability"]}')).toEqual({
      rev: 12,
      facts: ['panels', 'capability'],
    });
  });

  it('★ 缺纪元的帧照样惊动它点名的事实（推送这条路不能整条哑掉）', () => {
    const wire = fakeTransport();
    const channel = createFactChannel({ transport: wire.transport });
    const listener = vi.fn();
    channel.subscribe('panels', listener);
    channel.applyFrame({ epoch: 'e1', rev: 10, facts: ['panels'] });
    listener.mockClear();

    channel.applyFrame({ rev: 11, facts: ['panels'] });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(channel.revisionOf('panels')).toBeGreaterThan(0);
  });

  it('缺纪元 ≠ 换纪元（推送帧不该把"宿主重载过"误报成全量重读）', () => {
    const wire = fakeTransport();
    const channel = createFactChannel({ transport: wire.transport });
    const listener = vi.fn();
    channel.applyFrame({ epoch: 'e1', rev: 3, facts: [] });
    channel.subscribe('panels', listener);

    channel.applyFrame({ rev: 4, facts: [] });
    channel.applyFrame({ epoch: 'e1', rev: 5, facts: [] });
    expect(listener).not.toHaveBeenCalled();

    channel.applyFrame({ epoch: 'e2', rev: 1, facts: [] });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('读不懂的帧丢掉（不猜）：非字符串 / 坏 JSON / 没有修订号', () => {
    expect(parseFactFrame(undefined)).toBeNull();
    expect(parseFactFrame({ rev: 1, facts: [] })).toBeNull();
    expect(parseFactFrame('{ 这不是 JSON')).toBeNull();
    expect(parseFactFrame('{"type":"bump","facts":["panels"]}')).toBeNull();
    expect(parseFactFrame('{"rev":2}')).toEqual({ rev: 2, facts: [] });
    expect(parseFactFrame('{"rev":2,"facts":["panels",7]}')).toEqual({ rev: 2, facts: ['panels'] });
  });
});

describe('factOfRoute', () => {
  it('事实名就是路由名（不另起一套词汇，读与订阅不可能各说各话）', () => {
    expect(factOfRoute('inventory/summary')).toBe('inventory/summary');
    expect(factOfRoute('capability')).toBe('capability');
  });
});
