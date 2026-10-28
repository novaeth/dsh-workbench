import { describe, expect, it } from 'vitest';
import type { Translate } from '@dsh-workbench/shared';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import { appliedUnitsOf, changeFailure, changeOf } from '../market-change';

const t = ((key: string) => key) as unknown as Translate;

function change(over: Partial<BundleChange> = {}): BundleChange {
  return { application: 'failed', stage: 'remove', changed: true, target: 'x', ...over };
}

describe('changeOf：从写接口回来的那一坨里认出 change', () => {
  it('拿得出来（只认带 application 的那种）', () => {
    expect(changeOf({ change: change({ application: 'applied' }) })?.application).toBe('applied');
  });

  it('没有 / 不是对象 / 缺 application → undefined（别把别的东西当结果读）', () => {
    expect(changeOf(undefined)).toBeUndefined();
    expect(changeOf(null)).toBeUndefined();
    expect(changeOf({})).toBeUndefined();
    expect(changeOf({ change: null })).toBeUndefined();
    expect(changeOf({ change: { stage: 'remove' } })).toBeUndefined();
  });
});

describe('changeFailure：没落下就说为什么（别静默当作成功）', () => {
  it('★ 落下了那三种（applied / restart-required / overridden）→ 不算失败', () => {
    for (const application of ['applied', 'restart-required', 'overridden'] as const) {
      expect(changeFailure(change({ application }), t), application).toBeUndefined();
    }
  });

  it('★ failed + 已知原因码 → 给那句人能照做的话（不是把码原样丢给用户）', () => {
    expect(changeFailure(change({ errorCode: 'bundle-in-use' }), t)).toBe('panels.market.add.failureGeneric');
    expect(
      changeFailure(change({ packageResult: { exitCode: 1, output: '', truncated: false, logPath: '', kind: 'network' } }), t),
    ).toBe('panels.market.add.failureNetwork');
  });

  it('cancelled 也算没落下', () => {
    expect(changeFailure(change({ application: 'cancelled', stage: 'install' }), t)).toBeTruthy();
  });

  it('原因码认不出 → 原样给（有字比没字强）', () => {
    expect(changeFailure(change({ errorCode: 'whatever' }), t)).toBe('whatever');
  });

  it('没有 change（比如共用依赖那条）→ 不出声', () => {
    expect(changeFailure(undefined, t)).toBeUndefined();
  });
});

describe('appliedUnitsOf：dsh 真换上了的那一单元（只有它值得等热换落地）', () => {
  it('★ applied + 模块结果 → 那个 unit', () => {
    expect(
      appliedUnitsOf({
        change: change({ application: 'applied' }),
        module: { kind: 'module', pkg: '@a/hello', unit: 'hello' },
      }),
    ).toEqual(['hello']);
  });

  it('★ 说要重启 / 失败 / 取消 → 不压后（当场按真实状态说）', () => {
    for (const application of ['restart-required', 'failed', 'cancelled', 'overridden'] as const) {
      expect(
        appliedUnitsOf({
          change: change({ application }),
          module: { kind: 'module', pkg: '@a/hello', unit: 'hello' },
        }),
        application,
      ).toEqual([]);
    }
  });

  it('插件那份 / 看不出是不是模块 / unit 空 → 不给 hold', () => {
    expect(appliedUnitsOf({ change: change({ application: 'applied' }) })).toEqual([]);
    expect(
      appliedUnitsOf({
        change: change({ application: 'applied' }),
        module: { kind: 'not-module', pkg: '@a/plugin' },
      }),
    ).toEqual([]);
    expect(
      appliedUnitsOf({
        change: change({ application: 'applied' }),
        module: { kind: 'module', pkg: '@a/hello', unit: '' },
      }),
    ).toEqual([]);
    expect(appliedUnitsOf(null)).toEqual([]);
  });
});
