import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import type { ClientUnitRegistry } from '@/kernel/client/registry';
import { UNIT_MANIFESTS_ROUTE } from '@/kernel/contract/unit-manifests';

const sources: FakeEventSource[] = [];

class FakeEventSource {
  onmessage: ((event: { readonly data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    sources.push(this);
  }

  close(): void {}
}

function manifest(id: string): UnitManifest {
  return {
    id,
    titleKey: `${id}.title`, card: { order: 10 },
    tools: [],
    host: { inject: [] },
  };
}

function stubFetch(hold = false): {
  manifestsCalls: () => number;
  otherCalls: () => number;
  release: (index: number) => void;
} {
  const resolvers: Array<() => void> = [];
  let manifests = 0;
  let others = 0;
  vi.stubGlobal('fetch', (url: string) => {
    if (!String(url).includes(UNIT_MANIFESTS_ROUTE)) {
      others += 1;
      return Promise.resolve({ ok: false, status: 404, json: async () => ({ ok: false }) });
    }
    manifests += 1;
    const answer = () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, manifests: [manifest('late-module')] }),
    });
    if (!hold) return Promise.resolve(answer());
    return new Promise((resolve) => resolvers.push(() => resolve(answer())));
  });
  return {
    manifestsCalls: () => manifests,
    otherCalls: () => others,
    release: (index) => resolvers[index]?.(),
  };
}

function registrySpy(): {
  registry: ClientUnitRegistry;
  written: UnitManifest[][];
  failures: (string | null)[];
} {
  const written: UnitManifest[][] = [];
  const failures: (string | null)[] = [];
  let failure: string | null = null;
  const registry = {
    setManifests: (manifests: readonly UnitManifest[]) => {
      written.push([...manifests]);
    },
    refusals: () => [],
    setManifestReadFailure: (reason: string | null) => {
      failure = reason;
      failures.push(reason);
    },
    manifestReadFailure: () => failure,
  } as unknown as ClientUnitRegistry;
  return { registry, written, failures };
}

function sourceOf(): FakeEventSource {
  const source = sources[sources.length - 1];
  if (source === undefined) throw new Error('变更流没连上');
  return source;
}

function sync(rev: number): void {
  sourceOf().onmessage?.({ data: JSON.stringify({ epoch: 'e1', rev, facts: [] }) });
}

