import { describe, expect, it } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import { marketCatalog } from '../market-rows';

function unit(id: string, plugin?: string): UnitManifest {
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
            plugins: [{ name: plugin, commands: ['x'] }],
          },
        }),
  };
}

describe('marketCatalog（市场门槛：来自已装包的模块）', () => {
  it('★ 宿主说了哪些来自已装包 → 只认那几张（没有 env 供给的也在里面）', () => {
    const manifests = [unit('delivery'), unit('panels'), unit('issues', 'demo')];

    expect(marketCatalog(manifests, new Set(['delivery', 'issues'])).map((item) => item.id)).toEqual([
      'delivery',
      'issues',
    ]);
  });

  it('★ 宿主没说（旧宿主 / 没喂过）→ 回退老口径：只认声明了插件或库的', () => {
    const manifests = [unit('delivery'), unit('panels'), unit('issues', 'demo')];

    expect(marketCatalog(manifests, null).map((item) => item.id)).toEqual(['issues']);
    expect(marketCatalog(manifests, undefined).map((item) => item.id)).toEqual(['issues']);
  });

  it('★ 宿主说"一张都不来自已装包"（空集）与"没说"（null）不是一回事', () => {
    expect(marketCatalog([unit('issues', 'demo')], new Set())).toEqual([]);
  });
});
