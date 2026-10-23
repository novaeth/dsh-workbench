import { describe, expect, it } from 'vitest';
import type { BundleChange } from '@/shared/api/bundle-install';
import type { UnitCapability } from '@/shared/api/host/probe-units';
import type { DependencyTarget } from '../model/market-dependency';
import {
  dependencyStillBehind,
  supplyUpdateStillBehind,
  verifyBundleUpdate,
} from '../model/market-verify';

const change = (over: Partial<BundleChange> = {}): BundleChange => ({
  application: 'applied',
  stage: 'install',
  changed: true,
  target: 'x',
  ...over,
});

const capability = (over: Partial<UnitCapability> = {}): UnitCapability => ({
  unit: 'hello',
  status: 'ok',
  required: [],
  missing: [],
  detail: '',
  ...over,
});

describe('更新跑完要拿盘上的真实结果对账', () => {
  it('★ 盘上还是点下去那一版 → no-change（不认 applied 这个字）', () => {
    const result = verifyBundleUpdate({
      change: change(),
      before: '0.1.0',
      after: { kind: 'module', pkg: '@a/m', unit: 'm', version: '0.1.0' },
    });

    expect(result.change.application).toBe('failed');
    expect(result.change.errorCode).toBe('no-change');
    expect(result.change.errorDetail).toContain('0.1.0');
  });

  it('★ 版本动了 → 照实带 applied + 盘上那一版', () => {
    const result = verifyBundleUpdate({
      change: change(),
      before: '0.1.0',
      after: { kind: 'module', pkg: '@a/m', unit: 'm', version: '0.1.1' },
    });

    expect(result.change.application).toBe('applied');
    expect(result.change.version).toBe('0.1.1');
  });

  it('★ 盘上读不到模块 → module-gone；回滚成功就一起带上', () => {
    const gone = verifyBundleUpdate({
      change: change(),
      before: '0.1.0',
      after: { kind: 'unknown', pkg: '@a/m' },
    });
    const back = verifyBundleUpdate({
      change: change(),
      before: '0.1.0',
      after: { kind: 'module', pkg: '@a/m', unit: 'm', version: '0.1.0' },
      restored: '0.1.0',
    });

    expect(gone.change.errorCode).toBe('module-gone');
    expect(gone.change.errorDetail).toContain('读不到');
    expect(back.change.errorCode).toBe('module-gone');
    expect(back.restored).toBe('0.1.0');
  });

  it('管理器本来就说失败 → 不改成 no-change（原样保留失败原因）', () => {
    const result = verifyBundleUpdate({
      change: change({ application: 'failed', errorCode: 'network' }),
      before: '0.1.0',
      after: { kind: 'module', pkg: '@a/m', unit: 'm', version: '0.1.0' },
    });

    expect(result.change.application).toBe('failed');
    expect(result.change.errorCode).toBe('network');
  });
});

describe('命令 / 共用依赖跑完还落后 → 给一句人话', () => {
  it('★ 能力格还是 fix=update 才算落后（别的失败不在这里下结论）', () => {
    expect(supplyUpdateStillBehind(capability({ fix: 'update', detail: '缺必需：x' }))).toContain('缺必需：x');
    expect(supplyUpdateStillBehind(capability({ fix: undefined }))).toBeUndefined();
  });

  it('★ 插件 / 库各自看自己的状态', () => {
    const pluginTarget = { kind: 'plugin', name: 'demo', declarers: [{ id: 'a' }] } as unknown as DependencyTarget;
    const libTarget = { kind: 'lib', name: 'libx', declarers: [{ id: 'a' }] } as unknown as DependencyTarget;

    expect(
      dependencyStillBehind(
        pluginTarget,
        new Map([['a', capability({ plugins: [{ name: 'demo', status: 'outdated', missing: [] }] })]]),
      ),
    ).toContain('demo');
    expect(
      dependencyStillBehind(
        pluginTarget,
        new Map([['a', capability({ plugins: [{ name: 'demo', status: 'ok', missing: [] }] })]]),
      ),
    ).toBeUndefined();
    expect(
      dependencyStillBehind(
        libTarget,
        new Map([['a', capability({ libs: [{ name: 'libx', purpose: '', status: 'unsatisfied' }] })]]),
      ),
    ).toContain('libx');
  });
});
