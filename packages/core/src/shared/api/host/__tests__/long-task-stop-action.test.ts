import { describe, expect, it } from 'vitest';
import { mountUnits } from '@/kernel/host/mount-units';
import type { LongTaskBase, LongTaskRegistry } from '@dsh-workbench/shared/host';
import type { HostUnit } from '@/kernel/host/unit-registry';
import { ctxWith, face, hostOf, manifest } from './unit-face-helpers';

describe('mountUnits：长任务的停止（外壳按单元自动挂那条动作）', () => {
  const pending = (): Promise<never> => new Promise<never>(() => {});

  function stopFace(
    unit: string,
    run: () => Promise<unknown> = pending,
  ): {
    host: HostUnit;
    start: () => string;
    statusOf: (id: string) => string | undefined;
  } {
    const box: { start?: () => string; status?: (id: string) => string | undefined } = {};
    const host = hostOf(manifest(unit, { inject: [] }), (deps) => {
      const runs = deps.longTasks?.create({
        key: 'release',
        run,
        view: (snapshot: { id: string; workspace: string; target: string; status: string }) => ({
          id: snapshot.id,
          env: snapshot.target,
          status: snapshot.status,
        }),
      });
      if (runs !== undefined) {
        box.start = () => runs.start({ workspace: '/w/a', target: 'test' }).id;
        box.status = (id: string) => runs.snapshot(id)?.status;
      }
      return {
        routes: {},
        registerTools: () => [],
        actions: [{ resource: `${unit}/release`, handle: () => ({ ok: true, own: true }) }],
        ...(runs === undefined ? {} : { longTasks: runs }),
      };
    });
    return { host, start: () => box.start?.() ?? '', statusOf: (id) => box.status?.(id) };
  }

  function mountStopFace(options: { readonly unit?: string; readonly run?: (() => Promise<unknown>) | undefined } = {}) {
    const unit = options.unit ?? 'demo';
    const stopped = stopFace(unit, options.run);
    const plan = mountUnits([stopped.host], {
      ctx: ctxWith([]),
      manifests: () => [],
      longTasks: { scope: `test-${String(Date.now())}-${Math.random()}`, bump: () => {} },
    });
    const stop = plan.actions.find((item) => item.resource === `${unit}/runs/stop`);
    const routes = plan.routes as Record<string, (search: URLSearchParams) => unknown>;
    return { face: stopped, plan, stop, routes };
  }

  it('★ 交回长任务表 → 这条停止动作挂在单元的动作表上，模块自己那条照在', () => {
    const { plan, stop } = mountStopFace();

    expect(plan.actions.map((item) => item.resource).sort()).toEqual(['demo/release', 'demo/runs/stop']);
    expect(stop?.unit).toBe('demo');
  });

  it('★ `{ id }` 对 → `{ ok: true, stopped: true }`，读路由那条随之变 `stopped`；再按一下回 `stopped: false`', () => {
    const { face: stopped, stop, routes } = mountStopFace();
    const id = stopped.start();
    expect(stopped.statusOf(id)).toBe('running');

    expect(stop?.handle({ id })).toEqual({ ok: true, stopped: true });

    expect(stopped.statusOf(id)).toBe('stopped');
    expect(routes['demo/runs']?.(new URLSearchParams('path=/w/a'))).toEqual({
      ok: true,
      runs: [expect.objectContaining({ id, status: 'stopped' })],
    });

    expect(stop?.handle({ id })).toEqual({ ok: true, stopped: false });
  });

  it('★ 认识这个 id 但已经不在跑（已收尾）→ `{ ok: true, stopped: false }`（按晚了不算错）', async () => {
    const { face: stopped, stop } = mountStopFace({ run: () => Promise.resolve({}) });
    const id = stopped.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(stopped.statusOf(id)).toBe('ok');

    expect(stop?.handle({ id })).toEqual({ ok: true, stopped: false });
    expect(stopped.statusOf(id)).toBe('ok');
  });

  it('★ `{}` / 空 id / 不认识的 id → `{ ok: false, … }`，什么都不变', () => {
    const { face: stopped, stop, routes } = mountStopFace();
    const id = stopped.start();

    expect(stop?.handle({})).toEqual({ ok: false, text: expect.any(String) });
    expect(stop?.handle({ id: '' })).toMatchObject({ ok: false });
    expect(stop?.handle({ id: '不认识的-id' })).toMatchObject({ ok: false });

    expect(stopped.statusOf(id)).toBe('running');
    expect(routes['demo/runs']?.(new URLSearchParams('path=/w/a'))).toEqual({
      ok: true,
      runs: [expect.objectContaining({ id, status: 'running' })],
    });
  });

  it('没交长任务表 → 不挂这条停止动作（套件按"没接编排"降级）', () => {
    const plan = mountUnits([face(manifest('demo', { inject: [] }))], { ctx: ctxWith([]), manifests: () => [] });

    expect(plan.actions).toEqual([]);
  });

  it('★ 上一版那份注册表（热重载里还没有 `stop`）→ 动作照挂，按下去回 `{ok:false}` 带"重起工作台"那句', () => {
    const legacy = {
      start: () => ({}) as never,
      snapshot: () => null,
      active: () => null,
      current: () => [],
      onChange: () => () => {},
    } as unknown as LongTaskRegistry<LongTaskBase>;
    const spy = hostOf(manifest('demo', { inject: [] }), () => ({
      routes: {},
      registerTools: () => [],
      longTasks: legacy,
    }));

    const plan = mountUnits([spy], { ctx: ctxWith([]), manifests: () => [] });
    const stop = plan.actions.find((item) => item.resource === 'demo/runs/stop');

    expect(Object.keys(plan.routes)).toEqual(['demo/runs']);
    expect(plan.actions.map((item) => item.resource)).toEqual(['demo/runs/stop']);
    expect(stop?.handle({})).toEqual({
      ok: false,
      text: '这一份外壳还是上一版的注册表，停不了 —— 重新起一下工作台就能停',
    });
  });
});

