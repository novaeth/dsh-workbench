import { describe, expect, it } from 'vitest';
import type { Translate } from '@dsh-workbench/shared';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import { installVerdictOf } from '../use-discover';

const t = ((key: string, params?: Record<string, string>) =>
  params === undefined ? key : `${key}|${JSON.stringify(params)}`) as Translate;

function change(overrides: Partial<BundleChange> = {}): BundleChange {
  return { application: 'applied', stage: 'install', changed: true, target: '@a/b@1.0.0', ...overrides };
}

function payload(overrides: Partial<BundleChange> = {}): unknown {
  return { ok: true, action: 'install-version', change: change(overrides), module: { kind: 'unknown', pkg: '@a/b' } };
}

describe('发现页的安装结果分档', () => {
  it('applied / restart-required / overridden 才算装好', () => {
    expect(installVerdictOf(payload(), t)).toEqual({ kind: 'done' });
    expect(installVerdictOf(payload({ application: 'restart-required' }), t)).toEqual({ kind: 'done' });
    expect(installVerdictOf(payload({ application: 'overridden' }), t)).toEqual({ kind: 'done' });
  });

  it('failed 按 change 的原因给人话，不许当成功', () => {
    const verdict = installVerdictOf(payload({ application: 'failed', errorCode: 'not-found' }), t);
    expect(verdict.kind).toBe('failed');
    if (verdict.kind !== 'failed') return;
    expect(verdict.text).toContain('panels.discover.failed');
    expect(verdict.text).toContain('panels.market.add.failureNotFound');
  });

  it('cancelled 安静，没有 change 的载荷也不乱报', () => {
    expect(installVerdictOf(payload({ application: 'cancelled' }), t)).toEqual({ kind: 'quiet' });
    expect(installVerdictOf({ ok: true }, t)).toEqual({ kind: 'quiet' });
  });
});
