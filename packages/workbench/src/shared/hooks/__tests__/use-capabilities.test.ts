import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CapabilityPayload } from '@dsh-workbench/shared';
import {
  type CapabilityMap,
  beginProbe,
  capabilityValue,
  endProbe,
  probeValue,
  publishCapability,
  runCapabilityRead,
  setCapabilities,
  shareCapabilityFetch,
  shouldForce,
  subscribeCapabilities,
} from '../use-capabilities';

const payload = (unit: string): CapabilityPayload => ({
  unit,
  status: 'ok',
  required: [],
  missing: [],
  detail: '',
});

describe('shouldForce', () => {
  it('首次挂载（token 没变）→ 不强探（命中宿主缓存）', () => {
    expect(shouldForce(0, 0)).toBe(false);
  });

  it('用户刷新过（token 变了）→ 强探', () => {
    expect(shouldForce(1, 0)).toBe(true);
    expect(shouldForce(7, 3)).toBe(true);
  });

  it('同一个 token 反复渲染 → 一直不强探（不是"变了以后每次都强探"）', () => {
    const initial = 2;
    expect(shouldForce(2, initial)).toBe(false);
    expect(shouldForce(2, initial)).toBe(false);
  });

  it('★ 凭据变过之后，后面每一轮（事实推送）都不再强探', () => {
    let previous = 0;
    const forced = [0, 0, 1, 1, 1].map((token) => {
      const force = shouldForce(token, previous);
      previous = token;
      return force;
    });

    expect(forced).toEqual([false, false, true, false, false]);
  });
});

describe('shareCapabilityFetch', () => {
  it('同一个语义的在飞请求搭车（多张卡片只问一次）', async () => {
    let calls = 0;
    const load = async (): Promise<Record<string, never>> => {
      calls += 1;
      return {};
    };

    const first = shareCapabilityFetch(true, load);
    const second = shareCapabilityFetch(true, load);
    await first;

    expect(calls).toBe(1);
    expect(second).toBe(first);
  });

  it('★ 落地之后不再复用：第二次强探要真的再跑一次（不然装完插件看不到变化）', async () => {
    let calls = 0;
    const load = async (): Promise<Record<string, never>> => {
      calls += 1;
      return {};
    };

    await shareCapabilityFetch(true, load);
    await shareCapabilityFetch(true, load);

    expect(calls).toBe(2);
  });

  it('force 语义不同就不搭车（一次强探、一次读缓存不能混成一次）', async () => {
    let calls = 0;
    const load = async (): Promise<Record<string, never>> => {
      calls += 1;
      return {};
    };

    await Promise.all([shareCapabilityFetch(true, load), shareCapabilityFetch(false, load)]);

    expect(calls).toBe(2);
  });

  it('失败也要清空（不然一次网络抖动会把后面的强探永久粘在旧结果上）', async () => {
    let calls = 0;
    const load = async (): Promise<Record<string, never>> => {
      calls += 1;
      throw new Error('boom');
    };

    await shareCapabilityFetch(true, load).catch(() => undefined);
    await shareCapabilityFetch(true, load).catch(() => undefined);

    expect(calls).toBe(2);
  });

});

describe('能力结论只有一份（模块级 store）', () => {
  afterEach(() => setCapabilities(null));

  it('★ 一次探测落地，所有读者看到的是同一份（左栏那枚标签跟着市场页一起亮）', () => {
    const firstSeen: Array<CapabilityMap | null> = [];
    const secondSeen: Array<CapabilityMap | null> = [];
    subscribeCapabilities(() => firstSeen.push(capabilityValue()));
    subscribeCapabilities(() => secondSeen.push(capabilityValue()));

    setCapabilities({ inventory: payload('inventory') });

    expect(firstSeen).toHaveLength(1);
    expect(secondSeen).toHaveLength(1);
    expect(firstSeen[0]).toBe(secondSeen[0]);
    expect(firstSeen[0]).toEqual({ inventory: expect.objectContaining({ unit: 'inventory' }) });
  });

  it('后来的读者直接站在共享结论上（不必先空一下、再等自己那次请求）', () => {
    setCapabilities({ inventory: payload('inventory') });

    expect(capabilityValue()).toEqual({ inventory: expect.objectContaining({ unit: 'inventory' }) });
  });

  it('同值不通知（左栏不该被"同一条说法再发一遍"推着重画）', () => {
    let notified = 0;
    subscribeCapabilities(() => {
      notified += 1;
    });
    const value = { inventory: payload('inventory') };

    setCapabilities(value);
    setCapabilities(value);

    expect(notified).toBe(1);
  });

  it('退订之后不再收到通知', () => {
    let notified = 0;
    const off = subscribeCapabilities(() => {
      notified += 1;
    });

    off();
    setCapabilities({ inventory: payload('inventory') });

    expect(notified).toBe(0);
  });
});

