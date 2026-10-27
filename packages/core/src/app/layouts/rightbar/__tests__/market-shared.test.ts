import { describe, expect, it } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import { unitTitleKey } from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import { extensionNeedOf, libNeedOf, manifestOf } from '@dsh-workbench/shared/testing';
import { marketRows, sharedActions, sharedRows } from '../market-rows';

const NPM = { kind: 'npm' as const, registryEnv: 'X', registryDefault: 'https://r.invalid/' };

function unit(id: string, needs: { readonly plugin?: string; readonly lib?: string } = {}): UnitManifest {
  return manifestOf({
    id,
    needs: [
      ...(needs.plugin === undefined
        ? []
        : [extensionNeedOf(needs.plugin, { commands: ['x'], sources: [NPM] })]),
      ...(needs.lib === undefined
        ? []
        : [libNeedOf(needs.lib, { version: '1.0.0', sources: [NPM], purpose: '夹具用途' })]),
    ],
  });
}


type FixtureNeedState = {
  readonly name: string;
  readonly status: string;
  readonly missing?: readonly string[];
  readonly installed?: string;
  readonly latest?: string;
  readonly provision?: CapabilityMap[string]['needs'][number]['provision'];
  readonly release?: { readonly installed?: string; readonly latest?: string };
  readonly command?: string;
  readonly purpose?: string;
};

type FixtureExtra = Partial<CapabilityMap[string]> & {
  readonly extensions?: readonly FixtureNeedState[];
  readonly libs?: readonly FixtureNeedState[];
  readonly provision?: CapabilityMap[string]['needs'][number]['provision'];
  readonly missing?: readonly string[];
};

function needStatusOf(status: string): CapabilityMap[string]['needs'][number]['status'] {
  if (status === 'degraded') return 'ok';
  if (status === 'unsupported' || status === 'failed') return 'unchecked';
  return status as CapabilityMap[string]['needs'][number]['status'];
}

function statesOf(extra: FixtureExtra, kind: 'extension' | 'lib'): CapabilityMap[string]['needs'] {
  const list = kind === 'extension' ? (extra.extensions ?? []) : (extra.libs ?? []);
  return list.map((state) => {
    const installed = state.installed ?? state.release?.installed;
    const latest = state.latest ?? state.release?.latest;
    const provision = state.provision ?? extra.provision;
    return {
      id: `${kind}:${state.name}`,
      kind,
      name: state.name,
      status: needStatusOf(state.status),
      detail: '假探测',
      ...(state.missing === undefined ? {} : { missing: state.missing }),
      ...(installed === undefined ? {} : { installed }),
      ...(latest === undefined ? {} : { latest }),
      ...(provision === undefined ? {} : { provision }),
      ...(state.command === undefined ? {} : { command: state.command }),
    };
  });
}

function translated(extra: FixtureExtra): Partial<CapabilityMap[string]> {
  const { extensions: _extensions, libs: _libs, provision: _provision, missing: _missing, ...rest } = extra;
  const needs = [...statesOf(extra, 'extension'), ...statesOf(extra, 'lib')];
  const withFirstMissing =
    extra.missing === undefined || needs[0] === undefined
      ? needs
      : [{ ...needs[0], missing: extra.missing }, ...needs.slice(1)];
  return {
    ...rest,
    ...(withFirstMissing.length === 0 ? {} : { needs: withFirstMissing }),
  };
}

function capability(id: string, extra: FixtureExtra = {}): CapabilityMap[string] {
  return { unit: id, status: 'ok', needs: [], ...translated(extra) };
}

describe('sharedRows：聚合', () => {
  it('★ 一行 = 一份安装：两个模块声明同一份插件 → 只有一行，主文案是两个模块名', () => {
    const manifests = [unit('a', { plugin: 'demo' }), unit('b', { plugin: 'demo' })];
    const capabilities: CapabilityMap = {
      a: capability('a', { extensions: [{ name: 'demo', status: 'ok', missing: [] }] }),
      b: capability('b', { extensions: [{ name: 'demo', status: 'ok', missing: [] }] }),
    };

    const rows = sharedRows(manifests, capabilities);

    expect(rows.map((row) => row.id)).toEqual(['extension:demo']);
    expect(rows[0]?.usedByKeys).toEqual([unitTitleKey('a'), unitTitleKey('b')]);
    expect(rows[0]?.state).toBe('installed');
    expect(sharedActions(rows[0] as never)).toEqual([]);
  });

  it('插件与库各占一行，id 前缀区分（`extension:` / `lib:`）', () => {
    const rows = sharedRows(
      [unit('a', { plugin: 'demo', lib: 'opencli-workflow' })],
      { a: capability('a') },
    );

    expect(rows.map((row) => row.id)).toEqual(['extension:demo', 'lib:opencli-workflow']);
    expect(rows.every((row) => row.state === 'unchecked')).toBe(true);
  });

  it('没声明任何依赖的模块不进列表', () => {
    expect(sharedRows([unit('a')], {})).toEqual([]);
  });

  it('★ 放手过的模块**不算使用者**；全放手了那一行就不在', () => {
    const manifests = [unit('a', { plugin: 'demo' }), unit('b', { plugin: 'demo' })];
    const released: CapabilityMap = {
      a: capability('a', { released: true, extensions: [{ name: 'demo', status: 'ok', missing: [] }] }),
      b: capability('b', { extensions: [{ name: 'demo', status: 'ok', missing: [] }] }),
    };

    expect(sharedRows(manifests, released)[0]?.usedByKeys).toEqual([unitTitleKey('b')]);

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
      status: 'missing',
      provision: 'ready',
      extensions: [{ name: 'demo', status: 'missing', missing: ['x'], provision: 'ready' }],
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
      extensions: [
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
      a: capability('a', { extensions: [{ name: 'demo', status: 'ok', missing: [] }] }),
      b: capability('b', { extensions: [{ name: 'demo', status: 'missing', missing: [] }] }),
    };

    expect(sharedRows(manifests, caps)[0]?.state).toBe('missing');
  });

  it('缺命令也算旧（但**没有**版本信号就不给版本号）', () => {
    const manifests = [unit('a', { plugin: 'demo' })];
    const state = capability('a', {
      extensions: [{ name: 'demo', status: 'outdated', missing: ['x'] }],
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
  it('★ 行上只有标签（包名）与用它的模块，没有 `name` / `command` / `detail` 字段；原始命令不进界面', () => {
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

    expect(row?.usedByKeys).toEqual([unitTitleKey('a')]);
    expect(JSON.stringify(row?.usedByKeys)).not.toContain('opencli-workflow');
    expect(row?.label).toBe('opencli-workflow');
    expect(JSON.stringify(row ?? {})).not.toContain('npm i');
    expect(Object.keys(row ?? {})).not.toContain('name');
    expect(Object.keys(row ?? {})).not.toContain('command');
    expect(Object.keys(row ?? {})).not.toContain('detail');
  });
});
