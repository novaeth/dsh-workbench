/* eslint-disable react-hooks/rules-of-hooks */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cells = vi.hoisted(() => ({
  values: [] as unknown[],
  deps: [] as (readonly unknown[] | undefined)[],
  callbacks: [] as ({ fn: unknown; deps?: readonly unknown[] } | undefined)[],
  cursor: 0,
  pending: [] as (() => void)[],
}));

vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const at = cells.cursor;
    cells.cursor += 1;
    if (!(at in cells.values)) {
      cells.values[at] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    }
    const set = (next: unknown): void => {
      const current = cells.values[at];
      cells.values[at] =
        typeof next === 'function' ? (next as (prev: unknown) => unknown)(current) : next;
    };
    return [cells.values[at], set];
  },
  useRef: (initial: unknown) => {
    const at = cells.cursor;
    cells.cursor += 1;
    if (!(at in cells.values)) cells.values[at] = { current: initial };
    return cells.values[at];
  },
  useEffect: (effect: () => void, deps?: readonly unknown[]) => {
    const at = cells.cursor;
    cells.cursor += 1;
    const previous = cells.deps[at];
    const changed =
      deps === undefined ||
      previous === undefined ||
      deps.some((dep, index) => !Object.is(dep, previous[index]));
    cells.deps[at] = deps;
    if (changed) cells.pending.push(effect);
  },
  useCallback: (fn: unknown, deps?: readonly unknown[]) => {
    const at = cells.cursor;
    cells.cursor += 1;
    const previous = cells.callbacks[at];
    const changed =
      previous === undefined ||
      deps === undefined ||
      previous.deps === undefined ||
      deps.some((dep, index) => !Object.is(dep, previous.deps?.[index]));
    if (changed) cells.callbacks[at] = { fn, deps };
    return cells.callbacks[at]?.fn;
  },
}));

import type { SetupSnapshot, SetupStep, UnitSetup } from '@dsh-workbench/shared';
import { useUnitSetup, type UseUnitSetupOptions } from '../use-unit-setup';

async function flush(): Promise<void> {
  for (let at = 0; at < 8; at += 1) await Promise.resolve();
}

async function mount(options: UseUnitSetupOptions): Promise<UnitSetup> {
  for (let at = 0; at < 6; at += 1) {
    cells.cursor = 0;
    useUnitSetup(options);
    const pending = cells.pending;
    cells.pending = [];
    for (const effect of pending) effect();
    await flush();
  }
  cells.cursor = 0;
  return useUnitSetup(options);
}

beforeEach(() => {
  cells.values = [];
  cells.deps = [];
  cells.callbacks = [];
  cells.cursor = 0;
  cells.pending = [];
});

function step(id: string, extra: Partial<SetupStep> = {}): SetupStep {
  return { id, title: id, render: () => null, ...extra };
}

function snapshot(configured: boolean, values: Record<string, unknown> = {}): SetupSnapshot {
  return { configured, values };
}

function options(extra: Partial<UseUnitSetupOptions> = {}): UseUnitSetupOptions {
  return {
    steps: [step('identity'), step('envs')],
    read: async () => snapshot(false),
    ...extra,
  };
}

describe('初始化的状态机', () => {
  it('★ 没配置：从 checking 落到 needs-setup，第一步就位，值来自读回来的那份', async () => {
    const setup = await mount(options({ read: async () => snapshot(false, { name: '工作台' }) }));
    expect(setup.phase).toBe('needs-setup');
    expect(setup.step?.id).toBe('identity');
    expect(setup.values['name']).toBe('工作台');
  });

  it('★ 已配置：相位直接 ready，并回调一次', async () => {
    const onReady = vi.fn();
    const setup = await mount(options({ read: async () => snapshot(true), onReady }));
    expect(setup.phase).toBe('ready');
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('★ 读失败：相位 blocked，错误原文留着', async () => {
    const setup = await mount(
      options({
        read: async () => {
          throw new Error('宿主没响应');
        },
      }),
    );
    expect(setup.phase).toBe('blocked');
    expect(setup.error).toBe('宿主没响应');
  });

  it('★ 下一步：先存本步，再落到下一步', async () => {
    const submit = vi.fn(async () => ({ ok: true }) as const);
    const opts = options({ steps: [step('identity', { submit }), step('envs')] });
    const setup = await mount(opts);
    setup.next();
    const moved = await mount(opts);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(setup.step?.id).toBe('identity');
    expect(moved.step?.id).toBe('envs');
  });

  it('★ 本步存失败：留在原地，把原因说清楚', async () => {
    const opts = options({
      steps: [
        step('identity', { submit: async () => ({ ok: false, message: '名字冲突' }) }),
        step('envs'),
      ],
    });
    const setup = await mount(opts);
    setup.next();
    const stayed = await mount(opts);
    expect(stayed.step?.id).toBe('identity');
    expect(stayed.error).toBe('名字冲突');
  });

  it('★ 最后一步走完：相位到 ready', async () => {
    const opts = options({ steps: [step('identity', { next: () => null })] });
    const setup = await mount(opts);
    setup.next();
    const done = await mount(opts);
    expect(done.phase).toBe('ready');
  });

  it('★ 不让走就不走：canLeave 为假时 next 不动', async () => {
    const submit = vi.fn(async () => ({ ok: true }) as const);
    const opts = options({
      steps: [step('identity', { canLeave: () => false, submit }), step('envs')],
    });
    const setup = await mount(opts);
    setup.next();
    const stayed = await mount(opts);
    expect(submit).not.toHaveBeenCalled();
    expect(stayed.step?.id).toBe('identity');
  });

  it('★ 往回走：第二步能回第一步，第一步不能再回', async () => {
    const opts = options({
      steps: [step('identity'), step('envs')],
      initialStep: () => 'envs',
    });
    const setup = await mount(opts);
    expect(setup.step?.id).toBe('envs');
    expect(setup.canBack).toBe(true);
    setup.back();
    const back = await mount(opts);
    expect(back.step?.id).toBe('identity');
    expect(back.canBack).toBe(false);
  });

  it('★ 编辑模式存全量：写成功到 ready，并回调 onSaved', async () => {
    const write = vi.fn(async () => ({ ok: true }) as const);
    const onSaved = vi.fn();
    const opts = options({
      read: async () => snapshot(true, { name: 'x' }),
      write,
      onSaved,
    });
    const setup = await mount(opts);
    setup.saveAll();
    const saved = await mount(opts);
    expect(write).toHaveBeenCalledTimes(1);
    expect(saved.phase).toBe('ready');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('★ 存全量失败：相位不动，错误留着', async () => {
    const opts = options({
      read: async () => snapshot(true, {}),
      write: async () => ({ ok: false, message: '写不进去' }),
    });
    const setup = await mount(opts);
    setup.saveAll();
    const failed = await mount(opts);
    expect(failed.phase).toBe('ready');
    expect(failed.error).toBe('写不进去');
  });
});
