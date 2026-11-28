import { describe, expect, it } from 'vitest';
import type { World, WorldProblem } from '../types';
import {
  capabilityOf,
  captured,
  emptyWorld,
  derived,
  installedModule,
  marketSource,
  panelUnit,
  validateWorld,
  workspacePanel,
  world,
} from '../index';

function problemsOf(input: World): readonly WorldProblem[] {
  const result = validateWorld(input);
  return result.ok ? [] : result.problems;
}

function codesOf(input: World): readonly string[] {
  return problemsOf(input).map((problem) => problem.code);
}

describe('世界不变量', () => {
  it('★ 能力行对应的模块必须在已装清单里', () => {
    const built = world({ capabilities: [capabilityOf('ghost')] });

    expect(codesOf(built)).toContain('capability');
  });

  it('★ 面板配置引用了没装的模块就红（待装/待摘时要显式写进例外）', () => {
    const invalid = world({ workspaces: [workspacePanel('w1', [panelUnit('ghost')])] });
    const pending = world({
      workspaces: [workspacePanel('w1', [panelUnit('ghost')], { pendingUnits: ['ghost'] })],
    });
    const withdrawn = world({
      workspaces: [workspacePanel('w1', [panelUnit('ghost')], { withdrawnUnits: ['ghost'] })],
    });

    expect(codesOf(invalid)).toContain('workspace');
    expect(validateWorld(pending)).toEqual({ ok: true });
    expect(validateWorld(withdrawn)).toEqual({ ok: true });
  });

  it('★ 已装模块没有 manifest 时必须说明宿主为什么认不出（refused）', () => {
    const noManifest = world({ modules: [installedModule('issues', { manifest: undefined })] });
    const refused = world({
      modules: [installedModule('issues', { manifest: undefined, refused: ['缺 apiVersion'] })],
    });

    expect(codesOf(noManifest)).toContain('module');
    expect(validateWorld(refused)).toEqual({ ok: true });
  });

  it('★ manifest 的 id 与 unit 不一致会红（错位的卡片比没有更糟）', () => {
    const built = world({
      modules: [installedModule('issues', { manifest: { ...installedModule('other').manifest!, id: 'other' } })],
    });

    expect(codesOf(built)).toContain('module');
  });

  it('★ 工作台本体行缺版本会红，损坏时必须显式 broken', () => {
    const missing = world({ workbench: { installed: '' } });
    const broken = world({ workbench: { installed: '', broken: true } });

    expect(codesOf(missing)).toContain('workbench');
    expect(validateWorld(broken)).toEqual({ ok: true });
  });

  it('本地那份（link: 装的）不该同时有远端新版本', () => {
    const built = world({
      modules: [installedModule('issues', { local: true, latest: '0.2.0' })],
      workbench: { local: true, latest: '0.2.0' },
    });

    expect(codesOf(built)).toEqual(expect.arrayContaining(['module', 'workbench']));
  });

  it('重复的模块 / 工作区 / 来源都红', () => {
    const built = world({
      modules: [installedModule('issues'), installedModule('issues')],
      workspaces: [workspacePanel('w1', []), workspacePanel('w1', [])],
      market: { sources: [marketSource('r'), marketSource('r')] },
    });

    expect(codesOf(built)).toContain('duplicate');
  });

  it('故障模式自身要合法（HTTP 状态码 / 延迟 / 适配器原因）', () => {
    const built = world({
      faults: {
        'unit-manifests': { kind: 'http', status: 42 },
        capability: { kind: 'latency', ms: -1 },
        panels: { kind: 'adapter-error', error: '' },
        changes: { kind: 'hang' },
      },
    });

    expect(codesOf(built)).toContain('fault');
    expect(problemsOf(built).length).toBeGreaterThanOrEqual(3);
  });

  it('★ provenance 必填且要说实话：captured 要有版本与时间，derived 要列改动字段', () => {
    expect(codesOf({ ...emptyWorld(), provenance: { kind: 'captured', hostVersion: '', at: '' } })).toContain('provenance');
    expect(codesOf(world({ provenance: derived('base', []) }))).toContain('provenance');
    expect(validateWorld(world({ provenance: captured('1.5.6', '2026-11-28') }))).toEqual({ ok: true });
  });

  it('schemaVersion 不是 1 就红（旧世界不许静默当成新的）', () => {
    const built = { ...emptyWorld(), schemaVersion: 2 } as unknown as World;

    expect(codesOf(built)).toContain('schema');
  });
});
