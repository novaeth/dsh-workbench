import { describe, expect, it, vi } from 'vitest';
import type { DshPromptAssembly } from '@dsh-workbench/shared';
import type { ToolScopeContext } from '@dsh-workbench/shared/host';
import { createToolScope, type ScopedToolRegistry } from '../tool-scope';

function fakeTools() {
  const calls: Array<{ allow?: readonly string[]; deny?: readonly string[] }> = [];
  let disposed = 0;
  const registry = {
    restrict(filter: { allow?: readonly string[]; deny?: readonly string[] }) {
      calls.push(filter);
      return () => {
        disposed += 1;
      };
    },
  } as ScopedToolRegistry;
  return { registry, calls, disposed: () => disposed };
}

function agentWith(tools: ScopedToolRegistry | undefined, cwd?: string, preset?: string) {
  return {
    ctx: tools === undefined ? {} : { tools },
    ...(cwd === undefined
      ? {}
      : { session: { header: { cwd, ...(preset === undefined ? {} : { agentPreset: preset }) } } }),
  };
}

describe('tool-scope', () => {
  it('认不出的载荷一律跳过（不抛）', () => {
    const { calls, registry } = fakeTools();
    const scope = createToolScope({ deniedTools: () => ['a'] });
    for (const value of [undefined, null, 'x', 42, {}, { ctx: {} }, agentWith(registry)]) {
      expect(() => scope.apply(value)).not.toThrow();
    }
    expect(calls).toHaveLength(1);
  });

  it('把 deniedTools 的结果设成限制，工作区取自会话 cwd', () => {
    const { registry, calls } = fakeTools();
    const seen: Array<string | null> = [];
    const scope = createToolScope({
      deniedTools: (context) => {
        seen.push(context.workspace);
        return ['workbench_demo_issues'];
      },
    });

    scope.apply(agentWith(registry, '/w/a'));

    expect(seen).toEqual(['/w/a']);
    expect(calls).toEqual([{ deny: ['workbench_demo_issues'] }]);
  });

  it('★ preset 进 context：投影读得到就用它（新会话屏是先建会话、再 select）', () => {
    const { registry } = fakeTools();
    const seen: ToolScopeContext[] = [];
    const scope = createToolScope({
      deniedTools: (context) => {
        seen.push(context);
        return [];
      },
      presetOf: () => 'workbench-diy',
    });

    scope.apply(agentWith(registry, '/w/a'));

    expect(seen).toEqual([{ workspace: '/w/a', preset: 'workbench-diy' }]);
  });

  it('presetOf 读不到就退回会话 header 里的创建事实', () => {
    const { registry } = fakeTools();
    const seen: ToolScopeContext[] = [];
    const scope = createToolScope({
      deniedTools: (context) => {
        seen.push(context);
        return [];
      },
    });

    scope.apply(agentWith(registry, '/w/a', 'workbench-diy'));
    scope.apply(agentWith(registry));

    expect(seen[0]).toEqual({ workspace: '/w/a', preset: 'workbench-diy' });
    expect(seen[1]).toEqual({ workspace: null, preset: null });
  });

  it('★★ preset 选上了：reapply 之后整条限制撤掉（那 34 把放出来）', () => {
    const { registry, calls, disposed } = fakeTools();
    let preset: string | null = null;
    const scope = createToolScope({
      deniedTools: (context) => (context.preset === 'workbench-diy' ? [] : ['workbench_diy_list']),
      presetOf: () => preset,
    });
    const agent = agentWith(registry, '/w/a');

    scope.apply(agent);
    expect(calls).toEqual([{ deny: ['workbench_diy_list'] }]);

    preset = 'workbench-diy';
    scope.reapply();

    expect(disposed()).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it('读不到 cwd 时按 null 问（不是空串、也不是猜一个路径）', () => {
    const { registry, calls } = fakeTools();
    const seen: Array<string | null> = [];
    const scope = createToolScope({
      deniedTools: (context) => {
        seen.push(context.workspace);
        return ['t'];
      },
    });

    scope.apply(agentWith(registry, ''));
    scope.apply(agentWith(registry));

    expect(seen).toEqual([null, null]);
    expect(calls).toHaveLength(2);
  });

  it('幂等：同一个 agent 集合没变就不再设一次', () => {
    const { registry, calls } = fakeTools();
    const scope = createToolScope({ deniedTools: () => ['a', 'b'] });

    const agent = agentWith(registry, '/w/a');
    scope.apply(agent);
    scope.apply(agent);
    scope.apply(agent);

    expect(calls).toHaveLength(1);
  });

  it('集合变了：先解除旧的，再设新的', () => {
    const { registry, calls, disposed } = fakeTools();
    let deny = ['a'];
    const scope = createToolScope({ deniedTools: () => deny });
    const agent = agentWith(registry, '/w/a');

    scope.apply(agent);
    deny = ['a', 'b'];
    scope.apply(agent);

    expect(calls).toEqual([{ deny: ['a'] }, { deny: ['a', 'b'] }]);
    expect(disposed()).toBe(1);
  });

  it('工作区变了也算集合变了（同一个人换了项目）', () => {
    const { registry, calls, disposed } = fakeTools();
    const scope = createToolScope({ deniedTools: () => ['a'] });
    const agent = agentWith(registry, '/w/a');

    scope.apply(agent);
    agent.session = { header: { cwd: '/w/b' } };
    scope.apply(agent);

    expect(calls).toHaveLength(2);
    expect(disposed()).toBe(1);
  });

  it('没有要收的（deny 为空）就不设限制，并把旧的解除掉', () => {
    const { registry, calls, disposed } = fakeTools();
    let deny: string[] = ['a'];
    const scope = createToolScope({ deniedTools: () => deny });
    const agent = agentWith(registry, '/w/a');

    scope.apply(agent);
    deny = [];
    scope.apply(agent);

    expect(calls).toEqual([{ deny: ['a'] }]);
    expect(disposed()).toBe(1);
  });

  it('只有 get 形式（没有属性形式）也能拿到工具面', () => {
    const { registry, calls } = fakeTools();
    const scope = createToolScope({ deniedTools: () => ['a'] });
    scope.apply({ ctx: { get: (name: string) => (name === 'tools' ? registry : undefined) } });
    expect(calls).toHaveLength(1);
  });

  it('工具面拿不到 → fail open（不设限制、不抛），但**要出声**', () => {
    const warn = vi.fn();
    const scope = createToolScope({ deniedTools: () => ['a'], logger: { warn } });

    expect(() => scope.apply({ ctx: {} })).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('拿不到 agent 作用域的工具面');
  });

  it('★ reapply：配置变了就**立刻**重算（不用等下一次 apply）', () => {
    const { registry, calls, disposed } = fakeTools();
    let deny = ['a', 'b'];
    const scope = createToolScope({ deniedTools: () => deny });
    const agent = agentWith(registry, '/w/a');

    scope.apply(agent);
    expect(calls).toHaveLength(1);

    deny = [];
    scope.reapply();

    expect(disposed()).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it('reapply：销毁过的 agent 不再拖累集合（弱引用被清掉）', () => {
    const { registry, calls } = fakeTools();
    const scope = createToolScope({ deniedTools: () => ['a'] });

    scope.apply(agentWith(registry, '/w/a'));
    scope.apply(agentWith(registry, '/w/b'));
    expect(calls).toHaveLength(2);

    scope.reapply();
    expect(calls).toHaveLength(2);
  });

  it('★ disposeAll：把设过的限制全撤掉（插件热换时用）', () => {
    const { registry, calls, disposed } = fakeTools();
    const scope = createToolScope({ deniedTools: () => ['a'] });
    scope.apply(agentWith(registry, '/w/a'));
    scope.apply(agentWith(registry, '/w/b'));
    expect(calls).toHaveLength(2);

    scope.disposeAll();

    expect(disposed()).toBe(2);
    scope.reapply();
    expect(calls).toHaveLength(2);
  });

  it('设好之后留一条 info（能看到"收起了哪些工具"）', () => {
    const info = vi.fn();
    const { registry } = fakeTools();
    const scope = createToolScope({ deniedTools: () => ['a', 'b'], logger: { info } });

    scope.apply(agentWith(registry, '/w/a'));

    expect(String(info.mock.calls[0]?.[0])).toContain('/w/a');
    expect(String(info.mock.calls[0]?.[0])).toContain('a, b');
  });

  it('restrict 抛错只告警，不冒泡（一次失败的收窄不该毁掉这一步）', () => {
    const warn = vi.fn();
    const boom: ScopedToolRegistry = {
      restrict() {
        throw new Error('scope 已关闭');
      },
    };
    const scope = createToolScope({ deniedTools: () => ['a'], logger: { warn } });

    expect(() => scope.apply(agentWith(boom, '/w/a'))).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('收窄工具面失败');
  });
});

describe('tool-scope · 装配期过滤', () => {
  const assembly = {
    tools: [{ name: 'workbench_panels' }, { name: 'workbench_demo_issues' }],
  };

  it('★ 限制被撤掉之后（插件热换），下一次装配仍然按配置过滤', () => {
    const { registry } = fakeTools();
    const scope = createToolScope({ deniedTools: () => ['workbench_demo_issues'] });
    const agent = agentWith(registry, '/w/a');

    scope.apply(agent);
    scope.disposeAll();

    expect(scope.narrow(assembly, agent)).toEqual({ tools: [{ name: 'workbench_panels' }] });
  });

  it('★★ 装配期也看 preset：DIY 会话里那 34 把留在清单里', () => {
    const scope = createToolScope({
      deniedTools: (context) => (context.preset === 'workbench-diy' ? [] : ['workbench_demo_issues']),
    });

    expect(scope.narrow(assembly, agentWith(undefined, '/w/a', 'workbench-diy'))).toBe(assembly);
    expect(scope.narrow(assembly, agentWith(undefined, '$DSH_HOME/workbench/diy'))).toEqual({
      tools: [{ name: 'workbench_panels' }],
    });
  });

  it('读不到 cwd 时按 null 问（与设限制那份同一口径）', () => {
    const seen: Array<string | null> = [];
    const scope = createToolScope({
      deniedTools: (context) => {
        seen.push(context.workspace);
        return [];
      },
    });

    scope.narrow(assembly, {});

    expect(seen).toEqual([null]);
  });

  it('没有要收的：原样返回同一个对象', () => {
    const scope = createToolScope({ deniedTools: () => [] });

    expect(scope.narrow(assembly, agentWith(fakeTools().registry, '/w/a'))).toBe(assembly);
  });

  it('要收的名字这次没出现：原样返回同一个对象', () => {
    const scope = createToolScope({ deniedTools: () => ['workbench_inventory_binding'] });

    expect(scope.narrow(assembly, {})).toBe(assembly);
  });

  it('配置变了下一次装配立刻是新集（不缓存）', () => {
    let deny = ['workbench_panels'];
    const scope = createToolScope({ deniedTools: () => deny });

    expect(scope.narrow(assembly, {})).toEqual({ tools: [{ name: 'workbench_demo_issues' }] });

    deny = [];
    expect(scope.narrow(assembly, {})).toBe(assembly);
  });

  it('载荷没有 tools（或根本不是对象）时原样返回，不抛', () => {
    const scope = createToolScope({ deniedTools: () => ['workbench_panels'] });
    const empty = {};
    const missing = { tools: undefined };

    expect(scope.narrow(empty, {})).toBe(empty);
    expect(scope.narrow(missing, {})).toBe(missing);
    expect(() => scope.narrow(undefined as unknown as DshPromptAssembly, {})).not.toThrow();
  });
});
