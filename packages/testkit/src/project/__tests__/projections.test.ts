import { describe, expect, it } from 'vitest';
import {
  capabilityOf,
  capabilityPayloadOf,
  installedModule,
  installedPlugin,
  marketInstalledOf,
  marketSource,
  moduleVersionsOf,
  panelsOf,
  panelPlugin,
  panelUnit,
  projectRoute,
  unitManifestsOf,
  validateWorld,
  workspacePanel,
  world,
} from '../../index';

function sample() {
  return world({
    modules: [
      installedModule('issues', { sourceId: 'registry', latest: '0.2.0' }),
      installedModule('plain', { manifest: { id: 'plain', titleKey: 'plain.title', card: null, tools: [], host: { inject: [] } } }),
    ],
    capabilities: [capabilityOf('issues')],
    plugins: [installedPlugin('@fixture/notes', { name: 'notes' })],
    workspaces: [
      workspacePanel('w1', [panelUnit('issues'), panelUnit('plain', false)], {
        path: '/repo',
        plugins: [panelPlugin('@fixture/notes')],
        defaults: ['issues'],
        own: true,
      }),
    ],
    market: { sources: [marketSource('registry', { registry: 'https://registry.invalid/' })] },
  });
}

describe('World 到契约 payload 的投影', () => {
  it('unit-manifests：清单、可装、被拒分开给', () => {
    const world1 = sample();
    const payload = unitManifestsOf(world1);

    expect(payload.manifests.map((item) => item.id).sort()).toEqual(['issues', 'plain']);
    expect([...payload.installable].sort()).toEqual(['issues', 'plain']);
  });

  it('capability：逐行带上 needs 与 detail', () => {
    const payload = capabilityPayloadOf(sample());

    expect(payload.units).toEqual([{ unit: 'issues', status: 'ok', needs: [] }]);
  });

  it('panels：标题键、卡片、来源与默认值都从世界来', () => {
    const payload = panelsOf(sample(), '/repo');

    expect(payload.units).toEqual([
      { id: 'issues', titleKey: 'issues.title', shown: true, source: 'user', hasCard: false },
      { id: 'plain', titleKey: 'plain.title', shown: false, source: 'user', hasCard: false },
    ]);
    expect(payload.plugins).toMatchObject([{ pkg: '@fixture/notes', title: 'notes', shown: true }]);
    expect(payload.defaults).toEqual(['issues']);
    expect(payload.own).toBe(true);
  });

  it('module-versions：已装行来自模块，工作台本体行常驻', () => {
    const payload = moduleVersionsOf(sample());

    expect(payload.modules).toHaveLength(2);
    expect(payload.modules[0]).toMatchObject({
      unit: 'issues',
      installed: '0.1.0',
      latest: '0.2.0',
      title: { zh: 'issues', en: 'issues' },
    });
    expect(payload.workbench).toMatchObject({ pkg: '@dsh-workbench/core', installed: '1.5.6' });
  });

  it('market-installed：每行带上来源 id/label 与来源形状', () => {
    const payload = marketInstalledOf(sample());

    expect(payload.modules[0]).toMatchObject({
      unit: 'issues',
      sourceId: 'registry',
      sourceLabel: 'registry',
      source: { type: 'npm', registry: 'https://registry.invalid/' },
    });
    expect(payload.modules).toHaveLength(1);
    expect(payload.ok).toBe(true);
  });

  it('按路由投影：未知路由返回 undefined，不猜', () => {
    const built = sample();

    expect(projectRoute(built, 'unit-manifests')).toEqual(unitManifestsOf(built));
    expect(projectRoute(built, 'nope')).toBeUndefined();
  });

  it('★ 投影结果与不变量一致：样本世界本身是合法的', () => {
    expect(validateWorld(sample())).toEqual({ ok: true });
  });
});