describe('mountUnits：longTaskRuns 取值器（外壳把那袋注册表交给面）', () => {
  type Table = () => ReadonlyMap<string, LongTaskRegistry<LongTaskBase>> | undefined;

  function capture(
    unit: string,
    seen: Table[],
    extraRoutes: Record<string, () => { ok: boolean }> = {},
  ): HostUnit {
    return hostOf(manifest(unit, { inject: [] }), (deps) => {
      if (deps.longTaskRuns !== undefined) seen.push(deps.longTaskRuns);
      const runs = deps.longTasks?.create({
        key: 'release',
        run: () => new Promise<never>(() => {}),
        view: (snapshot: { id: string; status: string }) => ({ id: snapshot.id, status: snapshot.status }),
      });
      return {
        routes: extraRoutes,
        registerTools: () => [],
        ...(runs === undefined ? {} : { longTasks: runs }),
      };
    });
  }

  const longTasks = { scope: `test-${String(Date.now())}-${Math.random()}`, bump: () => {} };

  it('★ 挂上就拿得到：每个单元那把注册表都在，`stop` 是函数', () => {
    const seen: Table[] = [];
    const plan = mountUnits([capture('demo', seen), capture('other', seen)], {
      ctx: ctxWith([]),
      manifests: () => [],
      longTasks,
    });

    expect(plan.failed).toEqual([]);
    const table = seen[0]?.();
    expect([...(table?.keys() ?? [])].sort()).toEqual(['demo', 'other']);
    expect(typeof table?.get('demo')?.stop).toBe('function');
  });

  it('★ 单元被摘掉（路由不在自己命名空间里）→ 那张表里不再有它', () => {
    const seen: Table[] = [];
    const plan = mountUnits([capture('demo', seen), capture('gone', [], { 'elsewhere/x': () => ({ ok: true }) })], {
      ctx: ctxWith([]),
      manifests: () => [],
      longTasks,
    });

    expect(plan.failed.map((item) => item.id)).toEqual(['gone']);
    const table = seen[0]?.();
    expect([...(table?.keys() ?? [])]).toEqual(['demo']);
  });

  it('★ 整批卸载（`disposeLongTasks`）之后那张表是空的', () => {
    const seen: Table[] = [];
    const plan = mountUnits([capture('demo', seen)], { ctx: ctxWith([]), manifests: () => [], longTasks });
    const table = seen[0]?.();
    expect([...(table?.keys() ?? [])]).toEqual(['demo']);

    plan.disposeLongTasks();

    expect([...(table?.keys() ?? [])]).toEqual([]);
  });

  it('★ 表由调用方持有：先后两次 `mountUnits` 共用一张表 —— 先挂的面看得见后挂的单元，卸载只删自己那笔', () => {
    const shared = new Map<string, LongTaskRegistry<LongTaskBase>>();
    const seen: Table[] = [];
    const first = mountUnits([capture('demo', seen)], {
      ctx: ctxWith([]),
      manifests: () => [],
      longTasks,
      longTaskRuns: shared,
    });
    const getter = seen[0];
    expect([...(getter?.()?.keys() ?? [])]).toEqual(['demo']);

    const second = mountUnits([capture('other', [])], {
      ctx: ctxWith([]),
      manifests: () => [],
      longTasks,
      longTaskRuns: shared,
    });
    expect([...(getter?.()?.keys() ?? [])].sort()).toEqual(['demo', 'other']);

    second.disposeLongTasks();
    expect([...(getter?.()?.keys() ?? [])]).toEqual(['demo']);

    first.disposeLongTasks();
    expect([...(getter?.()?.keys() ?? [])]).toEqual([]);
  });
});
