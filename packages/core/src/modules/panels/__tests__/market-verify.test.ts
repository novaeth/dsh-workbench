import { describe, expect, it } from 'vitest';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import type { UnitCapability } from '@dsh-workbench/shared/host';
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
  needs: [],
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
  it('★ 能力里还有 outdated / unsatisfied 的 need 才算落后（别的失败不在这里下结论）', () => {
    expect(
      supplyUpdateStillBehind(
        capability({
          status: 'outdated',
          needs: [{ id: 'extension:x', kind: 'extension', name: 'x', status: 'outdated', detail: '缺必需：x' }],
        }),
      ),
    ).toContain('缺必需：x');
    expect(supplyUpdateStillBehind(capability({ needs: [] }))).toBeUndefined();
  });

  it('★ 插件 / 库各自看自己的状态', () => {
    const pluginTarget = { kind: 'extension', name: 'demo', declarers: [{ id: 'a' }] } as unknown as DependencyTarget;
    const libTarget = { kind: 'lib', name: 'libx', declarers: [{ id: 'a' }] } as unknown as DependencyTarget;

    expect(
      dependencyStillBehind(
        pluginTarget,
        new Map([['a', capability({ needs: [{ id: 'extension:demo', kind: 'extension', name: 'demo', status: 'outdated', detail: '' }] })]]),
      ),
    ).toContain('demo');
    expect(
      dependencyStillBehind(
        pluginTarget,
        new Map([['a', capability({ needs: [{ id: 'extension:demo', kind: 'extension', name: 'demo', status: 'ok', detail: '' }] })]]),
      ),
    ).toBeUndefined();
    expect(
      dependencyStillBehind(
        libTarget,
        new Map([['a', capability({ needs: [{ id: 'lib:libx', kind: 'lib', name: 'libx', status: 'unsatisfied', detail: '' }] })]]),
      ),
    ).toContain('libx');
  });
});
