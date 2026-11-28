import { describe, expect, it } from 'vitest';
import {
  capabilityOf,
  emptyWorld,
  installedModule,
  installedPlugin,
  marketSource,
  panelUnit,
  validateWorld,
  workspacePanel,
  world,
} from '../index';

describe('世界构造器', () => {
  it('★ 空世界也有工作台本体行（它不可能不存在）', () => {
    const empty = emptyWorld();

    expect(empty.schemaVersion).toBe(1);
    expect(empty.machine.workbench).toMatchObject({ pkg: '@dsh-workbench/core', installed: '1.5.6' });
    expect(validateWorld(empty)).toEqual({ ok: true });
  });

  it('装上模块会自带一份最小 manifest，能力/面板引用能对上', () => {
    const module = installedModule('issues');
    const built = world({
      modules: [module],
      capabilities: [capabilityOf('issues')],
      workspaces: [workspacePanel('w1', [panelUnit('issues')])],
      plugins: [installedPlugin('@fixture/plugin')],
      market: { sources: [marketSource('registry')] },
    });

    expect(module.manifest?.id).toBe('issues');
    expect(validateWorld(built)).toEqual({ ok: true });
  });

  it('局部覆盖不会丢掉默认值', () => {
    const built = world({ workbench: { installed: '1.5.7' } });

    expect(built.machine.workbench.pkg).toBe('@dsh-workbench/core');
    expect(built.machine.workbench.installed).toBe('1.5.7');
  });
});