function frame(facts: readonly string[], rev: number): void {
  sourceOf().onmessage?.({ data: JSON.stringify({ rev, facts }) });
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.unstubAllGlobals();
  sources.length = 0;
  vi.resetModules();
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createUnitManifestLoader', () => {
  it('★ 清单那条事实一动，浏览器就重读一次（不刷新页面也看得见装卸）', async () => {
    const { createUnitManifestLoader } = await import('../manifests');
    const fetchState = stubFetch();
    const { registry, written } = registrySpy();
    const load = createUnitManifestLoader();

    load(registry);
    await flush();
    expect(fetchState.manifestsCalls()).toBe(1);

    sync(1);
    await flush();
    expect(fetchState.manifestsCalls()).toBe(1);

    frame(['unit-manifests'], 2);
    await flush();

    expect(fetchState.manifestsCalls()).toBe(2);
    expect(written.map((items) => items.map((item) => item.id))).toEqual([
      ['late-module'],
      ['late-module'],
    ]);
  });

  it('★ 别的事实动了不重读：清单只认它自己那条事实', async () => {
    const { createUnitManifestLoader } = await import('../manifests');
    const fetchState = stubFetch();
    const { registry, written } = registrySpy();
    const load = createUnitManifestLoader();

    load(registry);
    await flush();
    sync(1);
    await flush();

    frame(['capability'], 2);
    frame(['panels'], 3);
    await flush();

    expect(fetchState.manifestsCalls()).toBe(1);
    expect(written).toHaveLength(1);
  });

  it('★ 走推送那条路：只开一条 SSE，不去轮询 changes', async () => {
    const { createUnitManifestLoader } = await import('../manifests');
    const fetchState = stubFetch();
    const { registry } = registrySpy();
    const load = createUnitManifestLoader();

    load(registry);
    await flush();
    sync(1);
    frame(['unit-manifests'], 2);
    await flush();

    expect(sources).toHaveLength(1);
    expect(sources[0]?.url).toContain('since=');
    expect(fetchState.otherCalls()).toBe(0);
  });

  it('★ 合并并发：一次读还在飞的时候又来了信号，只补读一次', async () => {
    const { createUnitManifestLoader } = await import('../manifests');
    const fetchState = stubFetch(true);
    const { registry } = registrySpy();
    const load = createUnitManifestLoader();

    load(registry);
    sync(1);
    frame(['unit-manifests'], 2);
    frame(['unit-manifests'], 3);
    expect(fetchState.manifestsCalls()).toBe(1);

    fetchState.release(0);
    await flush();

    expect(fetchState.manifestsCalls()).toBe(2);
    fetchState.release(1);
    await flush();
    expect(fetchState.manifestsCalls()).toBe(2);
  });

  it('★ 503 只打一次：失败就登记，不自己重试（用户点重试再读）', async () => {
    const { createUnitManifestLoader } = await import('../manifests');
    let calls = 0;
    vi.stubGlobal('fetch', (url: string) => {
      if (!String(url).includes(UNIT_MANIFESTS_ROUTE)) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({ ok: false }) });
      }
      calls += 1;
      return Promise.resolve({
        ok: false,
        status: 503,
        json: async () => ({ ok: false, error: { code: 'busy', message: '宿主还没起来' } }),
      });
    });
    const { registry, written } = registrySpy();
    const load = createUnitManifestLoader();

    load(registry);
    for (let round = 0; round < 6; round += 1) await flush();

    expect(calls).toBe(1);
    expect(written).toEqual([]);
    expect(registry.manifestReadFailure()).toContain('503');
  });

  it('★ 清单里还缺刚注册的 unit（读者先到）也会再读一次，卡片才挂得上', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { createUnitManifestLoader } = await import('../manifests');
    const { createClientUnitRegistry } = await import('@/kernel/client/registry');
    let calls = 0;
    vi.stubGlobal('fetch', (url: string) => {
      if (!String(url).includes(UNIT_MANIFESTS_ROUTE)) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({ ok: false }) });
      }
      calls += 1;
      const manifests = calls === 1 ? [manifest('panels')] : [manifest('panels'), manifest('hello')];
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, manifests }) });
    });
    const load = createUnitManifestLoader();
    const units = createClientUnitRegistry({ onUnknownUnit: () => load(units) });

    load(units);
    await flush();
    units.register({ unit: 'hello', card: () => null });

    for (let round = 0; round < 10; round += 1) await flush();

    expect(calls).toBeGreaterThan(1);
    expect(units.manifests().map((item) => item.id)).toEqual(['hello']);
    warn.mockRestore();
  });

  it('★ 一直 503 也不自己重试：只打一次', async () => {
    const { createUnitManifestLoader } = await import('../manifests');
    let calls = 0;
    vi.stubGlobal('fetch', (url: string) => {
      if (!String(url).includes(UNIT_MANIFESTS_ROUTE)) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({ ok: false }) });
      }
      calls += 1;
      return Promise.resolve({ ok: false, status: 503, json: async () => ({ ok: false }) });
    });
    const { registry } = registrySpy();
    const load = createUnitManifestLoader();

    load(registry);
    for (let round = 0; round < 8; round += 1) await flush();

    expect(calls).toBe(1);
  });

  it('★ 一次读不到就登记成"读失败了"，界面才分得清空态与故障', async () => {
    const { createUnitManifestLoader } = await import('../manifests');
    vi.stubGlobal('fetch', (url: string) => {
      if (!String(url).includes(UNIT_MANIFESTS_ROUTE)) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({ ok: false }) });
      }
      return Promise.resolve({ ok: false, status: 503, json: async () => ({ ok: false }) });
    });
    const { registry } = registrySpy();
    const load = createUnitManifestLoader();

    load(registry);
    for (let round = 0; round < 8; round += 1) await flush();

    expect(registry.manifestReadFailure()).not.toBeNull();
  });

  it('读成功之后把"读失败"清掉（恢复后不再挂着错误）', async () => {
    const { createUnitManifestLoader } = await import('../manifests');
    let calls = 0;
    vi.stubGlobal('fetch', (url: string) => {
      if (!String(url).includes(UNIT_MANIFESTS_ROUTE)) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({ ok: false }) });
      }
      calls += 1;
      if (calls === 1) return Promise.resolve({ ok: false, status: 503, json: async () => ({ ok: false }) });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, manifests: [manifest('hello')] }),
      });
    });
    const { registry } = registrySpy();
    const load = createUnitManifestLoader();

    load(registry);
    for (let round = 0; round < 8; round += 1) await flush();
    expect(registry.manifestReadFailure()).not.toBeNull();

    load(registry);
    for (let round = 0; round < 8; round += 1) await flush();

    expect(registry.manifestReadFailure()).toBeNull();
  });

  it('★ 注册到宿主没担保的 unit 时那次重读还在（onUnknownUnit 那条路）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { createUnitManifestLoader } = await import('../manifests');
    const { createClientUnitRegistry } = await import('@/kernel/client/registry');
    const fetchState = stubFetch();
    const load = createUnitManifestLoader();
    const units = createClientUnitRegistry({ onUnknownUnit: () => load(units) });

    load(units);
    await flush();
    expect(fetchState.manifestsCalls()).toBe(1);

    units.register({ unit: 'ghost', card: () => null });
    await flush();

    expect(fetchState.manifestsCalls()).toBe(2);
    expect(units.refusals().map((item) => item.unit)).toEqual(['ghost']);
    warn.mockRestore();
  });

  it('★ 工作台说清哪几个模块被拒：不再空等 30 次，也不在看板上挂横幅', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { createUnitManifestLoader } = await import('../manifests');
    const { createClientUnitRegistry } = await import('@/kernel/client/registry');
    let calls = 0;
    vi.stubGlobal('fetch', (url: string) => {
      if (!String(url).includes(UNIT_MANIFESTS_ROUTE)) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({ ok: false }) });
      }
      calls += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          manifests: [manifest('panels')],
          refusals: [
            {
              unit: 'jj-news',
              pkg: '@pkg/module-jj-news',
              reasons: ['dsh.workbench.apiVersion 是 1，这里只认 3'],
            },
          ],
        }),
      });
    });
    const load = createUnitManifestLoader();
    const units = createClientUnitRegistry({ onUnknownUnit: () => load(units) });

    load(units);
    await flush();
    units.register({ unit: 'jj-news', card: () => null });
    for (let round = 0; round < 8; round += 1) await flush();

    expect(units.manifestReadFailure()).toBeNull();
    expect(units.refusals().map((item) => item.unit)).toEqual(['jj-news']);
    expect(calls).toBeLessThan(5);
    warn.mockRestore();
  });

  it('★ 清单缺刚注册的 unit：只补读一次，不报读失败', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { createUnitManifestLoader } = await import('../manifests');
    const { createClientUnitRegistry } = await import('@/kernel/client/registry');
    let calls = 0;
    vi.stubGlobal('fetch', (url: string) => {
      if (!String(url).includes(UNIT_MANIFESTS_ROUTE)) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({ ok: false }) });
      }
      calls += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, manifests: [manifest('panels')] }),
      });
    });
    const load = createUnitManifestLoader();
    const units = createClientUnitRegistry({ onUnknownUnit: () => load(units) });

    load(units);
    await flush();
    units.register({ unit: 'ghost', card: () => null });
    for (let round = 0; round < 10; round += 1) await flush();

    expect(units.manifestReadFailure()).toBeNull();
    expect(calls).toBe(2);
    warn.mockRestore();
  });
});
