import { describe, expect, it } from 'vitest';
import type { LongTaskIntervention, LongTaskStep } from '../../contract/long-task.js';
import {
  createLongTaskHost,
  createLongTaskRegistry,
  sharedLongTaskRegistry,
  withInterventionRetry,
  type LongTaskBase,
  type LongTaskDeps,
} from '../long-task.js';

interface Probe extends LongTaskBase {
  readonly note?: string | undefined;
}

function harness(over: Partial<LongTaskDeps<Probe>> = {}) {
  let signal: AbortSignal | undefined;
  let step: ((step: LongTaskStep) => void) | undefined;
  let settle: ((result: unknown) => void) | undefined;
  let fail: ((error: unknown) => void) | undefined;
  const base: LongTaskDeps<Probe> = {
    now: () => '2026-10-21T02:00:00.000Z',
    run: (options) =>
      new Promise((resolve, reject) => {
        signal = options.signal;
        step = options.onStep;
        settle = resolve as (result: unknown) => void;
        fail = reject as (error: unknown) => void;
      }),
    view: (snapshot) => ({ target: snapshot.target, status: snapshot.status, note: snapshot.note }),
  };
  return {
    deps: { ...base, ...over },
    signal: () => signal,
    step: (one: LongTaskStep) => step?.(one),
    done: (result: unknown) => settle?.(result),
    boom: (error: unknown) => fail?.(error),
  };
}

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('createLongTaskRegistry.stop（停止只是转发给生产方，认不认 signal 是模块的事）', () => {
  it('★★ stop：run 拿到的 signal 被 abort，这一趟变 stopped，回 true', () => {
    const h = harness();
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'release' });

    expect(h.signal()?.aborted).toBe(false);
    expect(runs.stop(started.id)).toBe(true);
    expect(h.signal()?.aborted).toBe(true);
    expect(runs.snapshot(started.id)?.status).toBe('stopped');
  });

  it('★★ 结算首胜：停过之后 run 再 resolve 也不许翻案（还是 stopped，不是 ok）', async () => {
    const h = harness();
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'release' });

    runs.stop(started.id);
    h.done({ anything: true });
    await flush();

    expect(runs.snapshot(started.id)?.status).toBe('stopped');
  });

  it('★★ 被 abort 的 run 常常 reject（AbortError）：那一趟不许变成 failed', async () => {
    const h = harness();
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'release' });

    runs.stop(started.id);
    h.boom(new Error('This operation was aborted'));
    await flush();

    expect(runs.snapshot(started.id)?.status).toBe('stopped');
    expect(runs.snapshot(started.id)?.why).toBeUndefined();
  });

  it('★★ 不是活的：已收尾 / 不认识的 id ⇒ 回 false，什么都没变', async () => {
    const h = harness();
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'release' });

    h.done({});
    await flush();

    expect(runs.stop(started.id)).toBe(false);
    expect(runs.snapshot(started.id)?.status).toBe('ok');
    expect(runs.stop('run-nope')).toBe(false);
    expect(runs.current('/w/a')).toHaveLength(1);
  });

  it('★★ 停这一下走 deps.stopped（与 outcome 之于 ok 同形：停在哪、文案怎么写是模块的知识）', () => {
    const h = harness({ stopped: () => ({ note: '用户按停的' }) });
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'release' });

    runs.stop(started.id);

    expect(runs.snapshot(started.id)?.note).toBe('用户按停的');
  });

  it('★ 等你登录时也能停：登录地址跟着清掉', () => {
    const h = harness();
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'release' });

    h.step({ kind: 'start', text: '未登录', loginUrl: 'https://x/login' });
    expect(runs.snapshot(started.id)?.status).toBe('needs-login');

    expect(runs.stop(started.id)).toBe(true);
    expect(runs.snapshot(started.id)?.status).toBe('stopped');
    expect(runs.snapshot(started.id)?.loginUrl).toBeUndefined();
  });

  it('★ 停过之后迟到的步骤也不进这一趟（结算首胜）', () => {
    const h = harness();
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'release' });

    runs.stop(started.id);
    h.step({ kind: 'info', text: '迟到一步' });

    expect(runs.snapshot(started.id)?.steps).toEqual([]);
    expect(runs.snapshot(started.id)?.status).toBe('stopped');
  });

  it('★★ current() 每条都带 id（浏览器按 id 点那颗钮），view 覆盖不了', () => {
    const h = harness({ view: (snapshot) => ({ id: 'spoofed', status: snapshot.status }) });
    const runs = createLongTaskRegistry({ ...h.deps, nextId: () => 'run-1' });
    const started = runs.start({ workspace: '/w/a', target: 'release' });

    const [row] = runs.current('/w/a');

    expect(started.id).toBe('run-1');
    expect(row?.['id']).toBe('run-1');
  });
});

