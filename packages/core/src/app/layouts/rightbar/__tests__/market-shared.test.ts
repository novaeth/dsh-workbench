import { describe, expect, it } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import { marketRows, sharedActions, sharedRows } from '../market-rows';

function unit(id: string, needs: { readonly plugin?: string; readonly lib?: string } = {}): UnitManifest {
  return {
    id,
    card: { titleKey: `${id}.mine`, order: 10 },
    tools: [],
    host: { inject: [] },
    env: {
      command: 'opencli',
      ...(needs.plugin === undefined ? {} : { plugins: [{ name: needs.plugin, commands: ['x'] }] }),
      ...(needs.lib === undefined
        ? {}
        : {
            libs: [
              {
                name: needs.lib,
                version: '1.0.0',
                registryEnv: 'X',
                registryDefault: 'https://r.invalid/',
                purpose: '夹具用途',
              },
            ],
          }),
    },
  };
}

function capability(
  id: string,
  extra: Partial<CapabilityMap[string]> = {},
): CapabilityMap[string] {
  return { unit: id, status: 'ok', required: [], missing: [], detail: '假探测', ...extra };
}

describe('sharedRows：聚合', () => {
  it('★ 一行 = 一份安装：两个模块声明同一份插件 → 只有一行，主文案是两个模块名', () => {
    const manifests = [unit('a', { plugin: 'demo' }), unit('b', { plugin: 'demo' })];
    const capabilities: CapabilityMap = {
      a: capability('a', { plugins: [{ name: 'demo', status: 'ok', missing: [] }] }),
      b: capability('b', { plugins: [{ name: 'demo', status: 'ok', missing: [] }] }),
    };

    const rows = sharedRows(manifests, capabilities);

    expect(rows.map((row) => row.id)).toEqual(['plugin:demo']);
    expect(rows[0]?.usedByKeys).toEqual(['a.mine', 'b.mine']);
    expect(rows[0]?.state).toBe('installed');
    expect(sharedActions(rows[0] as never)).toEqual([]);
  });

  it('插件与库各占一行，id 前缀区分（`plugin:` / `lib:`）', () => {
    const rows = sharedRows(
      [unit('a', { plugin: 'demo', lib: 'opencli-workflow' })],
      { a: capability('a') },
    );

    expect(rows.map((row) => row.id)).toEqual(['plugin:demo', 'lib:opencli-workflow']);
    expect(rows.every((row) => row.state === 'unchecked')).toBe(true);
  });

  it('没声明任何依赖的模块不进列表', () => {
    expect(sharedRows([unit('a')], {})).toEqual([]);
  });

  it('★ 放手过的模块**不算使用者**；全放手了那一行就不在', () => {
    const manifests = [unit('a', { plugin: 'demo' }), unit('b', { plugin: 'demo' })];
    const released: CapabilityMap = {
      a: capability('a', { released: true, plugins: [{ name: 'demo', status: 'ok', missing: [] }] }),
      b: capability('b', { plugins: [{ name: 'demo', status: 'ok', missing: [] }] }),
    };

    expect(sharedRows(manifests, released)[0]?.usedByKeys).toEqual(['b.mine']);

    const allReleased: CapabilityMap = {
      a: capability('a', { released: true }),
      b: capability('b', { released: true }),
    };
    expect(sharedRows(manifests, allReleased)).toEqual([]);
  });
});

