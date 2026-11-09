import { describe, expect, it } from 'vitest';
import { recheckRouteOf, runsRouteOf, stopRouteOf } from '@dsh-workbench/shared/host';
import type { UnitMountResult } from '@dsh-workbench/shared/host';
import { withRunsRoute } from '../unit-runs';

type Runs = Parameters<typeof withRunsRoute>[0]['longTasks'];

function mountResult(runs?: Record<string, unknown>): UnitMountResult {
  return {
    routes: { 'unit/ping': () => ({ ok: true }) },
    registerTools: () => [],
    ...(runs === undefined ? {} : { longTasks: runs as unknown as NonNullable<Runs> }),
  };
}

function actionOf(result: UnitMountResult, resource: string): (payload: unknown) => unknown {
  const action = (result.actions ?? []).find((item) => item.resource === resource);
  if (action === undefined) throw new Error(`没有 ${resource} 这条动作`);
  return action.handle;
}

describe('withRunsRoute', () => {
  it('没有长任务 → 原样返回，一条动作都不挂', () => {
    const result = mountResult();
    expect(withRunsRoute(result, 'unit')).toBe(result);
  });

  it('读路由按 path 交给 current()', () => {
    const seen: string[] = [];
    const mounted = withRunsRoute(
      mountResult({
        current: (workspace: string) => {
          seen.push(workspace);
          return [{ id: 'run-1' }];
        },
      }),
      'unit',
    );
    const read = mounted.routes[runsRouteOf('unit')];
    expect(read).toBeDefined();
    expect(read?.(new URLSearchParams('path=/w/a'))).toEqual({ ok: true, runs: [{ id: 'run-1' }] });
    expect(seen).toEqual(['/w/a']);
    expect(read?.(new URLSearchParams())).toEqual({ ok: true, runs: [] });
  });

  it('停止：正常回 ok，空 id / 不认识 id 各回一句人话', () => {
    const stopped: string[] = [];
    const mounted = withRunsRoute(
      mountResult({
        snapshot: (id: string) => (id === 'run-1' ? { id } : null),
        stop: (id: string) => {
          stopped.push(id);
          return true;
        },
      }),
      'unit',
    );
    const handle = actionOf(mounted, stopRouteOf('unit'));
    expect(handle({ id: 'run-1' })).toEqual({ ok: true, stopped: true });
    expect(handle({ id: ' ' })).toEqual({ ok: false, text: '要停哪一趟？给一个 id 才成' });
    expect(handle({ id: 'nope' })).toEqual({ ok: false, text: '没有这一趟 —— id 对不上，没什么可停的' });
    expect(stopped).toEqual(['run-1']);
  });

  it('重查：给了 handler 才真；没给回「没有可重查的口」；空 / 不认识 id 各回一句', () => {
    const rechecked: string[] = [];
    const mounted = withRunsRoute(
      mountResult({
        resumable: true,
        snapshot: (id: string) => (id === 'run-1' ? { id } : null),
        recheck: (id: string) => {
          rechecked.push(id);
          return true;
        },
      }),
      'unit',
    );
    const handle = actionOf(mounted, recheckRouteOf('unit'));
    expect(handle({ id: 'run-1' })).toEqual({ ok: true, rechecked: true });
    expect(handle({ id: 'nope' })).toEqual({ ok: false, text: '没有这一趟 —— id 对不上，没什么可重查的' });
    expect(rechecked).toEqual(['run-1']);

    const closed = withRunsRoute(mountResult({ resumable: false, snapshot: () => ({}), recheck: () => false }), 'unit');
    expect(actionOf(closed, recheckRouteOf('unit'))({ id: 'run-1' })).toEqual({
      ok: false,
      text: '这一趟没有可重查的口 —— 模块没给重查处理',
    });
  });

  it('上一版注册表（没有 recheck）→ 明说重查不了', () => {
    const mounted = withRunsRoute(
      mountResult({ snapshot: () => ({}) }),
      'unit',
    );
    expect(actionOf(mounted, recheckRouteOf('unit'))({ id: 'run-1' })).toEqual({
      ok: false,
      text: '这一份工作台还是上一版的注册表，重查不了 —— 重新起一下工作台就能重查',
    });
  });
});
