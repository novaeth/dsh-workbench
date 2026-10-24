import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import type { LongTaskStep } from '@dsh-workbench/shared';
import {
  createLongTaskHost,
  createLongTaskRegistry,
  sharedLongTaskRegistry,
  type LongTaskBase,
  type LongTaskDeps,
} from '@dsh-workbench/shared/host';

interface DemoShot extends LongTaskBase {
  readonly note?: string | undefined;
}

function deps(over: Partial<LongTaskDeps<DemoShot>> = {}) {
  let onStep: ((step: LongTaskStep) => void) | undefined;
  let settle: ((result: unknown) => void) | undefined;
  let fail: ((error: unknown) => void) | undefined;
  let started = 0;
  const base: LongTaskDeps<DemoShot> = {
    now: () => '2026-09-30T02:00:00.000Z',
    run: (options) =>
      new Promise((resolve, reject) => {
        started += 1;
        onStep = options.onStep;
        settle = resolve as (result: unknown) => void;
        fail = reject as (error: unknown) => void;
      }),
    view: (snapshot) => ({ id: snapshot.id, target: snapshot.target, status: snapshot.status, step: snapshot.step, note: snapshot.note }),
  };
  const merged = { ...base, ...over };
  return {
    deps: merged,
    starts: () => started,
    step: (step: LongTaskStep) => onStep?.(step),
    done: (result: unknown) => settle?.(result),
    boom: (error: unknown) => fail?.(error),
  };
}

