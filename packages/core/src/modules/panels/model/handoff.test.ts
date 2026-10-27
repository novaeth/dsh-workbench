import { describe, expect, it } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import { DIY_RECORD_FACT, PANELS_FACT, panelsFactsOf, panelsHandoffEntry } from './handoff';
import {
  DIY_INSTALL_TOOL,
  DIY_STATUS_TOOL,
  MODULES_INSTALL_TOOL,
  MODULES_LIST_TOOL,
  MODULES_UNINSTALL_TOOL,
  MODULES_UPDATE_DEPENDENCY_TOOL,
  MODULES_UPDATE_TOOL,
  MODULES_UPDATE_WORKBENCH_TOOL,
  PANELS_HIDE_TOOL,
  PANELS_LIST_TOOL,
  PANELS_RESET_TOOL,
  PANELS_SHOW_TOOL,
  READ_TOOLS,
} from '../unit';

function unit(id: string, plugins: readonly string[]): UnitManifest {
  return {
    id,
    titleKey: `${id}.mine`, card: { order: 10 },
    tools: [],
    host: { inject: [] },
    needs: plugins.map((name) => ({ kind: 'extension', runtime: 'opencli', name, commands: ['x'], purpose: '测试' })),
  };
}

const manifests: readonly UnitManifest[] = [
  unit('inventory', ['inventory', 'demo']),
  unit('issues', ['demo']),
  unit('analysis', ['demo']),
];

describe('panelsHandoffEntry', () => {
  it('★ 键按目录走（面板那条读带的是 path=workspace）', () => {
    expect(panelsHandoffEntry({ path: '/w/web' })).toEqual({ fact: PANELS_FACT, key: 'path:/w/web' });
  });

  it('不知道在哪个工作区 → 不交接（交出去没人能对上那格）', () => {
    expect(panelsHandoffEntry({})).toBeUndefined();
    expect(panelsHandoffEntry({ path: '   ' })).toBeUndefined();
  });
});

describe('panelsFactsOf', () => {
  it('★ 看配置（workbench_panels_list）→ 只惊动配置那条投影：面板的模块名单立刻重读（本地文件，≈ms）', () => {
    const call = { source: PANELS_LIST_TOOL, args: {}, result: {} };
    expect(panelsFactsOf(call, manifests)).toEqual([PANELS_FACT]);
  });

  it('★ 读调用最多只惊动两条投影：不再掉进写工具的"整块刷"兜底（拆工具之前做不到）', () => {
    for (const source of READ_TOOLS) {
      const facts = panelsFactsOf({ source, args: {}, result: {} }, manifests) ?? [];
      for (const fact of facts) {
        expect([PANELS_FACT, 'capability', DIY_RECORD_FACT], `${source} · ${fact}`).toContain(fact);
      }
      expect(panelsFactsOf({ source, args: { unit: 'inventory' }, result: {} }, manifests) ?? [], source).not.toContain(
        'inventory*',
      );
    }
  });

  it('改配置（五把写工具）→ 没意见，外壳按"写"的通用口径整块刷（连 capability 一起）', () => {
    for (const source of [PANELS_SHOW_TOOL, PANELS_HIDE_TOOL, PANELS_RESET_TOOL]) {
      expect(
        panelsFactsOf({ source, args: { id: 'inventory' }, result: {} }, manifests),
        source,
      ).toBeUndefined();
    }
  });

  it('★ 市场 list 是一次探针：配置与能力两条投影都得重读（能力走宿主缓存，≈ms）', () => {
    expect(panelsFactsOf({ source: MODULES_LIST_TOOL, args: {}, result: {} }, manifests)).toEqual([
      PANELS_FACT,
      'capability',
    ]);
  });

  it('★ 装 / 升 / 卸一个模块 → 连共用同一份安装的模块一起点名（用它的面板不许停在旧数据）', () => {
    expect(
      panelsFactsOf({ source: MODULES_INSTALL_TOOL, args: { id: 'inventory' }, result: {} }, manifests),
    ).toEqual([PANELS_FACT, 'capability', 'inventory*', 'issues*', 'analysis*']);
    expect(
      panelsFactsOf({ source: MODULES_UPDATE_TOOL, args: { id: 'inventory' }, result: {} }, manifests),
    ).toEqual([PANELS_FACT, 'capability', 'inventory*', 'issues*', 'analysis*']);
    expect(
      panelsFactsOf({ source: MODULES_UNINSTALL_TOOL, args: { id: 'inventory' }, result: {} }, manifests),
    ).toEqual([PANELS_FACT, 'capability', 'inventory*', 'issues*', 'analysis*']);
  });

  it('★ 升共用依赖 → 点名的是**声明它的模块**（不是发起那一个）', () => {
    expect(
      panelsFactsOf(
        { source: MODULES_UPDATE_DEPENDENCY_TOOL, args: { id: 'extension:demo' }, result: {} },
        manifests,
      ),
    ).toEqual([PANELS_FACT, 'capability', 'inventory*', 'issues*', 'analysis*']);
  });

  it('★ 更新工作台自己 → 配置与能力两条投影都重读（新版装上了，那一行要改成"还没生效"）', () => {
    expect(panelsFactsOf({ source: MODULES_UPDATE_WORKBENCH_TOOL, args: {}, result: {} }, manifests)).toEqual([
      PANELS_FACT,
      'capability',
    ]);
  });

  it('★ 看面板那两把（status / panel）→ 只惊动配置那条投影（它们没探能力）', () => {
    expect(panelsFactsOf({ source: DIY_STATUS_TOOL, args: {}, result: {} }, manifests)).toEqual([PANELS_FACT]);
  });

  it('★ 工坊里装一个（workbench_diy_install）→ 与市场装同一个口径（配置 + 能力 + 共用那份安装的模块）', () => {
    expect(
      panelsFactsOf({ source: DIY_INSTALL_TOOL, args: { unit: 'inventory' }, result: {} }, manifests),
    ).toEqual([PANELS_FACT, 'capability', 'inventory*', 'issues*', 'analysis*']);
    expect(panelsFactsOf({ source: DIY_INSTALL_TOOL, args: {}, result: {} }, manifests)).toBeUndefined();
  });

  it('认不出的工具 / 写工具没给目标 → undefined（不猜）', () => {
    expect(panelsFactsOf({ source: 'workbench_other', args: {}, result: {} }, manifests)).toBeUndefined();
    expect(
      panelsFactsOf({ source: MODULES_INSTALL_TOOL, args: {}, result: {} }, manifests),
    ).toBeUndefined();
  });
});
