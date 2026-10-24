import { describe, expect, it } from 'vitest';
import type { LongTaskStep } from '../../contract/long-task.js';
import {
  createLongTaskHost,
  createLongTaskRegistry,
  sharedLongTaskRegistry,
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