describe('createLongTaskRegistry 的人工干预节点（needs-human）', () => {
  const need: LongTaskIntervention = {
    title: '要登录腾讯云',
    hint: '凭证过期了',
    actions: [
      { kind: 'open-url', url: 'https://example.com/login', label: '去登录' },
      { kind: 'copy', text: 'token-123' },
    ],
  };

  it('★★ 步骤带 intervention：进 needs-human、存载荷、步骤文案照旧进快照', () => {
    const h = harness();
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'release' });

    h.step({ kind: 'start', text: '发布停在第 2 步', intervention: need });

    const snapshot = runs.snapshot(started.id);
    expect(snapshot?.status).toBe('needs-human');
    expect(snapshot?.intervention).toEqual(need);
    expect(snapshot?.step).toBe('发布停在第 2 步');
    expect(snapshot?.loginUrl).toBeUndefined();
  });

  it('★★ 下一条不带干预的步骤：退回 running，载荷清掉', () => {
    const h = harness();
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'release' });

    h.step({ kind: 'start', text: '等人', intervention: need });
    h.step({ kind: 'info', text: '人处理完了，继续' });

    expect(runs.snapshot(started.id)?.status).toBe('running');
    expect(runs.snapshot(started.id)?.intervention).toBeUndefined();
  });

  it('★★ 从旧的 needs-login 进新干预：loginUrl 清掉，状态换成 needs-human', () => {
    const h = harness();
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'release' });

    h.step({ kind: 'info', text: '未登录', loginUrl: 'https://example.com/login' });
    expect(runs.snapshot(started.id)?.status).toBe('needs-login');

    h.step({ kind: 'info', text: '换人工确认', intervention: need });

    expect(runs.snapshot(started.id)?.status).toBe('needs-human');
    expect(runs.snapshot(started.id)?.loginUrl).toBeUndefined();
  });

  it('★ 空 loginUrl 不算登录（不再画出点不动的「去登录」）', () => {
    const h = harness();
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'release' });

    h.step({ kind: 'info', text: '未登录', loginUrl: '' });

    expect(runs.snapshot(started.id)?.status).toBe('running');
    expect(runs.snapshot(started.id)?.loginUrl).toBeUndefined();
  });

  it('★★ 结算三态都清载荷：ok / failed / stopped', async () => {
    const okHarness = harness();
    const okRuns = createLongTaskRegistry(okHarness.deps);
    const okStarted = okRuns.start({ workspace: '/w/a', target: 'release' });
    okHarness.step({ kind: 'info', text: '等人', intervention: need });
    okHarness.done({});
    await flush();
    expect(okRuns.snapshot(okStarted.id)?.status).toBe('ok');
    expect(okRuns.snapshot(okStarted.id)?.intervention).toBeUndefined();

    const failedHarness = harness();
    const failedRuns = createLongTaskRegistry(failedHarness.deps);
    const failedStarted = failedRuns.start({ workspace: '/w/a', target: 'release' });
    failedHarness.step({ kind: 'info', text: '等人', intervention: need });
    failedHarness.boom(new Error('炸了'));
    await flush();
    expect(failedRuns.snapshot(failedStarted.id)?.status).toBe('failed');
    expect(failedRuns.snapshot(failedStarted.id)?.intervention).toBeUndefined();

    const stoppedHarness = harness();
    const stoppedRuns = createLongTaskRegistry(stoppedHarness.deps);
    const stoppedStarted = stoppedRuns.start({ workspace: '/w/a', target: 'release' });
    stoppedHarness.step({ kind: 'info', text: '等人', intervention: need });
    expect(stoppedRuns.stop(stoppedStarted.id)).toBe(true);
    expect(stoppedRuns.snapshot(stoppedStarted.id)?.intervention).toBeUndefined();
  });

  it('★★ live / current / active 三处都认 needs-human', () => {
    const h = harness();
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'release' });

    h.step({ kind: 'info', text: '等人', intervention: need });

    expect(runs.live().map((one) => one.id)).toEqual([started.id]);
    expect(runs.live()[0]?.status).toBe('needs-human');
    expect(runs.current('/w/a')).toHaveLength(1);
    expect(runs.current('/w/a')[0]?.['status']).toBe('needs-human');
    expect(runs.active('/w/a', 'release')?.status).toBe('needs-human');
  });

  it('★ 等人那一趟能停，载荷跟着清掉', () => {
    const h = harness();
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'release' });
    h.step({ kind: 'info', text: '等人', intervention: need });

    expect(runs.stop(started.id)).toBe(true);
    expect(runs.snapshot(started.id)?.status).toBe('stopped');
    expect(runs.snapshot(started.id)?.intervention).toBeUndefined();
  });
});

