import { describe, expect, it, vi } from 'vitest';
import type { UnitMountResult } from '@dsh-workbench/shared/host';
import { createClosedReasonOf } from '../closed-tool-gate';

const agent = { session: { id: 's-1', header: { cwd: '/w' } } };

function gateOf(reason: ((name: string) => string | undefined) | undefined): UnitMountResult['gate'] {
  return {
    deniedTools: () => [],
    ...(reason === undefined ? {} : { denyReason: (name: string) => reason(name) }),
    subscribe: () => () => {},
  };
}

function reasonOf(gates: readonly (UnitMountResult['gate'] | undefined)[]) {
  return createClosedReasonOf({ ctx: { get: () => undefined, logger: {} } as never, gates: () => gates });
}

describe('收起的工具：外壳从挂载面取拒绝理由', () => {
  it('★ 取第一个给出理由的闸', () => {
    const reason = reasonOf([gateOf(() => undefined), gateOf((name) => (name === 'a' ? '收在包里' : undefined))]);

    expect(reason('a', agent)).toBe('收在包里');
    expect(reason('b', agent)).toBeUndefined();
  });

  it('没有闸 / 闸不给理由 ⇒ 一个字都不插（退回 dsh 的 unknown tool）', () => {
    expect(reasonOf([])('a', agent)).toBeUndefined();
    expect(reasonOf([undefined, gateOf(undefined)])('a', agent)).toBeUndefined();
  });

  it('拿不到 agent 对象 ⇒ 不问闸（旧 dsh / 非对象载荷）', () => {
    const denyReason = vi.fn(() => '收在包里');
    const reason = reasonOf([gateOf(denyReason)]);

    expect(reason('a', undefined)).toBeUndefined();
    expect(reason('a', 'nope')).toBeUndefined();
    expect(denyReason).not.toHaveBeenCalled();
  });
});
