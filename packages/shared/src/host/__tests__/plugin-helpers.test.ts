import { describe, expect, it, vi } from 'vitest';

import { defineUnitHostPlugin, type UnitHostContextLike } from '../unit-plugin.js';
import { recordOf, textOf } from '../payload.js';
import { writeApprovalOf } from '../tool-approval.js';
import type { UnitModuleFace } from '../unit-face.js';

const face: UnitModuleFace = {
  unit: 'demo',
  mount: () => ({ routes: {}, registerTools: () => [] }),
};

describe('recordOf / textOf', () => {
  it('非对象回空对象；字符串 trim；别的算空串', () => {
    expect(recordOf(null)).toEqual({});
    expect(recordOf('x')).toEqual({});
    expect(recordOf({ a: 1 })).toEqual({ a: 1 });
    expect(textOf('  hi  ')).toBe('hi');
    expect(textOf(3)).toBe('');
    expect(textOf(undefined)).toBe('');
  });
});

describe('writeApprovalOf', () => {
  const approval = writeApprovalOf({
    tools: ['demo_write'],
    reason: '会写一条',
    question: { zh: '写吗？', en: 'Write?' },
    fallback: { zh: '只写模块自己的文件', en: 'Writes the module’s own file' },
    detail: { zh: '写 1 条', en: 'Write 1' },
  });

  it('点名的写工具：ask + 明细', () => {
    expect(approval.needsApproval({ name: 'demo_write' })).toMatchObject({ kind: 'ask' });
    expect(approval.approvalDetail({ name: 'demo_write' })).toEqual({ zh: '写 1 条', en: 'Write 1' });
  });

  it('别的工具：read、没有明细', () => {
    expect(approval.needsApproval({ name: 'demo_read' })).toEqual({ kind: 'read' });
    expect(approval.needsApproval({})).toEqual({ kind: 'read' });
    expect(approval.approvalDetail({ name: 'demo_read' })).toBeUndefined();
  });
});

describe('defineUnitHostPlugin', () => {
  it('导出 name / inject；apply 把面注册进 workbenchUnits 并交回清理函数', () => {
    const plugin = defineUnitHostPlugin({ name: '@demo/module', unit: 'demo', face });
    expect(plugin.name).toBe('@demo/module');
    expect(plugin.inject).toEqual(['workbenchUnits']);
    const dispose = vi.fn();
    const register = vi.fn(() => dispose);
    const effect = vi.fn((run: () => void | (() => void)) => {
      run();
      return () => {};
    });
    plugin.apply({ get: () => ({ register }), effect } as unknown as UnitHostContextLike);
    expect(register).toHaveBeenCalledWith(face);
    expect(effect).toHaveBeenCalledWith(expect.any(Function), '@demo/module: 注册 demo');
  });

  it('外壳没给服务：warn 一声，不抛', () => {
    const plugin = defineUnitHostPlugin({ name: '@demo/module', unit: 'demo', face });
    const warn = vi.fn();
    const ctx = { get: () => undefined, effect: () => () => {}, logger: { warn } } as unknown as UnitHostContextLike;
    expect(() => plugin.apply(ctx)).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('workbenchUnits'));
  });
});