describe('createLongTaskRegistry', () => {
  it('★ 秒回快照（编排还在跑），同目标不并发第二个；结算后放行', async () => {
    const h = deps();
    const runs = createLongTaskRegistry(h.deps);

    const started = runs.start({ workspace: '/w/a', target: 'test', payload: { any: 1 } });

    expect(started.status).toBe('running');
    expect(started.steps).toEqual([]);
    expect(runs.active('/w/a', 'test')?.id).toBe(started.id);
    expect(runs.active('/w/a', 'staging')).toBeNull();
    expect(runs.active('/w/b', 'test')).toBeNull();

    h.done({});
    await Promise.resolve();
    await Promise.resolve();
    expect(runs.active('/w/a', 'test')).toBeNull();
  });

  it('★ `current`：一个目标至多一条，别的目标/工作区各算各的', async () => {
    let n = 0;
    const h = deps();
    const runs = createLongTaskRegistry({ ...h.deps, nextId: () => `run-${(n += 1)}` });
    runs.start({ workspace: '/w/a', target: 'staging' });
    runs.start({ workspace: '/w/a', target: 'test' });
    runs.start({ workspace: '/w/other', target: 'test' });

    expect(runs.current('/w/a').map((row) => row['target'])).toEqual(['test', 'staging']);
    expect(runs.current('/w/z')).toEqual([]);
  });

  it('★ 一个目标只允许一趟：同目标第二次 `start` **复用**，不再跑一遍编排', () => {
    const h = deps();
    const runs = createLongTaskRegistry({ ...deps().deps, ...h.deps, nextId: () => 'run-1' });
    const first = runs.start({ workspace: '/w/a', target: 'test' });

    const again = runs.start({ workspace: '/w/a', target: 'test' });

    expect(again.id).toBe(first.id);
    expect(h.starts()).toBe(1);
    runs.start({ workspace: '/w/a', target: 'staging' });
    expect(h.starts()).toBe(2);
  });

  it('★ 刚收尾那一帧**留在**当前那一趟里（界面按环境一行），过了窗口才是历史', async () => {
    let clock = dayjs('2026-09-30T02:00:00.000Z').valueOf();
    const h = deps();
    const runs = createLongTaskRegistry({
      ...h.deps,
      now: () => new Date(clock).toISOString(),
      recentMs: 10 * 60 * 1000,
    });
    const started = runs.start({ workspace: '/w/a', target: 'test' });

    h.done({});
    await Promise.resolve();
    await Promise.resolve();

    expect(runs.active('/w/a', 'test')).toBeNull();
    expect(runs.current('/w/a')).toHaveLength(1);
    expect(runs.snapshot(started.id)?.status).toBe('ok');

    clock += 60 * 60 * 1000;
    expect(runs.current('/w/a')).toEqual([]);
  });

  it('★ 登录挂起是一态（带地址），登完自己回 running —— 不是失败', () => {
    const h = deps();
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'test' });

    h.step({ kind: 'start', text: 'inventory 未登录，请打开 https://inventory.invalid/login 完成登录', loginUrl: 'https://inventory.invalid/login' });
    expect(runs.snapshot(started.id)?.status).toBe('needs-login');
    expect(runs.snapshot(started.id)?.loginUrl).toBe('https://inventory.invalid/login');

    h.step({ kind: 'succeed', text: '登录完成' });
    expect(runs.snapshot(started.id)?.status).toBe('running');
    expect(runs.snapshot(started.id)?.loginUrl).toBeUndefined();
  });

  it('步骤最多留最近 20 条，失败那一步带 ✗', () => {
    const h = deps();
    const runs = createLongTaskRegistry({ ...h.deps, nextId: () => 'run-1' });
    runs.start({ workspace: '/w/a', target: 'test' });

    for (let index = 0; index < 25; index += 1) h.step({ kind: 'info', text: `第 ${index} 步` });
    h.step({ kind: 'fail', text: '挂了' });

    const shots = runs.snapshot('run-1')?.steps ?? [];
    expect(shots).toHaveLength(20);
    expect(shots[shots.length - 1]).toBe('✗ 挂了');
    expect(shots[0]).toBe('第 6 步');
  });

  it('★ 套件只交四件：`step`/`outcome` 加进来的格子跟着走，`view` 决定给浏览器哪几格', async () => {
    const h = deps({
      step: (step, current) => (current.note === undefined ? { note: step.text } : {}),
      outcome: () => ({ note: '跑完了' }),
    });
    const runs = createLongTaskRegistry(h.deps);
    const started = runs.start({ workspace: '/w/a', target: 'test' });

    h.step({ kind: 'info', text: '这一步认出了一格' });
    expect(runs.snapshot(started.id)?.note).toBe('这一步认出了一格');
    expect(Object.keys(runs.current('/w/a')[0] ?? {})).toEqual(['id', 'target', 'status', 'step', 'note']);
    h.step({ kind: 'info', text: '第二步' });
    expect(runs.snapshot(started.id)?.note).toBe('这一步认出了一格');

    h.done({});
    await Promise.resolve();
    await Promise.resolve();
    expect(runs.snapshot(started.id)?.note).toBe('跑完了');
    expect(runs.snapshot(started.id)?.status).toBe('ok');
  });

  it('★ 变了就报**变了什么**：起 / 走一步 / 收尾，各自的 kind 与快照；退订之后不再报', async () => {
    const h = deps();
    const runs = createLongTaskRegistry(h.deps);
    const kinds: string[] = [];
    const steps: string[] = [];
    const off = runs.onChange((change) => {
      kinds.push(`${change.kind}:${change.snapshot.status}`);
      if (change.step !== undefined) steps.push(change.step.text);
    });

    runs.start({ workspace: '/w/a', target: 'test' });
    h.step({ kind: 'start', text: '走一步' });
    h.done({});
    await Promise.resolve();
    await Promise.resolve();

    expect(kinds).toEqual(['start:running', 'step:running', 'settle:ok']);
    expect(steps).toEqual(['走一步']);

    off();
    h.step({ kind: 'info', text: '退订之后' });
    expect(kinds).toHaveLength(3);
  });

  it('★ 收尾失败也报 `settle`（套件据 `snapshot.status` 分成功与失败）', async () => {
    const h = deps();
    const runs = createLongTaskRegistry(h.deps);
    const settled: string[] = [];
    runs.onChange((change) => {
      if (change.kind === 'settle') settled.push(change.snapshot.status);
    });

    runs.start({ workspace: '/w/a', target: 'test' });
    h.boom(new Error('合并冲突'));
    await Promise.resolve();
    await Promise.resolve();

    expect(settled).toEqual(['failed']);
  });

  it('订阅者抛错不影响编排（推送失败不该让进度丢）', () => {
    const h = deps();
    const runs = createLongTaskRegistry(h.deps);
    runs.onChange(() => {
      throw new Error('订阅者自己的事');
    });

    expect(() => runs.start({ workspace: '/w/a', target: 'test' })).not.toThrow();
  });

  it('★ 进程级落点：同 scope+key 拿回同一份（热重载不丢在跑的），换 scope 不串', () => {
    const scope = `test-${String(Date.now())}-${Math.random()}`;
    const h = deps();
    const first = sharedLongTaskRegistry(scope, 'demo', h.deps);
    first.start({ workspace: '/w/a', target: 'test' });

    const again = sharedLongTaskRegistry(scope, 'demo', deps().deps);
    expect(again).toBe(first);
    expect(again.current('/w/a')).toHaveLength(1);

    expect(sharedLongTaskRegistry(`${scope}-other`, 'demo', h.deps)).not.toBe(first);
    expect(sharedLongTaskRegistry(scope, 'other-key', h.deps)).not.toBe(first);
  });

  it('★ 落点里那份**认不出**（热重载换了接口）⇒ 重造，不把旧对象当新表用', () => {
    const scope = `test-${String(Date.now())}-${Math.random()}`;
    const slot = Symbol.for(`dsh-workbench:long-task:${scope}:demo`);
    (globalThis as unknown as Record<symbol, unknown>)[slot] = {
      start: () => undefined,
      onChange: () => () => {},
      snapshot: () => null,
    };

    const fresh = sharedLongTaskRegistry(scope, 'demo', deps().deps);

    expect(typeof fresh.current).toBe('function');
    expect((globalThis as unknown as Record<symbol, unknown>)[slot]).toBe(fresh);
  });
});

