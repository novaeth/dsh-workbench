import { describe, expect, it } from 'vitest';
import type { UnitCapability } from '@/shared/api/host/probe-units';
import type { UnitManifest } from '@dsh-workbench/shared';
import { dependencyStillBehind } from '../model/market-verify';
import { updateDependencyRow } from '../model/market-dependency-update';
import { findDependency } from '../model/market-dependency';

const unit: UnitManifest = {
  id: 'a',
  card: { titleKey: 'a.mine', order: 10 },
  tools: [],
  host: { inject: [] },
  env: { command: 'opencli', plugins: [{ name: 'demo', commands: ['x'] }] },
};

const state = (status: 'ok' | 'outdated'): UnitCapability => ({
  unit: 'a',
  status: status === 'outdated' ? 'missing-commands' : 'ok',
  required: ['x'],
  missing: status === 'outdated' ? ['x'] : [],
  detail: status === 'outdated' ? '缺必需：x' : '',
  fix: status === 'outdated' ? 'update' : undefined,
  plugins: [{ name: 'demo', status, missing: status === 'outdated' ? ['x'] : [] }],
});

describe('共用依赖那一跳：跑完要强探，仍落后就抛', () => {
  it('★ 命令跑完、探测也追上了 → 回清单', async () => {
    const target = findDependency([unit], 'plugin:demo');
    if (target === undefined) throw new Error('找不到目标');
    let ran = false;

    const shared = await updateDependencyRow(target, {
      command: 'opencli',
      capabilityOf: async () => state(ran ? 'ok' : 'outdated'),
      runAll: async (commands) => {
        expect(commands.map((one) => one.line)).toEqual(["'opencli' plugin update 'demo'"]);
        ran = true;
      },
      snapshot: async () => [],
    });

    expect(ran).toBe(true);
    expect(shared).toEqual([]);
  });

  it('★ 跑完还是旧的样子 → 抛出原因（不许静默）', async () => {
    const target = findDependency([unit], 'plugin:demo');
    if (target === undefined) throw new Error('找不到目标');

    await expect(
      updateDependencyRow(target, {
        command: 'opencli',
        capabilityOf: async () => state('outdated'),
        runAll: async () => undefined,
        snapshot: async () => [],
      }),
    ).rejects.toThrow(/还差一步/);
  });

  it('★ 这一行没有可执行的更新命令、但还落后 → 也说清', async () => {
    const target = {
      id: 'plugin:demo',
      kind: 'plugin' as const,
      name: 'demo',
      declarers: [{ ...unit, env: { command: 'opencli', plugins: [] } }],
      users: [],
    };

    await expect(
      updateDependencyRow(target, {
        command: 'opencli',
        capabilityOf: async () => state('outdated'),
        runAll: async () => undefined,
        snapshot: async () => [],
      }),
    ).rejects.toThrow(/没有可执行的更新命令/);
  });

  it('纯判据：都追上了就是 undefined', () => {
    const target = findDependency([unit], 'plugin:demo');
    if (target === undefined) throw new Error('找不到目标');
    expect(dependencyStillBehind(target, new Map([['a', state('ok')]]))).toBeUndefined();
  });
});
