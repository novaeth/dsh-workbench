import { describe, expect, it } from 'vitest';
import { capabilityOf, extensionNeedOf, libNeedOf, manifestOf, needStateOf } from '@dsh-workbench/shared/testing';
import type { NeedState, UnitManifest } from '@dsh-workbench/shared/host';
import {
  affectedUnitsOf,
  dependencyCommandPlan,
  dependencyId,
  findDependency,
  parseDependencyId,
  sharedDependencies,
} from '../model/market-dependency';

const LIB = libNeedOf('opencli-workflow', {
  version: '1.1.22',
  sources: [{ kind: 'npm', registryEnv: 'DSH_WB_TEST_REGISTRY', registryDefault: 'https://r.invalid/' }],
  purpose: '发布编排',
});

function unit(id: string, needs: UnitManifest['needs'] = []): UnitManifest {
  return manifestOf({ id, needs });
}

function stateOf(need: Parameters<typeof needStateOf>[0], status: NeedState['status'], extra: Partial<NeedState> = {}) {
  return needStateOf(need, status, extra);
}

describe('parseDependencyId / dependencyId', () => {
  it('★ 共用依赖只有 extension / lib：bin / env 不进这一层', () => {
    expect(parseDependencyId('bin:gitops')).toBeUndefined();
    expect(parseDependencyId('env:DSH_TOKEN')).toBeUndefined();
    expect(parseDependencyId('extension:demo')).toEqual({ kind: 'extension', name: 'demo' });
  });

  it('不认识的 kind / 空的 name → undefined（不猜）', () => {
    expect(parseDependencyId('dsh-bundle:demo')).toBeUndefined();
    expect(parseDependencyId('extension:')).toBeUndefined();
    expect(parseDependencyId('nocolon')).toBeUndefined();
  });

  it('往返一致', () => {
    expect(parseDependencyId(dependencyId('lib', 'opencli-workflow'))).toEqual({
      kind: 'lib',
      name: 'opencli-workflow',
    });
  });
});

describe('sharedDependencies：跨模块聚合', () => {
  const demo = extensionNeedOf('demo', { commands: ['x'] });

  it('★ 一行 = 一份依赖：两个模块声明同一份 → 一行，usedBy 是那两个模块', () => {
    const shared = sharedDependencies({
      manifests: [unit('a', [demo]), unit('b', [demo])],
      capabilities: new Map([
        ['a', capabilityOf('a', [stateOf(demo, 'ok')])],
        ['b', capabilityOf('b', [stateOf(demo, 'ok')])],
      ]),
    });

    expect(shared.map((dep) => dep.id)).toEqual(['extension:demo']);
    expect(shared[0]?.usedBy).toEqual(['a', 'b']);
    expect(shared[0]?.status).toBe('ok');
  });

  it('★ 放手过的模块不算使用者；全放手了那一行就不列', () => {
    const manifests = [unit('a', [LIB]), unit('b', [LIB])];
    const caps = new Map([
      ['a', capabilityOf('a', [stateOf(LIB, 'ok', { installed: '1.1.22' })])],
      ['b', capabilityOf('b', [stateOf(LIB, 'ok', { installed: '1.1.22' })])],
    ]);

    expect(sharedDependencies({ manifests, capabilities: caps, isReleased: (id) => id === 'a' })[0]?.usedBy).toEqual(['b']);
    expect(sharedDependencies({ manifests, capabilities: caps, isReleased: () => true })).toEqual([]);
  });

  it('★ status 取最差（missing 赢过 outdated 与 ok），有信号才给版本', () => {
    const caps = new Map([
      ['a', capabilityOf('a', [stateOf(LIB, 'outdated', { installed: '1.1.22', latest: '1.1.23' })])],
      ['b', capabilityOf('b', [stateOf(LIB, 'missing')])],
    ]);

    const [dep] = sharedDependencies({ manifests: [unit('a', [LIB]), unit('b', [LIB])], capabilities: caps });

    expect(dep?.status).toBe('missing');
    expect(dep?.installed).toBe('1.1.22');
    expect(dep?.latest).toBe('1.1.23');
    expect(dep?.purpose).toBe('发布编排');
  });

  it('★ 探不动 → unchecked（不谎报"没装"）', () => {
    const demoNeed = extensionNeedOf('demo');
    const [dep] = sharedDependencies({
      manifests: [unit('a', [demoNeed])],
      capabilities: new Map([['a', capabilityOf('a', [stateOf(demoNeed, 'unchecked')])]]),
    });

    expect(dep?.status).toBe('unchecked');
  });

  it('同一个名字、extension 与 lib 是两行', () => {
    const shared = sharedDependencies({
      manifests: [
        unit('a', [
          extensionNeedOf('shared'),
          libNeedOf('shared'),
        ]),
      ],
      capabilities: new Map([['a', capabilityOf('a', [])]]),
    });

    expect(shared.map((dep) => dep.id).sort()).toEqual(['extension:shared', 'lib:shared']);
  });
});

