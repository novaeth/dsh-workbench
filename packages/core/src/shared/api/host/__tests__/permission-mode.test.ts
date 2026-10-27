import { describe, expect, it, vi } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared';
import { fullPermissionOf } from '../permission-mode';

const session = { id: 's-1' };
const agent = { session };

function contextOf(services: Record<string, unknown>): DshHostContext {
  return { get: (name: string) => services[name] } as unknown as DshHostContext;
}

function approvalOf(policy: string | undefined): Record<string, unknown> {
  return { effectivePolicy: () => policy };
}

function sandboxOf(mode: string | undefined): Record<string, unknown> {
  return { resolve: () => ({ mode }) };
}

describe('fullPermissionOf：完全权限 = 审批 never + 文件边界 danger-full-access', () => {
  it('★ 两件都成立 ⇒ true', () => {
    expect(
      fullPermissionOf(
        contextOf({ approval: approvalOf('never'), sandboxPolicy: sandboxOf('danger-full-access') }),
        agent,
      ),
    ).toBe(true);
  });

  it('审批还是 ask（工作区内修改 / 自动审查）⇒ false', () => {
    expect(
      fullPermissionOf(
        contextOf({ approval: approvalOf('ask'), sandboxPolicy: sandboxOf('danger-full-access') }),
        agent,
      ),
    ).toBe(false);
  });

  it('★ 审批 never 但文件边界不是完全访问 ⇒ 仍当不是（只关提示不等于完全权限）', () => {
    for (const mode of ['read-only', 'workspace-write', undefined]) {
      expect(
        fullPermissionOf(contextOf({ approval: approvalOf('never'), sandboxPolicy: sandboxOf(mode) }), agent),
      ).toBe(false);
    }
  });

  it('★ 服务缺席 / 方法缺席 ⇒ 当不是（不偷偷放行）', () => {
    expect(fullPermissionOf(contextOf({ sandboxPolicy: sandboxOf('danger-full-access') }), agent)).toBe(false);
    expect(fullPermissionOf(contextOf({ approval: approvalOf('never') }), agent)).toBe(false);
    expect(fullPermissionOf(contextOf({ approval: {}, sandboxPolicy: sandboxOf('danger-full-access') }), agent)).toBe(
      false,
    );
    expect(fullPermissionOf(contextOf({ approval: approvalOf('never'), sandboxPolicy: {} }), agent)).toBe(false);
  });

  it('★ 读策略时抛了 ⇒ 当不是', () => {
    const approval = {
      effectivePolicy: () => {
        throw new Error('会话还没打开');
      },
    };
    const sandbox = {
      resolve: () => {
        throw new Error('工作区没绑定');
      },
    };

    expect(
      fullPermissionOf(contextOf({ approval, sandboxPolicy: sandboxOf('danger-full-access') }), agent),
    ).toBe(false);
    expect(fullPermissionOf(contextOf({ approval: approvalOf('never'), sandboxPolicy: sandbox }), agent)).toBe(false);
  });

  it('没有 agent / 没有 session ⇒ 当不是', () => {
    const ctx = contextOf({ approval: approvalOf('never'), sandboxPolicy: sandboxOf('danger-full-access') });

    expect(fullPermissionOf(ctx, undefined)).toBe(false);
    expect(fullPermissionOf(ctx, {})).toBe(false);
    expect(fullPermissionOf(ctx, { session: null })).toBe(false);
  });

  it('★ 每次都现读：用户中途切到完全权限，下一次调用就生效', () => {
    let policy: string | undefined = 'ask';
    const ctx = contextOf({
      approval: { effectivePolicy: () => policy },
      sandboxPolicy: sandboxOf('danger-full-access'),
    });

    expect(fullPermissionOf(ctx, agent)).toBe(false);
    policy = 'never';
    expect(fullPermissionOf(ctx, agent)).toBe(true);
  });

  it('★ 按服务名取：approval 与 sandboxPolicy，不猜别的口子', () => {
    const get = vi.fn((name: string) =>
      name === 'approval'
        ? approvalOf('never')
        : name === 'sandboxPolicy'
          ? sandboxOf('danger-full-access')
          : undefined,
    );
    const ctx = { get } as unknown as DshHostContext;

    expect(fullPermissionOf(ctx, agent)).toBe(true);
    expect(get.mock.calls.map(([name]) => name)).toEqual(['approval', 'sandboxPolicy']);
  });
});
