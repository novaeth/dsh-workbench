import { describe, expect, it } from 'vitest';
import { installedPluginRows } from '@/app/layouts/rightbar/market-plugin-rows';
import { pluginPanelId, resolvePluginPanels } from '../model/config';

describe('市场那一行与面板配置那一行：同一个 id（同一笔账）', () => {
  const PKG = 'opencli-plugin-dashboards';

  it('★ 两屏都是 plugin:<包名>，逐字相等（"勾上默认"两屏立刻一致）', () => {
    const market = installedPluginRows([{ pkg: PKG, name: 'dashboards', installed: '1.0.16' }])[0];
    const board = resolvePluginPanels([{ pkg: PKG, title: 'dashboards', name: 'dashboards' }], {
      workspace: null,
      machine: null,
    })[0];

    expect(market?.id).toBe(pluginPanelId(PKG));
    expect(board?.id).toBe(pluginPanelId(PKG));
    expect(market?.id).toBe(board?.id);
  });

  it('★ 机器级默认板那一笔（defaults / changed）认的也是这个 id', () => {
    const id = pluginPanelId(PKG);
    const row = installedPluginRows([{ pkg: PKG, name: 'dashboards' }], new Set([id]), { [id]: 3 })[0];

    expect(row?.id).toBe(id);
    expect(row?.defaultShown).toBe(true);
    expect(row?.defaultChanged).toBe(3);
  });
});
