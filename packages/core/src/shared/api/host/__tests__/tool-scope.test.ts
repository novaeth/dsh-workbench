import { describe, expect, it, vi } from 'vitest';
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

function agentWith(tools: ScopedToolRegistry | undefined, cwd?: string, preset?: string, id?: string) {
  return {
    ctx: tools === undefined ? {} : { tools },
    ...(cwd === undefined
      ? {}
      : {
          session: {
            ...(id === undefined ? {} : { id }),
            header: { cwd, ...(preset === undefined ? {} : { agentPreset: preset }) },
          },
        }),
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

    const agent = agentWith(registry, '/w/a');
    scope.apply(agent);

    expect(seen).toEqual([{ workspace: '/w/a', preset: 'workbench-diy', session: null, scope: agent }]);
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

    const withPreset = agentWith(registry, '/w/a', 'workbench-diy');
    const bare = agentWith(registry);
    scope.apply(withPreset);
    scope.apply(bare);

    expect(seen[0]).toEqual({ workspace: '/w/a', preset: 'workbench-diy', session: null, scope: withPreset });
    expect(seen[1]).toEqual({ workspace: null, preset: null, session: null, scope: bare });
  });

  it('★ 会话 id 也进 context：工具包状态按会话分，签名里也有它', () => {
    const { registry, calls } = fakeTools();
    const seen: ToolScopeContext[] = [];
    const scope = createToolScope({
      deniedTools: (context) => {
        seen.push(context);
        return ['workbench_demo_issues'];
      },
    });

    scope.apply(agentWith(registry, '/w/a', undefined, 's-1'));
    scope.apply(agentWith(registry, '/w/a', undefined, 's-2'));

    expect(seen.map((context) => context.session)).toEqual(['s-1', 's-2']);
    expect(calls).toHaveLength(2);
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
    expect(String(warn.mock.calls[0]?.[0])).toContain('无法获取 agent 作用域的工具面');
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
    expect(String(warn.mock.calls[0]?.[0])).toContain('限制工具面失败');
  });
});