describe('★ 转圈必须罩到"强探落地"那一刻', () => {
  afterEach(() => setCapabilities(null));

  it('强探在飞时，另一次读缓存落地不许熄灭转圈', async () => {
    const OLD: CapabilityMap = { demo: payload('demo') };
    setCapabilities(OLD);
    beginProbe();

    let landForce!: (value: CapabilityMap) => void;
    const forced = runCapabilityRead({
      force: true,
      load: () =>
        new Promise<CapabilityMap>((resolve) => {
          landForce = resolve;
        }),
    });

    await runCapabilityRead({ force: false, load: async () => OLD });

    expect(probeValue().checking).toBe(true);
    expect(capabilityValue()).toBe(OLD);

    const NEW: CapabilityMap = { demo: payload('demo-new') };
    landForce(NEW);
    await forced;

    expect(probeValue().checking).toBe(false);
    expect(capabilityValue()).toBe(NEW);
    expect(probeValue().checkedAt).not.toBeNull();
  });

  it('被强探盖过的读缓存结果要丢掉（不然它会把新结论按回去）', async () => {
    const FRESH: CapabilityMap = { demo: payload('fresh') };
    setCapabilities(FRESH);

    let landStale!: (value: CapabilityMap) => void;
    const staleRead = runCapabilityRead({
      force: false,
      load: () =>
        new Promise<CapabilityMap>((resolve) => {
          landStale = resolve;
        }),
    });

    const NEWER: CapabilityMap = { demo: payload('newer') };
    await runCapabilityRead({ force: true, load: async () => NEWER });
    expect(capabilityValue()).toBe(NEWER);

    landStale({ demo: payload('stale') });
    await staleRead;

    expect(capabilityValue()).toBe(NEWER);
  });

  it('只有强探负责熄灭转圈：一次读缓存落地不该动它（后台补探那档同理）', async () => {
    await runCapabilityRead({ force: false, load: async () => ({ demo: payload('demo') }) });
    expect(probeValue().checking).toBe(false);

    await runCapabilityRead({ force: true, silent: true, load: async () => ({ demo: payload('demo') }) });
    expect(probeValue().checking).toBe(false);
  });
});

describe('publishCapability', () => {
  afterEach(() => setCapabilities(null));

  it('读到了 → 广播', () => {
    expect(publishCapability({ inventory: payload('inventory') })).toBe(true);
    expect(capabilityValue()).toEqual({ inventory: expect.objectContaining({ unit: 'inventory' }) });
  });

  it('★ 这一次没读到：已有结论留着（一次抖动不抹掉"装好了"）', () => {
    const good = { inventory: payload('inventory') };
    setCapabilities(good);

    expect(publishCapability(null)).toBe(false);
    expect(capabilityValue()).toBe(good);
  });

  it('从来没有过结论时，没读到 → 空表（"探不动"，不是"还没探"）', () => {
    expect(capabilityValue()).toBeNull();

    expect(publishCapability(null)).toBe(true);
    expect(capabilityValue()).toEqual({});
  });
});

describe('探测的新鲜度（最近检查 / 正在探）', () => {
  afterEach(() => setCapabilities(null));

  it('★ 强探拿回结论就记下时刻；与上次一样也算"刚看过"（真的问过一次）', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      setCapabilities({ inventory: payload('inventory') }, true);
      expect(probeValue().checkedAt).toBe(1_000);

      vi.setSystemTime(5_000);
      setCapabilities({ inventory: payload('inventory') }, true);
      expect(probeValue().checkedAt).toBe(5_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('★ 读宿主缓存那一次落地**不推进**「最近检查」（第二次进市场页要看到上次的时刻，不是"刚刚"）', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      setCapabilities({ inventory: payload('inventory') }, true);

      vi.setSystemTime(9_000);
      publishCapability({ inventory: payload('inventory') });

      expect(probeValue().checkedAt).toBe(1_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('★ 从没强探过时，读缓存落地也不给「最近检查」一个时刻（`null` = 还没真的问过）', () => {
    publishCapability({ inventory: payload('inventory') });

    expect(capabilityValue()).not.toBeNull();
    expect(probeValue().checkedAt).toBeNull();
  });

  it('★ 探不动**不推进**"最近检查"（不谎报：已有结论留着，但它不是刚拿到的）', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      setCapabilities({ inventory: payload('inventory') }, true);

      vi.setSystemTime(9_000);
      expect(publishCapability(null, true)).toBe(false);
      expect(probeValue().checkedAt).toBe(1_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('★ 一条结论都没有时探不动：广播空表（"探不动"≠"还没探"），但**不**写"最近检查"', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(9_000);
      expect(publishCapability(null, true)).toBe(true);

      expect(capabilityValue()).toEqual({});
      expect(probeValue().checkedAt).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('强探开始/落地：checking 亮起再放下；`endProbe` 不动「最近检查」', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      setCapabilities({ inventory: payload('inventory') }, true);

      vi.setSystemTime(9_000);
      beginProbe();
      expect(probeValue()).toEqual({ checkedAt: 1_000, checking: true });

      endProbe();
      expect(probeValue()).toEqual({ checkedAt: 1_000, checking: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('`setCapabilities(null)` 是归零（测试与"结论被撤掉"同一处境）：新鲜度一起归零', () => {
    setCapabilities({ inventory: payload('inventory') }, true);
    beginProbe();

    setCapabilities(null);

    expect(probeValue()).toEqual({ checkedAt: null, checking: false });
  });
});
