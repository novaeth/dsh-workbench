import { describe, expect, it } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared';
import { MCP_TOOLS_SERVICE, TOOLBOX_SERVICE } from '@dsh-workbench/shared/host';
import type { McpToolsPort } from '@dsh-workbench/shared/host';
import type { WorkbenchSettings } from '@/kernel/contract/workbench-settings';
import { createMcpScope } from '../pack-scope';
import type { WorkbenchSettingsStore } from '../workbench-settings';

function settingsOf(onDemand: boolean): WorkbenchSettingsStore & { set(next: boolean): void } {
  let current: WorkbenchSettings = { mcpOnDemand: onDemand, includePrerelease: false };
  const listeners = new Set<(settings: WorkbenchSettings) => void>();
  return {
    read: () => current,
    apply: () => ({ ok: true, settings: current }),
    watch(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      current = { mcpOnDemand: next, includePrerelease: false };
      for (const listener of [...listeners]) listener(current);
    },
  };
}

function fakeCtx(open: ReadonlySet<string>, names: readonly string[] = []) {
  const provided: Record<string, unknown> = {};
  const ctx = {
    get: (key: string) => {
      if (key === TOOLBOX_SERVICE) return { packsOf: () => open };
      if (key === 'tools') {
        return { view: (scope?: unknown) => ({ knownNames: new Set(scope === undefined ? [] : names) }) };
      }
      return undefined;
    },
    provide: (name: string, value: unknown) => {
      provided[name] = value;
      return () => {};
    },
    effect: (run: () => () => void) => {
      run();
    },
    logger: { info: () => {}, warn: () => {} },
  } as unknown as DshHostContext;
  return { ctx, provided };
}

const agent = { id: 'agent-1' };
const context = { workspace: '/w/a', preset: null, session: 's-1', scope: agent };
const names = ['mcp__chrome__list_pages', 'mcp__chrome__navigate_page', 'workbench_panels_list'];

describe('MCP 包的收窄接在注册期（dsh 0.2.2 的 assembly 里还没有 tools）', () => {
  it('★ 默认关：不登记 server、不 deny 任何 MCP 工具，读口里也没有 MCP 包', () => {
    const { ctx, provided } = fakeCtx(new Set(), names);
    const scope = createMcpScope({ ctx, reapply: () => {}, settings: settingsOf(false) });
    const port = provided[MCP_TOOLS_SERVICE] as McpToolsPort;

    expect(scope.extraDenied({} as never, context)).toEqual([]);
    expect(scope.denied(context)).toEqual([]);
    expect(port.servers()).toEqual([]);
  });

  it('★ 打开开关后：从注册的工具名认出 server，包没开就 deny；读口里能看到 mcp:chrome', () => {
    const { ctx, provided } = fakeCtx(new Set(), names);
    const scope = createMcpScope({ ctx, reapply: () => {}, settings: settingsOf(true) });

    expect(scope.denied(context)).toEqual(['mcp__chrome__list_pages', 'mcp__chrome__navigate_page']);
    expect(scope.extraDenied({} as never, context)).toEqual([
      'mcp__chrome__list_pages',
      'mcp__chrome__navigate_page',
    ]);
    expect((provided[MCP_TOOLS_SERVICE] as McpToolsPort).servers()).toEqual([
      { name: 'chrome', tools: ['mcp__chrome__list_pages', 'mcp__chrome__navigate_page'] },
    ]);
  });

  it('包开着就一个都不 deny；开关一变就重算工具面', () => {
    const { ctx } = fakeCtx(new Set(['mcp:chrome']), names);
    const settings = settingsOf(true);
    let reapplied = 0;
    const scope = createMcpScope({ ctx, reapply: () => (reapplied += 1), settings });

    expect(scope.denied(context)).toEqual([]);
    settings.set(false);
    expect(reapplied).toBe(1);
    expect(scope.denied(context)).toEqual([]);
  });

  it('没有 agent scope 时退回全局视图：那里看不到 scoped 的 MCP 注册，也就不 deny', () => {
    const { ctx } = fakeCtx(new Set(), names);
    const scope = createMcpScope({ ctx, reapply: () => {}, settings: settingsOf(true) });

    expect(scope.denied({ workspace: null, preset: null, session: null })).toEqual([]);
  });

  it('拿不到工具面 / 工具包状态：当作全开，不把 MCP 收走', () => {
    const ctx = {
      get: () => undefined,
      provide: () => () => {},
      effect: (run: () => () => void) => run(),
      logger: { info: () => {}, warn: () => {} },
    } as unknown as DshHostContext;
    const scope = createMcpScope({ ctx, reapply: () => {}, settings: settingsOf(true) });

    expect(scope.denied(context)).toEqual([]);
  });
});
