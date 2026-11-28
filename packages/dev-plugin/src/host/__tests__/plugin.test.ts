import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshRequest, DshResponse } from '@dsh-workbench/shared/host';
import { apply, inject, name } from '../plugin';

function fakeResponse(): DshResponse {
  return {
    statusCode: 0,
    setHeader: () => undefined,
    end: () => undefined,
  } as unknown as DshResponse;
}

function controlRequest(scene: string): DshRequest {
  return {
    method: 'POST',
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify({ scene }));
    },
  } as unknown as DshRequest;
}

function fakeContext() {
  const handlers = new Map<string, (req: DshRequest, res: DshResponse) => void | Promise<void>>();
  const active = new Set<string>();
  const effects: (() => void)[] = [];
  const ctx = {
    webServer: {
      register: (route: { path: string; handler: (req: DshRequest, res: DshResponse) => void | Promise<void> }) => {
        handlers.set(route.path, route.handler);
        active.add(route.path);
        return () => active.delete(route.path);
      },
    },
    effect: (fn: () => () => void) => {
      effects.push(fn());
    },
  } as unknown as DshHostContext;
  return { ctx, handlers, active, effects };
}

describe('夹具插件', () => {
  it('默认不接管任何工作台路由（dev 起来仍是真宿主）', async () => {
    const fake = fakeContext();

    await apply(fake.ctx);

    expect(name).toBe('dsh-workbench-dev-plugin');
    expect(inject).toEqual(['webServer']);
    expect([...fake.active].sort()).toEqual([
      '/workbench/api/__fixture/scene',
      '/workbench/api/__fixture/scenes',
      '/workbench/api/__fixture/takeover',
    ]);
  });

  it('★ 选了场景才接管读口、changes 与 events', async () => {
    const fake = fakeContext();
    await apply(fake.ctx);

    await fake.handlers.get('/workbench/api/__fixture/scene')?.(controlRequest('market-installed'), fakeResponse());

    expect(fake.active.has('/workbench/api/unit-manifests')).toBe(true);
    expect(fake.active.has('/workbench/api/changes')).toBe(true);
    expect(fake.active.has('/workbench/events')).toBe(true);
  });

  it('★ 选「真实」会把接管全部摘掉', async () => {
    const fake = fakeContext();
    await apply(fake.ctx);

    await fake.handlers.get('/workbench/api/__fixture/scene')?.(controlRequest('market-installed'), fakeResponse());
    await fake.handlers.get('/workbench/api/__fixture/scene')?.(controlRequest('real'), fakeResponse());

    expect([...fake.active].sort()).toEqual([
      '/workbench/api/__fixture/scene',
      '/workbench/api/__fixture/scenes',
      '/workbench/api/__fixture/takeover',
    ]);
  });

  it('卸载时把注册的路由全部摘掉', async () => {
    const fake = fakeContext();
    await apply(fake.ctx);

    for (const dispose of fake.effects) dispose();

    expect(fake.active.size).toBe(0);
  });
});
