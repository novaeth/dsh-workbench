import { describe, expect, it, vi } from 'vitest';
import type { DshAssemblyContext, DshHostContext } from '@dsh-workbench/shared/host';
import { DIY_PRESET_ID } from '@/shared/api/diy';
import { DIY_FLOW_SECTION, DIY_FLOW_TEXT, registerDiyFlowPrompt } from '../diy-flow-prompt';

interface Section {
  readonly name: string;
  readonly order: number;
  readonly text: (context: DshAssemblyContext) => string;
}

function hostWith(register: ((section: Section) => () => void) | undefined, info = vi.fn()) {
  const ctx = {
    get: (key: string) => (key === 'systemPrompt' && register !== undefined ? { section: register } : undefined),
    logger: { info, warn: vi.fn() },
  } as unknown as DshHostContext;
  return { ctx, info };
}

const contextOf = (preset: string | undefined, session = 's-1'): DshAssemblyContext =>
  ({
    agent: { session: { id: session, header: preset === undefined ? {} : { agentPreset: preset } } },
  }) as unknown as DshAssemblyContext;

describe('DIY 流程入口：写进系统提示词', () => {
  it('★ DIY 会话拿到开流程与推进的两把工具名', () => {
    const seen: Section[] = [];
    const { ctx } = hostWith((section) => {
      seen.push(section);
      return () => {};
    });

    registerDiyFlowPrompt(ctx, () => false);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.name).toBe(DIY_FLOW_SECTION);
    expect(seen[0]?.order).toBe(701);
    const text = seen[0]?.text(contextOf(DIY_PRESET_ID)) ?? '';
    expect(text).toBe(DIY_FLOW_TEXT);
    expect(text).toContain('workbench_diy_plan');
    expect(text).toContain('workbench_diy_step');
  });

  it('★ 常驻这段有上限（预算 720 字），不回到「第一次不审批」', () => {
    expect(DIY_FLOW_TEXT.length).toBeLessThanOrEqual(720);
    expect(DIY_FLOW_TEXT).not.toContain('第一次不审批');
    expect(DIY_FLOW_TEXT).toContain('「补充方案」');
    expect(DIY_FLOW_TEXT).toContain('Write/edit stay closed');
    expect(DIY_FLOW_TEXT).toContain('diy-probe');
    expect(DIY_FLOW_TEXT).toContain('if a tool is closed');
  });

  it('★ 非 DIY 会话与 flow 子 agent 都不给', () => {
    const seen: Section[] = [];
    const { ctx } = hostWith((section) => {
      seen.push(section);
      return () => {};
    });

    registerDiyFlowPrompt(ctx, (id) => id === 'child-1');

    expect(seen[0]?.text(contextOf(undefined))).toBe('');
    expect(seen[0]?.text(contextOf('standard'))).toBe('');
    expect(seen[0]?.text(contextOf(DIY_PRESET_ID, 'child-1'))).toBe('');
    expect(seen[0]?.text(contextOf(DIY_PRESET_ID, 's-2'))).toBe(DIY_FLOW_TEXT);
  });

  it('没有 systemPrompt 服务：只记日志，不抛', () => {
    const info = vi.fn();
    const { ctx } = hostWith(undefined, info);

    expect(() => registerDiyFlowPrompt(ctx, () => false)).not.toThrow();
    expect(info).toHaveBeenCalled();
  });

  it('注册抛错：记日志并返回可调用的 disposer', () => {
    const warn = vi.fn();
    const ctx = {
      get: () => ({
        section: () => {
          throw new Error('dup');
        },
      }),
      logger: { info: vi.fn(), warn },
    } as unknown as DshHostContext;

    const disposer = registerDiyFlowPrompt(ctx, () => false);

    expect(warn).toHaveBeenCalled();
    expect(() => disposer()).not.toThrow();
  });
});