describe('createLongTaskRegistry.recheck（「我处理完了」只请模块再看一眼）', () => {
  const need: LongTaskIntervention = { title: '要登录腾讯云' };

  it('★★ 给了 deps.recheck：resumable 为真，recheck 调到 handler 且不改状态', () => {
    const seen: string[] = [];
    const h = harness({
      recheck: (current) => {
        seen.push(current.id);
      },
    });
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'release' });
    h.step({ kind: 'info', text: '等人', intervention: need });

    expect(runs.resumable).toBe(true);
    expect(runs.recheck(started.id)).toBe(true);
    expect(seen).toEqual([started.id]);
    expect(runs.snapshot(started.id)?.status).toBe('needs-human');
  });

  it('★★ 没给 handler：resumable 为假、recheck 回 false、什么都不做', () => {
    const h = harness();
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'release' });
    h.step({ kind: 'info', text: '等人', intervention: need });

    expect(runs.resumable).toBe(false);
    expect(runs.recheck(started.id)).toBe(false);
    expect(runs.snapshot(started.id)?.status).toBe('needs-human');
  });

  it('★ 不在跑的那一趟：recheck 回 false（收尾后没有可重查的口）', async () => {
    const h = harness({ recheck: () => undefined });
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'release' });

    h.done({});
    await flush();

    expect(runs.recheck(started.id)).toBe(false);
  });

  it('★★ current() 的投影在 resumable 时带上这个键（浏览器据此画「我处理完了」）', () => {
    const open = harness({ recheck: () => undefined });
    const openRuns = createLongTaskRegistry(open.deps);
    openRuns.start({ workspace: '/w/a', target: 'release' });
    expect(openRuns.current('/w/a')[0]?.['resumable']).toBe(true);

    const closed = harness();
    const closedRuns = createLongTaskRegistry(closed.deps);
    closedRuns.start({ workspace: '/w/a', target: 'release' });
    expect('resumable' in (closedRuns.current('/w/a')[0] ?? {})).toBe(false);
  });
});

