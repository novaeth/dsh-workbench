import { describe, expect, it } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import { extensionNeedOf, libNeedOf, needStateOf } from '@dsh-workbench/shared/testing';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import { marketRows, sharedActions, sharedRows } from '../market-rows';

const WORKFLOW = libNeedOf('opencli-workflow', { purpose: '发布编排' });

function unit(id: string, plugin?: string): UnitManifest {
  return {
    id,
    titleKey: `${id}.mine`, card: { order: 10 },
    tools: [],
    host: { inject: [] },
    needs: [
      ...(plugin === undefined ? [] : [extensionNeedOf(plugin, { commands: ['x'] })]),
      WORKFLOW,
    ],
  };
}

describe('marketRows：交叉依赖（env.libs）', () => {
  it('★ 单元自有库有新版 → need outdated：模块行与共用依赖行都亮，更新归共用依赖', () => {
    const withLib: CapabilityMap = {
      inventory: {
        unit: 'inventory',
        status: 'outdated',
        needs: [needStateOf(WORKFLOW, 'outdated', { installed: '1.1.22', latest: '1.1.23' })],
        detail: '假探测',
      },
    };
    const manifests = [
      {
        ...unit('inventory', 'inventory'),
        needs: [
          libNeedOf('opencli-workflow', {
            sources: [{ kind: 'npm', registryEnv: 'X', registryDefault: 'https://r.invalid/' }],
          }),
        ],
      },
    ];

    const row = marketRows(manifests, withLib)[0];
    expect(row?.state).toBe('outdated');
    expect(row?.canUpdate).toBe(true);
    expect(row?.canInstall).toBe(false);

    const shared = sharedRows(manifests, withLib);
    const libRow = shared.find((item) => item.id === 'lib:opencli-workflow');
    expect(libRow?.state).toBe('outdated');
    expect(libRow?.version).toEqual({ installed: '1.1.22', latest: '1.1.23' });
    expect(sharedActions(libRow as never)).toEqual(['update-dependency']);
  });

  it('★ 单元自有库没装 → 依赖没装：**模块行**给「安装」（共用依赖行没有安装按钮）', () => {
    const missingLib: CapabilityMap = {
      inventory: {
        unit: 'inventory',
        status: 'missing',
        needs: [needStateOf(WORKFLOW, 'missing', { provision: 'ready' })],
        detail: '假探测',
      },
    };

    const row = marketRows([unit('inventory', 'inventory')], missingLib)[0];

    expect(row?.state).toBe('missing');
    expect(row?.canInstall).toBe(true);
  });

  it('★ 库在、但装的不是声明要的那一支 → 也算"没装好"：模块行「未装」+「安装」；共用依赖行「版本不对」+「更新」', () => {
    const mismatch: CapabilityMap = {
      inventory: {
        unit: 'inventory',
        status: 'missing',
        needs: [needStateOf(WORKFLOW, 'unsatisfied', { provision: 'ready', installed: '1.1.19' })],
        detail: 'opencli-workflow（装的是 1.1.19，声明要 ^1.1.20）',
      },
    };
    const manifests = [
      {
        ...unit('inventory', 'inventory'),
        env: {
          command: 'opencli',
          plugins: [{ name: 'inventory', commands: ['x'] }],
          libs: [
            {
              name: 'opencli-workflow',
              version: '^1.1.20',
              registryEnv: 'X',
              registryDefault: 'https://r.invalid/',
              purpose: '发布编排',
            },
          ],
        },
      },
    ];

    const row = marketRows(manifests, mismatch)[0];
    expect(row?.state).toBe('missing');
    expect(row?.canInstall).toBe(true);

    const libRow = sharedRows(manifests, mismatch).find((item) => item.id === 'lib:opencli-workflow');
    expect(libRow?.state).toBe('unsatisfied');
    expect(libRow?.canUpdate).toBe(true);
    expect(sharedActions(libRow as never)).toEqual(['update-dependency']);
    expect(libRow?.version).toEqual({ installed: '1.1.19' });
  });
});
