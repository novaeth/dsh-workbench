import { describe, expect, it } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared';
import { MCP_TOOLS_SERVICE, TOOLBOX_SERVICE } from '@dsh-workbench/shared/host';
import type { WorkbenchSettings } from '@/kernel/contract/workbench-settings';
import { createMcpScope } from '../pack-scope';
import type { WorkbenchSettingsStore } from '../workbench-settings';

function settingsOf(onDemand: boolean): WorkbenchSettingsStore & { set(next: boolean): void } {
  let current: WorkbenchSettings = { mcpOnDemand: onDemand };
  const listeners = new Set<(settings: WorkbenchSettings) => void>();
  return {
    read: () => current,
    apply: () => ({ ok: true, settings: current }),
    watch(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      current = { mcpOnDemand: next };
      for (const listener of [...listeners]) listener(current);
    },
  };
}

function fakeCtx(open: ReadonlySet<string>) {
  const provided: string[] = [];
  const ctx = {
    get: (key: string) => (key === TOOLBOX_SERVICE ? { packsOf: () => open } : undefined),
    provide: (name: string) => {
      provided.push(name);
      return () => {};
    },
    effect: (run: () => () => void) => {
      run();
    },
    logger: { info: () => {}, warn: () => {} },
  } as unknown as DshHostContext;
  return { ctx, provided };
}

const assembly = (...names: string[]) => ({ tools: names.map((name) => ({ name })) });
const context = { workspace: '/w/a', preset: null, session: 's-1' };

describe('MCP 包的收窄接在装配期与注册期', () => {
  it('★ 默认关：不登记读口里的 server，也不 deny 任何 MCP 工具', () => {
    const { ctx, provided } = fakeCtx(new Set());
    const settings = settingsOf(false);
    const scope = createMcpScope({ ctx, reapply: () => {}, settings });

    expect(provided).toEqual([MCP_TOOLS_SERVICE]);
    expect(scope.extraDenied(assembly('mcp__chrome__a'), context)).toEqual([]);
    expect(scope.denied(context)).toEqual([]);
  });

  it('★ 打开开关后才走按需：登记 server、deny 没开的包；开关一变就 reapply', () => {
    const { ctx } = fakeCtx(new Set());
    const settings = settingsOf(true);
    let reapplied = 0;
    const scope = createMcpScope({ ctx, reapply: () => (reapplied += 1), settings });

    expect(scope.extraDenied(assembly('mcp__chrome__a'), context)).toEqual(['mcp__chrome__a']);
    expect(reapplied).toBe(1);
    expect(scope.denied(context)).toEqual(['mcp__chrome__a']);

    settings.set(false);
    expect(reapplied).toBe(2);
    expect(scope.denied(context)).toEqual([]);
  });

  it('包开着就一个都不 deny；拿不到工具包状态时当作全开', () => {
    const openCtx = fakeCtx(new Set(['mcp:chrome'])).ctx;
    const scope = createMcpScope({ ctx: openCtx, reapply: () => {}, settings: settingsOf(true) });
    expect(scope.extraDenied(assembly('mcp__chrome__a'), context)).toEqual([]);

    const none = {
      get: () => undefined,
      provide: () => () => {},
      effect: (run: () => () => void) => run(),
      logger: { info: () => {}, warn: () => {} },
    } as unknown as DshHostContext;
    const loose = createMcpScope({ ctx: none, reapply: () => {}, settings: settingsOf(true) });
    expect(loose.extraDenied(assembly('mcp__chrome__a'), context)).toEqual([]);
  });
});
