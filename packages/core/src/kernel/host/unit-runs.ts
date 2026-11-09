import { param, recheckRouteOf, runsRouteOf, stopRouteOf } from '@dsh-workbench/shared/host';
import type { UnitMountResult } from '@dsh-workbench/shared/host';

export function withRunsRoute(result: UnitMountResult, unit: string): UnitMountResult {
  const runs = result.longTasks;
  if (runs === undefined) return result;
  return {
    ...result,
    routes: {
      ...result.routes,
      [runsRouteOf(unit)]: (search: URLSearchParams) => {
        const path = (param(search, 'path') ?? '').trim();
        return { ok: true, runs: path === '' ? [] : runs.current(path) };
      },
    },
    actions: [
      ...(result.actions ?? []),
      {
        resource: stopRouteOf(unit),
        handle(payload) {
          if (typeof runs.stop !== 'function') {
            return { ok: false, text: '这一份工作台还是上一版的注册表，停不了 —— 重新起一下工作台就能停' };
          }
          const id = (payload as { readonly id?: unknown } | null)?.id;
          if (typeof id !== 'string' || id.trim() === '') {
            return { ok: false, text: '要停哪一趟？给一个 id 才成' };
          }
          if (runs.snapshot(id) === null) {
            return { ok: false, text: '没有这一趟 —— id 对不上，没什么可停的' };
          }
          return { ok: true, stopped: runs.stop(id) };
        },
      },
      {
        resource: recheckRouteOf(unit),
        handle(payload) {
          if (typeof runs.recheck !== 'function') {
            return { ok: false, text: '这一份工作台还是上一版的注册表，重查不了 —— 重新起一下工作台就能重查' };
          }
          if (runs.resumable !== true) {
            return { ok: false, text: '这一趟没有可重查的口 —— 模块没给重查处理' };
          }
          const id = (payload as { readonly id?: unknown } | null)?.id;
          if (typeof id !== 'string' || id.trim() === '') {
            return { ok: false, text: '要重查哪一趟？给一个 id 才成' };
          }
          if (runs.snapshot(id) === null) {
            return { ok: false, text: '没有这一趟 —— id 对不上，没什么可重查的' };
          }
          return { ok: true, rechecked: runs.recheck(id) };
        },
      },
    ],
  };
}
