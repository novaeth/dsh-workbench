import { answerRouteOf, param, recheckRouteOf, runsRouteOf, stopRouteOf } from '@dsh-workbench/shared/host';
import type { UnitMountResult } from '@dsh-workbench/shared/host';

interface RunsAction {
  readonly resource: string;
  readonly redact?: boolean | undefined;
  handle(payload: unknown): unknown;
}

function stringValuesOf(raw: unknown): Readonly<Record<string, string>> {
  if (typeof raw !== 'object' || raw === null) return {};
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') values[key] = value;
  }
  return values;
}

export function withRunsRoute(result: UnitMountResult, unit: string): UnitMountResult {
  const runs = result.longTasks;
  if (runs === undefined) return result;
  const answer: RunsAction = {
    resource: answerRouteOf(unit),
    redact: true,
    handle(payload) {
      if (typeof runs.answer !== 'function') {
        return { ok: false, text: '这一份工作台还是上一版的注册表，交不了回执 —— 重新起一下工作台就能交' };
      }
      if (runs.answerable !== true) {
        return { ok: false, text: '这一趟交不了回执 —— 模块没给回执处理' };
      }
      const id = (payload as { readonly id?: unknown } | null)?.id;
      if (typeof id !== 'string' || id.trim() === '') {
        return { ok: false, text: '要给哪一趟交回执？给一个 id 才成' };
      }
      const snapshot = runs.snapshot(id);
      if (snapshot === null) {
        return { ok: false, text: '没有这一趟 —— id 对不上，没什么可交回执的' };
      }
      const fields = snapshot.intervention?.fields ?? [];
      if (fields.length === 0) {
        return { ok: false, text: '这一趟没有回执表单' };
      }
      const values = stringValuesOf((payload as { readonly values?: unknown } | null)?.values);
      if (runs.answer(id, values) !== true) {
        const missing = fields.filter(
          (field) => field.required === true && (values[field.key] ?? '').trim() === '',
        );
        if (missing.length > 0) {
          return { ok: false, text: `回执没交成 —— 还差必填项：${missing.map((field) => field.label).join('、')}` };
        }
        return { ok: false, text: '回执没交成 —— 缺必填项，或这一趟已经不在等人了' };
      }
      return { ok: true, answered: true };
    },
  };
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
      answer,
    ],
  };
}