describe('createLongTaskHost', () => {
  it('★ 造出来的表**变了就点名这个单元的那条事实**；dispose 之后不再点名', () => {
    const bumps: string[][] = [];
    const box = createLongTaskHost({
      scope: `test-${String(Date.now())}-${Math.random()}`,
      unit: 'demo',
      bump: (facts) => bumps.push([...facts]),
    });
    const h = deps();
    const runs = box.host.create({ key: 'release', ...h.deps });

    runs.start({ workspace: '/w/a', target: 'test' });
    h.step({ kind: 'start', text: '走一步' });

    expect(bumps).toEqual([['demo/runs'], ['demo/runs']]);

    box.dispose();
    h.step({ kind: 'info', text: 'dispose 之后' });
    expect(bumps).toHaveLength(2);
  });

  it('★ 套件点名的那几份**跟着一起点**（起跑 / 走一步 / 收尾），重复的名字只点一次', async () => {
    const bumps: string[][] = [];
    const box = createLongTaskHost({
      scope: `test-${String(Date.now())}-${Math.random()}`,
      unit: 'demo',
      bump: (facts) => bumps.push([...facts]),
    });
    const h = deps();
    const runs = box.host.create({
      key: 'release',
      ...h.deps,
      facts: (change) =>
        change.kind === 'start'
          ? ['inventory/builds?env=test']
          : change.kind === 'step'
            ? ['inventory/builds?env=test']
            : ['inventory/builds?env=test', 'inventory/releases?env=test', 'demo/runs'],
    });

    runs.start({ workspace: '/w/a', target: 'test' });
    h.step({ kind: 'start', text: '构建地址: https://x/ci/builds/1' });
    h.done({});
    await Promise.resolve();
    await Promise.resolve();

    expect(bumps).toEqual([
      ['demo/runs', 'inventory/builds?env=test'],
      ['demo/runs', 'inventory/builds?env=test'],
      ['demo/runs', 'inventory/builds?env=test', 'inventory/releases?env=test'],
    ]);
  });

  it('套件没给 `facts`（老写法）⇒ 还是只点 `<单元>/runs`', () => {
    const bumps: string[][] = [];
    const box = createLongTaskHost({
      scope: `test-${String(Date.now())}-${Math.random()}`,
      unit: 'demo',
      bump: (facts) => bumps.push([...facts]),
    });
    const h = deps();
    box.host.create({ key: 'release', ...h.deps }).start({ workspace: '/w/a', target: 'test' });

    expect(bumps).toEqual([['demo/runs']]);
  });
});
