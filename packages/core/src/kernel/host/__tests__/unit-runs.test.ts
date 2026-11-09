import { describe, expect, it } from 'vitest';
import { answerRouteOf, recheckRouteOf, runsRouteOf, stopRouteOf } from '@dsh-workbench/shared/host';
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

function redactOf(result: UnitMountResult, resource: string): boolean | undefined {
  const actions = (result.actions ?? []) as ReadonlyArray<{
    readonly resource: string;
    readonly redact?: boolean | undefined;
  }>;
  return actions.find((item) => item.resource === resource)?.redact;
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

describe('withRunsRoute：回执（answer 那条写路由）', () => {
  const fields = [
    { key: 'operator', label: '操作人', required: true },
    { key: 'token', label: '控制台口令', kind: 'secret', required: true },
  ];

  function answerMount(options: {
    readonly answerable?: boolean;
    readonly fields?: readonly unknown[] | undefined;
    readonly answer?: ((id: string, values: Readonly<Record<string, string>>) => boolean) | undefined;
  }): UnitMountResult {
    return withRunsRoute(
      mountResult({
        answerable: options.answerable ?? true,
        snapshot: (id: string) =>
          id === 'run-1'
            ? {
                id,
                intervention:
                  options.fields === undefined ? { title: '填回执' } : { title: '填回执', fields: options.fields },
              }
            : null,
        ...(options.answer === undefined ? {} : { answer: options.answer }),
      }),
      'unit',
    );
  }

  it('★★ 正常：`{ id, values }` 原样交给 answer、回 `{ ok:true, answered:true }`', () => {
    const seen: Array<[string, Readonly<Record<string, string>>]> = [];
    const mounted = answerMount({
      fields,
      answer: (id, values) => {
        seen.push([id, values]);
        return true;
      },
    });

    expect(actionOf(mounted, answerRouteOf('unit'))({ id: 'run-1', values: { operator: '甲', token: 't-1' } })).toEqual({
      ok: true,
      answered: true,
    });
    expect(seen).toEqual([['run-1', { operator: '甲', token: 't-1' }]]);
  });

  it('★ values 不是对象（缺 / 字符串 / null）当空对象，照样交给 answer', () => {
    const seen: Array<Readonly<Record<string, string>>> = [];
    const mounted = answerMount({
      fields,
      answer: (_id, values) => {
        seen.push(values);
        return true;
      },
    });
    const handle = actionOf(mounted, answerRouteOf('unit'));

    expect(handle({ id: 'run-1' })).toEqual({ ok: true, answered: true });
    expect(handle({ id: 'run-1', values: 'nope' })).toEqual({ ok: true, answered: true });
    expect(handle({ id: 'run-1', values: null })).toEqual({ ok: true, answered: true });
    expect(seen).toEqual([{}, {}, {}]);
  });

  it('★★ 缺必填项（answer 回 false）→ 把那几个 label 拼进回执；没有缺项就是通用那句', () => {
    const mounted = answerMount({ fields, answer: () => false });
    const handle = actionOf(mounted, answerRouteOf('unit'));

    expect(handle({ id: 'run-1', values: { operator: '甲' } })).toEqual({
      ok: false,
      text: '回执没交成 —— 还差必填项：控制台口令',
    });
    expect(handle({ id: 'run-1', values: { operator: '  ' } })).toEqual({
      ok: false,
      text: '回执没交成 —— 还差必填项：操作人、控制台口令',
    });
    expect(handle({ id: 'run-1', values: { operator: '甲', token: 't-1' } })).toEqual({
      ok: false,
      text: '回执没交成 —— 缺必填项，或这一趟已经不在等人了',
    });
  });

  it('★ 这一趟没有回执表单（intervention 不带 fields）→ 明说没有表单', () => {
    const mounted = answerMount({ fields: undefined, answer: () => true });
    expect(actionOf(mounted, answerRouteOf('unit'))({ id: 'run-1', values: {} })).toEqual({
      ok: false,
      text: '这一趟没有回执表单',
    });
  });

  it('★ 空 id / 不认识 id 各回一句人话', () => {
    const mounted = answerMount({ fields, answer: () => true });
    const handle = actionOf(mounted, answerRouteOf('unit'));

    expect(handle({ id: ' ' })).toEqual({ ok: false, text: '要给哪一趟交回执？给一个 id 才成' });
    expect(handle({ id: 'nope' })).toEqual({ ok: false, text: '没有这一趟 —— id 对不上，没什么可交回执的' });
  });

  it('★ 模块没给回执处理（answerable 假）→ 动作照挂，按下去明说交不了', () => {
    const mounted = answerMount({ answerable: false, fields, answer: () => false });
    expect(actionOf(mounted, answerRouteOf('unit'))({ id: 'run-1', values: {} })).toEqual({
      ok: false,
      text: '这一趟交不了回执 —— 模块没给回执处理',
    });
  });

  it('上一版注册表（没有 answer）→ 明说交不了，重起工作台才行', () => {
    const mounted = withRunsRoute(mountResult({ snapshot: () => ({}) }), 'unit');
    expect(actionOf(mounted, answerRouteOf('unit'))({ id: 'run-1' })).toEqual({
      ok: false,
      text: '这一份工作台还是上一版的注册表，交不了回执 —— 重新起一下工作台就能交',
    });
  });

  it('★★ answer 那条声明 redact：回执值不进 write journal；stop / recheck 不声明', () => {
    const mounted = withRunsRoute(
      mountResult({
        resumable: true,
        answerable: true,
        snapshot: () => ({}),
        stop: () => true,
        recheck: () => true,
        answer: () => true,
      }),
      'unit',
    );

    expect(redactOf(mounted, answerRouteOf('unit'))).toBe(true);
    expect(redactOf(mounted, stopRouteOf('unit'))).toBeUndefined();
    expect(redactOf(mounted, recheckRouteOf('unit'))).toBeUndefined();
  });
});