describe('createLongTaskRegistry.answer（结构化回执：值只回给模块）', () => {
  const need: LongTaskIntervention = {
    title: '要连数据库',
    fields: [
      { key: 'host', label: '主机', required: true },
      { key: 'token', label: '口令', kind: 'secret', required: true },
      { key: 'note', label: '备注' },
    ],
    submitLabel: '提交',
  };

  function answering(runs = harness()) {
    const seen: Array<Readonly<Record<string, string>>> = [];
    const deps = {
      ...runs.deps,
      answer: (_current: Probe, values: Readonly<Record<string, string>>) => {
        seen.push({ ...values });
      },
    };
    const registry = createLongTaskRegistry({ ...deps, nextId: () => 'run-1' });
    const started = registry.start({ workspace: '/w/a', target: 'release' });
    runs.step({ kind: 'info', text: '等人填回执', intervention: need });
    return { seen, registry, started, ...runs };
  }

  it('★★ 给了 deps.answer：answerable 为真；按声明字段收 key、trim 后交 handler，状态不动', () => {
    const h = answering();

    expect(h.registry.answerable).toBe(true);
    expect(h.registry.answer(h.started.id, { host: ' db.internal ', token: ' s3cret ', note: '   ' })).toBe(true);
    expect(h.seen).toEqual([{ host: 'db.internal', token: 's3cret' }]);
    expect(h.registry.snapshot(h.started.id)?.status).toBe('needs-human');
    expect(h.registry.snapshot(h.started.id)?.intervention).toEqual(need);
  });

  it('★★ 未知键丢掉：只收声明字段（回执不是随便塞的口子）', () => {
    const h = answering();

    expect(h.registry.answer(h.started.id, { host: 'h', token: 't', extra: 'x', '': 'y' })).toBe(true);
    expect(h.seen).toEqual([{ host: 'h', token: 't' }]);
  });

  it('★★ 必填缺失（没给 / 空串 / 全空白）⇒ false，handler 一次没调', () => {
    const h = answering();

    expect(h.registry.answer(h.started.id, { token: 't' })).toBe(false);
    expect(h.registry.answer(h.started.id, { host: 'h', token: '   ' })).toBe(false);
    expect(h.registry.answer(h.started.id, { host: '', token: 't' })).toBe(false);
    expect(h.seen).toEqual([]);
  });

  it('★★ 没给 handler：answerable 为假、answer 回 false、什么都不做', () => {
    const h = harness();
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'release' });
    h.step({ kind: 'info', text: '等人填回执', intervention: need });

    expect(runs.answerable).toBe(false);
    expect(runs.answer(started.id, { host: 'h', token: 't' })).toBe(false);
    expect(runs.snapshot(started.id)?.status).toBe('needs-human');
  });

  it('★★ 不在跑 / 没有 intervention / intervention 没有 fields ⇒ false（三处都不给口子）', async () => {
    const h = answering();
    expect(h.registry.answer(h.started.id, { host: 'h', token: 't' })).toBe(true);

    const plain = answering();
    plain.step({ kind: 'info', text: '继续跑' });
    expect(plain.registry.answer(plain.started.id, { host: 'h', token: 't' })).toBe(false);

    const bare = answering();
    bare.step({ kind: 'info', text: '只说不填', intervention: { title: '看一眼' } });
    expect(bare.registry.answer(bare.started.id, { host: 'h', token: 't' })).toBe(false);

    const empty = answering();
    empty.step({ kind: 'info', text: '空字段', intervention: { title: '看一眼', fields: [] } });
    expect(empty.registry.answer(empty.started.id, { host: 'h', token: 't' })).toBe(false);

    const done = answering();
    done.done({});
    await flush();
    expect(done.registry.answer(done.started.id, { host: 'h', token: 't' })).toBe(false);
  });

  it('★★ 回执值不落快照、不进变更通知（值只走 handler，不进任何 agent 可读处）', () => {
    const secret = 'SECRET-TOKEN-123';
    let changes = 0;
    const h = harness({
      answer: () => {},
    });
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'release' });
    h.step({ kind: 'info', text: '等人填回执', intervention: need });
    runs.onChange(() => {
      changes += 1;
    });

    expect(runs.answer(started.id, { host: 'h', token: secret })).toBe(true);

    expect(JSON.stringify(runs.snapshot(started.id))).not.toContain(secret);
    expect(JSON.stringify(runs.current('/w/a'))).not.toContain(secret);
    expect(changes).toBe(0);
  });

  it('★★ current() 的投影在 answerable 时带上这个键（浏览器据此画表单）', () => {
    const open = answering();
    expect(open.registry.current('/w/a')[0]?.['answerable']).toBe(true);

    const closed = harness();
    const closedRuns = createLongTaskRegistry(closed.deps);
    closedRuns.start({ workspace: '/w/a', target: 'release' });
    expect('answerable' in (closedRuns.current('/w/a')[0] ?? {})).toBe(false);
  });
});

