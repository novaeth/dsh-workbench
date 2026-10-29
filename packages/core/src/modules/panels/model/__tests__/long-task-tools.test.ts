import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshToolDefinition, DshToolRunContext } from '@dsh-workbench/shared';
import type { LongTaskBase, LongTaskChange, LongTaskRegistry } from '@dsh-workbench/shared/host';
import { createLongTaskRegistry } from '@dsh-workbench/shared/host';
import { panelsFactsOf } from '../handoff';
import { registerLongTaskTools, type LongTaskRunsLookup } from '../long-task-tools';
import { LONG_TASKS_LIST_TOOL, LONG_TASKS_STOP_TOOL } from '../../unit';

const NOW = '2026-10-21T00:00:00.000Z';

type Mode = 'running' | 'needs-login' | 'stopped' | 'ok' | 'failed';

function registryOf(options: {
  readonly id: string;
  readonly target: string;
  readonly mode: Mode;
  readonly step?: string | undefined;
  readonly session?: string | undefined;
  readonly workspace?: string | undefined;
  readonly onStop?: ((change: LongTaskChange<LongTaskBase>) => void) | undefined;
}): LongTaskRegistry<LongTaskBase> {
  const registry = createLongTaskRegistry<LongTaskBase>({
    run: ({ onStep }) => {
      if (options.step !== undefined) onStep({ kind: 'info', text: options.step });
      if (options.mode === 'running') return new Promise(() => {});
      if (options.mode === 'failed') return Promise.reject(new Error('炸了'));
      if (options.mode === 'needs-login') {
        onStep({ kind: 'info', text: '凭证过期了', loginUrl: 'https://example.com/login' });
        return new Promise(() => {});
      }
      return Promise.resolve('done');
    },
    view: (snapshot) => ({ target: snapshot.target, status: snapshot.status, step: snapshot.step }),
    nextId: () => options.id,
    now: () => NOW,
  });
  registry.start({
    workspace: options.workspace ?? '/w/x',
    target: options.target,
    ...(options.session === undefined ? {} : { session: options.session }),
  });
  if (options.mode === 'stopped') registry.stop(options.id);
  if (options.onStop !== undefined) registry.onChange(options.onStop);
  return registry;
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function seeded(entries: ReadonlyArray<readonly [string, LongTaskRegistry<LongTaskBase>]>): LongTaskRunsLookup {
  const table = new Map(entries);
  return () => table;
}

function harness(runs: LongTaskRunsLookup | undefined): Map<string, DshToolDefinition> {
  const seen = new Map<string, DshToolDefinition>();
  const registry = {
    register: (definition: DshToolDefinition) => {
      seen.set(definition.name, definition);
      return () => {};
    },
  };
  const ctx = {
    get: (key: string) => (key === 'tools' ? registry : undefined),
    logger: { info: () => {}, warn: () => {} },
  } as unknown as DshHostContext;
  registerLongTaskTools(ctx, runs);
  return seen;
}

function execAt(workspace: string | null, session: string | null): DshToolRunContext {
  return {
    agent: {
      session: {
        ...(session === null ? {} : { id: session }),
        header: { ...(workspace === null ? {} : { cwd: workspace }) },
      },
    },
  } as unknown as DshToolRunContext;
}

async function run(
  name: string,
  runs: LongTaskRunsLookup | undefined,
  args: unknown,
  exec: DshToolRunContext,
): Promise<Record<string, unknown>> {
  const tool = harness(runs).get(name);
  expect(tool, name).toBeDefined();
  const execute = tool?.execute as unknown as (
    raw: unknown,
    context: DshToolRunContext,
  ) => Promise<Record<string, unknown>>;
  return execute(args, exec);
}

describe('workbench_long_tasks_list：一个工作区现在有哪几趟，一眼看完', () => {
  it('★ 行形状逐字：序号 · 单元 · 目标 · 口径词 · 当前一步 · id= · 来源', async () => {
    const runs = seeded([
      [
        'inventory',
        registryOf({
          id: 'run-1',
          target: 'env-prod',
          mode: 'running',
          step: '正在等新镜像部署到集群',
          session: 's1',
        }),
      ],
    ]);
    const result = await run(LONG_TASKS_LIST_TOOL, runs, {}, execAt('/w/x', 's1'));

    expect(result['text']).toBe(
      '当前工作区：/w/x\n1. inventory · env-prod · 进行中 · 正在等新镜像部署到集群 · id=run-1 · 我起的',
    );
  });

  it('★ 五种口径词一一对应五种态（running / needs-login / stopped / ok / failed）', async () => {
    const runs = seeded([
      ['a', registryOf({ id: 'run-1', target: 'one', mode: 'running' })],
      ['b', registryOf({ id: 'run-2', target: 'two', mode: 'needs-login' })],
      ['c', registryOf({ id: 'run-3', target: 'three', mode: 'stopped' })],
      ['d', registryOf({ id: 'run-4', target: 'four', mode: 'ok' })],
      ['e', registryOf({ id: 'run-5', target: 'five', mode: 'failed' })],
    ]);
    await tick();
    const result = await run(LONG_TASKS_LIST_TOOL, runs, {}, execAt('/w/x', 's1'));
    const text = String(result['text']);

    expect(text).toContain('进行中');
    expect(text).toContain('要登录');
    expect(text).toContain('被停了');
    expect(text).toContain('已完成');
    expect(text).toContain('出错');
  });

  it('★ 三种来源词：我起的（session === 调用方会话）/ 用户按的（没记来源）/ 别的会话起的', async () => {
    const runs = seeded([
      ['mine', registryOf({ id: 'run-1', target: 'one', mode: 'running', session: 's1' })],
      ['user', registryOf({ id: 'run-2', target: 'two', mode: 'running' })],
      ['other', registryOf({ id: 'run-3', target: 'three', mode: 'running', session: 's9' })],
    ]);
    const result = await run(LONG_TASKS_LIST_TOOL, runs, {}, execAt('/w/x', 's1'));
    const text = String(result['text']);

    expect(text).toContain('我起的');
    expect(text).toContain('用户按的');
    expect(text).toContain('别的会话起的');
  });

  it('★ 空态：这个工作区一趟都没有（也没有十分钟内刚收尾的）', async () => {
    const result = await run(LONG_TASKS_LIST_TOOL, seeded([]), {}, execAt('/w/x', 's1'));

    expect(result['text']).toBe('这个工作区现在没有长任务在跑（也没有十分钟内刚收尾的）。');
    expect(result['runs']).toEqual([]);
  });

  it('★ 没有注册表（老外壳）也回那句空态，不炸', async () => {
    const result = await run(LONG_TASKS_LIST_TOOL, undefined, {}, execAt('/w/x', 's1'));

    expect(result['text']).toBe('这个工作区现在没有长任务在跑（也没有十分钟内刚收尾的）。');
  });

  it('★ 不知道工作区：这条读不了（长任务按工作区记）', async () => {
    const runs = seeded([['inventory', registryOf({ id: 'run-1', target: 'env-prod', mode: 'running' })]]);
    const result = await run(LONG_TASKS_LIST_TOOL, runs, {}, execAt(null, 's1'));

    expect(result['text']).toBe('不知道当前会话在哪个工作区 —— 长任务按工作区记，这条读不了。');
    expect(result['runs']).toEqual([]);
  });

  it('★ 只挑这个工作区的：别的目录那几趟不上屏', async () => {
    const runs = seeded([
      ['mine', registryOf({ id: 'run-1', target: 'one', mode: 'running', workspace: '/w/x' })],
      ['elsewhere', registryOf({ id: 'run-2', target: 'two', mode: 'running', workspace: '/w/y' })],
    ]);
    const result = await run(LONG_TASKS_LIST_TOOL, runs, {}, execAt('/w/x', 's1'));

    expect(result['text']).toContain('one');
    expect(result['text']).not.toContain('two');
  });

  it('★ 交出去的结果带 unit（事实认领从它长出来）：每条一行、单元去重', async () => {
    const runs = seeded([
      ['inventory', registryOf({ id: 'run-1', target: 'env-prod', mode: 'running' })],
      ['demo', registryOf({ id: 'run-2', target: 'board', mode: 'running' })],
    ]);
    const result = await run(LONG_TASKS_LIST_TOOL, runs, {}, execAt('/w/x', 's1'));

    const claimed = panelsFactsOf({ source: LONG_TASKS_LIST_TOOL, args: {}, result }, []);
    const wrapped = panelsFactsOf({ source: LONG_TASKS_LIST_TOOL, args: {}, result: { value: result } }, []);
    expect(claimed).toEqual(['inventory/runs', 'demo/runs']);
    expect(wrapped).toEqual(['inventory/runs', 'demo/runs']);
  });

  it('★ 没列到单元就不认领事实（空态不惊动谁）', () => {
    expect(panelsFactsOf({ source: LONG_TASKS_LIST_TOOL, args: {}, result: { runs: [] } }, [])).toEqual([]);
    expect(panelsFactsOf({ source: LONG_TASKS_LIST_TOOL, args: {}, result: {} }, [])).toEqual([]);
  });

  it('★ 没有 tools 服务：一把都不注册（不炸）', () => {
    const ctx = { get: () => undefined, logger: { info: () => {}, warn: () => {} } } as unknown as DshHostContext;

    expect(registerLongTaskTools(ctx, undefined)).toEqual([]);
  });
});

describe('workbench_long_tasks_stop：四面围栏与四类回执', () => {
  const inventory = (mode: Mode, workspace = '/w/x', session?: string): LongTaskRunsLookup =>
    seeded([['inventory', registryOf({ id: 'run-1', target: 'env-prod', mode, workspace, session })]]);

  it('★ 认识且活着：停掉 + 那句回执逐字', async () => {
    const runs = inventory('running');
    const result = await run(LONG_TASKS_STOP_TOOL, runs, { unit: 'inventory', id: 'run-1' }, execAt('/w/x', 's1'));

    expect(result['text']).toBe(
      '停了：inventory · env-prod（run-1）。这一趟的活儿收到中断信号 —— 它认不认、停在哪一步看它自己。',
    );
    expect(result['stopped']).toBe(true);
    expect(runs().get('inventory')?.snapshot('run-1')?.status).toBe('stopped');
  });

  it('★ 停自己起的那一趟：`by` 交给注册表（回流靠它认"是不是自己按的"）', async () => {
    const changes: LongTaskChange<LongTaskBase>[] = [];
    const runs = seeded([
      ['inventory', registryOf({ id: 'run-1', target: 'env-prod', mode: 'running', session: 's1', onStop: (change) => changes.push(change) })],
    ]);
    await run(LONG_TASKS_STOP_TOOL, runs, { unit: 'inventory', id: 'run-1' }, execAt('/w/x', 's1'));

    expect(changes.at(-1)?.kind).toBe('settle');
    expect(changes.at(-1)?.by).toBe('s1');
    expect(changes.at(-1)?.snapshot.session).toBe('s1');
  });

  it('★ 认识但已收尾：回"已经不在跑了（口径）"，一个字都不动', async () => {
    const finished = inventory('ok');
    await tick();
    const done = await run(LONG_TASKS_STOP_TOOL, finished, { unit: 'inventory', id: 'run-1' }, execAt('/w/x', 's1'));
    const stopped = await run(LONG_TASKS_STOP_TOOL, inventory('stopped'), { unit: 'inventory', id: 'run-1' }, execAt('/w/x', 's1'));

    expect(done['text']).toBe('这一趟已经不在跑了（已完成）—— 没动它。');
    expect(stopped['text']).toBe('这一趟已经不在跑了（被停了）—— 没动它。');
    expect(done['stopped']).toBe(false);
    expect(finished().get('inventory')?.snapshot('run-1')?.status).toBe('ok');
  });

  it('★ 不认识的 id / 空 id / 空 unit / 没这一格：都回"没有这一趟 —— unit/id 对不上"', async () => {
    const runs = inventory('running');

    for (const args of [
      { unit: 'inventory', id: 'run-9' },
      { unit: 'demo', id: 'run-1' },
      { unit: 'inventory' },
      { id: 'run-1' },
      {},
    ]) {
      const result = await run(LONG_TASKS_STOP_TOOL, runs, args, execAt('/w/x', 's1'));
      expect(result['text'], JSON.stringify(args)).toBe('没有这一趟 —— unit/id 对不上。');
      expect(result['stopped'], JSON.stringify(args)).toBe(false);
    }
    expect(runs().get('inventory')?.snapshot('run-1')?.status).toBe('running');
  });

  it('★ 工作区围栏：不在你当前工作区的那一趟，当场拒、一个字都不动', async () => {
    const runs = inventory('running', '/w/y');
    const result = await run(LONG_TASKS_STOP_TOOL, runs, { unit: 'inventory', id: 'run-1' }, execAt('/w/x', 's1'));

    expect(result['text']).toBe('这一趟不在你当前的工作区（它在 /w/y）—— 没动它。');
    expect(result['stopped']).toBe(false);
    expect(runs().get('inventory')?.snapshot('run-1')?.status).toBe('running');
  });

  it('★ 不知道会话在哪个工作区：一样拒（围栏保守的那一侧）', async () => {
    const runs = inventory('running');
    const result = await run(LONG_TASKS_STOP_TOOL, runs, { unit: 'inventory', id: 'run-1' }, execAt(null, 's1'));

    expect(result['text']).toBe('这一趟不在你当前的工作区（它在 /w/x）—— 没动它。');
    expect(runs().get('inventory')?.snapshot('run-1')?.status).toBe('running');
  });

  it('★ 没有注册表（老外壳）→ 没有这一趟；注册表是上一版（没有 stop）→ 那句话说清要重启', async () => {
    const none = await run(LONG_TASKS_STOP_TOOL, undefined, { unit: 'inventory', id: 'run-1' }, execAt('/w/x', 's1'));
    const stale = seeded([
      ['inventory', { snapshot: () => null, current: () => [], start: () => ({}) } as unknown as LongTaskRegistry<LongTaskBase>],
    ]);
    const old = await run(LONG_TASKS_STOP_TOOL, stale, { unit: 'inventory', id: 'run-1' }, execAt('/w/x', 's1'));

    expect(none['text']).toBe('没有这一趟 —— unit/id 对不上。');
    expect(old['text']).toBe('这一份工作台还是上一版的注册表，停不了 —— 重新起一下工作台就能停');
  });

  it('★ 两把工具都进注册表（`writes` 分类只有清单那处真相：stop 在 `WRITE_TOOLS` 里，扫全表那套判据在 approval.test.ts）', () => {
    const seen = harness(undefined);
    expect([...seen.keys()].sort()).toEqual([LONG_TASKS_LIST_TOOL, LONG_TASKS_STOP_TOOL].sort());
  });

  it('★ 输出那一格：render 交回原文那句话（不是整包 JSON）', () => {
    const seen = harness(undefined);
    const list = seen.get(LONG_TASKS_LIST_TOOL)?.output;
    const stop = seen.get(LONG_TASKS_STOP_TOOL)?.output;

    expect(list?.render(undefined, { text: '一句话', runs: [] })).toEqual([{ type: 'text', text: '一句话' }]);
    expect(stop?.render(undefined, { text: '停了', stopped: true })).toEqual([{ type: 'text', text: '停了' }]);
    expect(String(list?.render(undefined, { runs: [] })[0]?.['text'])).toContain('"runs"');
    expect(String(stop?.render(undefined, null)[0]?.['text'])).toBe('null');
  });
});
