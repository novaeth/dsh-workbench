import { describe, expect, it, vi } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared';
import { createPresetScope } from '../preset-scope';
import type { ScopedToolRegistry, ToolScopeAgent } from '../tool-scope';

function fakeTools() {
  const calls: Array<{ deny?: readonly string[] }> = [];
  let disposed = 0;
  const registry = {
    restrict(filter: { deny?: readonly string[] }) {
      calls.push(filter);
      return () => {
        disposed += 1;
      };
    },
  } as ScopedToolRegistry;
  return { registry, calls, disposed: () => disposed };
}

function projectionsOf(initial: string | null, throwOnState = false) {
  const listeners: Array<(session: unknown, key: string, value: unknown, seq: unknown) => void> = [];
  let value = initial;
  return {
    stateOf: () => {
      if (throwOnState) throw new Error('投影读不了');
      return value;
    },
    onChanged: (listener: (session: unknown, key: string, value: unknown, seq: unknown) => void) => {
      listeners.push(listener);
      return () => {
        const at = listeners.indexOf(listener);
        if (at >= 0) listeners.splice(at, 1);
      };
    },
    fire: (key: string) => {
      for (const listener of [...listeners]) listener(undefined, key, value, 0);
    },
    set: (next: string | null) => {
      value = next;
    },
    count: () => listeners.length,
  };
}

function ctxFor(projections: unknown) {
  const warn = vi.fn();
  const scoped = {
    get: (name: string) => (name === 'sessionProjections' ? projections : undefined),
    effect: (body: () => (() => void) | void) => {
      const off = body();
      return () => off?.();
    },
  };
  const ctx = {
    get: (name: string) => (name === 'sessionProjections' ? projections : undefined),
    inject: (_deps: readonly string[], callback: (scope: unknown) => void) => {
      callback(scoped);
      return () => {};
    },
    logger: { info: vi.fn(), warn },
  };
  return { ctx: ctx as unknown as DshHostContext, warn };
}

function agentWith(tools: ScopedToolRegistry | undefined, cwd: string, preset?: string): ToolScopeAgent {
  return {
    ctx: tools === undefined ? {} : { tools },
    session: { header: { cwd, ...(preset === undefined ? {} : { agentPreset: preset }) } },
  };
}

describe('createPresetScope', () => {
  it('preset 取自会话投影：选了 workbench-diy 就不收那 34 把', () => {
    const { registry, calls } = fakeTools();
    const projections = projectionsOf('workbench-diy');
    const { ctx } = ctxFor(projections);
    const scope = createPresetScope({
      ctx,
      deniedTools: (context) => (context.preset === 'workbench-diy' ? [] : ['workbench_diy_list']),
    });

    scope.apply(agentWith(registry, '/w/modules-repo'));

    expect(calls).toEqual([]);
  });

  it('投影读不了 ⇒ 退回会话 header 里的创建事实（不吞、只告警）', () => {
    const { registry, calls } = fakeTools();
    const projections = projectionsOf(null, true);
    const { ctx, warn } = ctxFor(projections);
    const scope = createPresetScope({
      ctx,
      deniedTools: (context) => (context.preset === 'workbench-diy' ? [] : ['workbench_diy_list']),
    });

    scope.apply(agentWith(registry, '/w/modules-repo', 'workbench-diy'));

    expect(calls).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('读 preset 投影失败');
  });

  it('★★ 模式选上了就重算：投影一变，整条限制被撤掉（不用等下一步）', () => {
    const { registry, calls, disposed } = fakeTools();
    const projections = projectionsOf(null);
    const { ctx } = ctxFor(projections);
    const scope = createPresetScope({
      ctx,
      deniedTools: (context) => (context.preset === 'workbench-diy' ? [] : ['workbench_diy_list']),
    });
    scope.apply(agentWith(registry, '/w/a'));
    expect(calls).toEqual([{ deny: ['workbench_diy_list'] }]);

    projections.set('workbench-diy');
    projections.fire('agentPreset');

    expect(disposed()).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it('别的投影键变了不动工具面', () => {
    const { registry, calls } = fakeTools();
    const projections = projectionsOf(null);
    const { ctx } = ctxFor(projections);
    const scope = createPresetScope({ ctx, deniedTools: () => ['workbench_diy_list'] });
    scope.apply(agentWith(registry, '/w/a'));

    projections.set('workbench-diy');
    projections.fire('userQuestions');

    expect(calls).toHaveLength(1);
  });

  it('拿不到投影服务就不订阅（不抛）', () => {
    const { registry, calls } = fakeTools();
    const { ctx } = ctxFor(undefined);
    const scope = createPresetScope({ ctx, deniedTools: () => ['workbench_diy_list'] });

    scope.apply(agentWith(registry, '/w/a'));

    expect(calls).toHaveLength(1);
  });
});
