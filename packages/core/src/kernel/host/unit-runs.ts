import { answerRouteOf, param, recheckRouteOf, runsRouteOf, seenRouteOf, stopRouteOf } from '@dsh-workbench/shared/host';
import type { LongTaskBase, LongTaskRegistry, UnitMountResult } from '@dsh-workbench/shared/host';

interface RunsAction {
  readonly resource: string;
  readonly redact?: boolean | undefined;
  handle(payload: unknown): unknown;
}

type IdMethod = 'stop' | 'recheck' | 'answer' | 'seen';

interface IdActionOptions {
  readonly gate?: (() => { readonly ok: false; readonly text: string } | null) | undefined;
  readonly redact?: boolean | undefined;
}

const COPY: Readonly<Record<IdMethod, readonly [string, string, string]>> = {
  stop: [
    '这一份工作台仍是上一版的注册表，无法停止；重新启动工作台后即可停止。',
    '没有指明要停哪一趟，请重试。',
    '没有这一趟，列表可能已经变化。请重新打开面板。',
  ],
  seen: [
    '这一份工作台仍是上一版的注册表，无法标记为已查看；重新启动工作台后即可。',
    '没有指明要标记哪一趟，请重试。',
    '没有这一趟，列表可能已经变化。请重新打开面板。',
  ],
  recheck: [
    '这一份工作台仍是上一版的注册表，无法重查；重新启动工作台后即可重查。',
    '没有指明要重查哪一趟，请重试。',
    '没有这一趟，列表可能已经变化。请重新打开面板。',
  ],
  answer: [
    '这一份工作台仍是上一版的注册表，无法提交回执；重新启动工作台后即可提交。',
    '没有指明要交回执的哪一趟，请重试。',
    '没有这一趟，列表可能已经变化。请重新打开面板。',
  ],
};

function idOf(payload: unknown): string | null {
  const id = (payload as { readonly id?: unknown } | null)?.id;
  return typeof id === 'string' && id.trim() !== '' ? id : null;
}

function idAction(
  runs: LongTaskRegistry<LongTaskBase>,
  method: IdMethod,
  resource: string,
  done: (payload: unknown, id: string) => Record<string, unknown>,
  options: IdActionOptions = {},
): RunsAction {
  const [legacy, ask, missing] = COPY[method];
  const action: RunsAction = {
    resource,
    handle(payload) {
      if (typeof runs[method] !== 'function') return { ok: false, text: legacy };
      const gated = options.gate?.() ?? null;
      if (gated !== null) return gated;
      const id = idOf(payload);
      if (id === null) return { ok: false, text: ask };
      if (runs.snapshot(id) === null) return { ok: false, text: missing };
      return done(payload, id);
    },
  };
  return options.redact === true ? { ...action, redact: true } : action;
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
  const stop = idAction(runs, 'stop', stopRouteOf(unit), (_payload, id) => ({
    ok: true,
    stopped: runs.stop(id),
  }));
  const seen = idAction(runs, 'seen', seenRouteOf(unit), (_payload, id) =>
    runs.seen(id) === true
      ? { ok: true, seen: true }
      : { ok: false, text: '这一趟还在运行，结束后才能标记为已查看。' },
  );
  const recheck = idAction(runs, 'recheck', recheckRouteOf(unit), (_payload, id) => ({
    ok: true,
    rechecked: runs.recheck(id),
  }), {
    gate: () =>
      runs.resumable === true ? null : { ok: false, text: '这一趟没有可重查的入口，模块没有提供重查处理。' },
  });
  const answer = idAction(
    runs,
    'answer',
    answerRouteOf(unit),
    (payload, id) => {
      const fields = runs.snapshot(id)?.intervention?.fields ?? [];
      if (fields.length === 0) return { ok: false, text: '这一趟没有回执表单。' };
      const values = stringValuesOf((payload as { readonly values?: unknown } | null)?.values);
      if (runs.answer(id, values) !== true) {
        const missing = fields.filter(
          (field) => field.required === true && (values[field.key] ?? '').trim() === '',
        );
        if (missing.length > 0) {
          return {
            ok: false,
            text: `回执未提交，还差必填项：${missing.map((field) => field.label).join('、')}。`,
          };
        }
        return { ok: false, text: '回执未提交：缺少必填项，或这一趟已经不在等待处理。' };
      }
      return { ok: true, answered: true };
    },
    {
      redact: true,
      gate: () =>
        runs.answerable === true ? null : { ok: false, text: '这一趟交不了回执，模块没有提供回执处理。' },
    },
  );
  return {
    ...result,
    routes: {
      ...result.routes,
      [runsRouteOf(unit)]: (search: URLSearchParams) => {
        const path = (param(search, 'path') ?? '').trim();
        return { ok: true, runs: path === '' ? [] : runs.current(path) };
      },
    },
    actions: [...(result.actions ?? []), stop, seen, recheck, answer],
  };
}
