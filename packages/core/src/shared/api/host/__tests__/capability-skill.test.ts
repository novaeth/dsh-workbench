import { describe, expect, it, vi } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared';
import { TOOLBOX_SERVICE } from '@dsh-workbench/shared/host';
import { registerCapabilitySkill } from '../capability-skill';

const brief = { name: 'workbench-capabilities', description: '能开的包：manage', content: '先 list 再 open' };

function ctxOf(options: { brief?: typeof brief | undefined; registry?: unknown; warn?: (m: string) => void } = {}) {
  return {
    get: (name: string) =>
      name === TOOLBOX_SERVICE
        ? {
            packsOf: () => new Set<string>(),
            ...(options.brief === undefined ? {} : { capabilityBrief: () => options.brief }),
          }
        : undefined,
    logger: { info: () => {}, warn: options.warn ?? (() => {}) },
  } as unknown as DshHostContext;
}

function agentOf(skills: unknown, cwd = '/w') {
  return { ctx: { get: (name: string) => (name === 'skills' ? skills : undefined) }, session: { header: { cwd } } };
}

describe('能力索引：注册到 agent 作用域的 skill 服务', () => {
  it('★ 把活索引交给 skills.register（agent 作用域的那一份）', () => {
    const register = vi.fn(() => () => {});
    const ctx = ctxOf({ brief });

    registerCapabilitySkill(ctx, agentOf({ register }));

    expect(register).toHaveBeenCalledWith(brief);
  });

  it('这个 dsh 没有 skills 服务 ⇒ 只记一句，不抛', () => {
    const ctx = ctxOf({ brief });

    expect(() => registerCapabilitySkill(ctx, agentOf(undefined))).not.toThrow();
  });

  it('拿不到工具箱的活索引（老外壳）⇒ 什么都不注册，也不抛', () => {
    const register = vi.fn(() => () => {});
    const ctx = ctxOf({});

    expect(() => registerCapabilitySkill(ctx, agentOf({ register }))).not.toThrow();
    expect(register).not.toHaveBeenCalled();
  });

  it('skills.register 抛错 ⇒ 只记警告，不影响这次会话', () => {
    const warn = vi.fn();
    const register = vi.fn(() => {
      throw new Error('kebab-case 不合格');
    });

    expect(() => registerCapabilitySkill(ctxOf({ brief, warn }), agentOf({ register }))).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('同一个 agent 只注册一次（重复注册会被 dsh 判重并告警）', () => {
    const register = vi.fn(() => () => {});
    const agent = agentOf({ register });

    registerCapabilitySkill(ctxOf({ brief }), agent);
    registerCapabilitySkill(ctxOf({ brief }), agent);

    expect(register).toHaveBeenCalledTimes(1);
  });

  it('拿不到 agent 对象 ⇒ 直接放过（旧 dsh / 非对象载荷）', () => {
    const register = vi.fn(() => () => {});
    const ctx = ctxOf({ brief });

    expect(() => registerCapabilitySkill(ctx, undefined)).not.toThrow();
    expect(() => registerCapabilitySkill(ctx, 'nope')).not.toThrow();
    expect(register).not.toHaveBeenCalled();
  });
});
