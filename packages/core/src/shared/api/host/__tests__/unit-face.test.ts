import { describe, expect, it, vi } from 'vitest';
import type { DshToolDefinition, DshToolRegistry } from '@dsh-workbench/shared';
import { mountUnits } from '@/kernel/host/mount-units';
import type { UnitMountDeps } from '@dsh-workbench/shared/host';
import type { HostUnit } from '@/kernel/host/unit-registry';
import { ctxWith, face, hostOf, manifest } from './unit-face-helpers';

describe('mountUnits', () => {
  it('mount 拿到宿主 flow kit：createActions / check / run', async () => {
    let seen: UnitMountDeps | undefined;
    const unit = hostOf(manifest('flow', { inject: [] }), (deps) => {
      seen = deps;
      return { routes: {}, registerTools: () => [] };
    });
    const plan = mountUnits([unit], { ctx: ctxWith([]), manifests: () => [unit.manifest] });

    expect(plan.mounted).toHaveLength(1);
    if (seen === undefined) throw new Error('没有拿到宿主 kit');
    const flowKit = seen.flow;
    expect(typeof seen.sessionIdOf).toBe('function');
    expect(typeof seen.sessionWorkspace).toBe('function');
    expect(typeof seen.libInstallCommand).toBe('function');
    const actions = flowKit.createActions();
    actions.register('read', async () => 'ok');
    const flow = { id: 'f', title: 'F', steps: [{ id: 'read', action: 'read' }] } as const;

    expect(flowKit.check(flow, actions)).toEqual({ ok: true, problems: [] });
    const result = await flowKit.run({
      flow,
      input: {},
      actions,
      signal: new AbortController().signal,
      runId: 'run-1',
      workspace: '/w',
      onStep: () => {},
    });
    expect(result.status).toBe('ok');
  });

  it('硬依赖缺 → 跳过并记下缺哪个（不半挂）', () => {
    const plan = mountUnits([face(manifest('a', { inject: ['webServer'] }))], {
      ctx: ctxWith([]),
      manifests: () => [],
    });

    expect(plan.mounted).toHaveLength(0);
    expect(plan.skipped).toEqual([{ id: 'a', missing: ['webServer'] }]);
  });

  it('软依赖缺 → 照挂，并在 readiness 里记下降级', () => {
    const plan = mountUnits([face(manifest('a', { inject: [], optional: ['shell'] }))], {
      ctx: ctxWith([]),
      manifests: () => [],
    });

    expect(plan.mounted).toHaveLength(1);
    expect(plan.mounted[0]?.readiness.missingSoft).toEqual(['shell']);
  });

  it('闸门"谁提供用谁的"；没人提供就是 undefined（外壳视为全开）', () => {
    const gate = { deniedTools: () => ['workbench_x'], subscribe: () => () => {} };
    const plan = mountUnits(
      [face(manifest('a', { inject: [] })), face(manifest('b', { inject: [] }), { gate })],
      { ctx: ctxWith([]), manifests: () => [] },
    );

    expect(plan.mounted).toHaveLength(2);
    expect(plan.gate?.deniedTools({ workspace: '/w', preset: null })).toEqual(['workbench_x']);
  });

  it('没有闸门时外壳不该拿到一个"全关"的闸门', () => {
    const plan = mountUnits([face(manifest('a', { inject: [] }))], { ctx: ctxWith([]), manifests: () => [] });

    expect(plan.gate).toBeUndefined();
  });

  it('路由汇总起来；偏好写从面里收集（外壳不认识资源名）', () => {
    const plan = mountUnits(
      [face(manifest('a', { inject: [] }), { routes: ['a'], prefs: 'a-prefs' }), face(manifest('b', { inject: [] }), { routes: ['b'] })],
      { ctx: ctxWith([]), manifests: () => [] },
    );

    expect(Object.keys(plan.routes).sort()).toEqual(['a', 'b']);
    expect(plan.prefs.map((item) => item.resource)).toEqual(['a-prefs']);
  });

  it('软依赖的降级会留给外壳记日志（readiness 带出去）', () => {
    const warn = vi.fn();
    const plan = mountUnits([face(manifest('a', { inject: [], optional: ['tools'] }))], {
      ctx: ctxWith([]),
      manifests: () => [],
    });

    expect(plan.mounted[0]?.readiness.missingSoft).toEqual(['tools']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('★ 一个面的 mount() 抛错 → 只废掉它自己，别的面照挂（不是整插件挂）', () => {
    const broken = hostOf(manifest('boom', { inject: [] }), () => {
      throw new Error('模块自己的 bug');
    });
    const plan = mountUnits([broken, face(manifest('ok', { inject: [] }), { routes: ['ok'] })], {
      ctx: ctxWith([]),
      manifests: () => [],
    });

    expect(plan.failed).toEqual([{ id: 'boom', reason: '模块自己的 bug' }]);
    expect(plan.mounted.map((item) => item.host.manifest.id)).toEqual(['ok']);
    expect(Object.keys(plan.routes)).toEqual(['ok']);
  });

  it('★ 同一份面被挂了两次 → 后来那份废掉，先挂的那份照常（不是静默覆盖，也不是整批拒收）', () => {
    const plan = mountUnits(
      [
        face(manifest('a', { inject: [] }), { routes: ['a/list'] }),
        face(manifest('a', { inject: [] }), { routes: ['a/list'] }),
      ],
      { ctx: ctxWith([]), manifests: () => [] },
    );

    expect(Object.keys(plan.routes)).toEqual(['a/list']);
    expect(plan.mounted).toHaveLength(1);
    expect(plan.failed).toEqual([
      { id: 'a', reason: expect.stringMatching(/路由名冲突：a\/list 由套件 a 与 a/) },
    ]);
  });

  it('★ 路由名要住在自己模块的命名空间里（不在 → 只废它自己，兄弟面照常）', () => {
    const bad = mountUnits([face(manifest('a', { inject: [] }), { routes: ['issues'] })], {
      ctx: ctxWith([]),
      manifests: () => [],
    });

    expect(bad.routes).toEqual({});
    expect(bad.mounted).toEqual([]);
    expect(bad.failed[0]?.reason).toMatch(/命名空间/);

    const mixed = mountUnits(
      [
        face(manifest('a', { inject: [] }), { routes: ['issues'] }),
        face(manifest('b', { inject: [] }), { routes: ['b/list'] }),
      ],
      { ctx: ctxWith([]), manifests: () => [] },
    );

    expect(Object.keys(mixed.routes)).toEqual(['b/list']);
    expect(mixed.failed.map((failure) => failure.id)).toEqual(['a']);

    const good = mountUnits([face(manifest('a', { inject: [] }), { routes: ['a/list'] })], {
      ctx: ctxWith([]),
      manifests: () => [],
    });

    expect(good.failed).toEqual([]);
    expect(Object.keys(good.routes)).toEqual(['a/list']);
  });

  it('★ 两个套件都提供闸门 → 先挂的那个胜出，后来那个废掉并记下原因', () => {
    const gate = { deniedTools: () => ['workbench_x'], subscribe: () => () => {} };
    const plan = mountUnits(
      [face(manifest('a', { inject: [] }), { gate }), face(manifest('b', { inject: [] }), { gate })],
      { ctx: ctxWith([]), manifests: () => [] },
    );

    expect(plan.gate?.deniedTools({ workspace: '/w', preset: null })).toEqual(['workbench_x']);
    expect(plan.failed).toEqual([
      { id: 'b', reason: '启停闸门只能有一个提供者，现在是：a、b' },
    ]);
  });

  it('★ 两个套件声明同一个偏好资源名 → 先挂的那个胜出，后来那个废掉', () => {
    const plan = mountUnits(
      [
        face(manifest('a', { inject: [] }), { prefs: 'shared' }),
        face(manifest('b', { inject: [] }), { prefs: 'shared' }),
      ],
      { ctx: ctxWith([]), manifests: () => [] },
    );

    expect(plan.prefs.map((item) => item.unit)).toEqual(['a']);
    expect(plan.failed[0]?.reason).toMatch(/偏好资源名冲突：shared 由套件 a 与 b/);
  });

  it('★ 两个套件认领同一个引用 kind → 先挂的那个胜出，后来那个废掉', () => {
    const plan = mountUnits(
      [
        face(manifest('a', { inject: [] }), { context: ['issue'] }),
        face(manifest('b', { inject: [] }), { context: ['issue'] }),
      ],
      { ctx: ctxWith([]), manifests: () => [] },
    );

    expect([...plan.contextRenderers.keys()]).toEqual(['issue']);
    expect(plan.failed[0]?.reason).toMatch(/对话引用的 kind 冲突：issue 由套件 a 与 b/);
  });

  it('认领关系按 kind 建表：各归各家，与挂载顺序无关', () => {
    const plan = mountUnits(
      [
        face(manifest('a', { inject: [] }), { context: ['issue'] }),
        face(manifest('b', { inject: [] }), { context: ['commit'] }),
      ],
      { ctx: ctxWith([]), manifests: () => [] },
    );

    expect([...plan.contextRenderers.keys()].sort()).toEqual(['commit', 'issue']);
  });

  it('★ 两个套件都提供机器供给 → 先挂的那个胜出，后来那个废掉（两套"命令怎么拼"不许都在）', () => {
    const plan = mountUnits(
      [
        face(manifest('a', { inject: [] }), { provision: true }),
        face(manifest('b', { inject: [] }), { provision: true }),
      ],
      { ctx: ctxWith([]), manifests: () => [] },
    );

    expect(plan.provision).toBeDefined();
    expect(plan.failed).toEqual([
      { id: 'b', reason: '机器供给只能有一个提供者，现在是：a、b' },
    ]);
  });

  it('没人提供机器供给 → `undefined`（外壳据此**不注册**那条路由）', () => {
    const plan = mountUnits([face(manifest('a', { inject: [] }))], { ctx: ctxWith([]), manifests: () => [] });

    expect(plan.provision).toBeUndefined();
  });

  it('机器供给原样透传', () => {
    const plan = mountUnits([face(manifest('a', { inject: [] }), { provision: true })], {
      ctx: ctxWith([]),
      manifests: () => [],
    });

    expect(typeof plan.provision?.handle).toBe('function');
  });

  it('宿主已建好的能力探测**原样下发**给套件（同一进程，不必绕 HTTP 拿同一份事实）', () => {
    const probe = vi.fn(async () => undefined);
    const received: Array<UnitMountDeps['probe']> = [];
    const spy = hostOf(manifest('a', { inject: [] }), (deps) => {
      received.push(deps.probe);
      return { routes: {}, registerTools: () => [] };
    });

    mountUnits([spy], { ctx: ctxWith([]), manifests: () => [], probe });

    expect(received).toEqual([probe]);
  });

  it('外壳没有探测能力时就不给这个字段（套件按 undefined 自己降级，而不是拿到一个假的）', () => {
    const received: Array<UnitMountDeps['probe']> = [];
    const spy = hostOf(manifest('a', { inject: [] }), (deps) => {
      received.push(deps.probe);
      return { routes: {}, registerTools: () => [] };
    });

    mountUnits([spy], { ctx: ctxWith([]), manifests: () => [] });

    expect(received).toEqual([undefined]);
  });

  it('★ 外壳自己的单元集合原样交给面（豁免认的是 registerOwned 那条路，不是 id / 名字）', () => {
    const received: Array<() => readonly string[]> = [];
    const spy = hostOf(manifest('demo', { inject: [] }), (deps) => {
      received.push(deps.ownedUnits);
      return { routes: {}, registerTools: () => [] };
    });

    mountUnits([spy], { ctx: ctxWith([]), manifests: () => [], ownedUnits: () => ['panels'] });

    expect(received[0]?.()).toEqual(['panels']);
  });

  it('没给这个集合时是一份空集（不会把任何单元当成外壳自己的）', () => {
    const received: Array<() => readonly string[]> = [];
    const spy = hostOf(manifest('demo', { inject: [] }), (deps) => {
      received.push(deps.ownedUnits);
      return { routes: {}, registerTools: () => [] };
    });

    mountUnits([spy], { ctx: ctxWith([]), manifests: () => [] });

    expect(received[0]?.()).toEqual([]);
  });
});

describe('mountUnits：长任务（外壳自动挂那条投影 + 变了就推）', () => {
  const runDeps = {
    run: () => new Promise<never>(() => {}),
    view: (snapshot: { id: string; workspace: string; target: string; status: string }) => ({
      id: snapshot.id,
      workspace: snapshot.workspace,
      env: snapshot.target,
      status: snapshot.status,
    }),
  };

  function longTaskFace(unit: string): { host: HostUnit; start: () => void } {
    const box: { start?: () => void } = {};
    const spy = hostOf(manifest(unit, { inject: [] }), (deps) => {
        const runs = deps.longTasks?.create({ key: 'release', ...runDeps });
        if (runs !== undefined) {
          box.start = () => {
            runs.start({ workspace: '/w/a', target: 'innestest' });
            runs.start({ workspace: '/w/a', target: 'test' });
            runs.start({ workspace: '/w/other', target: 'test' });
          };
        }
      return { routes: {}, registerTools: () => [], ...(runs === undefined ? {} : { longTasks: runs }) };
    });
    return { host: spy, start: () => box.start?.() };
  }

  it('★ 交回长任务表 → 外壳按 `<单元>/runs` 自动挂那条投影（只给这个工作区在跑的）', () => {
    const { host: spy, start } = longTaskFace('demo');
    const plan = mountUnits([spy], {
      ctx: ctxWith([]),
      manifests: () => [],
      longTasks: { scope: `test-${String(Date.now())}-${Math.random()}`, bump: () => {} },
    });

    start();
    const routes = plan.routes as Record<string, (search: URLSearchParams) => unknown>;

    expect(Object.keys(plan.routes)).toEqual(['demo/runs']);
    expect(routes['demo/runs']?.(new URLSearchParams('path=/w/a'))).toEqual({
      ok: true,
      runs: [
        expect.objectContaining({ env: 'test' }),
        expect.objectContaining({ env: 'innestest' }),
      ],
    });
    expect(routes['demo/runs']?.(new URLSearchParams(''))).toEqual({ ok: true, runs: [] });
  });

  it('★ 一个目标至多一条：同一个环境起两趟也只给最新那条（界面按环境一行）', () => {
    const box: { start?: () => void } = {};
    let n = 0;
    const spy = hostOf(manifest('demo', { inject: [] }), (deps) => {
      {
        const runs = deps.longTasks?.create({ key: 'release', ...runDeps, nextId: () => `run-${(n += 1)}` });
        if (runs !== undefined) {
          box.start = () => {
            runs.start({ workspace: '/w/a', target: 'test' });
            runs.start({ workspace: '/w/a', target: 'test' });
            runs.start({ workspace: '/w/a', target: 'innestest' });
          };
        }
        return { routes: {}, registerTools: () => [], ...(runs === undefined ? {} : { longTasks: runs }) };
      }
    });
    const plan = mountUnits([spy], {
      ctx: ctxWith([]),
      manifests: () => [],
      longTasks: { scope: `test-${String(Date.now())}-${Math.random()}`, bump: () => {} },
    });
    box.start?.();
    const routes = plan.routes as Record<string, (search: URLSearchParams) => unknown>;

    const body = routes['demo/runs']?.(new URLSearchParams('path=/w/a')) as { runs: { id: string; env: string }[] };
    expect(body.runs.map((row) => row.id)).toEqual(['run-2', 'run-1']);
    expect(body.runs.map((row) => row.env)).toEqual(['innestest', 'test']);
  });

  it('没交长任务表 → 不挂那条投影（套件按"没接编排"降级）', () => {
    const plan = mountUnits([face(manifest('demo', { inject: [] }))], { ctx: ctxWith([]), manifests: () => [] });

    expect(Object.keys(plan.routes)).toEqual([]);
  });

  it('★ 长任务一变就点名这个单元那条事实；卸载之后不再点名（不然热重载会推好几遍）', () => {
    const bumps: string[][] = [];
    const { host: spy, start } = longTaskFace('demo');
    const plan = mountUnits([spy], {
      ctx: ctxWith([]),
      manifests: () => [],
      longTasks: { scope: `test-${String(Date.now())}-${Math.random()}`, bump: (facts) => bumps.push([...facts]) },
    });

    start();
    expect(bumps).toEqual([['demo/runs'], ['demo/runs'], ['demo/runs']]);

    plan.disposeLongTasks();
    plan.disposeLongTasks();
    start();
    expect(bumps).toHaveLength(3);
  });
});

describe('★ 注册期抛了：已经注册进去的那些要撤回（不留"套件判失败、工具还挂着"的半状态）', () => {
  function journalRegistry() {
    const live = new Set<string>();
    const registry = {
      register: (definition: DshToolDefinition) => {
        live.add(definition.name);
        return () => void live.delete(definition.name);
      },
    } as unknown as DshToolRegistry;
    return { live, registry };
  }

  it('★ registerTools 抛在中途 ⇒ rollbackTools() 把注册过的全撤掉（调用点在 app/host.ts 注册期那个 catch）', () => {
    const { live, registry } = journalRegistry();
    const ctx = { get: (name: string) => (name === 'tools' ? registry : {}) } as never;
    const unit = hostOf(manifest('a', { inject: [] }), (deps) => ({
      routes: { a: () => ({ ok: true }) },
      registerTools: () => {
        const tools = deps.ctx.get<DshToolRegistry>('tools');
        tools?.register({ name: 'a_one' } as DshToolDefinition);
        tools?.register({ name: 'a_two' } as DshToolDefinition);
        throw new Error('OUTPUT is not defined');
      },
    }));

    const plan = mountUnits([unit], { ctx, manifests: () => [] });
    const slot = plan.mounted[0];

    expect(slot).toBeDefined();
    expect(() => slot?.result.registerTools()).toThrow('OUTPUT is not defined');
    expect([...live].sort()).toEqual(['a_one', 'a_two']);
    slot?.rollbackTools();
    expect([...live]).toEqual([]);
    slot?.rollbackTools();
    expect([...live]).toEqual([]);
  });

  it('注册全绿的那条路：撤回是给失败路径的，工具照留在注册表里', () => {
    const { live, registry } = journalRegistry();
    const ctx = { get: (name: string) => (name === 'tools' ? registry : {}) } as never;
    const unit = hostOf(manifest('a', { inject: [] }), (deps) => ({
      routes: { a: () => ({ ok: true }) },
      registerTools: () => {
        const tools = deps.ctx.get<DshToolRegistry>('tools');
        tools?.register({ name: 'a_one' } as DshToolDefinition);
        return [];
      },
    }));

    const plan = mountUnits([unit], { ctx, manifests: () => [] });
    plan.mounted[0]?.result.registerTools();

    expect([...live]).toEqual(['a_one']);
  });
});
