import { describe, expect, it } from 'vitest';
import type { PluginSource, UnitManifest } from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import { marketRows, sharedActions, sharedRows } from '../market-rows';

function unit(id: string, plugin?: string, source?: PluginSource): UnitManifest {
  return {
    id,
    card: { titleKey: `${id}.mine`, order: 10 },
    tools: [],
    host: { inject: [] },
    ...(plugin === undefined
      ? {}
      : {
          env: {
            command: 'opencli',
            plugins: [
              { name: plugin, commands: ['x'], ...(source === undefined ? {} : { installSource: source }) },
            ],
          },
        }),
  };
}

describe('marketRows：交叉依赖（env.libs）', () => {
  it('★ 单元自有库有新版 → **模块行不变黄**，「更新」归共用依赖行（2026-09-30）', () => {
    const withLib: CapabilityMap = {
      inventory: {
        unit: 'inventory',
        status: 'ok',
        required: [],
        missing: [],
        detail: '假探测',
        libs: [
          {
            name: 'opencli-workflow',
            purpose: '发布编排',
            status: 'outdated',
            installed: '1.1.22',
            latest: '1.1.23',
          },
        ],
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
              version: '1.1.22',
              registryEnv: 'X',
              registryDefault: 'https://r.invalid/',
              purpose: '发布编排',
            },
          ],
        },
      },
    ];

    const row = marketRows(manifests, withLib)[0];
    expect(row?.state).toBe('installed');
    expect(row?.canUpdate).toBe(false);
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
        status: 'missing-plugin',
        required: [],
        missing: [],
        detail: '假探测',
        install: 'ready',
        libs: [{ name: 'opencli-workflow', purpose: '发布编排', status: 'missing' }],
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
        status: 'missing-plugin',
        required: [],
        missing: [],
        detail: 'opencli-workflow（装的是 1.1.19，声明要 ^1.1.20）',
        install: 'ready',
        libs: [{ name: 'opencli-workflow', purpose: '发布编排', status: 'unsatisfied', installed: '1.1.19' }],
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
