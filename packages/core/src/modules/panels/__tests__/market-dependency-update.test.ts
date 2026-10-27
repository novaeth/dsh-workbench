import { describe, expect, it } from 'vitest';
import type { UnitCapability } from '@dsh-workbench/shared/host';
import type { UnitManifest } from '@dsh-workbench/shared';
import { dependencyStillBehind } from '../model/market-verify';
import { updateDependencyRow } from '../model/market-dependency-update';
import { findDependency } from '../model/market-dependency';

const unit: UnitManifest = {
  id: 'a',
  titleKey: 'a.mine', card: { order: 10 },
  tools: [],
  host: { inject: [] },
  needs: [{ kind: 'extension', runtime: 'opencli', name: 'demo', commands: ['x'], purpose: '测试' }],
};

const state = (status: 'ok' | 'outdated'): UnitCapability => ({
  unit: 'a',
  status,
  needs: [
    {
      id: 'extension:demo',
      kind: 'extension',
      name: 'demo',
      status,
      detail: status === 'outdated' ? '缺必需：x' : '',
      ...(status === 'outdated'
        ? { missing: ['x'], command: "'opencli' plugin update 'demo'" }
        : {}),
    },
  ],
});

describe('共用依赖那一跳：跑完要强探，仍落后就抛', () => {
  it('★ 命令跑完、探测也追上了 → 回清单', async () => {
    const target = findDependency([unit], 'extension:demo');
    if (target === undefined) throw new Error('找不到目标');
    let ran = false;

    const shared = await updateDependencyRow(target, {
  
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
    const target = findDependency([unit], 'extension:demo');
    if (target === undefined) throw new Error('找不到目标');

    await expect(
      updateDependencyRow(target, {
        capabilityOf: async () => state('outdated'),
        runAll: async () => undefined,
        snapshot: async () => [],
      }),
    ).rejects.toThrow(/还差一步/);
  });

  it('★ 这一行没有可执行的更新命令、但还落后 → 也说清', async () => {
    const target = {
      id: 'extension:demo',
      kind: 'extension' as const,
      name: 'demo',
      declarers: [{ ...unit, needs: [] }],
      users: [],
    };

    await expect(
      updateDependencyRow(target, {
        capabilityOf: async () => {
          const base = state('outdated');
          return { ...base, needs: base.needs.map(({ command: _command, ...rest }) => rest) };
        },
        runAll: async () => undefined,
        snapshot: async () => [],
      }),
    ).rejects.toThrow(/没有可执行的更新命令/);
  });

  it('★ 同一个包两份来源 → 直接说清，不跑任何更新命令', async () => {
    let ran = false;

    await expect(
      updateDependencyRow(
        {
          id: 'extension:demo',
          kind: 'extension',
          name: 'demo',
          declarers: [unit],
          users: [unit],
          conflict: '插件包 opencli-plugin-demo 被 a、b 声明成了不同的来源',
        },
        {
          capabilityOf: async () => state('outdated'),
          runAll: async () => {
            ran = true;
          },
          snapshot: async () => [],
        },
      ),
    ).rejects.toThrow(/两份来源/);

    expect(ran).toBe(false);
  });

  it('纯判据：都追上了就是 undefined', () => {
    const target = findDependency([unit], 'extension:demo');
    if (target === undefined) throw new Error('找不到目标');
    expect(dependencyStillBehind(target, new Map([['a', state('ok')]]))).toBeUndefined();
  });
});