describe('sharedRows：处境与动作（点一行只有一行变）', () => {
  it('★ 未装 → 只报处境、**不给按钮**；装它的入口在模块那一行（用户口径 2026-09-30）', () => {
    const manifests = [unit('a', { plugin: 'demo' })];
    const state = capability('a', {
      status: 'missing-plugin',
      install: 'ready',
      plugins: [{ name: 'demo', status: 'missing', missing: ['x'], install: 'ready' }],
    });

    const row = sharedRows(manifests, { a: state })[0];

    expect(row?.state).toBe('missing');
    expect(row?.canUpdate).toBe(false);
    expect(sharedActions(row as never)).toEqual([]);
    expect(marketRows(manifests, { a: state })[0]?.canInstall).toBe(true);
  });

  it('★ 有新版 → 「更新」（update-dependency），并给 `installed → latest`', () => {
    const manifests = [unit('a', { lib: 'opencli-workflow' })];
    const state = capability('a', {
      libs: [{ name: 'opencli-workflow', purpose: '夹具用途', status: 'outdated', installed: '1.1.22', latest: '1.1.23' }],
    });

    const row = sharedRows(manifests, { a: state })[0];

    expect(row?.state).toBe('outdated');
    expect(row?.canUpdate).toBe(true);
    expect(row?.version).toEqual({ installed: '1.1.22', latest: '1.1.23' });
    expect(sharedActions(row as never)).toEqual(['update-dependency']);
  });

  it('★ 插件行「源上有新版」→ 版本号来自 release（`opencli-plugin-inventory 1.0.19 → 1.0.20`）', () => {
    const manifests = [unit('a', { plugin: 'inventory' })];
    const state = capability('a', {
      plugins: [
        {
          name: 'inventory',
          status: 'outdated',
          missing: [],
          release: { installed: '1.0.19', latest: '1.0.20' },
        },
      ],
    });

    const row = sharedRows(manifests, { a: state })[0];

    expect(row?.state).toBe('outdated');
    expect(row?.version).toEqual({ installed: '1.0.19', latest: '1.0.20' });
    expect(sharedActions(row as never)).toEqual(['update-dependency']);
  });

  it('★ 只有一个模块说"没装"就取最差（missing 赢过别的模块说的 ok）', () => {    const manifests = [unit('a', { plugin: 'demo' }), unit('b', { plugin: 'demo' })];
    const caps: CapabilityMap = {
      a: capability('a', { plugins: [{ name: 'demo', status: 'ok', missing: [] }] }),
      b: capability('b', { plugins: [{ name: 'demo', status: 'missing', missing: [] }] }),
    };

    expect(sharedRows(manifests, caps)[0]?.state).toBe('missing');
  });

  it('缺命令也算旧（但**没有**版本信号就不给版本号）', () => {
    const manifests = [unit('a', { plugin: 'demo' })];
    const state = capability('a', {
      plugins: [{ name: 'demo', status: 'outdated', missing: ['x'] }],
    });

    const row = sharedRows(manifests, { a: state })[0];

    expect(row?.state).toBe('outdated');
    expect(row?.version).toBeUndefined();
    expect(sharedActions(row as never)).toEqual(['update-dependency']);
  });

  it('还没探到（capabilities === null）→ 检测中，不给任何动作', () => {
    const row = sharedRows([unit('a', { plugin: 'demo' })], null)[0];

    expect(row?.state).toBe('checking');
    expect(sharedActions(row as never)).toEqual([]);
  });
});

describe('sharedRows：包名不进主文案', () => {
  it('★ 包名只出现在 `detail`（详情区），行上没有 `name` / `command` 字段；原始命令不进界面', () => {
    const row = sharedRows(
      [unit('a', { lib: 'opencli-workflow' })],
      {
        a: capability('a', {
          libs: [
            {
              name: 'opencli-workflow',
              purpose: '发布编排',
              status: 'outdated',
              installed: '1.1.22',
              latest: '1.1.23',
              command: 'npm i --prefix ... opencli-workflow@1.1.23',
            },
          ],
        }),
      },
    )[0];

    expect(row?.usedByKeys).toEqual(['a.mine']);
    expect(JSON.stringify(row?.usedByKeys)).not.toContain('opencli-workflow');
    expect(row?.detail).toContain('opencli-workflow');
    expect(row?.detail).not.toContain('npm i');
    expect(Object.keys(row ?? {})).not.toContain('name');
    expect(Object.keys(row ?? {})).not.toContain('command');
  });
});

describe('sharedRows：没有额外信息就不给提示', () => {
  it('★ 只有标签（没用途、没命令）→ `detail` 不给：悬停蹦出一句和行上一模一样的话就是噪音', () => {
    const rows = sharedRows(
      [unit('a', { plugin: 'demo' })],
      { a: capability('a', { plugins: [{ name: 'demo', status: 'ok', missing: [] }] }) },
    );

    expect(rows[0]?.label).toBe('demo');
    expect(rows[0]?.detail).toBeUndefined();
  });
});
