import { describe, expect, it, vi } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared';
import type { ApprovalPolicy, ToolUnit, UnitMountResult } from '@dsh-workbench/shared/host';
import { createApprovalGate, type ApprovalGateDecision } from '../approval-gate';

const asking: ApprovalPolicy = () => ({
  kind: 'ask',
  reason: 'writes for real',
  question: { en: 'it really does it. Allow?', zh: '会真的做这件事。允许吗？' },
  fallback: { en: 'The agent wants to do it. Allow?', zh: 'agent 想真的做这件事。允许吗？' },
});

const writerTool: ToolUnit = { unit: 'unit-a', writes: true };
const readerTool: ToolUnit = { unit: 'unit-a', writes: false };

function contextOf(approval: 'ask' | 'never', sandbox: string): DshHostContext {
  return {
    get: (name: string) =>
      name === 'approval'
        ? { effectivePolicy: () => approval }
        : name === 'sandboxPolicy'
          ? { resolve: () => ({ mode: sandbox }) }
          : undefined,
  } as unknown as DshHostContext;
}

function faceOf(overrides: Partial<UnitMountResult> = {}): UnitMountResult {
  return {
    routes: {},
    registerTools: () => [],
    needsApproval: asking,
    ...overrides,
  } as unknown as UnitMountResult;
}

function allow(): ApprovalGateDecision {
  return { kind: 'allow' };
}

function gateOf(options: {
  ctx?: DshHostContext;
  tool?: ToolUnit | undefined;
  face?: UnitMountResult | undefined;
  notes?: ReadonlySet<string>;
}): ReturnType<typeof createApprovalGate> {
  return createApprovalGate({
    ctx: options.ctx ?? contextOf('ask', 'workspace-write'),
    toolOf: () => options.tool,
    faceOf: () => options.face,
    declaredNotes: () => options.notes ?? new Set<string>(),
  });
}

describe('createApprovalGate：先让后面那道闸判，再轮到外壳的写审批', () => {
  it('后面那道闸不是 allow ⇒ 原样退回，套件策略一次都不问', async () => {
    const policy = vi.fn(asking);
    const gate = gateOf({ tool: writerTool, face: faceOf({ needsApproval: policy }) });
    const deny: ApprovalGateDecision = { kind: 'deny', reason: 'dsh 自己拒了' };

    await expect(gate({ name: 'workbench_write' }, () => Promise.resolve(deny))).resolves.toBe(deny);
    expect(policy).not.toHaveBeenCalled();
  });

  it('★ 套件说要问 ⇒ ask，并带上它给的明细', async () => {
    const detail = vi.fn(() => ({ en: 'Release V1 → test', zh: '要发布 V1 → test' }));
    const gate = gateOf({
      tool: writerTool,
      face: faceOf({ approvalDetail: detail }),
    });
    const decision = await gate({ name: 'workbench_write', arguments: { go: true } }, () => Promise.resolve(allow()));

    expect(decision.kind).toBe('ask');
    expect(detail).toHaveBeenCalledTimes(1);
    expect(decision.kind === 'ask' ? decision.displayReason?.zh : '').toContain('要发布 V1 → test');
  });

  it('★ 完全权限（never + danger-full-access）⇒ 不再 ask，但仍问套件要“这次会发生什么”', async () => {
    const detail = vi.fn(() => ({ en: 'Release V1 → test', zh: '要发布 V1 → test' }));
    const gate = gateOf({
      ctx: contextOf('never', 'danger-full-access'),
      tool: writerTool,
      face: faceOf({ approvalDetail: detail }),
    });

    await expect(
      gate(
        { name: 'workbench_write', agent: { session: { id: 'session-1' } } },
        () => Promise.resolve(allow()),
      ),
    ).resolves.toEqual({ kind: 'allow' });
    expect(detail).toHaveBeenCalledTimes(1);
  });

  it('★ 只关审批、文件边界不是完全访问 ⇒ 仍问（不被当成完全权限）', async () => {
    const gate = gateOf({ ctx: contextOf('never', 'workspace-write'), tool: writerTool, face: faceOf() });
    const decision = await gate(
      { name: 'workbench_write', agent: { session: { id: 'session-1' } } },
      () => Promise.resolve(allow()),
    );

    expect(decision.kind).toBe('ask');
  });

  it('★ 套件没认领这次写 ⇒ 拒（完全权限也不让写静默过去）', async () => {
    const gate = gateOf({ ctx: contextOf('never', 'danger-full-access'), tool: writerTool, face: undefined });

    expect((await gate({ name: 'workbench_write' }, () => Promise.resolve(allow()))).kind).toBe('deny');
  });

  it('读工具 / 不在清单里的工具 ⇒ 直接 allow，策略不问', async () => {
    const policy = vi.fn(asking);
    const gate = gateOf({ tool: readerTool, face: faceOf({ needsApproval: policy }) });

    await expect(gate({ name: 'workbench_read' }, () => Promise.resolve(allow()))).resolves.toEqual({ kind: 'allow' });
    await expect(gate({ name: 'bash' }, () => Promise.resolve(allow()))).resolves.toEqual({ kind: 'allow' });
    expect(policy).not.toHaveBeenCalled();
  });

  it('没有工具名 ⇒ 直接 allow（不按名字猜）', async () => {
    const gate = gateOf({ tool: writerTool, face: faceOf() });

    await expect(gate({ arguments: {} }, () => Promise.resolve(allow()))).resolves.toEqual({ kind: 'allow' });
  });

  it('声明了附注那一格 ⇒ agent 那句话进 ask 文案', async () => {
    const gate = gateOf({ tool: writerTool, face: faceOf(), notes: new Set(['workbench_write']) });
    const decision = await gate(
      { name: 'workbench_write', arguments: { approval_note: '想把预发那条构建发出去' } },
      () => Promise.resolve(allow()),
    );

    expect(decision.kind === 'ask' ? decision.displayReason?.zh : '').toContain('想把预发那条构建发出去');
  });
});
