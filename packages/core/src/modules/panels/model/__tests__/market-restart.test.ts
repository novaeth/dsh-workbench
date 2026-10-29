import { describe, expect, it } from 'vitest';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import { restartLogLine } from '../market-restart';

const change = (over: Partial<BundleChange> = {}): BundleChange => ({
  application: 'applied',
  stage: 'install',
  changed: true,
  target: '@dsh-workbench/module-hello@0.1.3',
  ...over,
});

describe('要重启那一下留的日志', () => {
  it('★ 要重启才写日志，并把 dsh 给的理由写进去（下次"为什么这次要重启"直接查日志）', () => {
    const line = restartLogLine(
      change({ application: 'restart-required', restartReason: 'package-moved' }),
    );
    expect(line).toContain('@dsh-workbench/module-hello@0.1.3');
    expect(line).toContain('package-moved');
  });

  it('dsh 没给理由时照写，但说清"没给"（不许编一个）', () => {
    expect(restartLogLine(change({ application: 'restart-required' }))).toContain('没给');
  });

  it('不是"要重启"的三种情形都不写：applied / failed / 没有结果', () => {
    expect(restartLogLine(change({ application: 'applied' }))).toBeUndefined();
    expect(restartLogLine(change({ application: 'failed' }))).toBeUndefined();
    expect(restartLogLine(undefined)).toBeUndefined();
    expect(restartLogLine(null)).toBeUndefined();
  });
});