describe('withInterventionRetry（看一眼没接上就有界地再试，永不抛错）', () => {
  const current = (id = 'run-1'): Probe => ({
    id,
    workspace: '/w/a',
    target: 'release',
    status: 'needs-human',
    step: '',
    steps: [],
    startedAt: '2026-10-21T02:00:00.000Z',
    at: '2026-10-21T02:00:00.000Z',
  });

  const settle = async (): Promise<void> => {
    for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  };

  function fakeSleep() {
    const waits: number[] = [];
    return {
      waits,
      sleep: (ms: number): Promise<void> => {
        waits.push(ms);
        return Promise.resolve();
      },
    };
  }

  it('★★ 最多 attempts 次；第一轮立刻试、之后每轮先睡 delayMs；用尽就清单飞', async () => {
    const clock = fakeSleep();
    let calls = 0;
    const handler = withInterventionRetry(
      () => {
        calls += 1;
        return false;
      },
      { attempts: 3, delayMs: 7, sleep: clock.sleep },
    );

    handler(current());
    await settle();

    expect(calls).toBe(3);
    expect(clock.waits).toEqual([7, 7]);

    handler(current());
    await settle();
    expect(calls).toBe(6);
  });

  it('★★ check 返回 true = 已经接上，不用再试', async () => {
    const clock = fakeSleep();
    let calls = 0;
    const handler = withInterventionRetry(
      () => {
        calls += 1;
        return calls === 2;
      },
      { attempts: 5, delayMs: 1, sleep: clock.sleep },
    );

    handler(current());
    await settle();

    expect(calls).toBe(2);
    expect(clock.waits).toEqual([1]);
  });

  it('★★ delayMs 可给函数（按第几次等待算，从 1 开始）', async () => {
    const clock = fakeSleep();
    const handler = withInterventionRetry(() => false, {
      attempts: 3,
      delayMs: (attempt) => attempt * 10,
      sleep: clock.sleep,
    });

    handler(current());
    await settle();

    expect(clock.waits).toEqual([10, 20]);
  });

  it('★★ 单飞：同一 id 在飞时再按直接忽略（不会并发放大 check）', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let waits = 0;
    let calls = 0;
    const handler = withInterventionRetry(
      () => {
        calls += 1;
        return false;
      },
      {
        attempts: 2,
        delayMs: 1,
        sleep: async () => {
          waits += 1;
          await gate;
        },
      },
    );

    handler(current());
    handler(current());
    for (let i = 0; i < 3; i += 1) await Promise.resolve();

    expect(waits).toBe(1);
    expect(calls).toBe(1);

    release?.();
    await settle();

    expect(waits).toBe(1);
    expect(calls).toBe(2);
  });

  it('★★ check 抛错继续下一轮，不往外抛', async () => {
    const clock = fakeSleep();
    let calls = 0;
    const handler = withInterventionRetry(
      () => {
        calls += 1;
        if (calls < 3) throw new Error(`第 ${calls} 轮没接上`);
        return true;
      },
      { attempts: 5, delayMs: 1, sleep: clock.sleep },
    );

    expect(() => handler(current())).not.toThrow();
    await settle();

    expect(calls).toBe(3);
    expect(clock.waits).toHaveLength(2);
  });

  it('★★ 连 sleep 都不许把错抛出去（fire-and-forget 的路由可不听拒绝）', async () => {
    const handler = withInterventionRetry(() => false, {
      attempts: 2,
      delayMs: 1,
      sleep: () => Promise.reject(new Error('等不下去了')),
    });

    expect(() => handler(current())).not.toThrow();
    await settle();
  });
});

describe('createLongTaskRegistry.live（外壳侧栏那颗 loading 点读的：不分工作区，只给活着的）', () => {
  it('★★ 两个工作区各一趟在跑 ⇒ 两趟都在；收尾的 / 停掉的不在', async () => {
    const h = harness();
    const runs = createLongTaskRegistry(h.deps);
    const a = runs.start({ workspace: '/w/a', target: 'release', session: 's-1' });
    const b = runs.start({ workspace: '/w/b', target: 'board' });

    expect(runs.live().map((one) => one.id)).toEqual([a.id, b.id]);
    expect(runs.live().map((one) => one.session)).toEqual(['s-1', undefined]);

    h.done({});
    await flush();
    expect(runs.live().map((one) => one.id)).toEqual([a.id]);

    runs.stop(a.id);
    expect(runs.live()).toEqual([]);
  });

  it('★ 要登录那种也算活着（与 longTaskDot 同一口径）', () => {
    const h = harness();
    const runs = createLongTaskRegistry(h.deps);
    runs.start({ workspace: '/w/a', target: 'release' });

    h.step({ kind: 'start', text: '未登录', loginUrl: 'https://x/login' });

    expect(runs.live().map((one) => one.status)).toEqual(['needs-login']);
  });

  it('★★ 交回的是 base 快照（工作区 / 目标 / 来源会话都在），模块那层 view 投影不参与', () => {
    const h = harness({ view: () => ({ hidden: true }) });
    const runs = createLongTaskRegistry(h.deps);
    runs.start({ workspace: '/w/a', target: 'release', session: 's-1' });

    expect(runs.live()[0]).toMatchObject({
      workspace: '/w/a',
      target: 'release',
      session: 's-1',
      status: 'running',
    });
  });
});