describe('findDependency', () => {
  const demo = extensionNeedOf('demo', { sources: [{ kind: 'git', url: 'github:acme/demo' }] });

  it('只认声明过它的模块', () => {
    const target = findDependency([unit('a', [demo]), unit('b', [])], 'extension:demo');
    expect(target?.declarers.map((item) => item.id)).toEqual(['a']);
    expect(findDependency([unit('b', [])], 'extension:demo')).toBeUndefined();
  });

  it('★ 同一个包两家写了不同的源 → 目标带 conflict，sources 为空', () => {
    const target = findDependency(
      [
        unit('a', [libNeedOf('opencli-workflow', { sources: [{ kind: 'npm', registryEnv: 'DSH_WB_A_REGISTRY' }] })]),
        unit('b', [libNeedOf('opencli-workflow', { sources: [{ kind: 'npm', registryEnv: 'DSH_WB_B_REGISTRY' }] })]),
      ],
      'lib:opencli-workflow',
    );

    expect(target?.conflict).toBeDefined();
    expect(target?.sources).toEqual([]);
  });

  it('bin / env 没有共用依赖行：找它不返回目标', () => {
    const manifests = [unit('a', [{ kind: 'bin', name: 'gitops', purpose: '测试' }])];
    expect(findDependency(manifests, 'bin:gitops')).toBeUndefined();
    expect(sharedDependencies({ manifests, capabilities: new Map([['a', capabilityOf('a', [])]]) })).toEqual([]);
  });
});

describe('affectedUnitsOf', () => {
  it('按模块 id → 该模块 + 与它共用依赖的模块', () => {
    const demo = extensionNeedOf('demo');
    expect(affectedUnitsOf([unit('a', [demo]), unit('b', [demo]), unit('c', [])], { unit: 'a' })).toEqual(['a', 'b']);
  });

  it('按依赖 id → 所有声明者', () => {
    const demo = extensionNeedOf('demo');
    expect(affectedUnitsOf([unit('a', [demo]), unit('b', [demo])], { id: 'extension:demo' })).toEqual(['a', 'b']);
  });

  it('不认识的 id / 模块 → 空', () => {
    expect(affectedUnitsOf([unit('a', [])], { id: 'extension:nope' })).toEqual([]);
    expect(affectedUnitsOf([unit('a', [])], { unit: 'nope' })).toEqual([]);
  });
});

describe('dependencyCommandPlan：只跑探测给出的那条修法', () => {
  const demo = extensionNeedOf('demo', { commands: ['x'] });

  it('★ 没装（missing）→ undefined：安装不是共用依赖的动作（用户口径 2026-09-30）', () => {
    const target = findDependency([unit('a', [demo])], 'extension:demo');
    expect(
      dependencyCommandPlan({
        target: target!,
        capability: capabilityOf('a', [stateOf(demo, 'missing', { command: 'opencli plugin install <demo>' })]),
      }),
    ).toBeUndefined();
  });

  it('★ 旧了 → 用 NeedState.command（来源解析已经在探测里做过了）', () => {
    const target = findDependency([unit('a', [demo])], 'extension:demo');
    const plan = dependencyCommandPlan({
      target: target!,
      capability: capabilityOf('a', [
        stateOf(demo, 'outdated', { installed: '1.0.0', latest: '1.1.0', command: 'opencli plugin update demo' }),
      ]),
    });

    expect(plan?.map((step) => step.line)).toEqual(['opencli plugin update demo']);
  });

  it('★ 能力按声明者配对：第一家没命令、第二家有 → 用第二家的', () => {
    const target = findDependency([unit('a', [demo]), unit('b', [demo])], 'extension:demo');
    const plan = dependencyCommandPlan({
      target: target!,
      capability: capabilityOf('a', [stateOf(demo, 'outdated')]),
      capabilities: new Map([
        ['a', capabilityOf('a', [stateOf(demo, 'outdated')])],
        ['b', capabilityOf('b', [stateOf(demo, 'outdated', { command: 'opencli plugin update demo' })])],
      ]),
    });

    expect(plan?.map((step) => step.line)).toEqual(['opencli plugin update demo']);
  });

  it('★ 已经是最新 → 幂等（undefined，一条命令都不跑）', () => {
    const target = findDependency([unit('a', [demo])], 'extension:demo');
    expect(
      dependencyCommandPlan({ target: target!, capability: capabilityOf('a', [stateOf(demo, 'ok')]) }),
    ).toBeUndefined();
  });

  it('★ 来源冲突 → undefined（不猜）', () => {
    const target = findDependency(
      [
        unit('a', [libNeedOf('opencli-workflow', { sources: [{ kind: 'npm', registryEnv: 'DSH_WB_A_REGISTRY' }] })]),
        unit('b', [libNeedOf('opencli-workflow', { sources: [{ kind: 'npm', registryEnv: 'DSH_WB_B_REGISTRY' }] })]),
      ],
      'lib:opencli-workflow',
    );

    expect(target?.conflict).toBeDefined();
    expect(
      dependencyCommandPlan({
        target: target!,
        capability: capabilityOf('a', [
          stateOf(LIB, 'outdated', { command: 'npm i --prefix /libs opencli-workflow@1.1.23' }),
        ]),
      }),
    ).toBeUndefined();
  });

  it('库版本不对 → 同样用探测给的命令', () => {
    const target = findDependency([unit('a', [LIB])], 'lib:opencli-workflow');
    const plan = dependencyCommandPlan({
      target: target!,
      capability: capabilityOf('a', [
        stateOf(LIB, 'unsatisfied', { installed: '1.1.20', command: 'npm i --prefix /libs opencli-workflow@1.1.22' }),
      ]),
    });

    expect(plan?.[0]?.line).toContain('opencli-workflow@1.1.22');
  });
});
