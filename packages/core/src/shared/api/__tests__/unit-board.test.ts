import { describe, expect, it } from 'vitest';
import type { CapabilityPayload, ModuleBlocker } from '@dsh-workbench/shared';
import { gateOf, probeKeyOf, splitBlocker } from '../unit-board';

function capability(status: CapabilityPayload['status']): CapabilityPayload {
  const mapped = status;
  const needs =
    mapped === 'ok' || mapped === 'unchecked'
      ? []
      : [
          {
            id: 'extension:demo',
            kind: 'extension' as const,
            name: 'demo',
            status: mapped === 'outdated' ? ('outdated' as const) : ('missing' as const),
            detail: '测试用的结论',
          },
        ];
  return { unit: 'issues', status: mapped, needs, detail: '测试用的结论' };
}

function blocker(id: string, severity: ModuleBlocker['severity']): ModuleBlocker {
  return { id, severity, title: id, actions: [] };
}

describe('gateOf（能力门）', () => {
  it('★ 还没探到（null）→ 照常取数：探测只是个前置检查，不许把卡片按住', () => {
    expect(gateOf(null, 'capability')).toEqual({ gated: true });
  });

  it('ok → 取数；缺插件/缺命令 → 不取（那次平台读注定失败）', () => {
    expect(gateOf(capability('ok'), 'capability')).toEqual({ gated: true });
    expect(gateOf(capability('missing'), 'capability')).toEqual({ gated: false });
    expect(gateOf(capability('outdated'), 'capability')).toEqual({ gated: false });
  });

  it('★ 探不动（unchecked）→ **照常取数**：那是"问不到"，不是"没装"（ADR-0016）', () => {
    expect(gateOf(capability('unchecked'), 'capability')).toEqual({ gated: true });
  });

  it("mode: 'none' → 永远取数（套件自己决定不要这道门）", () => {
    expect(gateOf(capability('missing'), 'none')).toEqual({ gated: true });
    expect(gateOf(null, 'none')).toEqual({ gated: true });
  });
});

describe('splitBlocker（一条阻断 + 至多一条提示）', () => {
  it('没有候选 → 两条都没有', () => {
    expect(splitBlocker([])).toEqual({});
    expect(splitBlocker([undefined, undefined])).toEqual({});
  });

  it('★ 第一条 block 赢（一张卡上压两条阻断，用户不知道该按哪个）', () => {
    const first = blocker('一', 'block');
    const second = blocker('二', 'block');

    expect(splitBlocker([first, second])).toEqual({ blocker: first });
  });

  it('只有 notice → 就是 notice（不拦人）', () => {
    const notice = blocker('降级', 'notice');

    expect(splitBlocker([undefined, notice])).toEqual({ notice });
  });

  it('★ 有阻断时丢掉提示：那一刻提示只是噪声', () => {
    const block = blocker('缺插件', 'block');
    const notice = blocker('降级', 'notice');

    expect(splitBlocker([notice, block])).toEqual({ blocker: block });
  });
});

describe('probeKeyOf（出错搭车强探的防抖键）', () => {
  it('没有错误 → null（调用方据此不探）', () => {
    expect(probeKeyOf(undefined)).toBeNull();
  });

  it('★ 键就是错误码：码没变就不再探（否则"错误 → 强探 → 仍然错误"会转圈）', () => {
    expect(probeKeyOf({ code: 'auth-required', message: '未登录' })).toBe('auth-required');
    expect(probeKeyOf({ code: 'auth-required', message: '未登录（另一个环境）' })).toBe('auth-required');
    expect(probeKeyOf({ code: 'failed', message: '起不来' })).toBe('failed');
  });

  it('空码给一个稳定的兜底键（不许变成"每次都算新错误"）', () => {
    expect(probeKeyOf({ code: '', message: '没说什么' })).toBe('unknown');
  });
});