describe('sharedLongTaskRegistry（那一份跨热重载存活）', () => {
  it('★★ 槽里那份**上一版的注册表**（四个方法、没有 stop）仍被认回：升级那次重载不重建空表', () => {
    const scope = `test-${String(Date.now())}-${Math.random()}`;
    const slot = Symbol.for(`dsh-workbench:long-task:${scope}:demo`);
    const stale = {
      start: () => undefined,
      snapshot: () => null,
      active: () => null,
      current: () => [],
      onChange: () => () => {},
    };
    (globalThis as unknown as Record<symbol, unknown>)[slot] = stale;

    const again = sharedLongTaskRegistry(scope, 'demo', harness().deps);

    expect(again).toBe(stale);
    expect(Object.hasOwn(again, 'stop')).toBe(false);
  });

  it('★ 认不出（热重载换了接口）⇒ 重造，槽里换成新表', () => {
    const scope = `test-${String(Date.now())}-${Math.random()}`;
    const slot = Symbol.for(`dsh-workbench:long-task:${scope}:demo`);
    const stale = {
      start: () => undefined,
      snapshot: () => null,
      active: () => null,
    };
    (globalThis as unknown as Record<symbol, unknown>)[slot] = stale;

    const fresh = sharedLongTaskRegistry(scope, 'demo', harness().deps);

    expect(fresh).not.toBe(stale);
    expect((globalThis as unknown as Record<symbol, unknown>)[slot]).toBe(fresh);
    expect(typeof fresh.stop).toBe('function');
  });
});

describe('来源会话（谁的这一趟，决定停它要不要审批）', () => {
  it('★★ start 把来源会话记进快照', () => {
    const h = harness();
    const runs = createLongTaskRegistry({ ...h.deps, nextId: () => 'run-1' });
    const started = runs.start({ workspace: '/w/a', target: 'release', session: 's-1' });

    expect(started.session).toBe('s-1');
    expect(runs.snapshot('run-1')?.session).toBe('s-1');
  });

  it('★★ 不给来源 ⇒ 快照里连 session 这个键都没有（别把 undefined 塞进去）', () => {
    const h = harness();
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'release' });

    expect(started.session).toBeUndefined();
    expect(Object.keys(runs.snapshot(started.id) ?? {})).not.toContain('session');
  });

  it('★★ stop(id, by)：谁按的落在那条 settle 通知上', () => {
    const h = harness();
    const runs = createLongTaskRegistry(h.deps);
    const seen: Array<{ kind: string; by: string | undefined; status: string }> = [];
    runs.onChange((change) => {
      seen.push({ kind: change.kind, by: change.by, status: change.snapshot.status });
    });
    const started = runs.start({ workspace: '/w/a', target: 'release', session: 's-1' });

    expect(runs.stop(started.id, 's-2')).toBe(true);

    expect(seen).toEqual([
      { kind: 'start', by: undefined, status: 'running' },
      { kind: 'settle', by: 's-2', status: 'stopped' },
    ]);
  });

  it('★★ stop(id) 不给 by ⇒ 通知里的 by 是 undefined（界面上按的用户）', () => {
    const h = harness();
    const runs = createLongTaskRegistry(h.deps);
    let settleBy: string | undefined = 'sentinel';
    runs.onChange((change) => {
      if (change.kind === 'settle') settleBy = change.by;
    });
    const started = runs.start({ workspace: '/w/a', target: 'release' });

    expect(runs.stop(started.id)).toBe(true);
    expect(settleBy).toBeUndefined();
  });
});

describe('createLongTaskHost 的 notify（每次变更都叫一下，bump 那半照旧）', () => {
  it('★★ 起 / 走一步 / 被停 三次都叫 notify；停那笔带着谁按的', () => {
    const bumps: string[][] = [];
    const seen: string[] = [];
    const box = createLongTaskHost({
      scope: `test-${String(Date.now())}-${Math.random()}`,
      unit: 'demo',
      bump: (facts) => bumps.push([...facts]),
      notify: (change) => seen.push(`${change.kind}:${change.snapshot.status}:${change.by ?? '-'}`),
    });
    const h = harness();
    const runs = box.host.create({ key: 'release', ...h.deps, nextId: () => 'run-1' });

    runs.start({ workspace: '/w/a', target: 'release', session: 's-1' });
    h.step({ kind: 'start', text: '走一步' });

    expect(runs.stop('run-1', 's-1')).toBe(true);
    expect(seen).toEqual(['start:running:-', 'step:running:-', 'settle:stopped:s-1']);
    expect(bumps).toEqual([['demo/runs'], ['demo/runs'], ['demo/runs']]);
  });

  it('★ 没给 notify 也照常跑（老调用点不受影响）', () => {
    const bumps: string[][] = [];
    const box = createLongTaskHost({
      scope: `test-${String(Date.now())}-${Math.random()}`,
      unit: 'demo',
      bump: (facts) => bumps.push([...facts]),
    });
    const h = harness();

    box.host.create({ key: 'release', ...h.deps }).start({ workspace: '/w/a', target: 'release' });

    expect(bumps).toEqual([['demo/runs']]);
  });
});
